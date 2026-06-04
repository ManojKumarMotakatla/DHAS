// ── reminderController.js — SIMPLIFIED: removed getReminderCols() detection.
//    Schema now uses fixed column names: medicine_name, schedule_type,
//    schedule_label, dose_count, doses_label, start_date, alt_base.
//    P1.4: No SQL error details sent to client.
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

function safeJSON(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

function resolveDate(val) {
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(String(val))) return val;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/* ── ADD ──────────────────────────────────────────────────────── */
const addReminder = (req, res) => {
    const user_id = req.userId;
    const {
        medicine, sched, scheduleLabel, doseCount, dosesLabel,
        times, days, monthDay, duration, sound, startDate, altBase
    } = req.body;

    if (!medicine || !String(medicine).trim())
        return res.status(400).json({ success: false, message: "Medicine name is required." });
    if (!times || (Array.isArray(times) && times.length === 0))
        return res.status(400).json({ success: false, message: "At least one time is required." });

    const resolvedStart = resolveDate(startDate);
    let resolvedAlt = null;
    if (altBase) {
        const d = new Date(altBase);
        if (!isNaN(d)) resolvedAlt = d.toISOString().slice(0,19).replace('T',' ');
    }

    const timesJSON = JSON.stringify(Array.isArray(times) ? times : []);
    const daysJSON  = JSON.stringify(Array.isArray(days)  ? days  : []);

    const sql = `
        INSERT INTO reminders
          (user_id, medicine_name, schedule_type, schedule_label,
           dose_count, doses_label, times, days, month_day,
           duration, sound, start_date, alt_base)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        user_id,
        String(medicine).trim(),
        sched        || "daily",
        scheduleLabel || "",
        parseInt(doseCount) || 1,
        dosesLabel   || "",
        timesJSON,
        daysJSON,
        parseInt(monthDay) || 1,
        duration     || "forever",
        sound        || "bell",
        resolvedStart,
        resolvedAlt
    ], (err, result) => {
        if (err) {
            console.error("addReminder DB error:", err.message);
            return res.status(500).json({ success: false, message: "Failed to save reminder. Please try again." });
        }
        res.json({ success: true, id: result.insertId });
    });
};

/* ── GET ──────────────────────────────────────────────────────── */
const getReminders = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    db.query(
        "SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC",
        [requestedId],
        (err, rows) => {
            if (err) {
                console.error("getReminders DB error:", err.message);
                return res.status(500).json({ success: false, message: "Failed to load reminders." });
            }

            const data = rows.map(r => {
                const rawStart = r.start_date;
                const startStr = rawStart
                    ? (rawStart instanceof Date
                        ? rawStart.toISOString().split("T")[0]
                        : String(rawStart).split("T")[0])
                    : null;
                const rawAlt = r.alt_base;
                return {
                    id:            r.id,
                    medicine:      r.medicine_name,
                    sched:         r.schedule_type,
                    scheduleLabel: r.schedule_label,
                    doseCount:     String(r.dose_count),
                    dosesLabel:    r.doses_label,
                    times:         safeJSON(r.times, []),
                    days:          safeJSON(r.days,  []),
                    monthDay:      r.month_day,
                    duration:      r.duration,
                    sound:         r.sound,
                    startDate:     startStr,
                    altBase:       rawAlt ? new Date(rawAlt).toISOString() : null,
                    createdAt:     r.created_at ? new Date(r.created_at).toISOString() : null
                };
            });

            res.json({ success: true, data });
        }
    );
};

/* ── DELETE ───────────────────────────────────────────────────── */
const deleteReminder = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.promise().query(
            "SELECT user_id FROM reminders WHERE id = ?", [id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Reminder not found." });
        }

        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        db.query("DELETE FROM reminders WHERE id = ?", [id], (err) => {
            if (err) {
                console.error("deleteReminder DB error:", err.message);
                return res.status(500).json({ success: false, message: "Failed to delete reminder." });
            }
            res.json({ success: true, message: "Reminder deleted." });
        });
    } catch (err) {
        console.error("deleteReminder error:", err.message);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = { addReminder, getReminders, deleteReminder };