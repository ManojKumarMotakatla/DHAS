// ============================================================
// Backend/routes/chatRoutes.js
//
// NEW: GET /chat/presence/:room_id — REST fallback for "is my
// partner online / when were they last seen", used by the frontend
// for the very first paint of the chat header (before the socket's
// join_room ack — which now also carries partner_presence — comes
// back). See chatController.getPresence for the access-control
// reasoning (same verifyRoomAccess() guard as every other route here).
// ============================================================

const express = require("express");
const router  = express.Router();

const { identifyChatUser } = require("../middleware/chatAuthMiddleware");
const { chatUpload }       = require("../middleware/uploadMiddleware");
const {
    getContacts, getMessages, markRead, uploadChatFile,
    serveFile, getSharedReport, getRoomForPartner, sendMessage,
    getPresence
} = require("../controllers/chatController");

router.use(identifyChatUser);

router.get(   "/contacts",                   getContacts);
router.get(   "/room/:partner_id",           getRoomForPartner);
router.get(   "/messages/:room_id",          getMessages);
router.get(   "/presence/:room_id",          getPresence);          // NEW
router.patch( "/read/:room_id",              markRead);
router.post(  "/send",                       sendMessage);           // REST fallback for sending
router.post(  "/upload",                     chatUpload.single("file"), uploadChatFile);
router.get(   "/file/:room_id/:filename",    serveFile);
router.get(   "/report/:room_id/:report_id", getSharedReport);

router.use((err, req, res, next) => {
    if (err && err.message === "UNSUPPORTED_FILE_TYPE")
        return res.status(415).json({ success: false, message: "Only PDF, JPG, PNG and WEBP files are supported." });
    if (err && err.code === "LIMIT_FILE_SIZE")
        return res.status(413).json({ success: false, message: "File is too large. Maximum size is 8 MB." });
    next(err);
});

module.exports = router;