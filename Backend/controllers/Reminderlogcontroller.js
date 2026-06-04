// ============================================================
// DHAS — Backend/controllers/reminderLogController.js
// Tracks when reminders were taken, missed, or snoozed.
// Provides weekly adherence summary.
// JWT auth required (requireAuth middleware on all routes).
// ============================================================

const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

/* ── LOG a dose ───────────────────────────────────────────── */
/**
 * POST /reminder-logs/log
 * Body: { reminder_id, scheduled_time, status, dose_label }
 * status: "taken" | "missed" | "snoozed"
 */
const logDose = async (req, res) => {
    const user_id = req.userId;
    const { reminder_id, scheduled_time, status, dose_label } = req.body;

    if (!reminder_id || !scheduled_time || !status) {
        return res.status(400).json({
            success: false,
            message: "reminder_id, scheduled_time, and status are required."
        });
    }
    if (!["taken", "missed", "snoozed"].includes(status)) {
        return res.status(400).json({
            success: false,
            message: "status must be 'taken', 'missed', or 'snoozed'."
        });
    }

    try {
        // Verify the reminder belongs to this user
        const [rows] = await db.promise().query(
            "SELECT user_id FROM reminders WHERE id = ?", [reminder_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Reminder not found." });
        }
        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        // Upsert — same reminder + same scheduled_time = update status
        await db.promise().query(
            `INSERT INTO reminder_logs (reminder_id, user_id, scheduled_time, status, dose_label)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), logged_at = NOW()`,
            [reminder_id, user_id, scheduled_time, status, dose_label || ""]
        );

        res.json({ success: true, message: `Dose logged as ${status}.` });
    } catch (err) {
        console.error("logDose error:", err.message);
        res.status(500).json({ success: false, message: "Failed to log dose. Please try again." });
    }
};

/* ── GET logs for a user (last 30 days) ──────────────────── */
/**
 * GET /reminder-logs/user/:user_id
 */
const getLogs = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);
    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
        const [rows] = await db.promise().query(
            `SELECT rl.id, rl.reminder_id, rl.scheduled_time, rl.status,
                    rl.dose_label, rl.logged_at, r.medicine_name
             FROM reminder_logs rl
             JOIN reminders r ON r.id = rl.reminder_id
             WHERE rl.user_id = ?
               AND rl.scheduled_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             ORDER BY rl.scheduled_time DESC
             LIMIT 200`,
            [requestedId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getLogs error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load logs." });
    }
};

/* ── GET weekly adherence summary ────────────────────────── */
/**
 * GET /reminder-logs/adherence/:user_id
 * Returns: { taken, missed, snoozed, adherence_pct }
 */
const getAdherence = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);
    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
        const [rows] = await db.promise().query(
            `SELECT status, COUNT(*) AS count
             FROM reminder_logs
             WHERE user_id = ?
               AND scheduled_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY status`,
            [requestedId]
        );

        const summary = { taken: 0, missed: 0, snoozed: 0 };
        rows.forEach(r => { summary[r.status] = parseInt(r.count); });

        const total = summary.taken + summary.missed + summary.snoozed;
        summary.total = total;
        summary.adherence_pct = total > 0 ? Math.round((summary.taken / total) * 100) : null;

        res.json({ success: true, data: summary });
    } catch (err) {
        console.error("getAdherence error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load adherence data." });
    }
};

module.exports = { logDose, getLogs, getAdherence };