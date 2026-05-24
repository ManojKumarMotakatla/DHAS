// ============================================
// DHAS - reminder.js  (v4 — snooze + edit)
// ============================================

const API = "http://localhost:3006/reminders";

function getUserId() {
    const flatKeys = ["user_id","userId","uid","dhas_user_id","dhas_userId","id","user"];
    for (const store of [localStorage, sessionStorage]) {
        for (const key of flatKeys) {
            const val = store.getItem(key);
            if (val && val !== "null" && val !== "undefined") {
                if (!val.startsWith("{") && !val.startsWith("[")) return val;
            }
        }
        const jsonKeys = ["user","dhas_user","currentUser","loggedInUser","profile"];
        for (const key of jsonKeys) {
            const raw = store.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                const id  = obj.user_id || obj.userId || obj.uid || obj.id;
                if (id) return String(id);
            } catch { /* not JSON */ }
        }
    }
    return null;
}

let remindersCache = [];
function getReminders() { return remindersCache; }

// ── Audio Engine ──────────────────────────────────────────────
if ("Notification" in window) Notification.requestPermission();

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

const SOUNDS = {
    bell:   { label:"Bell",   play(ctx){ playTone(ctx,[{freq:880,dur:0.3,delay:0,gain:0.6},{freq:660,dur:0.3,delay:0.35,gain:0.5},{freq:880,dur:0.5,delay:0.7,gain:0.7}],"sine"); } },
    chime:  { label:"Chime",  play(ctx){ [523,659,784,1047,784,659,523].forEach((f,i)=>playTone(ctx,[{freq:f,dur:0.25,delay:i*0.18,gain:0.45}],"sine")); } },
    beep:   { label:"Beep",   play(ctx){ [0,0.35,0.7].forEach(d=>playTone(ctx,[{freq:1000,dur:0.2,delay:d,gain:0.5}],"square")); } },
    gentle: { label:"Gentle", play(ctx){ playTone(ctx,[{freq:440,dur:0.8,delay:0,gain:0.3},{freq:550,dur:0.8,delay:0.5,gain:0.25},{freq:440,dur:0.8,delay:1.0,gain:0.2}],"sine"); } },
    alarm:  { label:"Alarm",  play(ctx){ for(let i=0;i<6;i++) playTone(ctx,[{freq:i%2===0?880:660,dur:0.18,delay:i*0.2,gain:0.6}],"sawtooth"); } }
};

function playTone(ctx, notes, type) {
    notes.forEach(({ freq, dur, delay, gain }) => {
        const osc = ctx.createOscillator(), gn = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gn.gain.setValueAtTime(0, ctx.currentTime + delay);
        gn.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.connect(gn); gn.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur + 0.05);
    });
}

function playSound(soundKey) {
    const s = SOUNDS[soundKey] || SOUNDS.bell;
    try { s.play(getAudioCtx()); } catch (e) { console.warn("Audio:", e); }
}

window.previewSound = function () {
    playSound(document.getElementById("alarmSound").value);
};

// ── Snooze state ──────────────────────────────────────────────
let snoozeTimers = {};

function snoozeReminder(reminderId, soundKey, toastEl) {
    // Remove the current toast
    toastEl.remove();

    // Cancel any existing snooze for this reminder
    if (snoozeTimers[reminderId]) clearTimeout(snoozeTimers[reminderId]);

    // Show a small snooze confirmation
    const snoozeNote = document.createElement("div");
    snoozeNote.id = `snooze-note-${reminderId}`;
    snoozeNote.innerHTML = `
        <div style="position:fixed;bottom:24px;right:20px;
                    background:#1e293b;color:#fff;
                    border-radius:12px;padding:12px 18px;
                    box-shadow:0 4px 20px rgba(0,0,0,0.3);
                    z-index:99998;font-size:0.83rem;font-weight:600;
                    display:flex;align-items:center;gap:8px;
                    animation:snoozeSlide .3s ease;">
          <style>@keyframes snoozeSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>
          <i class="ti ti-clock-snooze" style="font-size:16px;color:#60a5fa" aria-hidden="true"></i>
          Snoozed for 10 minutes
        </div>`;
    document.body.appendChild(snoozeNote);
    setTimeout(() => snoozeNote.remove(), 3500);

    // Re-fire the alarm after 10 minutes
    snoozeTimers[reminderId] = setTimeout(() => {
        const r = remindersCache.find(x => x.id === reminderId);
        const t = r?.times?.[0] || { label:"Reminder", display:"" };
        playSound(soundKey);
        showAlarmToast(r || { id: reminderId, medicine: "Medicine", sound: soundKey }, t);
        delete snoozeTimers[reminderId];
    }, 10 * 60 * 1000);
}

// ── Service Worker ────────────────────────────────────────────
async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
        await navigator.serviceWorker.register("/sw.js");
        navigator.serviceWorker.addEventListener("message", e => {
            if (e.data && e.data.type === "WAKE_CHECK") checkAlarms();
        });
    } catch (err) { console.warn("SW failed:", err); }
}

async function requestNotifPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    return (await Notification.requestPermission()) === "granted";
}
async function enableDHASNotifications() {
    if ((await Notification.requestPermission()) === "granted") {
        updateNotifBanner(true);
    } else {
        alert("Notifications are still blocked. Please allow them in your browser site settings.");
    }
}

// ── Alarm engine ──────────────────────────────────────────────
let lastFiredKey = {};

