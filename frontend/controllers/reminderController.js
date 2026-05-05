const db = require("../config/db");

/* =========================
   ADD REMINDER
========================= */
const addReminder = (req, res) => {
    const { user_id, medicine, time, frequency } = req.body;

    if (!user_id || !medicine || !time) {
        return res.json({ success: false, message: "All fields required." });
    }

    const sql = "INSERT INTO reminders (user_id, medicine, time, frequency) VALUES (?, ?, ?, ?)";

    db.query(sql, [user_id, medicine, time, frequency || "Once daily"], (err) => {
        if (err) return res.json({ success: false, message: "Failed to add reminder." });
        res.json({ success: true, message: "Reminder added." });
    });
};

/* =========================
   GET REMINDERS
========================= */
const getReminders = (req, res) => {
    const { user_id } = req.params;

    db.query("SELECT * FROM reminders WHERE user_id = ? ORDER BY time ASC", [user_id], (err, result) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, data: result });
    });
};

/* =========================
   DELETE REMINDER
========================= */
const deleteReminder = (req, res) => {
    const { id } = req.params;

    db.query("DELETE FROM reminders WHERE id = ?", [id], (err) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, message: "Reminder deleted." });
    });
};

module.exports = { addReminder, getReminders, deleteReminder };