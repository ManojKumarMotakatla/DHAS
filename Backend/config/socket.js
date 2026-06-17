// ============================================================
// Backend/config/socket.js
//
// CHANGED FOR E2E ENCRYPTION:
//   - send_message payload may now include is_encrypted, iv,
//     file_iv. The server stores these columns AS-IS and relays
//     them in new_message - it never attempts to decrypt content
//     or file_data. For "text" messages, when is_encrypted=1,
//     `content` is base64 ciphertext rather than plain text, and
//     buildMessageRow() applies a looser length check since
//     ciphertext length isn't directly comparable to plaintext
//     length - see buildMessageRow() comments below.
//   - symptom_share / report_share messages are NOT encrypted
//     (they reference existing DB rows the server must read to
//     validate ownership), so those two types are unaffected.
// ============================================================

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db  = require("./db");
const { verifyRoomAccess, otherParty } = require("../utils/chatAccess");

let io = null;

const onlineUsers = new Map();
const presenceKey = (role, id) => `${role}:${id}`;

function addPresence(role, id, socketId) {
    const key = presenceKey(role, id);
    if (!onlineUsers.has(key)) onlineUsers.set(key, new Set());
    onlineUsers.get(key).add(socketId);
}
function removePresence(role, id, socketId) {
    const key = presenceKey(role, id);
    const set = onlineUsers.get(key);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) onlineUsers.delete(key);
}
function isOnline(role, id) { return onlineUsers.has(presenceKey(role, id)); }

function partnerSocketsInRoom(roomId, partner) {
    const partnerSocketIds = onlineUsers.get(presenceKey(partner.role, partner.id));
    if (!partnerSocketIds) return false;
    const roomSet = io.sockets.adapter.rooms.get(`room:${roomId}`);
    if (!roomSet) return false;
    for (const sid of partnerSocketIds) if (roomSet.has(sid)) return true;
    return false;
}

function safeParseJSON(v) { try { return JSON.parse(v); } catch { return v; } }

/* Builds the column values for a chat_messages insert. For
   "text"/"image"/"pdf" we now trust the client's is_encrypted flag:
   when true, content/file_data are opaque ciphertext (base64) and
   we store them verbatim plus the iv/file_iv nonces. We still cap
   length to stop abuse, just looser than the old "must be readable
   prose" check since base64 ciphertext is naturally longer than the
   plaintext it represents. */
async function buildMessageRow(role, partyId, payload) {
    const isEncrypted = !!payload.is_encrypted;

    switch (payload.message_type) {
        case "text": {
            const text = (payload.content || "").trim();
            if (!text) return { error: "Message cannot be empty." };
            // Ciphertext (base64) runs longer than plaintext for the same
            // message, so the cap is generous; this just stops abuse.
            const maxLen = isEncrypted ? 8000 : 4000;
            if (text.length > maxLen) return { error: "Message is too long." };
            if (isEncrypted && !payload.iv) return { error: "Missing encryption nonce." };
            return { content: text, is_encrypted: isEncrypted ? 1 : 0, iv: payload.iv || null };
        }

        case "image":
        case "pdf": {
            if (!payload.file_url || !payload.file_name) return { error: "File information missing." };
            if (isEncrypted && !payload.file_iv) return { error: "Missing file encryption nonce." };
            return {
                content:      payload.content ? String(payload.content).trim().slice(0, 500) : null,
                file_name:    payload.file_name,
                file_size:    payload.file_size || null,
                file_mime:    payload.file_mime || null,
                file_data:    payload.file_url, // authenticated download URL; bytes behind it are ciphertext
                is_encrypted: isEncrypted ? 1 : 0,
                file_iv:      payload.file_iv || null
            };
        }

        case "symptom_share": {
            // Not E2E encrypted: server must read the real symptom row to
            // validate it belongs to this patient before sharing it.
            const symptomId = parseInt(payload.metadata?.symptom_id, 10);
            if (!symptomId) return { error: "No symptom record selected." };
            const [rows] = await db.promise().query(
                "SELECT * FROM symptoms WHERE id = ? AND user_id = ?", [symptomId, partyId]
            );
            if (rows.length === 0) return { error: "Symptom record not found." };
            const s = rows[0];
            return {
                content: `Shared symptom check: ${s.condition_name || "General"}`,
                metadata: {
                    symptom_id: s.id,
                    symptoms: safeParseJSON(s.symptoms),
                    condition_name: s.condition_name,
                    severity: s.severity,
                    checked_at: s.created_at
                }
            };
        }

        case "report_share": {
            // Not E2E encrypted, same reasoning as symptom_share.
            const reportId = parseInt(payload.metadata?.report_id, 10);
            if (!reportId) return { error: "No report selected." };
            const [rows] = await db.promise().query(
                "SELECT id, filename, filesize, filetype FROM reports WHERE id = ? AND user_id = ?",
                [reportId, partyId]
            );
            if (rows.length === 0) return { error: "Report not found." };
            const r = rows[0];
            return {
                content: `Shared report: ${r.filename}`,
                metadata: { report_id: r.id, filename: r.filename, filesize: r.filesize, filetype: r.filetype }
            };
        }

        default:
            return { error: "Unsupported message type." };
    }
}

