// ============================================================
// Backend/controllers/chatController.js
//
// FIXED:
//   - getContacts now auto-creates chat rooms for accepted connections
//     that don't have one yet (was causing "Loading..." to hang forever
//     because the INNER JOIN on chat_rooms returned zero rows)
//   - Both patient and doctor queries now LEFT JOIN chat_rooms and call
//     ensureRoomForConnection() so every accepted connection has a room
// ============================================================

const path = require("path");
const fs   = require("fs");
const db   = require("../config/db");
const { verifyRoomAccess, ensureRoomForConnection } = require("../utils/chatAccess");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");

function myId(req) { return req.role === "doctor" ? req.doctorId : req.userId; }

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/* -- GET /chat/contacts ----------------------------------------- */
const getContacts = async (req, res) => {
    const { role } = req;
    const id = myId(req);

    try {
        let connections;

        if (role === "doctor") {
            // Get all accepted patients for this doctor
            [connections] = await db.promise().query(`
                SELECT
                    dpc.id AS connection_id,
                    dpc.doctor_id,
                    dpc.patient_id,
                    u.id AS partner_id,
                    u.name,
                    u.profile_image AS avatar,
                    NULL AS speciality
                FROM doctor_patient_connections dpc
                JOIN users u ON u.id = dpc.patient_id
                WHERE dpc.doctor_id = ? AND dpc.status = 'accepted'
            `, [id]);
        } else {
            // Get all accepted doctors for this patient
            [connections] = await db.promise().query(`
                SELECT
                    dpc.id AS connection_id,
                    dpc.doctor_id,
                    dpc.patient_id,
                    d.id AS partner_id,
                    d.name,
                    d.profile_photo AS avatar,
                    d.speciality
                FROM doctor_patient_connections dpc
                JOIN doctors d ON d.id = dpc.doctor_id
                WHERE dpc.patient_id = ? AND dpc.status = 'accepted'
            `, [id]);
        }

        if (!connections.length) {
            return res.json({ success: true, data: [] });
        }

        // Ensure every accepted connection has a chat room (auto-create if missing)
        const roomIds = [];
        for (const conn of connections) {
            const roomId = await ensureRoomForConnection(
                conn.connection_id,
                conn.doctor_id,
                conn.patient_id
            );
            roomIds.push(roomId);
        }

        // Now fetch full contact data with last message info
        const result = [];
        for (let i = 0; i < connections.length; i++) {
            const conn = connections[i];
            const roomId = roomIds[i];

            // Get last message for this room
            const [lastMsgRows] = await db.promise().query(`
                SELECT content, message_type, is_encrypted, created_at, status
                FROM chat_messages
                WHERE room_id = ?
                ORDER BY created_at DESC LIMIT 1
            `, [roomId]);

            // Get unread count
            const senderType = role === "doctor" ? "patient" : "doctor";
            const [unreadRows] = await db.promise().query(`
                SELECT COUNT(*) AS cnt
                FROM chat_messages
                WHERE room_id = ? AND sender_type = ? AND status != 'read'
            `, [roomId, senderType]);

            const lastMsg = lastMsgRows[0] || null;
            result.push({
                connection_id:           conn.connection_id,
                partner_id:              conn.partner_id,
                name:                    conn.name,
                avatar:                  conn.avatar,
                speciality:              conn.speciality || null,
                room_id:                 roomId,
                last_message:            lastMsg ? (lastMsg.is_encrypted ? null : lastMsg.content) : null,
                last_message_type:       lastMsg ? lastMsg.message_type : null,
                last_message_encrypted:  lastMsg ? !!lastMsg.is_encrypted : false,
                last_message_at:         lastMsg ? lastMsg.created_at : null,
                unread_count:            unreadRows[0].cnt || 0
            });
        }

        // Sort by last message date descending (newest first), no-message contacts last
        result.sort((a, b) => {
            if (!a.last_message_at && !b.last_message_at) return 0;
            if (!a.last_message_at) return 1;
            if (!b.last_message_at) return -1;
            return new Date(b.last_message_at) - new Date(a.last_message_at);
        });

        res.json({ success: true, data: result });
    } catch (err) {
        console.error("getContacts error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load chats." });
    }
};

