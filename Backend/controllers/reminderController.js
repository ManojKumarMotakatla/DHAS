// ── CHANGED: user_id from req.userId; delete checks ownership ──
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

function safeJSON(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

let _cols = null;
function getReminderCols(callback) {
    if (_cols) return callback(null, _cols);
    db.query("DESCRIBE reminders", (err, rows) => {
        if (err) return callback(err);
        const names = rows.map(r => r.Field);
        _cols = {
            medicineCol:  names.includes("medicine_name")  ? "medicine_name"  : "medicine",
            startDateCol: names.includes("start_date")     ? "start_date"     : "startDate",
            schedTypeCol: names.includes("schedule_type")  ? "schedule_type"  : "sched",
            schedLblCol:  names.includes("schedule_label") ? "schedule_label" : "scheduleLabel",
            doseCountCol: names.includes("dose_count")     ? "dose_count"     : "doseCount",
            dosesLblCol:  names.includes("doses_label")    ? "doses_label"    : "dosesLabel",
            monthDayCol:  names.includes("month_day")      ? "month_day"      : "monthDay",
            altBaseCol:   names.includes("alt_base")       ? "alt_base"       : "altBase",
        };
        callback(null, _cols);
    });
}

function resolveDate(val) {
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(String(val))) return val;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/* ── ADD ─────────────────────────────────────────────────────── */
const addReminder = (req, res) => {
    // CHANGED: always use token-verified ID
    const user_id = req.userId;

    const { medicine, sched, scheduleLabel, doseCount, dosesLabel,
            times, days, monthDay, duration, sound, startDate, altBase } = req.body;

    if (!medicine || !String(medicine).trim())
        return res.status(400).json({ success: false, message: "Medicine name is required." });
    if (!times || (Array.isArray(times) && times.length === 0))
        return res.status(400).json({ success: false, message: "At least one time is required." });

    getReminderCols((err, c) => {
        if (err) return res.status(500).json({ success: false, message: "DB error." });

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

        db.query(sql, [
            user_id, String(medicine).trim(),
            sched || "daily", scheduleLabel || "",
            parseInt(doseCount) || 1, dosesLabel || "",
            timesJSON, daysJSON, parseInt(monthDay) || 1,
            duration || "forever", sound || "bell",
            resolvedStart, resolvedAlt
        ], (err2, result) => {
            if (err2) {
                console.error("addReminder DB error:", err2);
                return res.status(500).json({ success: false, message: "Failed to save reminder." });
            }
            res.json({ success: true, id: result.insertId });
        });
    });
};

/* ── GET ─────────────────────────────────────────────────────── */
const getReminders = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    // CHANGED: ownership check
    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    getReminderCols((err, c) => {
        if (err) return res.status(500).json({ success: false });

        db.query("SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC", [requestedId], (err2, rows) => {
            if (err2) return res.status(500).json({ success: false });

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

/* ── DELETE ─────────────────────────────────────────────────────
   CHANGED: verifies that the reminder belongs to the token owner
   before deleting. Previously anyone could delete any reminder by
   hitting DELETE /reminders/42.
────────────────────────────────────────────────────────────────── */
const deleteReminder = async (req, res) => {
    const { id } = req.params;

    try {
        // Fetch the reminder first to check ownership
        const [rows] = await db.promise().query(
            "SELECT user_id FROM reminders WHERE id = ?", [id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Reminder not found." });
        }

        // CHANGED: only the owner can delete
        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        db.query("DELETE FROM reminders WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, message: "Reminder deleted." });
        });
    } catch (err) {
        console.error("deleteReminder error:", err);
        return res.status(500).json({ success: false });
    }
};

module.exports = { addReminder, getReminders, deleteReminder };