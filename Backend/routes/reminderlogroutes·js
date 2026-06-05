// Backend/routes/reminderlogroutes.js
const express = require("express");
const router  = express.Router();
const { logDose, getLogs, getAdherence } = require("../controllers/reminderlogcontroller");
const { requireAuth } = require("../middleware/authMiddleware");

router.post("/log",                requireAuth, logDose);
router.get( "/user/:user_id",      requireAuth, getLogs);
router.get( "/adherence/:user_id", requireAuth, getAdherence);

module.exports = router;