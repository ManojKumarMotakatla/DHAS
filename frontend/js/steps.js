// ============================================================
// DHAS - steps.js
// Walk-only step detection using cadence + peak-valley filter.
// Random phone movements / sitting / shaking do NOT count.
//
// FIX 1: performMidnightReset() now saves yesterday's steps
//         into the correct slot BEFORE resetting todayIdx,
//         instead of using Date.now()-86400000 which could
//         produce the wrong day index near midnight boundaries.
//
// FIX 2: Removed duplicate connectGoogleFit() definition that
//         used alert() and silently overwrote the showToast
//         version defined in steps.html. The good version in
//         steps.html now remains in effect at runtime.
// ============================================================

const DAILY_GOAL   = 10000;
const WHO_GOAL     = 150;
const STEP_STRIDE  = 0.000762;
const CAL_PER_STEP = 0.04;

// ── Walking cadence rules ─────────────────────────────────────
// A real walking step happens every 400–1200 ms (50–150 steps/min).
// Faster = running/shaking. Slower = not walking.
const MIN_STEP_MS   = 400;   // fastest plausible step
const MAX_STEP_MS   = 1200;  // slowest plausible step

// Require N consecutive valid-cadence steps before counting starts.
// Kills false positives from sitting, gesturing, shaking.
const CONFIRM_STEPS = 2;

// Low-pass filter (0–1): smooths noise without lag
const LOW_PASS_ALPHA = 0.2;

// Minimum peak-to-valley swing to register as a footfall
const MIN_SWING = 2.5; // m/s²

// ── State ────────────────────────────────────────────────────
let steps      = 0;
let briskSteps = 0;
let weekData   = [0, 0, 0, 0, 0, 0, 0];
let todayIdx   = new Date().getDay();

// Detection internals
let filteredMag   = 0;
let lastPeak      = 0;
let goingUp       = true;
let lastStepTime  = 0;
let pendingSteps  = 0;    // consecutive valid steps (not yet confirmed)
let walkConfirmed = false;
let stableMovementCount = 0;
let previousSwing = 0;
let consistentSwingCount = 0;
let previousFilteredMag = 0;

let stillTimer = null;

// ── Midnight reset ────────────────────────────────────────────
function scheduleMidnightReset() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  setTimeout(() => {
    performMidnightReset();
    scheduleMidnightReset();
  }, next - now);
}

function performMidnightReset() {
  // FIX: save today's step count into the slot we're about to vacate
  // BEFORE updating todayIdx. The old code used Date.now()-86400000
  // to find yesterday's index, which is the same as the current todayIdx
  // at the moment this runs (just after midnight). Using todayIdx directly
  // is both correct and unambiguous.
  weekData[todayIdx] = steps;          // archive today → becomes "yesterday"

  // Advance to the new day
  todayIdx   = new Date().getDay();    // now points to the freshly started day
  steps      = 0;
  briskSteps = 0;
  weekData[todayIdx] = 0;             // clear the new day's slot

  pendingSteps  = 0;
  walkConfirmed = false;
  save();
  updateDisplay();
  setPill("still", "Standing still");
}

// ── Load saved data ───────────────────────────────────────────
(function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem("dhas_steps_v4") || "{}");
    const today = new Date().toDateString();
    if (saved.date === today) {
      steps      = saved.steps      || 0;
      briskSteps = saved.briskSteps || 0;
    }
    weekData           = saved.weekData || [0, 0, 0, 0, 0, 0, 0];
    weekData[todayIdx] = steps;
  } catch (e) {}
})();

function save() {
  weekData[todayIdx] = steps;
  try {
    localStorage.setItem("dhas_steps_v4", JSON.stringify({
      date: new Date().toDateString(),
      steps, briskSteps, weekData
    }));
  } catch (e) {}
}

// ── Live pill ─────────────────────────────────────────────────
function setPill(state, text) {
  document.getElementById("livePill").className = "live-pill " + state;
  document.getElementById("pillText").textContent = text;
  document.getElementById("dotPulse").style.display = state === "walking" ? "block" : "none";
}

