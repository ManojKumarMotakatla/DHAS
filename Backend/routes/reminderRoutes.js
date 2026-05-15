const express = require("express");
const router  = express.Router();
const { addReminder, getReminders, deleteReminder } = require("../controllers/reminderController");

router.post("/add",          addReminder);
router.get("/get/:user_id",  getReminders);
router.delete("/delete/:id", deleteReminder);

module.exports = router;