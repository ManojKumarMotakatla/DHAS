// ============================================================
// Backend/config/socket.js
//
// Socket.IO server. Reuses the SAME JWTs as the REST API (no
// separate chat login). All persistence (INSERT into chat_messages)
// happens here, on `send_message` — the REST /chat/upload route
// only stores the file on disk and hands back a URL; the actual
// message row + delivery/read tracking is centralised in this file.
//
// Call initSocket(httpServer, allowedOriginRegexes) once from
// server.js (see INTEGRATION_GUIDE.md).
// ============================================================

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db  = require("./db");
const { verifyRoomAccess, otherParty } = require("../utils/chatAccess");

let io = null;

// "role:id" -> Set<socket.id>   — who is currently online
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

/* Builds the column values for a chat_messages insert based on
   message_type, re-validating ownership of any referenced data
   against the DB rather than trusting the client payload outright. */
async function buildMessageRow(role, partyId, payload) {
    switch (payload.message_type) {
        case "text": {
            const text = (payload.content || "").trim();
            if (!text) return { error: "Message cannot be empty." };
            if (text.length > 4000) return { error: "Message is too long." };
            return { content: text };
        }

        case "image":
        case "pdf": {
            if (!payload.file_url || !payload.file_name) return { error: "File information missing." };
            return {
                content:   payload.content ? String(payload.content).trim().slice(0, 500) : null, // optional caption
                file_name: payload.file_name,
                file_size: payload.file_size || null,
                file_mime: payload.file_mime || null,
                file_data: payload.file_url // re-using file_data column to store the authenticated download URL
            };
        }

        case "symptom_share": {
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
        maxHttpBufferSize: 2 * 1024 * 1024 // text-only payloads; files go through /chat/upload first
    });

    // ── Auth handshake — same JWT_SECRET as the REST API ──
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
        socket.join(`user:${role}:${partyId}`); // personal channel for contact-list / cross-room pings

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

                // Only patients can share their own health records
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
                         file_name, file_size, file_mime, file_data, metadata, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        room.id, role, partyId, payload.message_type, built.content || null,
                        built.file_name || null, built.file_size || null,
                        built.file_mime || null, built.file_data || null,
                        built.metadata ? JSON.stringify(built.metadata) : null,
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

/* Called from doctorController.js (disconnectPatient / disconnectDoctor)
   right after a connection row is deleted, so any open chat window
   closes immediately instead of waiting for the next failed action. */
function notifyConnectionTerminated(roomId) {
    if (!io || !roomId) return;
    io.to(`room:${roomId}`).emit("connection_terminated", { room_id: roomId });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
}

module.exports = { initSocket, getIO: () => io, notifyConnectionTerminated, isOnline };