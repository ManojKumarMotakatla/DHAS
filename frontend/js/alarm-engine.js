// ============================================================
// DHAS — frontend/js/alarm-engine.js (FIXED VERSION)
// ============================================================

(function () {
  "use strict";

  if (window.__DHAS_ALARM_ENGINE_LOADED__) return;
  window.__DHAS_ALARM_ENGINE_LOADED__ = true;

  function getUserId() {
    const flatKeys = ["user_id", "userId", "uid", "dhas_user_id", "dhas_userId", "id", "user"];
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
          const id = obj.user_id || obj.userId || obj.uid || obj.id;
          if (id) return String(id);
        } catch (_) { }
      }
    }
    return null;
  }

  const uid = getUserId();
  const patientToken = localStorage.getItem("dhas_token");
  if (!uid || !patientToken) return;

  const API = (window.API_BASE || "http://localhost:3007") + "/reminders";

  let remindersCache = [];

  // ── Audio engine (with better initialization) ───────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.error("[AlarmEngine] Audio context creation failed:", e);
        return null;
      }
    }
    return audioCtx;
  }

  function _warmAudioCtx() {
    try {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(e => console.warn("[AlarmEngine] Audio resume failed:", e));
      }
    } catch (e) { }
  }

  ["click", "touchstart", "keydown", "pointerdown"].forEach(ev =>
    document.addEventListener(ev, _warmAudioCtx, { passive: true })
  );

  const SOUNDS = {
    bell: {
      play(ctx) {
        playTone(ctx, [
          { freq: 880, dur: 0.3, delay: 0, gain: 0.6 },
          { freq: 660, dur: 0.3, delay: 0.35, gain: 0.5 },
          { freq: 880, dur: 0.5, delay: 0.7, gain: 0.7 }
        ], "sine");
      }
    },
    chime: {
      play(ctx) {
        [523, 659, 784, 1047, 784, 659, 523].forEach((f, i) =>
          playTone(ctx, [{ freq: f, dur: 0.25, delay: i * 0.18, gain: 0.45 }], "sine")
        );
      }
    },
    beep: {
      play(ctx) {
        [0, 0.35, 0.7].forEach(d =>
          playTone(ctx, [{ freq: 1000, dur: 0.2, delay: d, gain: 0.5 }], "square")
        );
      }
    },
    gentle: {
      play(ctx) {
        playTone(ctx, [
          { freq: 440, dur: 0.8, delay: 0, gain: 0.3 },
          { freq: 550, dur: 0.8, delay: 0.5, gain: 0.25 },
          { freq: 440, dur: 0.8, delay: 1.0, gain: 0.2 }
        ], "sine");
      }
    },
    alarm: {
      play(ctx) {
        for (let i = 0; i < 6; i++)
          playTone(ctx, [{ freq: i % 2 === 0 ? 880 : 660, dur: 0.18, delay: i * 0.2, gain: 0.6 }], "sawtooth");
      }
    }
  };

  function playTone(ctx, notes, type) {
    if (!ctx) return;
    notes.forEach(({ freq, dur, delay, gain }) => {
      try {
        const osc = ctx.createOscillator(), gn = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gn.gain.setValueAtTime(0, ctx.currentTime + delay);
        gn.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.connect(gn); gn.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur + 0.05);
      } catch (e) {
        console.warn("[AlarmEngine] Tone error:", e);
      }
    });
  }

  async function playSound(soundKey) {
    const s = SOUNDS[soundKey] || SOUNDS.bell;
    try {
      const ctx = getAudioCtx();
      if (!ctx) {
        console.warn("[AlarmEngine] Audio context unavailable");
        return;
      }
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      s.play(ctx);
      console.log("[AlarmEngine] Sound played:", soundKey);
    } catch (e) {
      console.error("[AlarmEngine] Audio error:", e);
    }
  }

  window.previewSound = window.previewSound || function (soundKey) {
    playSound(soundKey || document.getElementById("alarmSound")?.value || "bell");
  };

  // ── Toast notifications ──
  function ensureToastEl() {
    let toast = document.getElementById("dhasPageToast");
    if (toast) return toast;

    if (!document.getElementById("dhasToastStyleShared")) {
      const style = document.createElement("style");
      style.id = "dhasToastStyleShared";
      style.textContent = `
        #dhasPageToast {
          position: fixed; bottom: 24px; left: 20px; z-index: 99998;
          max-width: 340px; min-width: 240px; padding: 13px 18px;
          border-radius: 14px; font-size: 0.87rem; font-weight: 600;
          line-height: 1.5; display: none; align-items: flex-start;
          gap: 10px; box-shadow: 0 6px 28px rgba(0,0,0,0.18);
          font-family: 'DM Sans', sans-serif; animation: dhasToastInShared 0.3s ease;
        }
        #dhasPageToast.success { background:#d1fae5; border:1.5px solid #86efac; color:#166534; }
        #dhasPageToast.error   { background:#fee2e2; border:1.5px solid #fca5a5; color:#991b1b; }
        @keyframes dhasToastInShared { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        #dhasAlarmContainerShared {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          z-index: 99999; display: flex; flex-direction: column;
          gap: 10px; max-width: 360px; width: 92%; pointer-events: none;
        }
        #dhasAlarmContainerShared > * { pointer-events: all; }
        .alarm-card-shared {
          background: linear-gradient(135deg,#1a56db,#0ea5e9); color:#fff;
          border-radius: 16px; padding: 16px 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.28);
          animation: alarmSlideInShared 0.35s ease;
          font-family: 'DM Sans', sans-serif;
        }
        @keyframes alarmSlideInShared { from{opacity:0;transform:translateY(-14px)} to{opacity:1;transform:translateY(0)} }
        .alarm-card-shared .acs-title { display:flex; align-items:center; gap:8px; font-size:1rem; font-weight:700; margin-bottom:3px; }
        .alarm-card-shared .acs-sub { font-size:0.82rem; opacity:0.85; margin-bottom:10px; }
        .alarm-card-shared .acs-actions { display:flex; gap:8px; }
        .acs-snooze { background:rgba(255,255,255,0.2); border:1.5px solid rgba(255,255,255,0.4); color:#fff; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; flex:1; font-size:0.78rem; font-family:'DM Sans',sans-serif; }
        .acs-dismiss { background:#fff; border:none; color:#1a56db; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; flex:1; font-size:0.78rem; font-family:'DM Sans',sans-serif; }
      `;
      document.head.appendChild(style);
    }

    toast = document.createElement("div");
    toast.id = "dhasPageToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
  }

  function ensureAlarmContainer() {
    let c = document.getElementById("dhasAlarmContainerShared");
    if (c) return c;
    c = document.createElement("div");
    c.id = "dhasAlarmContainerShared";
    c.setAttribute("aria-live", "assertive");
    c.setAttribute("aria-label", "Medicine reminders");
    document.body.appendChild(c);
    return c;
  }

  let _msgTimer = null;
  function showPageMsg(text, type = "success", duration = 6000) {
    ensureToastEl();
    const toast = document.getElementById("dhasPageToast");
    toast.className = type;
    toast.innerHTML = `<span>${text}</span>`;
    toast.style.display = "flex";
    if (_msgTimer) clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => { if (toast) toast.style.display = "none"; }, duration);
  }

  // ── Schedule helpers ──
  function to24(h, m, ampm) {
    let hour = parseInt(h, 10);
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return [hour, parseInt(m, 10)];
  }

  function shouldFireToday(r) {
    const now = new Date();
    const dow = now.getDay(), dom = now.getDate();
    const todayMidnight = new Date(); 
    todayMidnight.setHours(0, 0, 0, 0);

    if (r.startDate) {
      const start = new Date(r.startDate + "T00:00:00");
      if (todayMidnight < start) return false;
    }

    if (r.duration && r.duration !== "forever") {
      const base = r.startDate
        ? new Date(r.startDate + "T00:00:00")
        : (r.createdAt ? new Date(r.createdAt) : new Date());
      base.setHours(0, 0, 0, 0);
      if (Math.floor((todayMidnight - base) / 86400000) >= parseInt(r.duration)) return false;
    }

    switch (r.sched) {
      case "daily": return true;
      case "alternate": {
        if (!r.altBase) return true;
        const base = new Date(r.altBase);
        const today = new Date(); 
        today.setHours(0, 0, 0, 0);
        const bDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        return Math.round((today - bDay) / 86400000) % 2 === 0;
      }
      case "weekly": case "twice_week": case "three_week": case "custom":
        return (r.days || []).map(Number).includes(dow);
      case "monthly": return dom === (parseInt(r.monthDay) || 1);
      default: return false;
    }
  }

  // ── Load reminders ──
  async function loadReminders() {
    try {
      const res = await fetch(`${API}/get/${uid}`, { headers: window.getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        remindersCache = (data.data || []).map(r => ({
          ...r,
          times: (r.times || []).map(t => ({
            ...t,
            h: String(t.h || "8"),
            m: String(t.m || "00"),
            ampm: String(t.ampm || "AM"),
            display: t.display || `${t.h}:${String(t.m).padStart(2, "0")} ${t.ampm}`
          })),
          days: Array.isArray(r.days) ? r.days.map(Number) : [],
          monthDay: parseInt(r.monthDay || r.month_day || 1),
          duration: String(r.duration || "forever"),
          sound: r.sound || "bell",
          sched: r.sched || "daily"
        }));
        console.log("[AlarmEngine] Loaded reminders:", remindersCache.length);
        pushRemindersToServiceWorker();
      }
    } catch (err) {
      console.warn("[AlarmEngine] loadReminders error:", err);
    }
  }

  function pushRemindersToServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) {
        reg.active.postMessage({ type: "DHAS_SET_REMINDERS", reminders: remindersCache });
      }
    }).catch(() => { });
  }

  // ── Snooze state ──
  let snoozeTimers = {};
  function snoozeReminder(reminderId, soundKey, cardEl) {
    cardEl.remove();
    if (snoozeTimers[reminderId]) clearTimeout(snoozeTimers[reminderId]);
    showPageMsg("Snoozed for 10 minutes.", "success");
    snoozeTimers[reminderId] = setTimeout(() => {
      const r = remindersCache.find(x => x.id === reminderId);
      const t = r?.times?.[0] || { label: "Reminder", display: "" };
      playSound(soundKey);
      showAlarmCard(r || { id: reminderId, medicine: "Medicine", sound: soundKey }, t);
      delete snoozeTimers[reminderId];
    }, 10 * 60 * 1000);
  }

  function showAlarmCard(reminder, timeSlot) {
    const container = ensureAlarmContainer();
    const rid = reminder.id;
    const sound = reminder.sound || "bell";
    const cardId = `alarmCardShared_${rid}_${timeSlot.label || "dose"}`.replace(/\s+/g, "_");

    // Remove existing card for this reminder
    const existing = document.getElementById(cardId);
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.className = "alarm-card-shared";
    card.id = cardId;
    card.innerHTML = `
      <div class="acs-title">🔔 Medicine Time!</div>
      <div style="font-size:1rem;font-weight:700;margin-bottom:3px;">💊 ${escapeHTML(reminder.medicine || "Medicine")}</div>
      <div class="acs-sub">${escapeHTML(timeSlot.label || "")}: ${escapeHTML(timeSlot.display || "—")}</div>
      <div class="acs-actions">
        <button class="acs-snooze" id="snooze_${cardId}">⏸ Snooze 10 min</button>
        <button class="acs-dismiss" onclick="this.parentElement.parentElement.remove()">✓ Dismiss</button>
      </div>`;
    container.appendChild(card);

    document.getElementById(`snooze_${cardId}`)?.addEventListener("click", () => {
      snoozeReminder(rid, sound, card);
    });

    // Auto-remove after 60 seconds (increased from 40s to give more time to interact)
    setTimeout(() => {
      if (card.parentNode) card.remove();
    }, 60000);

    console.log("[AlarmEngine] Card displayed for:", reminder.medicine);
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  // ── Alarm check (with fixed time comparison) ──
  let lastFiredKey = {};

  function checkAlarms() {
    if (!remindersCache.length) return;

    const now = new Date();
    const dow = now.getDay(), dom = now.getDate();
    const hh = now.getHours(), mm = now.getMinutes();
    const nowMinutes = hh * 60 + mm;

    remindersCache.forEach(r => {
      if (!shouldFireToday(r)) return;

      (r.times || []).forEach(t => {
        const [alarmH, alarmM] = to24(t.h, t.m, t.ampm);
        if (isNaN(alarmH) || isNaN(alarmM)) return;

        const alarmMinutes = alarmH * 60 + alarmM;

        // CRITICAL: Only fire if current minute EXACTLY matches
        if (nowMinutes !== alarmMinutes) return;

        const key = `${r.id}-${t.label}-${alarmH}-${alarmM}-${now.toDateString()}`;
        if (lastFiredKey[key]) return;

        lastFiredKey[key] = true;
        setTimeout(() => delete lastFiredKey[key], 90 * 1000);

        console.log("[AlarmEngine] Triggering alarm for:", r.medicine);
        triggerAlarm(r, t);
      });
    });
  }

  function triggerAlarm(reminder, timeSlot) {
    playSound(reminder.sound || "bell");
    showAlarmCard(reminder, timeSlot);

    if (Notification.permission === "granted" && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(reg =>
        reg.showNotification(`💊 ${reminder.medicine}`, {
          body: `${timeSlot.label}: ${timeSlot.display}\n${reminder.scheduleLabel || ""}`,
          icon: "/icons/icon-192.svg",
          badge: "/icons/icon-96.svg",
          vibrate: [300, 100, 300],
          requireInteraction: true,
          tag: `dhas-${reminder.id}-${timeSlot.label}`
        })
      ).catch(() => { });
    }

    // FIXED: Only purge if reminder has explicit fixed duration AND is truly expired
    schedulePostAlarmPurge(reminder, timeSlot);
  }

  function schedulePostAlarmPurge(reminder, timeSlot) {
    // Only purge fixed-duration reminders (not "forever")
    if (!reminder.duration || reminder.duration === "forever") return;

    const times = reminder.times || [];
    if (!times.length) return;

    const now = new Date();
    const todayMidnight = new Date(); 
    todayMidnight.setHours(0, 0, 0, 0);

    const base = reminder.startDate
      ? new Date(reminder.startDate + "T00:00:00")
      : (reminder.createdAt ? new Date(reminder.createdAt) : new Date());
    base.setHours(0, 0, 0, 0);

    const daysSince = Math.floor((todayMidnight - base) / 86400000);
    const dur = parseInt(reminder.duration);

    // Only delete if today is AFTER the duration period
    // e.g., for a 1-day reminder started on day 0: delete on day 2 or later
    if (daysSince <= dur) {
      console.log(`[AlarmEngine] Reminder still active (day ${daysSince} of ${dur}), not purging`);
      return;
    }

    // Schedule deletion for 5 minutes from now
    setTimeout(async () => {
      try {
        const res = await fetch(`${API}/delete/${reminder.id}`, {
          method: "DELETE",
          headers: window.getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
          remindersCache = remindersCache.filter(x => x.id !== reminder.id);
          pushRemindersToServiceWorker();
          showPageMsg(`"${reminder.medicine}" reminder duration completed and removed.`, "success", 6000);
          window.dispatchEvent(new CustomEvent("dhas-reminders-changed"));
          console.log("[AlarmEngine] Reminder purged:", reminder.id);
        }
      } catch (err) {
        console.warn("[AlarmEngine] Purge failed:", err);
      }
    }, 5 * 60 * 1000);
  }

  // ── Minute-aligned ticker ──
  function startAlarmTicker() {
    function scheduleNextMinuteTick() {
      const now = new Date();
      const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 200;
      console.log("[AlarmEngine] Next check in", msUntilNextMinute, "ms");
      
      setTimeout(() => {
        checkAlarms();
        setInterval(checkAlarms, 60 * 1000);
      }, msUntilNextMinute);
    }
    scheduleNextMinuteTick();
  }

  // ── Register Service Worker ──
  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("/sw.js");
      navigator.serviceWorker.addEventListener("message", e => {
        if (e.data && (e.data.type === "WAKE_CHECK" || e.data.type === "DHAS_CHECK_NOW")) {
          console.log("[AlarmEngine] SW wake check received");
          checkAlarms();
        }
      });
    } catch (err) {
      console.warn("[AlarmEngine] SW registration failed:", err);
    }
  }

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => { });
  }

  // ── Public API ──
  window.DHAS_ALARM_ENGINE = {
    reload: loadReminders,
    getReminders: () => remindersCache,
    checkNow: checkAlarms
  };

  // ── Init ──
  (async function init() {
    console.log("[AlarmEngine] Initializing...");
    registerSW();
    await loadReminders();
    startAlarmTicker();
    console.log("[AlarmEngine] Ready");
  })();

  // Refresh periodically
  setInterval(loadReminders, 5 * 60 * 1000);

})();