// ── CHANGED: all routes now require JWT ──────────────────────
const express  = require("express");
const router   = express.Router();
const { getProfile, saveProfile, deleteAccount } = require("../controllers/profileController");
const { requireAuth } = require("../middleware/authMiddleware");

// Every profile route requires a valid token.
// requireAuth sets req.userId from the token — controllers use that,
// not a user_id from the request body or params.

// CHANGED: removed the /profile/ prefix — server.js mounts this at /profile
router.get(   "/:user_id", requireAuth, getProfile);
router.post(  "/save",     requireAuth, saveProfile);
router.delete("/:user_id", requireAuth, deleteAccount);

module.exports = router;