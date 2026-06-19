// ============================================================
// Backend/controllers/chatController.js
// ============================================================

const path = require("path");
const fs   = require("fs");
const db   = require("../config/db");
const { verifyRoomAccess, ensureRoomForConnection } = require("../utils/chatAccess");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");

function myId(req) { return req.role === "doctor" ? req.doctorId : req.userId; }

function formatBytes(bytes) {
    if (bytes < 1024)            return bytes + " B";
    if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/* ── GET /chat/contacts ─────────────────────────────────────── */
const getContacts = async (req, res) => {
    const { role } = req;
    const id = myId(req);
    try {
        let connections;
        if (role === "doctor") {
            [connections] = await db.promise().query(`
                SELECT dpc.id AS connection_id, dpc.doctor_id, dpc.patient_id,
                       u.id AS partner_id, u.name,
                       up.profile_image AS avatar,
                       NULL AS speciality
                FROM doctor_patient_connections dpc
                JOIN  users u  ON u.id = dpc.patient_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                WHERE dpc.doctor_id = ? AND dpc.status = 'accepted'
            `, [id]);
        } else {
            [connections] = await db.promise().query(`
                SELECT dpc.id AS connection_id, dpc.doctor_id, dpc.patient_id,
                       d.id AS partner_id, d.name,
                       d.profile_photo AS avatar, d.speciality
                FROM doctor_patient_connections dpc
                JOIN doctors d ON d.id = dpc.doctor_id
                WHERE dpc.patient_id = ? AND dpc.status = 'accepted'
            `, [id]);
        }

        if (!connections.length) return res.json({ success: true, data: [] });

        const roomIds = [];
        for (const conn of connections) {
            const roomId = await ensureRoomForConnection(conn.connection_id, conn.doctor_id, conn.patient_id);
            roomIds.push(roomId);
        }

        const result = [];
        for (let i = 0; i < connections.length; i++) {
            const conn   = connections[i];
            const roomId = roomIds[i];
            const [lastMsgRows] = await db.promise().query(
                `SELECT content, message_type, is_encrypted, created_at, status
                 FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`, [roomId]);
            const senderType = role === "doctor" ? "patient" : "doctor";
            const [unreadRows] = await db.promise().query(
                `SELECT COUNT(*) AS cnt FROM chat_messages
                 WHERE room_id = ? AND sender_type = ? AND status != 'read'`, [roomId, senderType]);
            const lastMsg = lastMsgRows[0] || null;
            result.push({
                connection_id:          conn.connection_id,
                partner_id:             conn.partner_id,
                name:                   conn.name,
                avatar:                 conn.avatar,
                speciality:             conn.speciality || null,
                room_id:                roomId,
                last_message:           lastMsg ? (lastMsg.is_encrypted ? null : lastMsg.content) : null,
                last_message_type:      lastMsg ? lastMsg.message_type : null,
                last_message_encrypted: lastMsg ? !!lastMsg.is_encrypted : false,
                last_message_at:        lastMsg ? lastMsg.created_at : null,
                unread_count:           unreadRows[0].cnt || 0
            });
        }
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

/* ── GET /chat/messages/:room_id ────────────────────────────── */
const getMessages = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });
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
            [room.id, req.role]);
        res.json({ success: true, data: rows.reverse(), has_more: rows.length === limit });
    } catch (err) {
        console.error("getMessages error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load messages." });
    }
};

