// ── symptomRoutes.js — CHANGED: protected with requireAuth ───
const express  = require("express");
const router   = express.Router();
const { saveSymptoms, getSymptoms } = require("../controllers/symptomController");
const { requireAuth } = require("../middleware/authMiddleware");

router.post("/save",             requireAuth, saveSymptoms);
router.get( "/history/:user_id", requireAuth, getSymptoms);

module.exports = router;