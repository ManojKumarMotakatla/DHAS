// ── symptomRoutes.js (FIXED) ─────────────────────────────────
// Added /history/:user_id route to match what symptom_history.html
// calls: GET /symptoms/history/:user_id
// ─────────────────────────────────────────────────────────────
const express  = require("express");
const router   = express.Router();
const { saveSymptoms, getSymptoms } = require("../controllers/symptomController");
const { requireAuth } = require("../middleware/authMiddleware");

router.post("/save",                requireAuth, saveSymptoms);
router.get( "/history/:user_id",    requireAuth, getSymptoms);  // used by symptom_history.html
router.get( "/:user_id",            requireAuth, getSymptoms);  // legacy / alternate

module.exports = router;