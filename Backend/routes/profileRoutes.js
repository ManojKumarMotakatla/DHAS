// ── profileRoutes.js ─────────────────────────────────────────
// CHANGED: change-password now uses requireAnyAuth instead of
// requireAuth so that doctor tokens (doctorId, role:"doctor")
// are accepted in addition to patient tokens (userId).
// All other routes remain patient-only via requireAuth.
// ──────────────────────────────────────────────────────────────
const express    = require("express");
const router     = express.Router();
const { getProfile, saveProfile, deleteAccount } = require("../controllers/profileController");
const { changePassword } = require("../controllers/changePasswordController");
const { requireAuth, requireAnyAuth } = require("../middleware/authMiddleware");

// Patient-only profile routes
router.get(   "/:user_id",        requireAuth,    getProfile);
router.post(  "/save",            requireAuth,    saveProfile);
router.delete("/:user_id",        requireAuth,    deleteAccount);

// Shared route: patients AND doctors can change their password
router.post(  "/change-password", requireAnyAuth, changePassword);

module.exports = router;