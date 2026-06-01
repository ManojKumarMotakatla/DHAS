// ── reminderRoutes.js — CHANGED: protected with requireAuth ──
const express  = require("express");
const router   = express.Router();
const { addReminder, getReminders, deleteReminder } = require("../controllers/reminderController");
const { requireAuth } = require("../middleware/authMiddleware");

router.post(   "/add",          requireAuth, addReminder);
router.get(    "/get/:user_id", requireAuth, getReminders);
router.get(    "/:user_id",     requireAuth, getReminders);
router.delete( "/delete/:id",   requireAuth, deleteReminder);
router.delete( "/:id",          requireAuth, deleteReminder);

module.exports = router;