function checkAlarms() {
    const reminders = getReminders();
    if (!reminders.length) return;

    const now = new Date();
    const dow = now.getDay(), dom = now.getDate();
    const hh  = now.getHours(), mm = now.getMinutes();

    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
            type:"CHECK_ALARMS", reminders, now:now.toISOString()
        });
    }

    reminders.forEach(r => {
        if (!shouldFireToday(r, dow, dom)) return;
        (r.times || []).forEach(t => {
            const [alarmH, alarmM] = to24(t.h, t.m, t.ampm);
            if (alarmH !== hh || alarmM !== mm) return;
            const key = `${r.id}-${t.label}-${hh}-${mm}`;
            if (lastFiredKey[key]) return;
            lastFiredKey[key] = true;
            setTimeout(() => delete lastFiredKey[key], 90000);
            triggerAlarm(r, t);
        });
    });
}

function triggerAlarm(reminder, timeSlot) {
    playSound(reminder.sound || "bell");
    showAlarmToast(reminder, timeSlot);
    if (Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(reg =>
            reg.showNotification(`${reminder.medicine}`, {
                body: `${timeSlot.label}: ${timeSlot.display}\n${reminder.scheduleLabel}`,
                icon:"/favicon.ico", badge:"/favicon.ico",
                vibrate:[300,100,300], requireInteraction:true,
                tag:`dhas-${reminder.id}-${timeSlot.label}`
            })
        );
    }
}

