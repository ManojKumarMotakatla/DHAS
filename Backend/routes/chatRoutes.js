// ============================================================
// Backend/routes/chatRoutes.js
//
// Added: GET /chat/shared-counts/:room_id
//   Returns counts of symptom_share and report_share messages in a
//   given room — used by the doctor dashboard to show how many
//   symptoms/reports the patient has actually shared in chat,
//   rather than their total record counts.
// ============================================================

const express = require("express");
const router  = express.Router();

const { identifyChatUser } = require("../middleware/chatAuthMiddleware");
const { chatUpload }       = require("../middleware/uploadMiddleware");
const {
    getContacts, getMessages, markRead, uploadChatFile,
    serveFile, getSharedReport, getRoomForPartner, sendMessage,
    getPresence, getChatSharedCounts
} = require("../controllers/chatController");

router.use(identifyChatUser);

router.get(   "/contacts",                    getContacts);
router.get(   "/room/:partner_id",            getRoomForPartner);
router.get(   "/messages/:room_id",           getMessages);
router.get(   "/presence/:room_id",           getPresence);
router.get(   "/shared-counts/:room_id",      getChatSharedCounts);   // NEW
router.patch( "/read/:room_id",               markRead);
router.post(  "/send",                        sendMessage);
router.post(  "/upload",                      chatUpload.single("file"), uploadChatFile);
router.get(   "/file/:room_id/:filename",     serveFile);
router.get(   "/report/:room_id/:report_id",  getSharedReport);

router.use((err, req, res, next) => {
    if (err && err.message === "UNSUPPORTED_FILE_TYPE")
        return res.status(415).json({ success: false, message: "Only PDF, JPG, PNG and WEBP files are supported." });
    if (err && err.code === "LIMIT_FILE_SIZE")
        return res.status(413).json({ success: false, message: "File is too large. Maximum size is 8 MB." });
    next(err);
});

module.exports = router;