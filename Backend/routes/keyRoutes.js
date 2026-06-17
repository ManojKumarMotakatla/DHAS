// ============================================================
// Backend/routes/keyRoutes.js
//
// Mount at app.use("/keys", keyRoutes) — see server.js.
// Reuses identifyChatUser (already handles BOTH patient and
// doctor JWTs) so one route file serves both roles, same pattern
// as chatRoutes.js.
// ============================================================

const express = require("express");
const router  = express.Router();

const { identifyChatUser } = require("../middleware/chatAuthMiddleware");
const { saveMyPublicKey, getMyPublicKey, getPartnerPublicKey } = require("../controllers/keyController");

router.use(identifyChatUser);

router.post("/me",               saveMyPublicKey);
router.get( "/me",                getMyPublicKey);
router.get( "/partner/:room_id",  getPartnerPublicKey);

module.exports = router;