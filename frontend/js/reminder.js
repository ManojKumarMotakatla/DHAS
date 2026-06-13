console.log("REMINDER JS LOADED");
const API = (window.API_BASE || "http://localhost:3007") + "/reminders";

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

// Normalize a reminder from the server so alarm engine fields are always correct
function normalizeReminder(r) {
    return {
        ...r,
        doseCount: String(r.doseCount || r.dose_count || 1),
        times: (r.times || []).map(t => ({
            ...t,
            h:    String(t.h    || "8"),
            m:    String(t.m    || "00"),
            ampm: String(t.ampm || "AM"),
            display: t.display || `${t.h}:${String(t.m).padStart(2,"0")} ${t.ampm}`
        })),
        days:     Array.isArray(r.days) ? r.days.map(Number) : [],
        monthDay: parseInt(r.monthDay || r.month_day || 1),
        duration: String(r.duration || "forever"),
        sound:    r.sound || "bell",
        sched:    r.sched || "daily",
    };
}

// ── Bottom-left toast ─────────────────────────────────────────
(function injectToastStyles() {
    if (document.getElementById("dhasToastStyle")) return;
    const style = document.createElement("style");
    style.id = "dhasToastStyle";
    style.textContent = `
        #dhasPageToast {
            position: fixed; bottom: 24px; left: 20px; z-index: 99998;
            max-width: 340px; min-width: 240px; padding: 13px 18px;
            border-radius: 14px; font-size: 0.87rem; font-weight: 600;
            line-height: 1.5; display: none; align-items: flex-start;
            gap: 10px; box-shadow: 0 6px 28px rgba(0,0,0,0.18);
            animation: dhasToastIn 0.3s cubic-bezier(.4,0,.2,1);
            font-family: 'DM Sans', sans-serif;
        }
        #dhasPageToast.success { background:#d1fae5; border:1.5px solid #86efac; color:#166534; }
        #dhasPageToast.error   { background:#fee2e2; border:1.5px solid #fca5a5; color:#991b1b; }
        body.dark #dhasPageToast.success, html.dark #dhasPageToast.success { background:#052e16; border-color:#166534; color:#86efac; }
        body.dark #dhasPageToast.error,   html.dark #dhasPageToast.error   { background:#450a0a; border-color:#991b1b; color:#fca5a5; }
        @keyframes dhasToastIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        #dhasPageToast .toast-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
        #dhasPageToast .toast-dismiss {
            margin-left:auto; background:none; border:none; cursor:pointer;
            color:inherit; opacity:0.6; font-size:14px; padding:0 0 0 8px; flex-shrink:0;
        }
        #dhasPageToast .toast-dismiss:hover { opacity:1; }
        .edit-discard-bar {
            display: flex; align-items: center; gap: 10px;
            background: #fff8ec; border: 1.5px solid #f4a035;
            border-radius: 10px; padding: 10px 14px; margin-bottom: 14px;
            font-size: 0.83rem; font-weight: 600; color: #92400e;
            animation: dhasToastIn 0.2s ease;
        }
        html.dark .edit-discard-bar, body.dark .edit-discard-bar {
            background: rgba(244,160,53,0.12); border-color: rgba(244,160,53,0.4); color: #fbbf6a;
        }
        .edit-discard-bar .discard-yes {
            margin-left: auto; background: #f4a035; color: #fff;
            border: none; border-radius: 7px; padding: 5px 12px;
            font-size: 0.78rem; font-weight: 700; cursor: pointer;
            font-family: 'DM Sans', sans-serif;
        }
        .edit-discard-bar .discard-no {
            background: none; border: 1.5px solid currentColor;
            border-radius: 7px; padding: 4px 10px; font-size: 0.78rem;
            font-weight: 700; cursor: pointer; color: inherit;
            font-family: 'DM Sans', sans-serif;
        }
        #dhasAlarmContainer {
            position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
            z-index: 99999; display: flex; flex-direction: column;
            gap: 10px; max-width: 360px; width: 92%;
            pointer-events: none;
        }
        #dhasAlarmContainer > * { pointer-events: all; }
        .alarm-card {
            background: linear-gradient(135deg,#1a56db,#0ea5e9); color:#fff;
            border-radius: 16px; padding: 16px 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.28);
            animation: alarmSlideIn 0.35s ease;
        }
        @keyframes alarmSlideIn { from{opacity:0;transform:translateY(-14px)} to{opacity:1;transform:translateY(0)} }
        .alarm-card-title { display:flex; align-items:center; gap:8px; font-size:1rem; font-weight:700; margin-bottom:3px; }
        .alarm-card-title i { font-size:18px; }
        .alarm-card-sub { font-size:0.82rem; opacity:0.85; margin-bottom:10px; }
        .alarm-card-actions { display:flex; gap:8px; }
        .alarm-snooze { background:rgba(255,255,255,0.2); border:1.5px solid rgba(255,255,255,0.4); color:#fff; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; flex:1; font-size:0.78rem; display:flex; align-items:center; justify-content:center; gap:5px; font-family:'DM Sans',sans-serif; }
        .alarm-dismiss { background:#fff; border:none; color:#1a56db; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; flex:1; display:flex; align-items:center; justify-content:center; gap:5px; font-size:0.78rem; font-family:'DM Sans',sans-serif; }
    `;
    document.head.appendChild(style);

    const toast = document.createElement("div");
    toast.id = "dhasPageToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);

    const alarmContainer = document.createElement("div");
    alarmContainer.id = "dhasAlarmContainer";
    alarmContainer.setAttribute("aria-live", "assertive");
    alarmContainer.setAttribute("aria-label", "Medicine reminders");
    document.body.appendChild(alarmContainer);
})();

