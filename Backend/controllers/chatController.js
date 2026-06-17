// ============================================================
// Backend/controllers/chatController.js
//
// CHANGED FOR E2E ENCRYPTION:
//   - getMessages / getContacts now also select is_encrypted, iv,
//     file_iv. The server does NOT decrypt anything - content and
//     file_data may be ciphertext (base64) when is_encrypted = 1.
//     Decryption happens only in the browser (frontend/js/crypto.js).
//   - uploadChatFile now accepts an already-ENCRYPTED file from the
//     browser (multer just stores bytes - it has no idea they're
//     ciphertext, which is exactly the point: the server never sees
//     plaintext file content either).
//   - getSharedReport is UNCHANGED in shape, but note: shared
//     reports (existing medical reports table) are NOT E2E
//     encrypted in this version, since reports.html stores them
//     server-side as plain base64 (existing app behaviour) and
//     encrypting that flow is a bigger lift outside this chat
//     migration. This is flagged in the integration summary.
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
        let rows;
        if (role === "doctor") {
            [rows] = await db.promise().query(`
                SELECT u.id AS partner_id, u.name, u.profile_image AS avatar,
                       cr.id AS room_id, dpc.connected_at,
                       lm.content AS last_message, lm.message_type AS last_message_type,
                       lm.is_encrypted AS last_message_encrypted,
                       lm.created_at AS last_message_at,
                       (SELECT COUNT(*) FROM chat_messages
                         WHERE room_id = cr.id AND sender_type = 'patient' AND status != 'read') AS unread_count
                FROM doctor_patient_connections dpc
                JOIN users u       ON u.id = dpc.patient_id
                JOIN chat_rooms cr ON cr.connection_id = dpc.id
                LEFT JOIN chat_messages lm
                       ON lm.id = (SELECT id FROM chat_messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1)
                WHERE dpc.doctor_id = ? AND dpc.status = 'accepted'
                ORDER BY (lm.created_at IS NULL) ASC, lm.created_at DESC
            `, [id]);
        } else {
            [rows] = await db.promise().query(`
                SELECT d.id AS partner_id, d.name, d.speciality, d.profile_photo AS avatar,
                       cr.id AS room_id, dpc.connected_at,
                       lm.content AS last_message, lm.message_type AS last_message_type,
                       lm.is_encrypted AS last_message_encrypted,
                       lm.created_at AS last_message_at,
                       (SELECT COUNT(*) FROM chat_messages
                         WHERE room_id = cr.id AND sender_type = 'doctor' AND status != 'read') AS unread_count
                FROM doctor_patient_connections dpc
                JOIN doctors d     ON d.id = dpc.doctor_id
                JOIN chat_rooms cr ON cr.connection_id = dpc.id
                LEFT JOIN chat_messages lm
                       ON lm.id = (SELECT id FROM chat_messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1)
                WHERE dpc.patient_id = ? AND dpc.status = 'accepted'
                ORDER BY (lm.created_at IS NULL) ASC, lm.created_at DESC
            `, [id]);
        }

        res.json({ success: true, data: rows });
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
        } catch (_) { /* socket layer may not be initialised yet, that's fine */ }

        res.json({ success: true });
    } catch (err) {
        console.error("markRead error:", err.message);
        res.status(500).json({ success: false, message: "Failed to update read status." });
    }
};

/* -- POST /chat/upload  (multer field name: "file") --------------
   The browser ENCRYPTS the file with AES-256-GCM before this point
   (see frontend/js/chat.js -> encryptAndUploadFile). What multer
   receives and writes to disk is already ciphertext bytes - the
   server has no way to view the original image/PDF content.
   req.body.file_iv carries the AES-GCM nonce, forwarded back to the
   client via the socket message row so it can decrypt on download. */
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

/* -- GET /chat/file/:room_id/:filename ----------------------------
   Returns raw (ciphertext) bytes. Decryption happens in the browser
   using the file_iv stored on the message + the room's shared key. */
const serveFile = async (req, res) => {
    const room = await verifyRoomAccess(req.params.room_id, req.role, myId(req));
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    const filename = path.basename(req.params.filename);
    const resolved = path.join(UPLOAD_ROOT, String(room.id), filename);

    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, message: "File not found." });
    }
    // Deliberately NOT res.sendFile() with content-type sniffing -
    // ciphertext isn't a real image/pdf, so we always serve as a generic
    // binary stream; the browser only ever treats it as bytes-to-decrypt.
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

/* -- GET /chat/room/:partner_id ----------------------------------- */
const getRoomForPartner = async (req, res) => {
    const myRole    = req.role;
    const id         = myId(req);
    const partnerId  = parseInt(req.params.partner_id, 10);
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