function markWalking() {
  setPill("walking", "Walking — counting steps");
  clearTimeout(stillTimer);
  stillTimer = setTimeout(() => {
    walkConfirmed = false;
    pendingSteps  = 0;
    setPill("still", "Standing still");
  }, 2500);
}

// ── Core accelerometer handler ────────────────────────────────
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;

  const raw = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

  // 1. Low-pass filter — removes high-frequency vibration/noise
  filteredMag = LOW_PASS_ALPHA * raw + (1 - LOW_PASS_ALPHA) * filteredMag;
  const suddenJump = Math.abs(filteredMag - previousFilteredMag);

  previousFilteredMag = filteredMag;

  // Ignore violent sudden spikes (phone shake)
  if (suddenJump > 6) return;

  // 2. Track rising signal
  if (filteredMag > lastPeak) {
    lastPeak = filteredMag;
    goingUp  = true;
  }

  // 3. Detect peak — signal starts falling after rising
  if (goingUp && filteredMag < lastPeak - 0.5) {
    goingUp = false;

    const valley = filteredMag;
    const swing  = lastPeak - valley;
    const swingDiff = Math.abs(swing - previousSwing);

    if (swingDiff < 3) {
      consistentSwingCount++;
    } else {
      consistentSwingCount = 0;
    }

    previousSwing = swing;

    // 4. Swing must be large enough to be a real footfall
    if (swing >= MIN_SWING) {
      const now      = Date.now();
      const interval = now - lastStepTime;

      if (interval < 300) return;

      // 5. Cadence check — must match real walking rhythm (400–1200 ms)
      if (lastStepTime > 0 && interval >= MIN_STEP_MS && interval <= MAX_STEP_MS) {
        stableMovementCount++;
        pendingSteps++;

        if (
          pendingSteps >= CONFIRM_STEPS &&
          stableMovementCount >= 4 &&
          consistentSwingCount >= 2
        ) {
          walkConfirmed = true;
        }

        if (walkConfirmed) {
          steps++;
          // Brisk: fast cadence + strong swing
          if (interval >= 400 && interval <= 650 && swing > 4) {
            briskSteps++;
          }
          markWalking();
          save();
          updateDisplay();
        }

      } else if (lastStepTime > 0) {
        pendingSteps        = 0;
        stableMovementCount = 0;
        walkConfirmed       = false;
      }

      lastStepTime = now;
    }

    // Reset peak for next cycle
    lastPeak = filteredMag;
  }
}

// ── Sensor start ──────────────────────────────────────────────
function startSensor() {
  if (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    // iOS: needs one user gesture
    function iosRequest() {
      DeviceMotionEvent.requestPermission()
        .then(r => {
          if (r === "granted") {
            window.addEventListener("devicemotion", onMotion);
            setPill("still", "Standing still");
          } else {
            setPill("waiting", "Motion permission denied");
          }
        })
        .catch(() => setPill("waiting", "Could not access sensor"));
      document.removeEventListener("click", iosRequest);
    }
    setPill("waiting", "Tap anywhere to enable sensor");
    document.addEventListener("click", iosRequest);

  } else if (typeof DeviceMotionEvent !== "undefined") {
    // Android / Chrome — starts immediately, no permission needed
    window.addEventListener("devicemotion", onMotion);
    setPill("still", "Standing still");

  } else {
    setPill("waiting", "No motion sensor on this device");
  }
}