let _msgTimer = null;
function showPageMsg(text, type = "success", duration = 4500) {
    let toast = document.getElementById("dhasPageToast");
    if (!toast) {
        setTimeout(() => showPageMsg(text, type, duration), 100);
        return;
    }
    const iconClass = type === "success" ? "ti-circle-check" : "ti-alert-circle";
    toast.className = type;
    toast.innerHTML = `
        <i class="ti ${iconClass} toast-icon" aria-hidden="true"></i>
        <span>${text}</span>
        <button class="toast-dismiss" onclick="this.parentElement.style.display='none'" aria-label="Dismiss">
            <i class="ti ti-x" aria-hidden="true"></i>
        </button>`;
    toast.style.display = "flex";
    if (_msgTimer) clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => { if (toast) toast.style.display = "none"; }, duration);
}

// ── Audio Engine ──────────────────────────────────────────────
if ("Notification" in window) Notification.requestPermission();

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

// Pre-warm AudioContext on every user interaction.
// Browsers suspend audio created outside a user gesture — this keeps it alive.
function _warmAudioCtx() {
    try { const ctx = getAudioCtx(); if (ctx.state === "suspended") ctx.resume(); } catch(e) {}
}
["click","touchstart","keydown","pointerdown"].forEach(ev =>
    document.addEventListener(ev, _warmAudioCtx, { passive: true })
);

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

async function playSound(soundKey) {
    const s = SOUNDS[soundKey] || SOUNDS.bell;
    try {
        const ctx = getAudioCtx();
        if (ctx.state === "suspended") await ctx.resume();
        s.play(ctx);
    } catch (e) { console.warn("Audio:", e); }
}

window.previewSound = function () {
    playSound(document.getElementById("alarmSound").value);
};

// ── Snooze state ──────────────────────────────────────────────
let snoozeTimers = {};

function snoozeReminder(reminderId, soundKey, cardEl) {
    cardEl.remove();
    if (snoozeTimers[reminderId]) clearTimeout(snoozeTimers[reminderId]);
    showPageMsg("Snoozed for 10 minutes.", "success");
    snoozeTimers[reminderId] = setTimeout(() => {
        const r = remindersCache.find(x => x.id === reminderId);
        const t = r?.times?.[0] || { label:"Reminder", display:"" };
        playSound(soundKey);
        showAlarmCard(r || { id: reminderId, medicine: "Medicine", sound: soundKey }, t);
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
        showPageMsg("Notifications are still blocked. Please allow them in your browser site settings.", "error", 6000);
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
            // Guard: skip if time parsing failed
            if (isNaN(alarmH) || isNaN(alarmM)) return;
            const nowMinutes   = hh * 60 + mm;
            const alarmMinutes = alarmH * 60 + alarmM;
            // Widen to ±4 minutes to survive page load delays and slow ticks
            
            const key = `${r.id}-${t.label}-${alarmH}-${alarmM}`;
            if (lastFiredKey[key]) return;
            lastFiredKey[key] = true;
            setTimeout(() => delete lastFiredKey[key], 5 * 60 * 1000);
            triggerAlarm(r, t);
        });
    });
}

function triggerAlarm(reminder, timeSlot) {
    playSound(reminder.sound || "bell");
    showAlarmCard(reminder, timeSlot);
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

    // After the last alarm of the day fires, schedule a post-alarm purge (5 min grace)
    if (reminder.duration && reminder.duration !== "forever") {
        schedulePostAlarmPurge(reminder, timeSlot);
    }
}

