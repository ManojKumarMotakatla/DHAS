// ============================================
// DHAS - steps.js
// Step counter with stats and progress
// ============================================

const DAILY_GOAL = 10000;

let steps = parseInt(localStorage.getItem("dhas_steps")) || 0;

window.onload = function () {
  updateDisplay();
};

function addStep() {
  steps++;
  saveAndUpdate();
}

function addHundred() {
  steps += 100;
  saveAndUpdate();
}

function resetSteps() {
  if (confirm("Reset step count to 0?")) {
    steps = 0;
    saveAndUpdate();
  }
}

function saveAndUpdate() {
  localStorage.setItem("dhas_steps", steps);
  updateDisplay();
}

function updateDisplay() {
  document.getElementById("stepCount").textContent = steps.toLocaleString();

  // Progress bar
  const percent = Math.min((steps / DAILY_GOAL) * 100, 100);
  document.getElementById("progressBar").style.width = percent + "%";
  document.getElementById("progressText").textContent = percent.toFixed(1) + "% of daily goal";
  document.getElementById("goalDisplay").textContent = DAILY_GOAL.toLocaleString();

  // Stats calculations
  // Approx: 1 step = 0.762 m, 1 step = 0.04 calories (avg)
  const calories = Math.round(steps * 0.04);
  const km       = (steps * 0.000762).toFixed(2);
  const minutes  = Math.round(steps / 100);   // ~100 steps/min walking

  document.getElementById("calorieDisplay").textContent = calories;
  document.getElementById("kmDisplay").textContent = km;
  document.getElementById("minuteDisplay").textContent = minutes;
}