/* -- GET /chat/messages/:room_id?before_id=&limit= --------------- */
const getMessages = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "You no longer have access to this conversation." });

    const limit    = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const beforeId = parseInt(req.query.before_id, 10) || null;

    try {
        const params = [room.id];
        let sql = "SELECT * FROM chat_messages WHERE room_id = ?";
        if (beforeId) { sql += " AND id < ?"; params.push(beforeId); }
        sql += " ORDER BY id DESC LIMIT ?";
        params.push(limit);

        const [rows] = await db.promise().query(sql, params);

        await db.promise().query(
            `UPDATE chat_messages SET status = 'delivered'
             WHERE room_id = ? AND sender_type != ? AND status = 'sent'`,
            [room.id, req.role]
        );

        res.json({ success: true, data: rows.reverse(), has_more: rows.length === limit });
    } catch (err) {
        console.error("getMessages error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load messages." });
    }
};

/* -- PATCH /chat/read/:room_id ----------------------------------- */
const markRead = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    try {
        await db.promise().query(
            `UPDATE chat_messages SET status = 'read'
             WHERE room_id = ? AND sender_type != ? AND status != 'read'`,
            [room.id, req.role]
        );

        try {
            const { getIO } = require("../config/socket");
            getIO()?.to(`room:${room.id}`).emit("messages_read", { room_id: room.id, reader: req.role });
        } catch (_) {}

        res.json({ success: true });
    } catch (err) {
        console.error("markRead error:", err.message);
        res.status(500).json({ success: false, message: "Failed to update read status." });
    }
};

/* -- POST /chat/upload ------------------------------------------ */
const uploadChatFile = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file received." });
    }

    const room = await verifyRoomAccess(req.body.room_id, req.role, myId(req));
    if (!room) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ success: false, message: "You no longer have access to this conversation." });
    }

    res.json({
        success: true,
        file: {
            file_name: req.file.originalname,
            file_size: formatBytes(req.file.size),
            file_mime: req.file.mimetype,
            file_url:  `/chat/file/${room.id}/${req.file.filename}`,
            file_iv:   req.body.file_iv || null
        }
    });
};

/* -- GET /chat/file/:room_id/:filename --------------------------- */
const serveFile = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    const filename = path.basename(req.params.filename);
    const resolved = path.join(UPLOAD_ROOT, String(room.id), filename);

    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, message: "File not found." });
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(resolved);
};

/* -- GET /chat/report/:room_id/:report_id ------------------------ */
const getSharedReport = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    const reportId = parseInt(req.params.report_id, 10);

    try {
        const [shared] = await db.promise().query(
            `SELECT id FROM chat_messages
             WHERE room_id = ? AND message_type = 'report_share'
               AND JSON_EXTRACT(metadata, '$.report_id') = ?`,
            [room.id, reportId]
        );
        if (shared.length === 0) {
            return res.status(403).json({ success: false, message: "This report was not shared in this conversation." });
        }

        const [rows] = await db.promise().query(
            "SELECT filename, filetype, dataurl FROM reports WHERE id = ? AND user_id = ?",
            [reportId, room.patient_id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Report not found." });

        res.json({ success: true, ...rows[0] });
    } catch (err) {
        console.error("getSharedReport error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load report." });
    }
};

/* -- GET /chat/room/:partner_id ---------------------------------- */
const getRoomForPartner = async (req, res) => {
    const myRole    = req.role;
    const id        = myId(req);
    const partnerId = parseInt(req.params.partner_id, 10);
    if (!partnerId) return res.status(400).json({ success: false, message: "Invalid partner id." });

    const doctorId  = myRole === "doctor" ? id : partnerId;
    const patientId = myRole === "doctor" ? partnerId : id;

    try {
        const [rows] = await db.promise().query(
            "SELECT id FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ? AND status = 'accepted'",
            [doctorId, patientId]
        );
        if (rows.length === 0) {
            return res.status(403).json({ success: false, message: "You are not connected with this person." });
        }

        const roomId = await ensureRoomForConnection(rows[0].id, doctorId, patientId);
        res.json({ success: true, room_id: roomId });
    } catch (err) {
        console.error("getRoomForPartner error:", err.message);
        res.status(500).json({ success: false, message: "Failed to open conversation." });
    }
};

module.exports = { getContacts, getMessages, markRead, uploadChatFile, serveFile, getSharedReport, getRoomForPartner };