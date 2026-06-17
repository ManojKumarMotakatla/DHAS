// ============================================================
// Backend/middleware/uploadMiddleware.js
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
        // room_id is sent as a normal form field alongside the file
        const roomId = String(parseInt(req.body.room_id, 10) || "misc");
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