function showAlarmToast(reminder, timeSlot) {
    document.getElementById("dhasAlarmToast")?.remove();
    const toast = document.createElement("div");
    toast.id = "dhasAlarmToast";
    const rid   = reminder.id;
    const sound = reminder.sound || "bell";

    toast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);
                    background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;
                    border-radius:16px;padding:18px 24px;
                    box-shadow:0 8px 32px rgba(0,0,0,0.3);
                    z-index:99999;max-width:340px;width:90%;
                    animation:toastIn 0.4s ease;font-family:'DM Sans',sans-serif;">
          <style>@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
          <div style="font-size:1.1rem;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px;">
            <i class="ti ti-alarm" style="font-size:20px" aria-hidden="true"></i>
            Medicine Time!
          </div>
          <div style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:7px;">
            <i class="ti ti-pill" style="font-size:16px" aria-hidden="true"></i>
            ${reminder.medicine}
          </div>
          <div style="font-size:0.85rem;opacity:0.9;margin-top:4px;">${timeSlot.label}: ${timeSlot.display}</div>
          <div style="display:flex;gap:8px;margin-top:14px;">
            <button id="snoozeBtn_${rid}"
                    style="background:rgba(255,255,255,0.2);border:1.5px solid rgba(255,255,255,0.4);color:#fff;
                           padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:700;flex:1;
                           display:flex;align-items:center;justify-content:center;gap:5px;font-size:0.82rem;">
              <i class="ti ti-clock-snooze" style="font-size:13px" aria-hidden="true"></i> Snooze 10 min
            </button>
            <button onclick="document.getElementById('dhasAlarmToast').remove()"
                    style="background:#fff;border:none;color:#1a56db;padding:7px 14px;border-radius:8px;
                           cursor:pointer;font-weight:700;flex:1;
                           display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Dismiss
            </button>
          </div>
        </div>`;
    document.body.appendChild(toast);

    // Wire up snooze button (needs reference to the toast element)
    document.getElementById(`snoozeBtn_${rid}`).addEventListener("click", function() {
        snoozeReminder(rid, sound, toast);
    });

    setTimeout(() => toast.remove(), 40000);
}

// ── Schedule helpers ──────────────────────────────────────────
function shouldFireToday(r, dow, dom) {
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    if (r.startDate) {
        const start = new Date(r.startDate + "T00:00:00");
        if (todayMidnight < start) return false;
    }
    if (r.duration && r.duration !== "forever") {
        const base = r.startDate ? new Date(r.startDate + "T00:00:00") : new Date(r.createdAt);
        base.setHours(0,0,0,0);
        if (Math.floor((todayMidnight - base) / 86400000) >= parseInt(r.duration)) return false;
    }
    switch (r.sched) {
        case "daily":      return true;
        case "alternate": {
            if (!r.altBase) return true;
            const base = new Date(r.altBase);
            const today = new Date(); today.setHours(0,0,0,0);
            const bDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
            return Math.round((today - bDay) / 86400000) % 2 === 0;
        }
        case "weekly": case "twice_week": case "three_week": case "custom":
            return (r.days || []).includes(dow);
        case "monthly": return dom === (r.monthDay || 1);
        default: return false;
    }
}

function to24(h, m, ampm) {
    let hour = parseInt(h, 10);
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour  = 0;
    return [hour, parseInt(m, 10)];
}

function startAlarmTicker() {
    checkAlarms();
    setInterval(checkAlarms, 30 * 1000);
}

// ── Constants ─────────────────────────────────────────────────
const DOSE_DEFAULTS = {
    "1": [{ label:"Daily",     h:"8", m:"00", ampm:"AM" }],
    "2": [{ label:"Morning",   h:"8", m:"00", ampm:"AM" },
          { label:"Evening",   h:"8", m:"00", ampm:"PM" }],
    "3": [{ label:"Morning",   h:"8", m:"00", ampm:"AM" },
          { label:"Afternoon", h:"2", m:"00", ampm:"PM" },
          { label:"Night",     h:"9", m:"00", ampm:"PM" }]
};
const MAX_DAYS      = { weekly:1, twice_week:2, three_week:3, custom:null };
const ALL_DAYS      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const ALL_DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// ── Notification banner ───────────────────────────────────────
function updateNotifBanner(granted) {
    const banner = document.getElementById("notifBanner");
    if (!banner) return;
    if (granted) {
        Object.assign(banner.style, { background:"#dcfce7", color:"#166534", borderColor:"#86efac" });
        banner.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:10px;">
              <i class="ti ti-bell-ringing" style="font-size:20px;margin-top:2px" aria-hidden="true"></i>
              <div>
                <div style="font-weight:700;font-size:0.92rem;">Notifications Enabled</div>
                <div style="margin-top:4px;font-weight:500;">DHAS can now send medicine reminders and alarm alerts even when the app is minimized.</div>
              </div>
            </div>`;
    } else {
        Object.assign(banner.style, { background:"#fff7ed", color:"#9a3412", borderColor:"#fdba74" });
        banner.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <i class="ti ti-bell-off" style="font-size:22px;margin-top:2px" aria-hidden="true"></i>
              <div style="flex:1;">
                <div style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Enable Browser Notifications</div>
                <div style="font-weight:500;line-height:1.6;">
                  To receive medicine reminders, please allow notification access.<br><br>
                  Works on: <strong>Chrome</strong>, <strong>Brave</strong>, <strong>Edge</strong>.<br><br>
                  <strong>How to enable:</strong>
                  <ol style="margin-top:6px;padding-left:18px;">
                    <li>Click the lock icon near the address bar</li>
                    <li>Open <strong>Site Settings</strong></li>
                    <li>Allow <strong>Notifications</strong></li>
                    <li>Refresh DHAS</li>
                  </ol>
                </div>
                <button onclick="enableDHASNotifications()"
                        style="margin-top:10px;background:linear-gradient(135deg,#ea580c,#f97316);
                               color:white;border:none;border-radius:8px;padding:8px 16px;
                               font-size:0.85rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                  <i class="ti ti-bell" style="font-size:14px" aria-hidden="true"></i> Enable Notifications
                </button>
              </div>
            </div>`;
    }
}

// ── Schedule UI ───────────────────────────────────────────────
function renderScheduleUI() {
    const sched = document.getElementById("scheduleType").value;
    document.getElementById("dayPickerSection").style.display  = "none";
    document.getElementById("monthDaySection").style.display   = "none";
    if (sched === "monthly") {
        document.getElementById("monthDaySection").style.display = "block";
    } else if (["weekly","twice_week","three_week","custom"].includes(sched)) {
        document.getElementById("dayPickerSection").style.display = "block";
        renderDayPicker(sched);
    }
    renderTimeSlots(document.getElementById("doseCount").value);
}

function renderDayPicker(mode) {
    const hints = { weekly:"Pick 1 day", twice_week:"Pick exactly 2 days", three_week:"Pick exactly 3 days", custom:"Pick one or more days" };
    document.getElementById("dayPickerHint").textContent = hints[mode] || "";
    document.getElementById("dayPicker").innerHTML = ALL_DAYS.map((day, i) =>
        `<div class="day-tile" id="dayTile_${i}" onclick="toggleDay(${i},'${mode}')">${day}</div>`
    ).join("");
}

function toggleDay(index, mode) {
    const tile   = document.getElementById("dayTile_" + index);
    const active = document.querySelectorAll(".day-tile.active");
    const maxSel = MAX_DAYS[mode];
    if (tile.classList.contains("active")) {
        tile.classList.remove("active");
    } else {
        if (maxSel !== null && active.length >= maxSel) active[0].classList.remove("active");
        tile.classList.add("active");
    }
}

function getSelectedDays() {
    return Array.from(document.querySelectorAll(".day-tile.active"))
                .map(t => parseInt(t.id.replace("dayTile_", "")));
}

function buildMonthDayOptions() {
    const sel = document.getElementById("monthDay");
    for (let d = 1; d <= 28; d++) {
        const opt = document.createElement("option");
        opt.value = d; opt.textContent = d + ordinal(d) + " of every month";
        sel.appendChild(opt);
    }
}

function renderTimeSlots(doseCount) {
    const slots = DOSE_DEFAULTS[doseCount] || DOSE_DEFAULTS["1"];
    document.getElementById("timeSlots").innerHTML = slots.map((slot, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <label style="min-width:88px;font-size:0.85rem;font-weight:600;color:var(--text-muted,#666);flex-shrink:0;">${slot.label}</label>
          <select id="slot_h_${i}"  class="dhas-input" style="width:68px;padding:8px 4px;text-align:center;">${hourOptions(slot.h)}</select>
          <span style="font-size:1.1rem;font-weight:700;color:#555;">:</span>
          <select id="slot_m_${i}"  class="dhas-input" style="width:68px;padding:8px 4px;text-align:center;">${minuteOptions(slot.m)}</select>
          <select id="slot_ap_${i}" class="dhas-input" style="width:68px;padding:8px 4px;text-align:center;font-weight:700;color:var(--primary,#0d6efd);">
            <option value="AM" ${slot.ampm==="AM"?"selected":""}>AM</option>
            <option value="PM" ${slot.ampm==="PM"?"selected":""}>PM</option>
          </select>
        </div>`).join("");
}

