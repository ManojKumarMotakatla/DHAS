const db = require("../config/db");

/* ── helper: safely parse JSON columns ── */
function safeJSON(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

/* ── helper: detect actual column names on first use ── */
let _cols = null;

function getReminderCols(callback) {
    if (_cols) return callback(null, _cols);
    db.query("DESCRIBE reminders", (err, rows) => {
        if (err) return callback(err);
        const names = rows.map(r => r.Field);
        _cols = {
            medicineCol:  names.includes("medicine_name") ? "medicine_name" : "medicine",
            startDateCol: names.includes("start_date")    ? "start_date"    : "startDate",
            schedTypeCol: names.includes("schedule_type") ? "schedule_type" : "sched",
            schedLblCol:  names.includes("schedule_label")? "schedule_label": "scheduleLabel",
            doseCountCol: names.includes("dose_count")    ? "dose_count"    : "doseCount",
            dosesLblCol:  names.includes("doses_label")   ? "doses_label"   : "dosesLabel",
            monthDayCol:  names.includes("month_day")     ? "month_day"     : "monthDay",
            altBaseCol:   names.includes("alt_base")      ? "alt_base"      : "altBase",
        };
        console.log("reminders table cols detected:", _cols);
        callback(null, _cols);
    });
}

/* ── resolve a valid YYYY-MM-DD from any input ── */
function resolveDate(val) {
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(String(val))) return val;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────────
   ADD REMINDER
───────────────────────────────────────────── */
const addReminder = (req, res) => {
    const { user_id, medicine, sched, scheduleLabel, doseCount, dosesLabel,
            times, days, monthDay, duration, sound, startDate, altBase } = req.body;

    if (!user_id)                                           return res.status(400).json({ success: false, message: "user_id is required." });
    if (!medicine || !String(medicine).trim())              return res.status(400).json({ success: false, message: "Medicine name is required." });
    if (!times || (Array.isArray(times) && times.length === 0)) return res.status(400).json({ success: false, message: "At least one time is required." });

    getReminderCols((err, c) => {
        if (err) return res.status(500).json({ success: false, message: "DB error.", dbError: err.code });

        const resolvedStart = resolveDate(startDate);
        let resolvedAlt = null;
        if (altBase) { const d = new Date(altBase); if (!isNaN(d)) resolvedAlt = d.toISOString().slice(0,19).replace('T',' '); }

        const timesJSON = JSON.stringify(Array.isArray(times) ? times : []);
        const daysJSON  = JSON.stringify(Array.isArray(days)  ? days  : []);

        const sql = `
            INSERT INTO reminders
              (user_id, ${c.medicineCol},
               ${c.schedTypeCol}, ${c.schedLblCol},
               ${c.doseCountCol}, ${c.dosesLblCol},
               times, days, ${c.monthDayCol},
               duration, sound,
               ${c.startDateCol}, ${c.altBaseCol})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            user_id, String(medicine).trim(),
            sched || "daily", scheduleLabel || "",
            parseInt(doseCount) || 1, dosesLabel || "",
            timesJSON, daysJSON, parseInt(monthDay) || 1,
            duration || "forever", sound || "bell",
            resolvedStart, resolvedAlt
        ];

        db.query(sql, params, (err2, result) => {
            if (err2) {
                console.error("addReminder DB error:", err2);
                return res.status(500).json({ success: false, message: "Failed to save reminder.", dbError: err2.code, dbMessage: err2.sqlMessage });
            }
            res.json({ success: true, id: result.insertId });
        });
    });
};

/* ─────────────────────────────────────────────
   GET REMINDERS
───────────────────────────────────────────── */
const getReminders = (req, res) => {
    const { user_id } = req.params;
    if (!user_id) return res.status(400).json({ success: false, message: "user_id required." });

    getReminderCols((err, c) => {
        if (err) return res.status(500).json({ success: false });

        db.query("SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC", [user_id], (err2, rows) => {
            if (err2) { console.error("getReminders error:", err2); return res.status(500).json({ success: false }); }

            const data = rows.map(r => {
                const rawStart = r[c.startDateCol];
                const startStr = rawStart
                    ? (rawStart instanceof Date ? rawStart.toISOString().split("T")[0] : String(rawStart).split("T")[0])
                    : null;
                const rawAlt = r[c.altBaseCol];
                return {
                    id:            r.id,
                    medicine:      r[c.medicineCol],
                    sched:         r[c.schedTypeCol],
                    scheduleLabel: r[c.schedLblCol],
                    doseCount:     String(r[c.doseCountCol]),
                    dosesLabel:    r[c.dosesLblCol],
                    times:         safeJSON(r.times, []),
                    days:          safeJSON(r.days,  []),
                    monthDay:      r[c.monthDayCol],
                    duration:      r.duration,
                    sound:         r.sound,
                    startDate:     startStr,
                    altBase:       rawAlt ? new Date(rawAlt).toISOString() : null,
                    createdAt:     r.created_at ? new Date(r.created_at).toISOString() : null
                };
            });
            res.json({ success: true, data });
        });
    });
};

/* ─────────────────────────────────────────────
   DELETE REMINDER
───────────────────────────────────────────── */
const deleteReminder = (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM reminders WHERE id = ?", [id], (err) => {
        if (err) { console.error("deleteReminder error:", err); return res.status(500).json({ success: false }); }
        res.json({ success: true, message: "Reminder deleted." });
    });
};

module.exports = { addReminder, getReminders, deleteReminder };