/* ── PATCH /chat/read/:room_id ──────────────────────────────── */
const markRead = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });
    try {
        await db.promise().query(
            `UPDATE chat_messages SET status = 'read'
             WHERE room_id = ? AND sender_type != ? AND status != 'read'`,
            [room.id, req.role]);
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

/* ── POST /chat/send  (REST fallback for when socket unavailable) */
const sendMessage = async (req, res) => {
    const { role } = req;
    const id = myId(req);
    const {
        room_id, message_type, content, is_encrypted, iv,
        file_name, file_size, file_mime, file_url, file_iv, metadata
    } = req.body;

    const room = await verifyRoomAccess(room_id, role, id);
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    const allowedTypes = ["text", "image", "pdf", "symptom_share", "report_share"];
    if (!allowedTypes.includes(message_type))
        return res.status(400).json({ success: false, message: "Unsupported message type." });

    if ((message_type === "symptom_share" || message_type === "report_share") && role !== "patient")
        return res.status(403).json({ success: false, message: "Only patients can share symptom or report data." });

    try {
        let finalContent  = content || null;
        let finalMetadata = metadata ? JSON.stringify(metadata) : null;

        if (message_type === "symptom_share") {
            const symptomId = parseInt(metadata?.symptom_id, 10);
            if (!symptomId) return res.status(400).json({ success: false, message: "No symptom selected." });
            const [rows] = await db.promise().query(
                "SELECT * FROM symptoms WHERE id = ? AND user_id = ?", [symptomId, id]);
            if (!rows.length) return res.status(403).json({ success: false, message: "Symptom not found." });
            const s = rows[0];
            let syms; try { syms = JSON.parse(s.symptoms); } catch { syms = []; }
            finalContent  = `Shared symptom check: ${s.condition_name || "General"}`;
            finalMetadata = JSON.stringify({ symptom_id: s.id, symptoms: syms, condition_name: s.condition_name, severity: s.severity, checked_at: s.created_at });
        }

        if (message_type === "report_share") {
            const reportId = parseInt(metadata?.report_id, 10);
            if (!reportId) return res.status(400).json({ success: false, message: "No report selected." });
            const [rows] = await db.promise().query(
                "SELECT id, filename, filesize, filetype FROM reports WHERE id = ? AND user_id = ?", [reportId, id]);
            if (!rows.length) return res.status(403).json({ success: false, message: "Report not found." });
            const r = rows[0];
            finalContent  = `Shared report: ${r.filename}`;
            finalMetadata = JSON.stringify({ report_id: r.id, filename: r.filename, filesize: r.filesize, filetype: r.filetype });
        }

        const [result] = await db.promise().query(
            `INSERT INTO chat_messages
                (room_id, sender_type, sender_id, message_type, content,
                 file_name, file_size, file_mime, file_data, metadata,
                 is_encrypted, iv, file_iv, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
            [room.id, role, id, message_type, finalContent,
             file_name || null, file_size || null, file_mime || null,
             file_url  || null, finalMetadata,
             is_encrypted ? 1 : 0, iv || null, file_iv || null]);

        const [savedRows] = await db.promise().query(
            "SELECT * FROM chat_messages WHERE id = ?", [result.insertId]);
        const saved = savedRows[0];

        // Broadcast via socket if available
        try {
            const { getIO } = require("../config/socket");
            const io = getIO();
            if (io) {
                io.to(`room:${room.id}`).emit("new_message", saved);
                const notifyRole = role === "doctor" ? "patient" : "doctor";
                const notifyId   = role === "doctor" ? room.patient_id : room.doctor_id;
                io.to(`user:${notifyRole}:${notifyId}`).emit("contact_update", { room_id: room.id });
            }
        } catch (_) {}

        res.json({ success: true, message: saved });
    } catch (err) {
        console.error("sendMessage error:", err.message);
        res.status(500).json({ success: false, message: "Failed to send message." });
    }
};

/* ── POST /chat/upload ──────────────────────────────────────── */
const uploadChatFile = async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file received." });
    const roomIdRaw = req.query.room_id || req.body.room_id;
    const room = await verifyRoomAccess(roomIdRaw, req.role, myId(req));
    if (!room) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ success: false, message: "Access denied." }); }
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

/* ── GET /chat/file/:room_id/:filename ──────────────────────── */
const serveFile = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });
    const filename = path.basename(req.params.filename);
    const resolved = path.join(UPLOAD_ROOT, String(room.id), filename);
    if (!fs.existsSync(resolved)) return res.status(404).json({ success: false, message: "File not found." });
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(resolved);
};

/* ── GET /chat/report/:room_id/:report_id ───────────────────── */
const getSharedReport = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });
    const reportId = parseInt(req.params.report_id, 10);
    try {
        const [shared] = await db.promise().query(
            `SELECT id FROM chat_messages WHERE room_id = ? AND message_type = 'report_share'
             AND JSON_EXTRACT(metadata, '$.report_id') = ?`, [room.id, reportId]);
        if (!shared.length) return res.status(403).json({ success: false, message: "Report not shared in this conversation." });
        const [rows] = await db.promise().query(
            "SELECT filename, filetype, dataurl FROM reports WHERE id = ? AND user_id = ?",
            [reportId, room.patient_id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Report not found." });
        res.json({ success: true, ...rows[0] });
    } catch (err) {
        console.error("getSharedReport error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load report." });
    }
};

/* ── GET /chat/room/:partner_id ─────────────────────────────── */
const getRoomForPartner = async (req, res) => {
    const myRole    = req.role;
    const id        = myId(req);
    const partnerId = parseInt(req.params.partner_id, 10);
    if (!partnerId) return res.status(400).json({ success: false, message: "Invalid partner id." });
    if (partnerId === id) return res.status(400).json({ success: false, message: "You cannot open a chat with yourself." });

    const doctorId  = myRole === "doctor" ? id        : partnerId;
    const patientId = myRole === "doctor" ? partnerId : id;

    try {
        const [allRows] = await db.promise().query(
            "SELECT id, status FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ?",
            [doctorId, patientId]);
        if (!allRows.length) {
            return res.status(403).json({ success: false, message: "You are not connected with this person yet. Connect using an invite code first." });
        }
        const conn = allRows[0];
        if (conn.status === "pending")  return res.status(403).json({ success: false, message: "This connection is still pending approval. Chat will open once accepted." });
        if (conn.status === "rejected") return res.status(403).json({ success: false, message: "This connection request was declined." });
        if (conn.status !== "accepted") return res.status(403).json({ success: false, message: `Unexpected connection status: ${conn.status}` });

        const roomId = await ensureRoomForConnection(conn.id, doctorId, patientId);
        res.json({ success: true, room_id: roomId });
    } catch (err) {
        console.error("getRoomForPartner error:", err.message);
        res.status(500).json({ success: false, message: "Failed to open conversation." });
    }
};

module.exports = {
    getContacts, getMessages, markRead, sendMessage,
    uploadChatFile, serveFile, getSharedReport, getRoomForPartner
};