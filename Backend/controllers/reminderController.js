const db = require("../config/db");

/* ─────────────────────────────────────────────
   Helper: safely parse a JSON column
   (mysql2 may return it pre-parsed or as string)
───────────────────────────────────────────── */
function safeJSON(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "object") return val;   // already parsed by driver
    try { return JSON.parse(val); } catch { return fallback; }
}

/* ─────────────────────────────────────────────
   ADD REMINDER
   Front-end sends camelCase; we map to DB snake_case.
───────────────────────────────────────────── */
const addReminder = (req, res) => {
    const {
        user_id,
        medicine,
        sched,           // e.g. "daily", "weekly" …
        scheduleLabel,
        doseCount,
        dosesLabel,
        times,           // array [{label,display,h,m,ampm}]
        days,            // array [0-6]
        monthDay,
        duration,
        sound,
        startDate,
        altBase          // ISO string or null
    } = req.body;

    if (!user_id || !medicine || !times) {
        return res.status(400).json({
            success: false,
            message: "user_id, medicine, and times are required."
        });
    }

    const sql = `
        INSERT INTO reminders
          (user_id, medicine_name,
           schedule_type, schedule_label,
           dose_count, doses_label,
           times, days, month_day,
           duration, sound,
           start_date, alt_base)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        user_id,
        medicine.trim(),
        sched          || "daily",
        scheduleLabel  || "",
        parseInt(doseCount) || 1,
        dosesLabel     || "",
        JSON.stringify(Array.isArray(times) ? times : []),
        JSON.stringify(Array.isArray(days)  ? days  : []),
        parseInt(monthDay) || 1,
        duration       || "forever",
        sound          || "bell",
        startDate      || new Date().toISOString().split("T")[0],
        altBase        || null
    ];

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error("addReminder DB error:", err);
            return res.status(500).json({ success: false, message: "Failed to save reminder." });
        }
        res.json({ success: true, id: result.insertId });
    });
};

/* ─────────────────────────────────────────────
   GET REMINDERS
   Returns ALL reminders for a user — including
   expired ones — so history is never lost.
   We remap DB snake_case → camelCase that
   reminder.js expects.
───────────────────────────────────────────── */
const getReminders = (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id required." });
    }

    db.query(
        "SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC",
        [user_id],
        (err, rows) => {
            if (err) {
                console.error("getReminders error:", err);
                return res.status(500).json({ success: false });
            }

            const data = rows.map(r => ({
                // Pass through the raw DB id
                id:            r.id,
                medicine:      r.medicine_name,

                // ── camelCase mapping for reminder.js ──
                sched:         r.schedule_type,
                scheduleLabel: r.schedule_label,
                doseCount:     String(r.dose_count),
                dosesLabel:    r.doses_label,

                // JSON columns (driver may already parse them)
                times:         safeJSON(r.times, []),
                days:          safeJSON(r.days,  []),
                monthDay:      r.month_day,

                duration:      r.duration,
                sound:         r.sound,
                startDate:     r.start_date,
                altBase:       r.alt_base  ? new Date(r.alt_base).toISOString()  : null,
                createdAt:     r.created_at ? new Date(r.created_at).toISOString() : null
            }));

            res.json({ success: true, data });
        }
    );
};

/* ─────────────────────────────────────────────
   DELETE REMINDER
   Hard-deletes a single reminder by id.
   If you ever want soft-delete (keep history),
   add a `deleted_at DATETIME NULL` column and
   change this to UPDATE … SET deleted_at = NOW().
───────────────────────────────────────────── */
const deleteReminder = (req, res) => {
    const { id } = req.params;

    db.query("DELETE FROM reminders WHERE id = ?", [id], (err) => {
        if (err) {
            console.error("deleteReminder error:", err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, message: "Reminder deleted." });
    });
};

module.exports = { addReminder, getReminders, deleteReminder };