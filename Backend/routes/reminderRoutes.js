const express = require("express");
const router  = express.Router();
const { addReminder, getReminders, deleteReminder } = require("../controllers/reminderController");

router.post("/add",          addReminder);
router.get("/get/:user_id",  getReminders);   // used by reminder.js
router.get("/:user_id",      getReminders);   // used by dashboard.html
router.delete("/delete/:id", deleteReminder); // used by reminder.js
router.delete("/:id",        deleteReminder); // fallback

module.exports = router;