function hourOptions(sel) {
    return Array.from({length:12},(_,i)=>{const s=String(i+1);return`<option value="${s}"${s===sel?" selected":""}>${s}</option>`;}).join("");
}
function minuteOptions(sel) {
    return Array.from({length:12},(_,i)=>{const s=String(i*5).padStart(2,"0");return`<option value="${s}"${s===sel?" selected":""}>${s}</option>`;}).join("");
}

function collectTimes() {
    const slots = DOSE_DEFAULTS[document.getElementById("doseCount").value] || DOSE_DEFAULTS["1"];
    return slots.map((slot, i) => ({
        label:   slot.label,
        display: `${document.getElementById(`slot_h_${i}`).value}:${document.getElementById(`slot_m_${i}`).value} ${document.getElementById(`slot_ap_${i}`).value}`,
        h:    document.getElementById(`slot_h_${i}`).value,
        m:    document.getElementById(`slot_m_${i}`).value,
        ampm: document.getElementById(`slot_ap_${i}`).value
    }));
}

function buildScheduleLabel(sched, days, monthDay) {
    switch (sched) {
        case "daily":      return "Every day";
        case "alternate":  return "Alternate days";
        case "monthly":    return `${monthDay}${ordinal(monthDay)} of every month`;
        case "weekly":     return days.length ? "Every " + ALL_DAYS_FULL[days[0]] : "Once a week";
        case "twice_week": return days.length===2 ? ALL_DAYS_FULL[days[0]]+" & "+ALL_DAYS_FULL[days[1]] : "Twice a week";
        case "three_week": return days.length===3 ? days.map(d=>ALL_DAYS[d]).join(", ") : "3x a week";
        case "custom":     return days.length ? days.map(d=>ALL_DAYS_FULL[d]).join(", ") : "Custom days";
        default:           return sched;
    }
}

function ordinal(n){ return n===1?"st":n===2?"nd":n===3?"rd":"th"; }
function doseLabel(n){ return {"1":"Once daily","2":"Twice daily","3":"Three times daily"}[n]||""; }

// ── Reminder preview ──────────────────────────────────────────
function updateReminderPreview() {
    const medicine = document.getElementById("medicine").value.trim();
    const preview  = document.getElementById("reminderPreview");
    if (!medicine) { preview.style.display = "none"; return; }

    const schedEl    = document.getElementById("scheduleType");
    const doseEl     = document.getElementById("doseCount");
    const durationEl = document.getElementById("durationType");
    const soundEl    = document.getElementById("alarmSound");
    const startDate  = document.getElementById("startDate").value || "Today";
    const times      = collectTimes().map(t => t.display).join(", ");
    const selDays    = getSelectedDays().map(d => ALL_DAYS_FULL[d]).join(", ");

    preview.style.display = "block";
    document.getElementById("previewContent").innerHTML = [
        previewRow("Medicine",   medicine,  "ti-pill"),
        previewRow("Schedule",   schedEl.options[schedEl.selectedIndex].text, "ti-calendar"),
        selDays ? previewRow("Days", selDays, "ti-calendar-week") : "",
        previewRow("Time",       times, "ti-clock"),
        previewRow("Frequency",  doseEl.options[doseEl.selectedIndex].text, "ti-repeat"),
        previewRow("Start Date", startDate, "ti-calendar-event"),
        previewRow("Duration",   durationEl.options[durationEl.selectedIndex].text, "ti-hourglass"),
        previewRow("Alarm",      soundEl.options[soundEl.selectedIndex].text, "ti-bell"),
        `<div style="margin-top:10px;background:#eff6ff;border-left:4px solid #2563eb;
                     padding:14px;border-radius:12px;line-height:1.7;color:#1e3a8a;font-size:0.88rem;">
           <strong>How this reminder will work</strong>
           <div style="margin-top:8px;">
             DHAS will remind you to take <strong>${medicine}</strong> at <strong>${times}</strong>.
             ${selDays ? `Triggers on: ${selDays}.` : `Schedule: ${schedEl.options[schedEl.selectedIndex].text}.`}
             Starts <strong>${startDate}</strong> &middot; Duration: <strong>${durationEl.options[durationEl.selectedIndex].text}</strong>.<br><br>
             Browser notification &nbsp;&middot;&nbsp; Alarm sound &nbsp;&middot;&nbsp; In-app popup
           </div>
         </div>`
    ].join("");
}

