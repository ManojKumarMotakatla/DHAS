// ============================================
// DHAS - reminder.js  (v3 — DB-backed, icons)
// ============================================

const API = "http://localhost:3006/reminders";

function getUserId() {
    const flatKeys = [
        "user_id", "userId", "uid",
        "dhas_user_id", "dhas_userId",
        "id", "user"
    ];

    for (const store of [localStorage, sessionStorage]) {
        for (const key of flatKeys) {
            const val = store.getItem(key);
            if (val && val !== "null" && val !== "undefined") {
                if (!val.startsWith("{") && !val.startsWith("[")) return val;
            }
        }

        const jsonKeys = ["user", "dhas_user", "currentUser", "loggedInUser", "profile"];
        for (const key of jsonKeys) {
            const raw = store.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                const id  = obj.user_id || obj.userId || obj.uid || obj.id;
                if (id) return String(id);
            } catch { /* not JSON, skip */ }
        }
    }
    return null;
}

let remindersCache = [];

function getReminders() {
    return remindersCache;
}

// ── Audio Engine ───────────────────────────────────────────────
if ("Notification" in window) Notification.requestPermission();

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

// ── Service Worker ─────────────────────────────────────────────
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

// ── Alarm engine ────────────────────────────────────────────────
let lastFiredKey = {};

function checkAlarms() {
    const reminders = getReminders();
    if (!reminders.length) return;

    const now = new Date();
    const dow = now.getDay(), dom = now.getDate();
    const hh  = now.getHours(), mm = now.getMinutes();

    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: "CHECK_ALARMS", reminders, now: now.toISOString()
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
                icon: "/favicon.ico", badge: "/favicon.ico",
                vibrate: [300, 100, 300], requireInteraction: true,
                tag: `dhas-${reminder.id}-${timeSlot.label}`
            })
        );
    }
}

function showAlarmToast(reminder, timeSlot) {
    document.getElementById("dhasAlarmToast")?.remove();
    const toast = document.createElement("div");
    toast.id = "dhasAlarmToast";
    toast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);
                    background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;
                    border-radius:16px;padding:18px 24px;
                    box-shadow:0 8px 32px rgba(0,0,0,0.3);
                    z-index:99999;max-width:340px;width:90%;
                    animation:toastIn 0.4s ease;font-family:'Sora',sans-serif;">
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
            <button onclick="document.getElementById('dhasAlarmToast').remove();playSound('${reminder.sound||'bell'}')"
                    style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:7px 16px;border-radius:8px;cursor:pointer;font-weight:700;flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="ti ti-volume" style="font-size:14px" aria-hidden="true"></i> Replay
            </button>
            <button onclick="document.getElementById('dhasAlarmToast').remove()"
                    style="background:#fff;border:none;color:#1a56db;padding:7px 16px;border-radius:8px;cursor:pointer;font-weight:700;flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="ti ti-check" style="font-size:14px" aria-hidden="true"></i> Dismiss
            </button>
          </div>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 40000);
}

// ── Schedule helpers ────────────────────────────────────────────
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

// ── Constants ───────────────────────────────────────────────────
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

// ── Notification banner ─────────────────────────────────────────
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

// ── Schedule UI ─────────────────────────────────────────────────
function renderScheduleUI() {
    const sched = document.getElementById("scheduleType").value;
    document.getElementById("dayPickerSection").style.display   = "none";
    document.getElementById("monthDaySection").style.display    = "none";
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

// ── Reminder preview ────────────────────────────────────────────
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

// ── API: fetch all reminders from server ────────────────────────
async function loadRemindersFromServer() {
    const uid = getUserId();
    if (!uid) {
        console.warn("DHAS: no user_id found.");
        displayReminders();
        return;
    }
    try {
        const res  = await fetch(`${API}/get/${uid}`);
        const data = await res.json();
        if (data.success) {
            remindersCache = data.data || [];
        }
    } catch (err) {
        console.error("loadReminders error:", err);
    }
    displayReminders();
}

// ── Save reminder ───────────────────────────────────────────────
window.addReminder = async function () {
    const medicineInput = document.getElementById("medicine");
    const medicine      = medicineInput.value.trim();

    if (!medicine) { medicineInput.focus(); alert("Please enter a medicine name."); return; }
    const uid = getUserId();
    if (!uid) {
        alert("Session error: could not read your user ID.");
        return;
    }

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
        times: effectiveTimes,
        days,
        monthDay,
        duration,
        sound,
        startDate,
        altBase: sched === "alternate" ? new Date().toISOString() : null
    };

    try {
        const res  = await fetch(`${API}/add`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload)
        });
        const data = await res.json();

        if (!data.success) { alert(data.message || "Failed to save reminder."); return; }

        await loadRemindersFromServer();
        showSaveConfirm(medicine, times[0]?.display);

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

// ── Delete reminder ─────────────────────────────────────────────
window.deleteReminder = async function (id) {
    if (!confirm("Delete this reminder?")) return;
    try {
        const res  = await fetch(`${API}/delete/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) { alert("Could not delete reminder."); return; }
        remindersCache = remindersCache.filter(r => r.id !== id);
        displayReminders();
    } catch (err) {
        console.error("deleteReminder error:", err);
        alert("Network error — could not delete reminder.");
    }
};

// ── Display ─────────────────────────────────────────────────────
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
        const bc = BC[r.sched] || { bg:"#dbeafe", color:"#1d4ed8" };
        const sIcon = soundIcon[r.sound] || "ti-bell";
        const soundLabel = SOUNDS[r.sound]?.label || "Bell";

        return `
            <div class="reminder-item">
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
              <button class="reminder-delete" onclick="deleteReminder(${r.id})" title="Delete">
                <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i>
                Delete
              </button>
            </div>`;
    }).join("");
}

function legacyFormat(t) {
    if (!t) return "—";
    const [h, m] = t.split(":").map(Number);
    return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}

function goBack() { window.location.href = "dashboard.html"; }

// ── Init ────────────────────────────────────────────────────────
window.onload = async function () {
    await registerSW();
    updateNotifBanner(await requestNotifPermission());
    buildMonthDayOptions();
    renderScheduleUI();

    const today = new Date().toISOString().split("T")[0];
    const startDateEl = document.getElementById("startDate");
    if (startDateEl) {
        startDateEl.min   = today;
        startDateEl.value = today;
    }

    await loadRemindersFromServer();
    startAlarmTicker();
};

document.addEventListener("input",  updateReminderPreview);
document.addEventListener("change", updateReminderPreview);