// ── Display update ────────────────────────────────────────────
function updateDisplay() {
  document.getElementById("stepCount").textContent   = steps.toLocaleString();
  document.getElementById("goalDisplay").textContent = DAILY_GOAL.toLocaleString();

  const pct = Math.min(steps / DAILY_GOAL, 1);
  document.getElementById("progressBar").style.width  = (pct * 100).toFixed(1) + "%";
  document.getElementById("progressText").textContent = (pct * 100).toFixed(1) + "% of daily goal";

  const arcLen = 267;
  document.getElementById("gaugeArc").setAttribute(
    "stroke-dasharray", (pct * arcLen).toFixed(1) + " " + arcLen
  );
  document.getElementById("gaugeNeedle").style.transform =
    `rotate(${(-180 + pct * 180).toFixed(1)}deg)`;

  const slowS  = steps - briskSteps;
  const slowP  = steps > 0 ? Math.round(slowS      / steps * 100) : 0;
  const briskP = steps > 0 ? Math.round(briskSteps / steps * 100) : 0;
  document.getElementById("slowLabel").textContent  = slowS.toLocaleString()      + " · " + slowP  + "%";
  document.getElementById("briskLabel").textContent = briskSteps.toLocaleString() + " · " + briskP + "%";
  document.getElementById("slowBar").style.width    = slowP  + "%";
  document.getElementById("briskBar").style.width   = briskP + "%";

  const km  = (steps * STEP_STRIDE).toFixed(2);
  const cal = Math.round(steps * CAL_PER_STEP);
  const min = Math.round(steps / 100);

  document.getElementById("kmDisplay").textContent      = km;
  document.getElementById("calDisplay").textContent     = cal;
  document.getElementById("calorieDisplay").textContent = cal;
  document.getElementById("kmStatDisplay").textContent  = km;
  document.getElementById("minuteDisplay").textContent  = min;

  document.getElementById("calFunVal").textContent = cal;
  document.getElementById("calFunSub").textContent = "≈ " + (cal / 10).toFixed(2) + " banana chips";

  const briskMins = Math.round(briskSteps / 120);
  const whoPct    = Math.min(briskMins / WHO_GOAL, 1);
  document.getElementById("whoRemaining").textContent     = Math.max(WHO_GOAL - briskMins, 0);
  document.getElementById("whoPct").textContent           = Math.round(whoPct * 100) + "%";
  document.getElementById("whoMins").textContent          = briskMins + " Min";
  document.getElementById("briskMinsDisplay").textContent = briskMins + " Min";
  document.getElementById("whoCircle").style.strokeDashoffset =
    (188.5 - whoPct * 188.5).toFixed(1);

  weekData[todayIdx] = steps;
  const wTotal = weekData.reduce((a, b) => a + b, 0);
  document.getElementById("weekSteps").textContent = wTotal.toLocaleString();
  document.getElementById("weekKm").textContent    = (wTotal * STEP_STRIDE).toFixed(2) + " km";
  document.getElementById("weekCal").textContent   = Math.round(wTotal * CAL_PER_STEP) + " kcal";

  renderWeekChart();
}

// ── Weekly bar chart ──────────────────────────────────────────
function renderWeekChart() {
  const chart  = document.getElementById("weekChart");
  const labels = document.getElementById("weekDayLabels");
  const days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const maxVal = Math.max(...weekData, 1500);
  const maxDay = Math.max(...weekData);

  chart.innerHTML  = "";
  labels.innerHTML = "";

  weekData.forEach((s, i) => {
    const h       = Math.max((s / maxVal) * 74, s > 0 ? 4 : 2);
    const isToday = i === todayIdx;
    const isBest  = s > 0 && s === maxDay;

    const col = document.createElement("div");
    col.className = "week-col";

    const bar = document.createElement("div");
    bar.className    = "week-bar" + (isToday ? " today" : "");
    bar.style.height = h + "px";

    if (isBest) {
      const crown = document.createElement("span");
      crown.className     = "week-crown";
      crown.textContent   = "👑";
      crown.style.display = "block";
      bar.appendChild(crown);
    }

    col.appendChild(bar);
    chart.appendChild(col);

    const lbl = document.createElement("span");
    lbl.className   = "week-day-label";
    lbl.textContent = days[i];
    labels.appendChild(lbl);
  });
}

// NOTE: connectGoogleFit() is intentionally NOT defined here.
// It is defined in steps.html (inline script) where it correctly
// uses showToast() for user feedback. Defining it here would
// overwrite that version with an alert()-based fallback since
// this external script is loaded after the inline script.

// ── Init ─────────────────────────────────────────────────────
window.onload = function () {
  updateDisplay();
  startSensor();
  scheduleMidnightReset();
};