function initSocket(httpServer, allowedOriginRegexes = []) {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, cb) => {
                if (!origin) return cb(null, true);
                const ok = allowedOriginRegexes.some(re => re.test(origin));
                cb(ok ? null : new Error("Not allowed by CORS"), ok);
            },
            credentials: true
        },
        maxHttpBufferSize: 2 * 1024 * 1024
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("Authentication required."));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role === "doctor" && decoded.doctorId) {
                socket.role = "doctor"; socket.partyId = decoded.doctorId;
            } else if (decoded.userId) {
                socket.role = "patient"; socket.partyId = decoded.userId;
            } else {
                return next(new Error("Invalid session token."));
            }
            next();
        } catch (err) {
            next(new Error(err.name === "TokenExpiredError" ? "Session expired." : "Invalid session."));
        }
    });

    io.on("connection", (socket) => {
        const { role, partyId } = socket;
        addPresence(role, partyId, socket.id);
        socket.join(`user:${role}:${partyId}`);

        socket.on("join_room", async ({ room_id } = {}, ack) => {
            try {
                const room = await verifyRoomAccess(room_id, role, partyId);
                if (!room) return ack?.({ success: false, message: "Access denied or conversation has ended." });

                socket.currentRoomId = room.id;
                socket.join(`room:${room.id}`);

                const [result] = await db.promise().query(
                    `UPDATE chat_messages SET status = 'delivered'
                     WHERE room_id = ? AND sender_type != ? AND status = 'sent'`,
                    [room.id, role]
                );
                if (result.affectedRows > 0) {
                    io.to(`room:${room.id}`).emit("status_update", { room_id: room.id, status: "delivered" });
                }
                ack?.({ success: true });
            } catch (err) {
                console.error("join_room error:", err.message);
                ack?.({ success: false, message: "Failed to join conversation." });
            }
        });

        socket.on("leave_room", () => {
            if (socket.currentRoomId) socket.leave(`room:${socket.currentRoomId}`);
            socket.currentRoomId = null;
        });

        socket.on("typing",      () => relayTyping(socket, true));
        socket.on("stop_typing", () => relayTyping(socket, false));

        socket.on("send_message", async (payload = {}, ack) => {
            try {
                const room = await verifyRoomAccess(payload.room_id, role, partyId);
                if (!room) return ack?.({ success: false, message: "You no longer have access to this conversation." });

                const allowedTypes = ["text", "image", "pdf", "symptom_share", "report_share"];
                if (!allowedTypes.includes(payload.message_type)) {
                    return ack?.({ success: false, message: "Unsupported message type." });
                }

                if ((payload.message_type === "symptom_share" || payload.message_type === "report_share") && role !== "patient") {
                    return ack?.({ success: false, message: "Only patients can share symptom history or reports." });
                }

                const built = await buildMessageRow(role, partyId, payload);
                if (built.error) return ack?.({ success: false, message: built.error });

                const partner = otherParty(room, role);
                const status = partnerSocketsInRoom(room.id, partner) ? "delivered" : "sent";

                const [result] = await db.promise().query(
                    `INSERT INTO chat_messages
                        (room_id, sender_type, sender_id, message_type, content,
                         file_name, file_size, file_mime, file_data, metadata,
                         is_encrypted, iv, file_iv, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        room.id, role, partyId, payload.message_type, built.content || null,
                        built.file_name || null, built.file_size || null,
                        built.file_mime || null, built.file_data || null,
                        built.metadata ? JSON.stringify(built.metadata) : null,
                        built.is_encrypted || 0, built.iv || null, built.file_iv || null,
                        status
                    ]
                );

                const [savedRows] = await db.promise().query("SELECT * FROM chat_messages WHERE id = ?", [result.insertId]);
                const saved = savedRows[0];

                io.to(`room:${room.id}`).emit("new_message", saved);
                io.to(`user:${partner.role}:${partner.id}`).emit("contact_update", { room_id: room.id });

                ack?.({ success: true, message: saved });
            } catch (err) {
                console.error("send_message error:", err.message);
                ack?.({ success: false, message: "Failed to send message. Please try again." });
            }
        });

        socket.on("mark_read", async ({ room_id } = {}) => {
            try {
                const room = await verifyRoomAccess(room_id, role, partyId);
                if (!room) return;
                await db.promise().query(
                    `UPDATE chat_messages SET status = 'read'
                     WHERE room_id = ? AND sender_type != ? AND status != 'read'`,
                    [room.id, role]
                );
                io.to(`room:${room.id}`).emit("messages_read", { room_id: room.id, reader: role });
            } catch (err) {
                console.error("mark_read error:", err.message);
            }
        });

        socket.on("disconnect", () => {
            removePresence(role, partyId, socket.id);
        });
    });

    return io;
}

function relayTyping(socket, isTyping) {
    if (!socket.currentRoomId) return;
    socket.to(`room:${socket.currentRoomId}`).emit(isTyping ? "typing" : "stop_typing", {
        room_id: socket.currentRoomId, role: socket.role
    });
}

function notifyConnectionTerminated(roomId) {
    if (!io || !roomId) return;
    io.to(`room:${roomId}`).emit("connection_terminated", { room_id: roomId });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
}

module.exports = { initSocket, getIO: () => io, notifyConnectionTerminated, isOnline };