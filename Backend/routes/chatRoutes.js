// ============================================================
// Backend/routes/chatRoutes.js
// Mount at app.use("/chat", chatRoutes) — see INTEGRATION_GUIDE.md
// ============================================================

const express = require("express");
const router  = express.Router();

const { identifyChatUser } = require("../middleware/chatAuthMiddleware");
const { chatUpload }       = require("../middleware/uploadMiddleware");
const {
    getContacts, getMessages, markRead, uploadChatFile, serveFile, getSharedReport, getRoomForPartner
} = require("../controllers/chatController");

// Every chat route needs a valid patient OR doctor token
router.use(identifyChatUser);

router.get(   "/contacts",                       getContacts);
router.get(   "/room/:partner_id",               getRoomForPartner);
router.get(   "/messages/:room_id",              getMessages);
router.patch( "/read/:room_id",                  markRead);
router.post(  "/upload",                         chatUpload.single("file"), uploadChatFile);
router.get(   "/file/:room_id/:filename",        serveFile);
router.get(   "/report/:room_id/:report_id",     getSharedReport);

// Multer-specific error handling (unsupported type / too large)
router.use((err, req, res, next) => {
    if (err && err.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(415).json({ success: false, message: "Only PDF, JPG, PNG and WEBP files are supported." });
    }
    if (err && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, message: "File is too large. Maximum size is 8 MB." });
    }
    next(err);
});

module.exports = router;