function previewRow(label, value, icon) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:12px;border-radius:12px;gap:8px;">
              <span style="display:flex;align-items:center;gap:6px;color:#6b7fa3;font-size:0.85rem;">
                <i class="ti ${icon}" style="font-size:15px" aria-hidden="true"></i>${label}
              </span>
              <strong style="font-size:0.85rem;text-align:right;">${value}</strong>
            </div>`;
}

// ── API: fetch reminders ──────────────────────────────────────
async function loadRemindersFromServer() {
    const uid = getUserId();
    if (!uid) { displayReminders(); return; }
    try {
        const res  = await fetch(`${API}/get/${uid}`);
        const data = await res.json();
        if (data.success) remindersCache = data.data || [];
    } catch (err) { console.error("loadReminders error:", err); }
    displayReminders();
}

// ── Save reminder ─────────────────────────────────────────────
window.addReminder = async function () {
    const medicineInput = document.getElementById("medicine");
    const medicine      = medicineInput.value.trim();
    if (!medicine) { medicineInput.focus(); alert("Please enter a medicine name."); return; }

    const uid = getUserId();
    if (!uid) { alert("Session error: could not read your user ID."); return; }

    const sched      = document.getElementById("scheduleType").value;
    const doseCount  = document.getElementById("doseCount").value;
    const sound      = document.getElementById("alarmSound").value;
    const duration   = document.getElementById("durationType").value;
    const startDate  = document.getElementById("startDate").value || new Date().toISOString().split("T")[0];
    const days       = getSelectedDays();
    const monthDay   = parseInt(document.getElementById("monthDay").value) || 1;
    const times      = collectTimes();

    if (sched === "weekly"     && days.length !== 1) { alert("Please select 1 day.");           return; }
    if (sched === "twice_week" && days.length !== 2) { alert("Please select exactly 2 days."); return; }
    if (sched === "three_week" && days.length !== 3) { alert("Please select exactly 3 days."); return; }
    if (sched === "custom"     && days.length === 0) { alert("Please select at least 1 day."); return; }

    const todayStr = new Date().toISOString().split("T")[0];
    const effectiveTimes = (startDate === todayStr)
        ? times.filter(t => {
              const [alarmH, alarmM] = to24(t.h, t.m, t.ampm);
              const now = new Date();
              return alarmH > now.getHours() || (alarmH === now.getHours() && alarmM > now.getMinutes());
          })
        : times;

    if (effectiveTimes.length === 0) {
        alert("All selected times have already passed for today.\nPlease pick a future time or choose a start date from tomorrow onward.");
        return;
    }

    const payload = {
        user_id:       uid,
        medicine,
        sched,
        scheduleLabel: buildScheduleLabel(sched, days, monthDay),
        doseCount:     parseInt(doseCount),
        dosesLabel:    doseLabel(doseCount),
        times:         effectiveTimes,
        days,
        monthDay,
        duration,
        sound,
        startDate,
        altBase: sched === "alternate" ? new Date().toISOString() : null
    };

    try {
        const res  = await fetch(`${API}/add`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) { alert(data.message || "Failed to save reminder."); return; }

        await loadRemindersFromServer();
        showSaveConfirm(medicine, effectiveTimes[0]?.display);

        document.getElementById("medicine").value     = "";
        document.getElementById("scheduleType").value = "daily";
        document.getElementById("doseCount").value    = "1";
        document.getElementById("alarmSound").value   = "bell";
        renderScheduleUI();
    } catch (err) {
        console.error("addReminder error:", err);
        alert("Network error — could not save reminder.");
    }
};

function showSaveConfirm(medicine, firstTime) {
    const el = document.getElementById("saveConfirm");
    if (!el) return;
    el.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">
      <i class="ti ti-circle-check" style="font-size:16px" aria-hidden="true"></i>
      Reminder saved for ${medicine}${firstTime ? " at " + firstTime : ""}
    </span>`;
    el.style.display = "block";
    setTimeout(() => el.style.display = "none", 3000);
}

// ── Delete reminder ───────────────────────────────────────────
window.deleteReminder = async function (id) {
    if (!confirm("Delete this reminder?")) return;
    try {
        const res  = await fetch(`${API}/delete/${id}`, { method:"DELETE" });
        const data = await res.json();
        if (!data.success) { alert("Could not delete reminder."); return; }
        remindersCache = remindersCache.filter(r => r.id !== id);
        displayReminders();
    } catch (err) {
        console.error("deleteReminder error:", err);
        alert("Network error — could not delete reminder.");
    }
};

