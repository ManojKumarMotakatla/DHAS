// ── profileRoutes.js — includes change-password route ───────
const express    = require("express");
const router     = express.Router();
const { getProfile, saveProfile, deleteAccount } = require("../controllers/profileController");
const { changePassword } = require("../controllers/changePasswordController");
const { requireAuth } = require("../middleware/authMiddleware");

// Every profile route requires a valid token.
router.get(   "/:user_id",       requireAuth, getProfile);
router.post(  "/save",           requireAuth, saveProfile);
router.post(  "/change-password", requireAuth, changePassword);
router.delete("/:user_id",       requireAuth, deleteAccount);

module.exports = router;