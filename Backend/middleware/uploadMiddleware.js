// ============================================================
// Backend/middleware/uploadMiddleware.js
//
// FIXED:
//   - destination() used to read req.body.room_id, but multer
//     only populates req.body with fields that appeared BEFORE
//     the file part in the multipart stream. The frontend
//     appends the file FIRST (form.append("file", ...)) and
//     room_id AFTER, so req.body.room_id was always undefined
//     at this point — every upload silently landed in
//     uploads/chat/misc/ instead of uploads/chat/<room_id>/.
//     serveFile() then looked in the correct room folder and
//     always 404'd. Fixed by reading room_id from the query
//     string instead (?room_id=123), which multer parses from
//     the URL immediately and is always available.
//   - chatRoutes.js / chat.js were updated to match (room_id is
//     now passed as a query param on the upload POST).
//
// Multer config for chat attachments. Files are written to disk
// under Backend/uploads/chat/<room_id>/<random-name>.<ext> and are
// served back out only through the authenticated
// GET /chat/file/:room_id/:filename route (controllers/chatController.js)
// — never via express.static — so every download re-checks that
// the requester still belongs to that room.
// ============================================================

const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "chat");

const ALLOWED_MIME = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
]);

const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // FIX: read room_id from the query string, NOT req.body.
        // req.body fields are only populated as multer streams past
        // them; since the frontend sends the file field before the
        // room_id field, req.body.room_id is undefined when this
        // callback fires. Query params are parsed by Express up
        // front and are always available here.
        const roomId = String(parseInt(req.query.room_id, 10) || "misc");
        const dir = path.join(UPLOAD_ROOT, roomId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ALLOWED_EXT.includes(ext) ? ext : "";
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    }
});

function fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
    cb(null, true);
}

const chatUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

module.exports = { chatUpload, UPLOAD_ROOT, MAX_FILE_BYTES };