// ── EDIT REMINDER ─────────────────────────────────────────────
window.openEditReminder = function(id) {
    const r = remindersCache.find(x => x.id === id);
    if (!r) return;

    // Close any other open edit panels
    document.querySelectorAll(".edit-panel").forEach(el => el.remove());

    const container = document.getElementById(`editContainer_${id}`);
    if (!container) return;

    const currentSched    = r.sched || "daily";
    const currentDuration = r.duration || "forever";
    const currentSound    = r.sound || "bell";
    const currentDoseCount= String(r.doseCount || r.dose_count || 1);
    const currentTimes    = r.times || [];

    // Build schedule options
    const schedOptions = [
        ["daily","Every Day"],["alternate","Alternate Days"],
        ["weekly","Once a Week"],["twice_week","Twice a Week"],
        ["three_week","3 Times a Week"],["monthly","Once a Month"],["custom","Custom Days"]
    ].map(([val,lbl]) => `<option value="${val}" ${val===currentSched?"selected":""}>${lbl}</option>`).join("");

    // Build duration options
    const durOptions = [
        ["forever","Continue Until Manually Removed"],["1","1 Day only"],
        ["2","2 Days"],["3","3 Days"],["5","5 Days"],["7","1 Week"],
        ["14","2 Weeks"],["30","1 Month"]
    ].map(([val,lbl]) => `<option value="${val}" ${val===currentDuration?"selected":""}>${lbl}</option>`).join("");

    // Build sound options
    const soundOptions = Object.entries(SOUNDS)
        .map(([val,obj]) => `<option value="${val}" ${val===currentSound?"selected":""}>${obj.label}</option>`).join("");

    // Build dose count options
    const doseOptions = [["1","Once a day"],["2","Twice a day"],["3","Three times a day"]]
        .map(([val,lbl]) => `<option value="${val}" ${val===currentDoseCount?"selected":""}>${lbl}</option>`).join("");

    // Build time slots from current reminder times
    function buildEditTimeSlots(times, doseCount) {
        const slots = DOSE_DEFAULTS[doseCount] || DOSE_DEFAULTS["1"];
        return slots.map((slot, i) => {
            const existing = times[i] || slot;
            const h    = existing.h    || slot.h;
            const m    = existing.m    || slot.m;
            const ampm = existing.ampm || slot.ampm;
            return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <label style="min-width:88px;font-size:0.83rem;font-weight:600;color:var(--text-muted,#6b7fa3);flex-shrink:0;">${slot.label}</label>
              <select id="edit_h_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${hourOptions(h)}</select>
              <span style="font-weight:700;color:#888;">:</span>
              <select id="edit_m_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${minuteOptions(m)}</select>
              <select id="edit_ap_${id}_${i}" class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;font-weight:700;color:var(--primary,#0d6efd);margin-bottom:0;">
                <option value="AM" ${ampm==="AM"?"selected":""}>AM</option>
                <option value="PM" ${ampm==="PM"?"selected":""}>PM</option>
              </select>
            </div>`;
        }).join("");
    }

    // Day picker for edit (shown conditionally)
    const currentDays = r.days || [];
    const dayPickerHtml = ALL_DAYS.map((day, i) => {
        const active = currentDays.includes(i) ? "active" : "";
        return `<div class="day-tile edit-day-tile ${active}" id="editDayTile_${id}_${i}" onclick="toggleEditDay(${id},${i},'${currentSched}')">${day}</div>`;
    }).join("");

    const showDayPicker = ["weekly","twice_week","three_week","custom"].includes(currentSched);
    const showMonthDay  = currentSched === "monthly";
    const currentMonthDay = r.monthDay || r.month_day || 1;

    // Month day options
    let monthDayOpts = "";
    for (let d = 1; d <= 28; d++) {
        monthDayOpts += `<option value="${d}" ${d===currentMonthDay?"selected":""}>${d}${ordinal(d)} of every month</option>`;
    }

    const panel = document.createElement("div");
    panel.className = "edit-panel";
    panel.innerHTML = `
        <div style="background:var(--card-bg,#fff);border:2px solid #2a6cf6;border-radius:16px;
                    padding:20px;margin-top:10px;animation:editSlide .25s ease;">
          <style>@keyframes editSlide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>

          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:0.92rem;font-weight:700;color:var(--text,#0d1b3e);display:flex;align-items:center;gap:6px;">
              <i class="ti ti-edit" style="font-size:16px;color:#2a6cf6" aria-hidden="true"></i>
              Edit — ${r.medicine}
            </div>
            <button onclick="closeEditReminder(${id})"
                    style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted,#6b7fa3);padding:0 4px;line-height:1;">✕</button>
          </div>

          <!-- Schedule -->
          <label class="dhas-label">Schedule</label>
          <select id="edit_sched_${id}" class="dhas-input" onchange="onEditSchedChange(${id})">${schedOptions}</select>

          <!-- Day picker (conditional) -->
          <div id="edit_dayPickerSection_${id}" style="display:${showDayPicker?"block":"none"};margin-bottom:10px;">
            <label class="dhas-label">Select Day(s)</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;" id="edit_dayPicker_${id}">${dayPickerHtml}</div>
          </div>

          <!-- Month day (conditional) -->
          <div id="edit_monthDaySection_${id}" style="display:${showMonthDay?"block":"none"};">
            <label class="dhas-label">Day of the Month</label>
            <select id="edit_monthDay_${id}" class="dhas-input">${monthDayOpts}</select>
          </div>

          <!-- Times per day -->
          <label class="dhas-label">Times per Day</label>
          <select id="edit_doseCount_${id}" class="dhas-input" onchange="onEditDoseChange(${id})">${doseOptions}</select>

          <!-- Time slots -->
          <label class="dhas-label">Set Time(s)</label>
          <div id="edit_timeSlots_${id}">${buildEditTimeSlots(currentTimes, currentDoseCount)}</div>

          <!-- Duration -->
          <label class="dhas-label">Reminder Duration</label>
          <select id="edit_duration_${id}" class="dhas-input" style="margin-bottom:14px;">${durOptions}</select>

          <!-- Alarm Sound -->
          <label class="dhas-label">Alarm Sound</label>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:18px;">
            <select id="edit_sound_${id}" class="dhas-input" style="margin-bottom:0;flex:1;">${soundOptions}</select>
            <button type="button"
                    onclick="playSound(document.getElementById('edit_sound_${id}').value)"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;
                           border-radius:8px;padding:9px 14px;cursor:pointer;font-size:0.82rem;
                           font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:5px;">
              <i class="ti ti-player-play" style="font-size:13px" aria-hidden="true"></i> Preview
            </button>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:10px;">
            <button onclick="closeEditReminder(${id})"
                    style="flex:1;padding:11px;border:1.5px solid var(--border,#e4e9f4);border-radius:10px;
                           background:var(--bg,#f4f6fc);color:var(--text,#0d1b3e);font-weight:600;
                           font-size:0.9rem;cursor:pointer;font-family:'DM Sans',sans-serif;">
              Cancel
            </button>
            <button onclick="saveEditReminder(${id})"
                    style="flex:2;padding:11px;border:none;border-radius:10px;
                           background:linear-gradient(135deg,#2a6cf6,#4f8ef9);color:#fff;
                           font-weight:700;font-size:0.9rem;cursor:pointer;
                           font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;
                           box-shadow:0 4px 14px rgba(42,108,246,0.3);">
              <i class="ti ti-device-floppy" style="font-size:15px" aria-hidden="true"></i> Save Changes
            </button>
          </div>
        </div>`;

    container.appendChild(panel);
};

window.closeEditReminder = function(id) {
    const container = document.getElementById(`editContainer_${id}`);
    container?.querySelectorAll(".edit-panel").forEach(el => el.remove());
};

window.toggleEditDay = function(id, index, mode) {
    const tile   = document.getElementById(`editDayTile_${id}_${index}`);
    const active = document.querySelectorAll(`#edit_dayPicker_${id} .edit-day-tile.active`);
    const maxSel = MAX_DAYS[mode];
    if (tile.classList.contains("active")) {
        tile.classList.remove("active");
    } else {
        if (maxSel !== null && active.length >= maxSel) active[0].classList.remove("active");
        tile.classList.add("active");
    }
};

window.onEditSchedChange = function(id) {
    const sched  = document.getElementById(`edit_sched_${id}`).value;
    const dpSec  = document.getElementById(`edit_dayPickerSection_${id}`);
    const mdSec  = document.getElementById(`edit_monthDaySection_${id}`);
    dpSec.style.display = ["weekly","twice_week","three_week","custom"].includes(sched) ? "block" : "none";
    mdSec.style.display = sched === "monthly" ? "block" : "none";
    // Update day tile onclick
    document.querySelectorAll(`#edit_dayPicker_${id} .edit-day-tile`).forEach((tile, i) => {
        tile.setAttribute("onclick", `toggleEditDay(${id},${i},'${sched}')`);
    });
};

window.onEditDoseChange = function(id) {
    const doseCount    = document.getElementById(`edit_doseCount_${id}`).value;
    const r            = remindersCache.find(x => x.id === id);
    const currentTimes = r?.times || [];
    const slots        = DOSE_DEFAULTS[doseCount] || DOSE_DEFAULTS["1"];
    document.getElementById(`edit_timeSlots_${id}`).innerHTML = slots.map((slot, i) => {
        const existing = currentTimes[i] || slot;
        const h    = existing.h    || slot.h;
        const m    = existing.m    || slot.m;
        const ampm = existing.ampm || slot.ampm;
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <label style="min-width:88px;font-size:0.83rem;font-weight:600;color:var(--text-muted,#6b7fa3);flex-shrink:0;">${slot.label}</label>
          <select id="edit_h_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${hourOptions(h)}</select>
          <span style="font-weight:700;color:#888;">:</span>
          <select id="edit_m_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${minuteOptions(m)}</select>
          <select id="edit_ap_${id}_${i}" class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;font-weight:700;color:var(--primary,#0d6efd);margin-bottom:0;">
            <option value="AM" ${ampm==="AM"?"selected":""}>AM</option>
            <option value="PM" ${ampm==="PM"?"selected":""}>PM</option>
          </select>
        </div>`;
    }).join("");
};

window.saveEditReminder = async function(id) {
    const r = remindersCache.find(x => x.id === id);
    if (!r) return;

    const sched     = document.getElementById(`edit_sched_${id}`).value;
    const duration  = document.getElementById(`edit_duration_${id}`).value;
    const sound     = document.getElementById(`edit_sound_${id}`).value;
    const doseCount = document.getElementById(`edit_doseCount_${id}`).value;
    const monthDay  = parseInt(document.getElementById(`edit_monthDay_${id}`)?.value || r.monthDay || 1);

    // Collect selected days
    const days = Array.from(
        document.querySelectorAll(`#edit_dayPicker_${id} .edit-day-tile.active`)
    ).map(t => parseInt(t.id.split("_").pop()));

    // Validate days
    if (sched === "weekly"     && days.length !== 1) { alert("Please select 1 day.");           return; }
    if (sched === "twice_week" && days.length !== 2) { alert("Please select exactly 2 days."); return; }
    if (sched === "three_week" && days.length !== 3) { alert("Please select exactly 3 days."); return; }
    if (sched === "custom"     && days.length === 0) { alert("Please select at least 1 day."); return; }

    // Collect times
    const slots     = DOSE_DEFAULTS[doseCount] || DOSE_DEFAULTS["1"];
    const newTimes  = slots.map((slot, i) => ({
        label:   slot.label,
        display: `${document.getElementById(`edit_h_${id}_${i}`).value}:${document.getElementById(`edit_m_${id}_${i}`).value} ${document.getElementById(`edit_ap_${id}_${i}`).value}`,
        h:    document.getElementById(`edit_h_${id}_${i}`).value,
        m:    document.getElementById(`edit_m_${id}_${i}`).value,
        ampm: document.getElementById(`edit_ap_${id}_${i}`).value
    }));

    const saveBtn = document.querySelector(`[onclick="saveEditReminder(${id})"]`);
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

    try {
        // Delete old and re-add with updated values
        const delRes  = await fetch(`${API}/delete/${id}`, { method:"DELETE" });
        const delData = await delRes.json();
        if (!delData.success) { alert("Could not update reminder."); return; }

        const uid = getUserId();
        const payload = {
            user_id:       uid,
            medicine:      r.medicine,
            sched,
            scheduleLabel: buildScheduleLabel(sched, days, monthDay),
            doseCount:     parseInt(doseCount),
            dosesLabel:    doseLabel(doseCount),
            times:         newTimes,
            days,
            monthDay,
            duration,
            sound,
            startDate:     r.startDate || new Date().toISOString().split("T")[0],
            altBase:       sched === "alternate" ? new Date().toISOString() : null
        };

        const addRes  = await fetch(`${API}/add`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(payload)
        });
        const addData = await addRes.json();
        if (!addData.success) { alert(addData.message || "Failed to save changes."); return; }

        await loadRemindersFromServer();

        // Show brief success toast
        const successNote = document.createElement("div");
        successNote.innerHTML = `
            <div style="position:fixed;bottom:24px;right:20px;
                        background:#166534;color:#fff;
                        border-radius:12px;padding:12px 18px;
                        box-shadow:0 4px 20px rgba(0,0,0,0.25);
                        z-index:99998;font-size:0.83rem;font-weight:600;
                        display:flex;align-items:center;gap:8px;
                        animation:snoozeSlide .3s ease;">
              <i class="ti ti-circle-check" style="font-size:16px;color:#86efac" aria-hidden="true"></i>
              Reminder updated successfully
            </div>`;
        document.body.appendChild(successNote);
        setTimeout(() => successNote.remove(), 3000);

    } catch (err) {
        console.error("saveEditReminder error:", err);
        alert("Network error — could not save changes.");
    }
};

// ── Display ───────────────────────────────────────────────────
function displayReminders() {
    const list      = document.getElementById("reminderList");
    const reminders = getReminders();

    if (!reminders.length) {
        list.innerHTML = `
            <div class="empty-state">
              <i class="ti ti-pill" aria-hidden="true"></i>
              <p>No reminders set yet.<br>Add your first medicine reminder above.</p>
            </div>`;
        return;
    }

    const BC = {
        daily:      {bg:"#dcfce7",color:"#166534"},
        alternate:  {bg:"#fef9c3",color:"#854d0e"},
        weekly:     {bg:"#ede9fe",color:"#5b21b6"},
        twice_week: {bg:"#ffedd5",color:"#9a3412"},
        three_week: {bg:"#fff0e0",color:"#92400e"},
        monthly:    {bg:"#fce7f3",color:"#9d174d"},
        custom:     {bg:"#f0fdf4",color:"#065f46"}
    };

    const soundIcon = {
        bell:"ti-bell", chime:"ti-music", beep:"ti-device-mobile-vibration",
        gentle:"ti-wave-sine", alarm:"ti-alarm"
    };

    list.innerHTML = reminders.map(r => {
        const durationLabel = r.duration === "forever" ? "Continuous" : `${r.duration} Day(s)`;
        const chips = (r.times || []).map(t =>
            `<span style="background:#f0f7ff;border:1px solid #bfdbfe;color:#1e40af;
                          border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">
               <i class="ti ti-clock" style="font-size:12px" aria-hidden="true"></i>
               ${t.label}: ${t.display || legacyFormat(t.time)}
             </span>`).join("");
        const bc    = BC[r.sched] || { bg:"#dbeafe", color:"#1d4ed8" };
        const sIcon = soundIcon[r.sound] || "ti-bell";
        const soundLabel = SOUNDS[r.sound]?.label || "Bell";

        return `
            <div class="reminder-item" id="reminderCard_${r.id}">
              <div style="flex:1;min-width:0;">
                <div class="reminder-name">
                  <i class="ti ti-pill" aria-hidden="true"></i>
                  ${r.medicine}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                  <span class="sched-chip" style="background:${bc.bg};color:${bc.color};">
                    <i class="ti ti-calendar" style="font-size:11px" aria-hidden="true"></i>
                    ${r.scheduleLabel || ""}
                  </span>
                  <span class="sched-chip" style="background:#dbeafe;color:#1d4ed8;">
                    <i class="ti ti-pill" style="font-size:11px" aria-hidden="true"></i>
                    ${r.dosesLabel || ""}
                  </span>
                  <span class="sched-chip" style="background:#ecfccb;color:#3f6212;">
                    <i class="ti ti-hourglass" style="font-size:11px" aria-hidden="true"></i>
                    ${durationLabel}
                  </span>
                  <span class="sched-chip" style="background:#f5f3ff;color:#5b21b6;cursor:pointer;"
                        onclick="playSound('${r.sound||'bell'}')">
                    <i class="ti ${sIcon}" style="font-size:11px" aria-hidden="true"></i>
                    ${soundLabel}
                  </span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${chips}</div>
              </div>
              <!-- Action buttons -->
              <div style="display:flex;flex-direction:column;gap:7px;flex-shrink:0;align-items:flex-end;">
                <button class="edit-btn" onclick="openEditReminder(${r.id})" title="Edit reminder">
                  <i class="ti ti-edit" style="font-size:13px" aria-hidden="true"></i>
                  Edit
                </button>
                <button class="reminder-delete" onclick="deleteReminder(${r.id})" title="Delete">
                  <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
                  Delete
                </button>
              </div>
            </div>
            <!-- Edit panel container -->
            <div id="editContainer_${r.id}"></div>`;
    }).join("");
}

function legacyFormat(t) {
    if (!t) return "—";
    const [h, m] = t.split(":").map(Number);
    return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}

function goBack() { window.location.href = "dashboard.html"; }

// ── Init ──────────────────────────────────────────────────────
window.onload = async function () {
    await registerSW();
    updateNotifBanner(await requestNotifPermission());
    buildMonthDayOptions();
    renderScheduleUI();

    const today = new Date().toISOString().split("T")[0];
    const startDateEl = document.getElementById("startDate");
    if (startDateEl) { startDateEl.min = today; startDateEl.value = today; }

    await loadRemindersFromServer();
    startAlarmTicker();
};

document.addEventListener("input",  updateReminderPreview);
document.addEventListener("change", updateReminderPreview);