// Checks if this timeSlot is the last one for today; if so, deletes the reminder after 5 min
function schedulePostAlarmPurge(reminder, timeSlot) {
    const times = reminder.times || [];
    if (!times.length) return;

    // Find the latest alarm minute across all time slots
    const latestMinute = Math.max(...times.map(t => {
        let h = parseInt(t.h); const m = parseInt(t.m);
        if (t.ampm === "PM" && h !== 12) h += 12;
        if (t.ampm === "AM" && h === 12) h = 0;
        return h * 60 + m;
    }));

    // Convert this slot to minutes
    let slotH = parseInt(timeSlot.h); const slotM = parseInt(timeSlot.m);
    if (timeSlot.ampm === "PM" && slotH !== 12) slotH += 12;
    if (timeSlot.ampm === "AM" && slotH === 12) slotH = 0;
    const thisSlotMinute = slotH * 60 + slotM;

    // Only schedule purge when the LAST time slot fires
    if (thisSlotMinute !== latestMinute) return;

    // Check if this is the last day (duration days have elapsed including today)
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const base = reminder.startDate
        ? new Date(reminder.startDate + "T00:00:00")
        : (reminder.createdAt ? new Date(reminder.createdAt) : new Date());
    base.setHours(0,0,0,0);
    const daysSince = Math.floor((todayMidnight - base) / 86400000);
    const dur = parseInt(reminder.duration);

    // For a 1-day reminder: daysSince === 0, dur - 1 === 0 → this is the last day
    if (daysSince < dur) return;

    console.log(`[DHAS] Scheduling auto-delete for "${reminder.medicine}" in 5 minutes (last alarm fired).`);

    setTimeout(async () => {
        try {
            const res  = await fetch(`${API}/delete/${reminder.id}`, {
                method: "DELETE",
                headers: window.getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                remindersCache = remindersCache.filter(x => x.id !== reminder.id);
                displayReminders();
                showPageMsg(`"${reminder.medicine}" reminder completed and removed automatically.`, "success", 6000);
                console.log(`[DHAS] Auto-deleted reminder id=${reminder.id} after last alarm.`);
            }
        } catch (err) {
            console.warn("[DHAS] Post-alarm purge failed:", err);
        }
    }, 5 * 60 * 1000); // 5 minute grace period
}

function showAlarmCard(reminder, timeSlot) {
    const container = document.getElementById("dhasAlarmContainer");
    if (!container) return;

    const rid   = reminder.id;
    const sound = reminder.sound || "bell";
    const cardId = `alarmCard_${rid}_${timeSlot.label || "dose"}`.replace(/\s+/g,"_");

    if (document.getElementById(cardId)) return;

    const card = document.createElement("div");
    card.className = "alarm-card";
    card.id = cardId;
    card.innerHTML = `
        <div class="alarm-card-title">
            <i class="ti ti-bell-ringing" aria-hidden="true"></i>
            Medicine Time!
        </div>
        <div style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <i class="ti ti-pill" style="font-size:15px" aria-hidden="true"></i>
            ${reminder.medicine}
        </div>
        <div class="alarm-card-sub">${timeSlot.label}: ${timeSlot.display || "—"}</div>
        <div class="alarm-card-actions">
            <button class="alarm-snooze" id="snooze_${cardId}">
                <i class="ti ti-player-pause" style="font-size:13px" aria-hidden="true"></i>
                Snooze 10 min
            </button>
            <button class="alarm-dismiss" onclick="document.getElementById('${cardId}').remove()">
                <i class="ti ti-check" style="font-size:13px" aria-hidden="true"></i>
                Dismiss
            </button>
        </div>`;

    container.appendChild(card);

    document.getElementById(`snooze_${cardId}`)?.addEventListener("click", () => {
        snoozeReminder(rid, sound, card);
    });

    setTimeout(() => card.remove(), 40000);
}

// ── Schedule helpers ──────────────────────────────────────────
function shouldFireToday(r, dow, dom) {
    // Allow calling without args (defaults to now)
    if (dow === undefined) { const n = new Date(); dow = n.getDay(); dom = n.getDate(); }
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    if (r.startDate) {
        const start = new Date(r.startDate + "T00:00:00");
        if (todayMidnight < start) return false;
    }
    if (r.duration && r.duration !== "forever") {
        const base = r.startDate ? new Date(r.startDate + "T00:00:00") : new Date(r.createdAt);
        base.setHours(0,0,0,0);
        // >= means: after the last valid day, don't fire
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
            return (r.days || []).map(Number).includes(dow);
        case "monthly": return dom === (parseInt(r.monthDay) || 1);
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
    // Align ticker to fire at the START of every minute (xx:yy:00)
    // This guarantees checkAlarms() always runs when hh:mm changes,
    // so an exact-minute match never gets skipped.
    function scheduleNextMinuteTick() {
        const now = new Date();
        // ms remaining until the next whole minute + 200ms buffer
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 200;
        setTimeout(() => {
            checkAlarms();
            // After the first aligned tick, repeat every 60 s exactly
            setInterval(checkAlarms, 60 * 1000);
        }, msUntilNextMinute);
    }
    // Also do an immediate check in case we loaded right at alarm time
    setTimeout(checkAlarms, 500);
    scheduleNextMinuteTick();
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
              <i class="ti ti-bell-check" style="font-size:20px;margin-top:2px;flex-shrink:0;" aria-hidden="true"></i>
              <div>
                <div style="font-weight:700;font-size:0.92rem;">Notifications Enabled</div>
                <div style="margin-top:4px;font-weight:500;">DHAS can now send medicine reminders and alarm alerts even when the app is minimized.</div>
              </div>
            </div>`;
    } else {
        Object.assign(banner.style, { background:"#fff7ed", color:"#9a3412", borderColor:"#fdba74" });
        banner.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <i class="ti ti-bell-off" style="font-size:22px;margin-top:2px;flex-shrink:0;" aria-hidden="true"></i>
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
                               font-size:0.85rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
                  <i class="ti ti-bell" aria-hidden="true"></i> Enable Notifications
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
    return Array.from({length:12},(_,i)=>{const s=String(i+1);return`<option value="${s}"${s===String(sel)?" selected":""}>${s}</option>`;}).join("");
}
function minuteOptions(sel) {
    return Array.from({length:12},(_,i)=>{const s=String(i*5).padStart(2,"0");return`<option value="${s}"${s===String(sel)?" selected":""}>${s}</option>`;}).join("");
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

function previewRow(label, value, iconClass) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:12px;border-radius:12px;gap:8px;">
              <span style="display:flex;align-items:center;gap:6px;color:#6b7fa3;font-size:0.85rem;">
                <i class="ti ${iconClass}" style="font-size:14px" aria-hidden="true"></i> ${label}
              </span>
              <strong style="font-size:0.85rem;text-align:right;">${value}</strong>
            </div>`;
}

// ── API: fetch reminders ──────────────────────────────────────
async function loadRemindersFromServer() {
    const uid = getUserId();
    if (!uid) { displayReminders(); return; }
    try {
        const res  = await fetch(`${API}/get/${uid}`, {
            headers: window.getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            remindersCache = (data.data || []).map(normalizeReminder);
            await purgeExpiredReminders();
        }
    } catch (err) { console.error("loadReminders error:", err); }
    displayReminders();
}

async function purgeExpiredReminders() {
    const now = new Date();
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const toDelete = remindersCache.filter(r => {
        if (!r.duration || r.duration === "forever") return false;
        const base = r.startDate
            ? new Date(r.startDate + "T00:00:00")
            : (r.createdAt ? new Date(r.createdAt) : new Date());
        base.setHours(0,0,0,0);
        const daysSince = Math.floor((todayMidnight - base) / 86400000);
        const dur = parseInt(r.duration);
        // daysSince > dur: clearly past — delete immediately
        if (daysSince > dur) return true;
        // daysSince === dur: last day has passed; delete only after all alarms + 5 min grace
        if (daysSince === dur) {
            const times = r.times || [];
            if (!times.length) return true;
            const latestMin = Math.max(...times.map(t => {
                let h = parseInt(t.h); const m = parseInt(t.m);
                if (t.ampm === "PM" && h !== 12) h += 12;
                if (t.ampm === "AM" && h === 12) h = 0;
                return h * 60 + m;
            }));
            return (now.getHours() * 60 + now.getMinutes()) >= latestMin + 5;
        }
        return false;
    });
    for (const r of toDelete) {
        try {
            await fetch(`${API}/delete/${r.id}`, { method:"DELETE", headers:window.getAuthHeaders() });
            remindersCache = remindersCache.filter(x => x.id !== r.id);
            showPageMsg(`"${r.medicine}" reminder completed and removed.`, "success", 5000);
        } catch(e) { console.warn("purge failed", r.id, e); }
    }
    if (toDelete.length) { console.log(`Purged ${toDelete.length} expired reminder(s).`); }
}

// ── Save reminder ─────────────────────────────────────────────
// FIX: Removed the aggressive "filter past times" logic that blocked saving.
// Now we save ALL selected times and let the alarm engine decide what fires.
window.addReminder = async function () {
    const medicineInput = document.getElementById("medicine");
    const medicine      = medicineInput.value.trim();
    if (!medicine) {
        medicineInput.focus();
        showPageMsg("Please enter a medicine name.", "error");
        return;
    }

    const uid = getUserId();
    if (!uid) {
        showPageMsg("Session error: could not read your user ID.", "error");
        return;
    }

    const sched      = document.getElementById("scheduleType").value;
    const doseCount  = document.getElementById("doseCount").value;
    const sound      = document.getElementById("alarmSound").value;
    const duration   = document.getElementById("durationType").value;
    const startDate  = document.getElementById("startDate").value || new Date().toISOString().split("T")[0];
    const days       = getSelectedDays();
    const monthDay   = parseInt(document.getElementById("monthDay").value) || 1;
    const times      = collectTimes();  // FIX: save all times, no filtering

    if (!times || times.length === 0) {
        showPageMsg("No times configured. Please set at least one time.", "error");
        return;
    }

    if (sched === "weekly"     && days.length !== 1) { showPageMsg("Please select 1 day for weekly schedule.", "error"); return; }
    if (sched === "twice_week" && days.length !== 2) { showPageMsg("Please select exactly 2 days.", "error"); return; }
    if (sched === "three_week" && days.length !== 3) { showPageMsg("Please select exactly 3 days.", "error"); return; }
    if (sched === "custom"     && days.length === 0) { showPageMsg("Please select at least 1 day.", "error"); return; }

    const payload = {
        user_id:       uid,
        medicine,
        sched,
        scheduleLabel: buildScheduleLabel(sched, days, monthDay),
        doseCount:     parseInt(doseCount),
        dosesLabel:    doseLabel(doseCount),
        times,
        days,
        monthDay,
        duration,
        sound,
        startDate,
        altBase: sched === "alternate" ? new Date().toISOString() : null
    };

    // Show loading state
    const saveBtn = document.querySelector('.btn-dhas.primary[onclick="addReminder()"]');
    const origText = saveBtn ? saveBtn.textContent : null;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

    try {
        const res  = await fetch(`${API}/add`, {
            method:"POST",
            headers: window.getAuthHeaders(),
            body:JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showPageMsg(data.message || "Failed to save reminder. Please try again.", "error");
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origText; }
            return;
        }

        await loadRemindersFromServer();
        showPageMsg(`✅ Reminder for "${medicine}" saved successfully at ${times[0]?.display}.`, "success", 5000);

        document.getElementById("medicine").value     = "";
        document.getElementById("scheduleType").value = "daily";
        document.getElementById("doseCount").value    = "1";
        document.getElementById("alarmSound").value   = "bell";
        document.getElementById("reminderPreview").style.display = "none";
        renderScheduleUI();
        
    } catch (err) {
        console.error("addReminder error:", err);
        showPageMsg("Network error — could not save reminder. Is the server running?", "error");
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origText; }
    }
};

// ── Delete reminder ───────────────────────────────────────────
window.deleteReminder = async function (id) {
    const card = document.getElementById(`reminderCard_${id}`);
    if (!card) return;

    if (card.dataset.pendingDelete === "1") {
        card.removeAttribute("data-pending-delete");
        try {
            const res  = await fetch(`${API}/delete/${id}`, {
                method:"DELETE",
                headers: window.getAuthHeaders()
            });
            const data = await res.json();
            if (!data.success) { showPageMsg("Could not delete reminder. Please try again.", "error"); return; }
            remindersCache = remindersCache.filter(r => r.id !== id);
            displayReminders();
            showPageMsg("Reminder deleted.", "success");
        } catch (err) {
            showPageMsg("Network error — could not delete.", "error");
        }
        return;
    }

    card.dataset.pendingDelete = "1";
    showPageMsg("Tap Delete again to confirm deletion.", "error", 4000);
    setTimeout(() => card?.removeAttribute("data-pending-delete"), 4000);
};

// ── FIX-2: hasUnsavedChanges ──────────────────────────────────
function hasUnsavedChanges(id) {
    const r = remindersCache.find(x => x.id === id);
    if (!r) return false;

    const container = document.getElementById(`editContainer_${id}`);
    if (!container || !container.innerHTML.trim()) return false;

    const schedEl = container.querySelector(`#edit_sched_${id}`);
    if (schedEl && schedEl.value !== (r.sched || "daily")) return true;

    const durEl = container.querySelector(`#edit_duration_${id}`);
    if (durEl && durEl.value !== (r.duration || "forever")) return true;

    const soundEl = container.querySelector(`#edit_sound_${id}`);
    if (soundEl && soundEl.value !== (r.sound || "bell")) return true;

    const doseEl = container.querySelector(`#edit_doseCount_${id}`);
    const originalDose = String(r.doseCount || r.dose_count || 1);
    if (doseEl && doseEl.value !== originalDose) return true;

    const slots = DOSE_DEFAULTS[doseEl ? doseEl.value : originalDose] || DOSE_DEFAULTS["1"];
    const originalTimes = r.times || [];
    for (let i = 0; i < slots.length; i++) {
        const hEl  = container.querySelector(`#edit_h_${id}_${i}`);
        const mEl  = container.querySelector(`#edit_m_${id}_${i}`);
        const apEl = container.querySelector(`#edit_ap_${id}_${i}`);
        const orig = originalTimes[i] || slots[i];
        if (hEl  && hEl.value  !== String(orig.h    || slots[i].h))    return true;
        if (mEl  && mEl.value  !== String(orig.m    || slots[i].m))    return true;
        if (apEl && apEl.value !== String(orig.ampm || slots[i].ampm)) return true;
    }

    const activeDayTiles = container.querySelectorAll(".day-tile.active");
    const currentDays    = Array.from(activeDayTiles).map(t => parseInt(t.id.replace(`editDayTile_${id}_`, "")));
    const originalDays   = r.days || [];
    if (currentDays.length !== originalDays.length) return true;
    if (!currentDays.every((d, i) => d === originalDays[i])) return true;

    return false;
}

function showDiscardBar(id, onConfirm) {
    const container = document.getElementById(`editContainer_${id}`);
    if (!container) { onConfirm(); return; }

    container.querySelector(".edit-discard-bar")?.remove();

    const bar = document.createElement("div");
    bar.className = "edit-discard-bar";
    bar.innerHTML = `
        <i class="ti ti-alert-triangle" style="font-size:15px;flex-shrink:0;" aria-hidden="true"></i>
        <span>You have unsaved changes. Discard them?</span>
        <button class="discard-no">Keep editing</button>
        <button class="discard-yes">Discard</button>
    `;
    container.insertBefore(bar, container.firstChild);

    bar.querySelector(".discard-yes").addEventListener("click", () => {
        bar.remove();
        onConfirm();
    });
    bar.querySelector(".discard-no").addEventListener("click", () => {
        bar.remove();
    });
}

// ── EDIT REMINDER (inline) ────────────────────────────────────
window.openEditReminder = function(id) {
    const r = remindersCache.find(x => x.id === id);
    if (!r) return;

    const container = document.getElementById(`editContainer_${id}`);
    if (!container) return;

    if (container.innerHTML.trim() !== "") {
        if (hasUnsavedChanges(id)) {
            showDiscardBar(id, () => { container.innerHTML = ""; });
        } else {
            container.innerHTML = "";
        }
        return;
    }

    document.querySelectorAll(".edit-panel").forEach(el => {
        const otherIdMatch = el.closest("[id^='editContainer_']")?.id?.replace("editContainer_", "");
        if (otherIdMatch && otherIdMatch !== String(id)) {
            const otherId = parseInt(otherIdMatch);
            if (!hasUnsavedChanges(otherId)) el.innerHTML = "";
        }
    });

    const sched      = r.sched || "daily";
    const doseCount  = String(r.doseCount || r.dose_count || 1);
    const duration   = r.duration || "forever";
    const sound      = r.sound || "bell";
    const days       = r.days || [];
    const monthDay   = r.monthDay || r.month_day || 1;
    const times      = r.times || [];

    const schedOptions = [
        ["daily","Every Day"],["alternate","Alternate Days"],
        ["weekly","Once a Week"],["twice_week","Twice a Week"],
        ["three_week","3 Times a Week"],["monthly","Once a Month"],["custom","Custom Days"]
    ].map(([val,lbl]) => `<option value="${val}" ${val===sched?"selected":""}>${lbl}</option>`).join("");

    const durOptions = [
        ["forever","Ongoing (until removed)"],["1","1 Day only"],
        ["2","2 Days"],["3","3 Days"],["5","5 Days"],["7","1 Week"],
        ["14","2 Weeks"],["30","1 Month"]
    ].map(([val,lbl]) => `<option value="${val}" ${val===duration?"selected":""}>${lbl}</option>`).join("");

    const soundOptions = Object.entries(SOUNDS)
        .map(([val,obj]) => `<option value="${val}" ${val===sound?"selected":""}>${obj.label}</option>`).join("");

    const doseOptions = [["1","Once a day"],["2","Twice a day"],["3","Three times a day"]]
        .map(([val,lbl]) => `<option value="${val}" ${val===doseCount?"selected":""}>${lbl}</option>`).join("");

    function buildEditTimeSlots(existingTimes, count) {
        const slots = DOSE_DEFAULTS[count] || DOSE_DEFAULTS["1"];
        return slots.map((slot, i) => {
            const ex = existingTimes[i] || slot;
            return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <label style="min-width:88px;font-size:0.83rem;font-weight:600;color:var(--text-muted,#6b7fa3);flex-shrink:0;">${slot.label}</label>
              <select id="edit_h_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${hourOptions(ex.h||slot.h)}</select>
              <span style="font-weight:700;color:#888;">:</span>
              <select id="edit_m_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${minuteOptions(ex.m||slot.m)}</select>
              <select id="edit_ap_${id}_${i}" class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;font-weight:700;color:var(--primary,#0d6efd);margin-bottom:0;">
                <option value="AM" ${(ex.ampm||slot.ampm)==="AM"?"selected":""}>AM</option>
                <option value="PM" ${(ex.ampm||slot.ampm)==="PM"?"selected":""}>PM</option>
              </select>
            </div>`;
        }).join("");
    }

    const showDayPicker = ["weekly","twice_week","three_week","custom"].includes(sched);
    const showMonthDay  = sched === "monthly";

    const dayPickerHtml = ALL_DAYS.map((day, i) => {
        const active = days.includes(i) ? "active" : "";
        return `<div class="day-tile edit-day-tile ${active}" id="editDayTile_${id}_${i}" onclick="toggleEditDay(${id},${i},'${sched}')">${day}</div>`;
    }).join("");

    let monthDayOpts = "";
    for (let d = 1; d <= 28; d++) {
        monthDayOpts += `<option value="${d}" ${d===monthDay?"selected":""}>${d}${ordinal(d)} of every month</option>`;
    }

    container.innerHTML = `
        <div style="background:var(--card-bg,#fff);border:2px solid #2a6cf6;border-radius:16px;
                    padding:20px;margin-top:10px;animation:editSlide .25s ease;">
          <style>@keyframes editSlide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:0.92rem;font-weight:700;color:#2a6cf6;display:flex;align-items:center;gap:7px;">
              <i class="ti ti-edit" style="font-size:15px" aria-hidden="true"></i>
              Edit — ${r.medicine}
            </div>
            <button onclick="closeEditReminderSafe(${id})"
                    style="background:none;border:1px solid var(--border,#e4e9f4);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;color:var(--muted,#6b7fa3);display:flex;align-items:center;justify-content:center;">
              <i class="ti ti-x" style="font-size:14px" aria-hidden="true"></i>
            </button>
          </div>

          <label class="dhas-label">Schedule</label>
          <select id="edit_sched_${id}" class="dhas-input" onchange="onEditSchedChange(${id})">${schedOptions}</select>

          <div id="edit_dayPickerSection_${id}" style="display:${showDayPicker?"block":"none"};margin-bottom:10px;">
            <label class="dhas-label">Select Day(s)</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;" id="edit_dayPicker_${id}">${dayPickerHtml}</div>
          </div>

          <div id="edit_monthDaySection_${id}" style="display:${showMonthDay?"block":"none"};">
            <label class="dhas-label">Day of the Month</label>
            <select id="edit_monthDay_${id}" class="dhas-input">${monthDayOpts}</select>
          </div>

          <label class="dhas-label">Times per Day</label>
          <select id="edit_doseCount_${id}" class="dhas-input" onchange="onEditDoseChange(${id})">${doseOptions}</select>

          <label class="dhas-label">Set Time(s)</label>
          <div id="edit_timeSlots_${id}">${buildEditTimeSlots(times, doseCount)}</div>

          <label class="dhas-label">Reminder Duration</label>
          <select id="edit_duration_${id}" class="dhas-input" style="margin-bottom:14px;">${durOptions}</select>

          <label class="dhas-label">Alarm Sound</label>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:18px;">
            <select id="edit_sound_${id}" class="dhas-input" style="margin-bottom:0;flex:1;">${soundOptions}</select>
            <button type="button"
                    onclick="playSound(document.getElementById('edit_sound_${id}').value)"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;
                           border-radius:8px;padding:9px 14px;cursor:pointer;font-size:0.82rem;font-weight:700;
                           display:flex;align-items:center;gap:6px;">
              <i class="ti ti-player-play" style="font-size:13px" aria-hidden="true"></i> Preview
            </button>
          </div>

          <div style="display:flex;gap:10px;">
            <button onclick="closeEditReminderSafe(${id})"
                    style="flex:1;padding:11px;border:1.5px solid var(--border,#e4e9f4);border-radius:10px;
                           background:var(--bg,#f4f6fc);color:var(--text,#0d1b3e);font-weight:600;font-size:0.9rem;cursor:pointer;">
              Cancel
            </button>
            <button onclick="saveEditReminder(${id})"
                    style="flex:2;padding:11px;border:none;border-radius:10px;
                           background:linear-gradient(135deg,#2a6cf6,#4f8ef9);color:#fff;
                           font-weight:700;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;">
              <i class="ti ti-device-floppy" style="font-size:15px" aria-hidden="true"></i>
              Save Changes
            </button>
          </div>
        </div>`;

    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.closeEditReminderSafe = function(id) {
    if (hasUnsavedChanges(id)) {
        showDiscardBar(id, () => {
            const container = document.getElementById(`editContainer_${id}`);
            if (container) container.innerHTML = "";
        });
    } else {
        const container = document.getElementById(`editContainer_${id}`);
        if (container) container.innerHTML = "";
    }
};

window.closeEditReminder = function(id) {
    const container = document.getElementById(`editContainer_${id}`);
    if (container) container.innerHTML = "";
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
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <label style="min-width:88px;font-size:0.83rem;font-weight:600;color:var(--text-muted,#6b7fa3);flex-shrink:0;">${slot.label}</label>
          <select id="edit_h_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${hourOptions(existing.h||slot.h)}</select>
          <span style="font-weight:700;color:#888;">:</span>
          <select id="edit_m_${id}_${i}"  class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;margin-bottom:0;">${minuteOptions(existing.m||slot.m)}</select>
          <select id="edit_ap_${id}_${i}" class="dhas-input" style="width:66px;padding:7px 4px;text-align:center;font-weight:700;color:var(--primary,#0d6efd);margin-bottom:0;">
            <option value="AM" ${(existing.ampm||slot.ampm)==="AM"?"selected":""}>AM</option>
            <option value="PM" ${(existing.ampm||slot.ampm)==="PM"?"selected":""}>PM</option>
          </select>
        </div>`;
    }).join("");
};

window.saveEditReminder = async function (id) {
    const r = remindersCache.find(x => x.id === id);
    if (!r) return;

    const sched     = document.getElementById(`edit_sched_${id}`).value;
    const duration  = document.getElementById(`edit_duration_${id}`).value;
    const sound     = document.getElementById(`edit_sound_${id}`).value;
    const doseCount = document.getElementById(`edit_doseCount_${id}`).value;
    const monthDay  = parseInt(document.getElementById(`edit_monthDay_${id}`)?.value || r.monthDay || 1);

    const days = Array.from(
        document.querySelectorAll(`#edit_dayPicker_${id} .edit-day-tile.active`)
    ).map(t => parseInt(t.id.split("_").pop()));

    if (sched==="weekly"     && days.length!==1) { showPageMsg("Please select 1 day for weekly schedule.", "error"); return; }
    if (sched==="twice_week" && days.length!==2) { showPageMsg("Please select exactly 2 days.", "error"); return; }
    if (sched==="three_week" && days.length!==3) { showPageMsg("Please select exactly 3 days.", "error"); return; }
    if (sched==="custom"     && days.length===0) { showPageMsg("Please select at least 1 day.", "error"); return; }

    const slots    = DOSE_DEFAULTS[doseCount] || DOSE_DEFAULTS["1"];
    const newTimes = slots.map((slot, i) => ({
        label:   slot.label,
        display: `${document.getElementById(`edit_h_${id}_${i}`).value}:${document.getElementById(`edit_m_${id}_${i}`).value} ${document.getElementById(`edit_ap_${id}_${i}`).value}`,
        h:    document.getElementById(`edit_h_${id}_${i}`).value,
        m:    document.getElementById(`edit_m_${id}_${i}`).value,
        ampm: document.getElementById(`edit_ap_${id}_${i}`).value
    }));

    try {
        const delData = await (await fetch(`${API}/delete/${id}`, {
            method:"DELETE",
            headers: window.getAuthHeaders()
        })).json();
        if (!delData.success) { showPageMsg("Could not update reminder. Please try again.", "error"); return; }

        const payload = {
            user_id:       getUserId(),
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
            altBase:       sched==="alternate" ? new Date().toISOString() : null
        };

        const addData = await (await fetch(`${API}/add`, {
            method:"POST",
            headers: window.getAuthHeaders(),
            body:JSON.stringify(payload)
        })).json();

        if (!addData.success) { showPageMsg(addData.message || "Failed to save changes.", "error"); return; }

        const container = document.getElementById(`editContainer_${id}`);
        if (container) container.innerHTML = "";

        await loadRemindersFromServer();
        showPageMsg(`Reminder for "${r.medicine}" updated successfully.`, "success");

    } catch (err) {
        showPageMsg("Network error — could not save changes.", "error");
    }
};

// ── Display reminders ─────────────────────────────────────────
function displayReminders() {
    const list = document.getElementById("reminderList");
    if (!list) return;

    const reminders = getReminders();
    if (!reminders.length) {
        list.innerHTML = `
            <div class="empty-state">
              <i class="ti ti-pill" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.5;" aria-hidden="true"></i>
              <p>No reminders set yet.<br>Add your first medicine reminder above.</p>
            </div>`;
        return;
    }

    const BC = {
        daily:{bg:"#dcfce7",color:"#166534"}, alternate:{bg:"#fef9c3",color:"#854d0e"},
        weekly:{bg:"#ede9fe",color:"#5b21b6"}, twice_week:{bg:"#ffedd5",color:"#9a3412"},
        three_week:{bg:"#fff0e0",color:"#92400e"}, monthly:{bg:"#fce7f3",color:"#9d174d"},
        custom:{bg:"#f0fdf4",color:"#065f46"}
    };

    list.innerHTML = reminders.map(r => {
        const durationLabel = r.duration==="forever" ? "Continuous" : `${r.duration} Day(s)`;
        const _sd = r.startDate
            || (r.createdAt ? r.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]);
        const startDateLabel = new Date(_sd + "T00:00:00")
            .toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
        let endDateLabel = "";
        if (r.duration && r.duration !== "forever") {
            const endD = new Date(_sd + "T00:00:00");
            endD.setDate(endD.getDate() + parseInt(r.duration));
            endDateLabel = endD.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
        }
        const chips = (r.times||[]).map(t =>
            `<span style="background:#f0f7ff;border:1px solid #bfdbfe;color:#1e40af;
                          border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:600;
                          white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">
               <i class="ti ti-clock" style="font-size:12px" aria-hidden="true"></i>
               ${t.label}: ${t.display || "—"}
             </span>`).join("");
        const bc = BC[r.sched] || { bg:"#dbeafe", color:"#1d4ed8" };

        return `
            <div class="reminder-item" id="reminderCard_${r.id}">
              <div style="flex:1;min-width:0;">
                <div class="reminder-name">
                  <i class="ti ti-pill" aria-hidden="true"></i>
                  ${r.medicine}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                  <span class="sched-chip" style="background:${bc.bg};color:${bc.color};">
                    <i class="ti ti-calendar" style="font-size:12px" aria-hidden="true"></i>
                    ${r.scheduleLabel||""}
                  </span>
                  <span class="sched-chip" style="background:#dbeafe;color:#1d4ed8;">
                    <i class="ti ti-repeat" style="font-size:12px" aria-hidden="true"></i>
                    ${r.dosesLabel||""}
                  </span>
                  <span class="sched-chip" style="background:#ecfccb;color:#3f6212;">
                    <i class="ti ti-hourglass" style="font-size:12px" aria-hidden="true"></i>
                    ${durationLabel}
                  </span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${chips}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">
                  <span class="sched-chip" style="background:rgba(42,108,246,.15);color:#7aafff;border:1px solid rgba(42,108,246,.3);">
                    <i class="ti ti-calendar-event" style="font-size:11px" aria-hidden="true"></i>
                    Started: ${startDateLabel}
                  </span>
                  ${endDateLabel ? `<span class="sched-chip" style="background:rgba(244,160,53,.15);color:#fbbf24;border:1px solid rgba(244,160,53,.3);">
                    <i class="ti ti-calendar-x" style="font-size:11px" aria-hidden="true"></i>
                    Ends: ${endDateLabel}
                  </span>` : ""}
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:7px;flex-shrink:0;align-items:flex-end;">
                <button class="edit-btn" onclick="openEditReminder(${r.id})">
                  <i class="ti ti-edit" style="font-size:13px" aria-hidden="true"></i> Edit
                </button>
                <button class="reminder-delete" onclick="deleteReminder(${r.id})">
                  <i class="ti ti-trash" style="font-size:13px" aria-hidden="true"></i> Delete
                </button>
              </div>
            </div>
            <div id="editContainer_${r.id}" class="edit-panel"></div>`;
    }).join("");
}

function goBack() { window.location.href = "dashboard.html"; }

// ── Init ──────────────────────────────────────────────────────
window.onload = async function () {
    // ── 1. DOM setup FIRST — before any async calls that could pause execution ──
    buildMonthDayOptions();
    renderScheduleUI();

    const today = new Date().toISOString().split("T")[0];
    const startDateEl = document.getElementById("startDate");
    if (startDateEl) {
        startDateEl.min   = today;
        startDateEl.value = today;
    }

    // Force-render time slots directly in case renderScheduleUI ran too early
    const doseEl = document.getElementById("doseCount");
    const tsEl   = document.getElementById("timeSlots");
    if (doseEl && tsEl && tsEl.innerHTML.trim() === "") {
        renderTimeSlots(doseEl.value || "1");
    }

    // ── 2. Async: SW + notifications (won't block DOM) ──
    registerSW();  // fire-and-forget — no await so SW install never blocks UI
    requestNotifPermission().then(granted => updateNotifBanner(granted));

    // ── 3. Load data + start alarm ticker ──
    await loadRemindersFromServer();
    startAlarmTicker();
};

document.addEventListener("input",  updateReminderPreview);
document.addEventListener("change", updateReminderPreview);