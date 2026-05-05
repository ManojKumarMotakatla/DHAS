// ============================================
// DHAS - severity.js
// Rule-based symptom → condition → severity
// ============================================

// --- Condition Rules ---
// Each condition has: name, symptoms (must match), minMatch, severity, suggestion
const CONDITIONS = [
  {
    name: "COVID-19 Like Illness",
    key: "covid_like",
    symptoms: ["fever", "cough", "loss_of_taste", "fatigue", "breathlessness"],
    minMatch: 3,
    severity: "High",
    suggestion: "⚠️ Your symptoms resemble COVID-19. Please isolate, monitor your oxygen levels, and consult a doctor immediately. Get tested if possible."
  },
  {
    name: "Influenza (Flu)",
    key: "flu",
    symptoms: ["fever", "body_pain", "headache", "fatigue", "cough"],
    minMatch: 3,
    severity: "High",
    suggestion: "⚠️ You may have the flu. Take rest, stay hydrated, and consult a doctor. Antipyretics like paracetamol can help with fever."
  },
  {
    name: "Viral Fever",
    key: "viral_fever",
    symptoms: ["fever", "headache", "fatigue", "body_pain"],
    minMatch: 3,
    severity: "Medium",
    suggestion: "You may have viral fever. Rest well, drink plenty of fluids, and take paracetamol for fever. See a doctor if fever exceeds 103°F."
  },
  {
    name: "Common Cold",
    key: "common_cold",
    symptoms: ["cold", "cough", "sore_throat", "headache"],
    minMatch: 2,
    severity: "Low",
    suggestion: "Looks like a common cold. Drink warm fluids, rest, and try steam inhalation. Should resolve in 5–7 days."
  },
  {
    name: "Gastroenteritis (Stomach Bug)",
    key: "gastro",
    symptoms: ["nausea", "diarrhea", "fatigue", "body_pain"],
    minMatch: 2,
    severity: "Medium",
    suggestion: "You may have a stomach infection. Stay hydrated with ORS, eat light foods (BRAT diet), and see a doctor if symptoms persist."
  },
  {
    name: "Migraine / Severe Headache",
    key: "headache",
    symptoms: ["headache", "nausea", "fatigue"],
    minMatch: 2,
    severity: "Medium",
    suggestion: "You may be experiencing a migraine or severe headache. Rest in a dark, quiet room, stay hydrated, and take OTC pain relief if needed."
  },
  {
    name: "Respiratory Distress",
    key: "respiratory",
    symptoms: ["breathlessness", "chest_pain", "cough"],
    minMatch: 2,
    severity: "High",
    suggestion: "🚨 Chest pain and breathlessness can be serious. Please seek immediate medical attention. Do not ignore these symptoms."
  },
  {
    name: "General Illness",
    key: "general",
    symptoms: [],
    minMatch: 0,
    severity: "Low",
    suggestion: "Take rest, drink plenty of water, and monitor your symptoms. Consult a doctor if you don't feel better within 2–3 days."
  }
];

// --- Match condition from symptoms ---
function detectCondition(symptoms) {
  for (const condition of CONDITIONS) {
    if (condition.key === "general") continue; // fallback, skip in loop
    const matched = condition.symptoms.filter(s => symptoms.includes(s)).length;
    if (matched >= condition.minMatch) {
      return condition;
    }
  }
  // Fallback
  return CONDITIONS.find(c => c.key === "general");
}

// --- Severity label class ---
function severityClass(severity) {
  if (severity === "High")   return "high";
  if (severity === "Medium") return "medium";
  return "low";
}

// --- Alert box class ---
function alertClass(severity) {
  if (severity === "High")   return "danger";
  if (severity === "Medium") return "warning";
  return "success";
}

// --- Friendly symptom label ---
const SYMPTOM_LABELS = {
  fever: "Fever",
  cold: "Cold / Runny Nose",
  headache: "Headache",
  cough: "Cough",
  fatigue: "Fatigue",
  body_pain: "Body Pain",
  sore_throat: "Sore Throat",
  nausea: "Nausea / Vomiting",
  diarrhea: "Diarrhea",
  loss_of_taste: "Loss of Taste/Smell",
  chest_pain: "Chest Pain",
  breathlessness: "Breathlessness"
};

// --- Run on page load ---
window.onload = function () {
  const symptoms = JSON.parse(localStorage.getItem("dhas_symptoms")) || [];

  if (symptoms.length === 0) {
    document.getElementById("alertBox").className = "dhas-alert info";
    document.getElementById("alertBox").textContent = "No symptoms found. Please go back and select your symptoms.";
    return;
  }

  const result = detectCondition(symptoms);

  // Save condition key for diet/remedies pages
  localStorage.setItem("dhas_condition", result.key);

  // Display symptoms as tags
  const symDisplay = document.getElementById("symptomDisplay");
  symDisplay.innerHTML = symptoms.map(s =>
    `<span class="condition-tag">${SYMPTOM_LABELS[s] || s}</span>`
  ).join("");

  // Display condition
  document.getElementById("conditionDisplay").innerHTML =
    `<span class="condition-tag" style="background:#f0fdf4;color:#166534;border-color:#86efac;font-size:1rem;">${result.name}</span>`;

  // Display severity badge
  document.getElementById("severityDisplay").innerHTML =
    `<span class="severity-badge ${severityClass(result.severity)}">${result.severity}</span>`;

  // Display suggestion
  document.getElementById("suggestionDisplay").textContent = result.suggestion;

  // Update alert box
  const alertBox = document.getElementById("alertBox");
  alertBox.className = `dhas-alert ${alertClass(result.severity)}`;
  alertBox.textContent = result.severity === "High"
    ? "⚠️ High severity detected — please consult a doctor."
    : result.severity === "Medium"
    ? "⚡ Moderate symptoms — monitor closely and consider seeing a doctor."
    : "✅ Mild symptoms detected — rest and home care should help.";
};