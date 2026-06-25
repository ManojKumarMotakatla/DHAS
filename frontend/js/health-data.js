// ============================================================
// DHAS — health-data.js
//
// FIX P3.1 — Health data (conditions, diet, remedies, symptoms)
//             was duplicated across 8 files:
//               - Backend/utils/SeverityLogic.js
//               - Backend/utils/suggestions.js
//               - frontend/js/severity.js
//               - frontend/js/symptom.js
//               - frontend/diet.html  (inline script)
//               - frontend/remedies.html  (inline script)
//               - frontend/symptom_diet.html  (inline script)
//               - frontend/symptom_remedies.html  (inline script)
//
//             This file is the ONE place all health data lives.
//             Import it BEFORE any script that needs this data.
//
// BACKEND NOTE: Backend/utils/SeverityLogic.js and
//               Backend/utils/suggestions.js now require()
//               a Node-compatible version of this data.
//               See Backend/utils/health-data-node.js for that.
//
// USAGE:
//   <script src="js/config.js"></script>
//   <script src="js/health-data.js"></script>
//   Then access: window.DHAS.CONDITIONS, window.DHAS.DIET, etc.
// ============================================================

(function () {
  "use strict";

  // ── CONDITIONS ────────────────────────────────────────────
  // Each entry drives: symptom detection, severity badge,
  // suggestion text, alert colour, and page routing.
  var CONDITIONS = [
    {
      key:        "covid_like",
      name:       "COVID-19 Like Illness",
      symptoms:   ["fever", "cough", "loss_of_taste", "fatigue", "breathlessness"],
      minMatch:   3,
      severity:   "High",
      severityLabel: "High",
      icon:       "ti-virus",
      iconBg:     "rgba(239,68,68,0.15)",
      iconColor:  "#ef4444",
      suggestion: "Your symptoms resemble COVID-19. Please isolate, monitor oxygen levels, and consult a doctor immediately.",
      alertClass: "danger"
    },
    {
      key:        "flu",
      name:       "Influenza (Flu)",
      symptoms:   ["fever", "body_pain", "headache", "fatigue", "cough"],
      minMatch:   3,
      severity:   "High",
      severityLabel: "Moderate",
      icon:       "ti-thermometer",
      iconBg:     "rgba(249,115,22,0.15)",
      iconColor:  "#f97316",
      suggestion: "You may have the flu. Take rest, stay hydrated, and consult a doctor. Paracetamol can help with fever.",
      alertClass: "danger"
    },
    {
      key:        "respiratory",
      name:       "Respiratory Distress",
      symptoms:   ["breathlessness", "chest_pain", "cough"],
      minMatch:   2,
      severity:   "High",
      severityLabel: "High",
      icon:       "ti-lungs",
      iconBg:     "rgba(239,68,68,0.2)",
      iconColor:  "#dc2626",
      suggestion: "Chest pain and breathlessness can be serious. Please seek immediate medical attention.",
      alertClass: "danger"
    },
    {
      key:        "viral_fever",
      name:       "Viral Fever",
      symptoms:   ["fever", "headache", "fatigue", "body_pain"],
      minMatch:   3,
      severity:   "Medium",
      severityLabel: "Mild",
      icon:       "ti-temperature",
      iconBg:     "rgba(234,179,8,0.15)",
      iconColor:  "#eab308",
      suggestion: "You may have viral fever. Rest, drink fluids, and take paracetamol. See a doctor if fever exceeds 103°F.",
      alertClass: "warning"
    },
    {
      key:        "gastro",
      name:       "Gastroenteritis",
      symptoms:   ["nausea", "diarrhea", "fatigue", "body_pain"],
      minMatch:   2,
      severity:   "Medium",
      severityLabel: "Mild",
      icon:       "ti-droplet",
      iconBg:     "rgba(20,184,166,0.15)",
      iconColor:  "#14b8a6",
      suggestion: "You may have a stomach infection. Stay hydrated with ORS, eat light foods, and see a doctor if symptoms persist.",
      alertClass: "warning"
    },
    {
      key:        "headache",
      name:       "Migraine / Headache",
      symptoms:   ["headache", "nausea", "fatigue"],
      minMatch:   2,
      severity:   "Medium",
      severityLabel: "Mild",
      icon:       "ti-brain",
      iconBg:     "rgba(139,92,246,0.15)",
      iconColor:  "#8b5cf6",
      suggestion: "You may have a migraine. Rest in a dark quiet room, stay hydrated, and take OTC pain relief if needed.",
      alertClass: "warning"
    },
    {
      key:        "common_cold",
      name:       "Common Cold",
      symptoms:   ["cold", "cough", "sore_throat", "headache"],
      minMatch:   2,
      severity:   "Low",
      severityLabel: "Mild",
      icon:       "ti-cloud-snow",
      iconBg:     "rgba(14,165,233,0.15)",
      iconColor:  "#0ea5e9",
      suggestion: "Looks like a common cold. Drink warm fluids, rest, and try steam inhalation. Should resolve in 5–7 days.",
      alertClass: "success"
    },
    {
      key:        "sore_throat",
      name:       "Sore Throat",
      symptoms:   ["sore_throat", "cough", "cold"],
      minMatch:   1,
      severity:   "Low",
      severityLabel: "Mild",
      icon:       "ti-microphone",
      iconBg:     "rgba(236,72,153,0.15)",
      iconColor:  "#ec4899",
      suggestion: "Your symptoms point to throat irritation or infection. Gargle with warm salt water and stay hydrated.",
      alertClass: "success"
    },
    {
      key:        "nausea",
      name:       "Nausea / Vomiting",
      symptoms:   ["nausea"],
      minMatch:   1,
      severity:   "Low",
      severityLabel: "Mild",
      icon:       "ti-mood-sick",
      iconBg:     "rgba(16,185,129,0.15)",
      iconColor:  "#10b981",
      suggestion: "You seem to be experiencing nausea or vomiting. Sip ginger tea slowly and eat small bland meals.",
      alertClass: "success"
    },
    {
      key:        "general",
      name:       "General Illness",
      symptoms:   [],
      minMatch:   0,
      severity:   "Low",
      severityLabel: "Mild",
      icon:       "ti-stethoscope",
      iconBg:     "rgba(99,102,241,0.15)",
      iconColor:  "#6366f1",
      suggestion: "Take rest, drink plenty of water, and monitor your symptoms. Consult a doctor if you don't feel better in 2–3 days.",
      alertClass: "success"
    }
  ];

  // ── SYMPTOM LABELS ────────────────────────────────────────
  var SYMPTOM_LABELS = {
    fever:          "Fever",
    cold:           "Cold / Runny Nose",
    headache:       "Headache",
    cough:          "Cough",
    fatigue:        "Fatigue",
    body_pain:      "Body Pain",
    sore_throat:    "Sore Throat",
    nausea:         "Nausea / Vomiting",
    diarrhea:       "Diarrhea",
    loss_of_taste:  "Loss of Taste / Smell",
    chest_pain:     "Chest Pain",
    breathlessness: "Breathlessness"
  };

  // ── DIET DATA ─────────────────────────────────────────────
  // Replaces duplicate data in: suggestions.js, severity.js,
  // diet.html, symptom_diet.html
  var DIET = {
    covid_like: {
      eat:   ["Warm turmeric milk", "High protein foods (dal, eggs, paneer)", "Fresh citrus fruits", "Giloy / Ashwagandha tea", "Zinc-rich foods (pumpkin seeds, chickpeas)", "Coconut water", "Warm soups and vegetable broth"],
      avoid: ["Cold and raw foods", "Alcohol completely", "Junk and processed food", "Excess sugar", "Cold drinks", "Oily and fried items"]
    },
    flu: {
      eat:   ["Warm vegetable soup", "Oranges and citrus fruits", "Ginger tea with honey", "Light khichdi", "Bananas", "Warm water throughout the day", "Pomegranate juice"],
      avoid: ["Junk food", "Cold drinks", "Oily and fried foods", "Spicy food", "Alcohol", "Heavy meals"]
    },
    viral_fever: {
      eat:   ["Warm herbal teas (tulsi, ginger)", "Papaya and pomegranate", "Light rice porridge (kanji)", "Coconut water", "Honey with warm water", "Fresh fruit juices", "Vegetable soup"],
      avoid: ["Oily and fried food", "Cold items and ice cream", "Spicy curries", "Junk food", "Caffeine and coffee", "Heavy protein meals"]
    },
    common_cold: {
      eat:   ["Warm soups and broths", "Tulsi tea", "Ginger-honey milk", "Garlic added to food", "Vitamin C fruits (oranges, amla)", "Warm water with lemon and honey", "Steamed vegetables"],
      avoid: ["Cold water and cold drinks", "Ice cream and frozen foods", "Fried snacks", "Excess sugar", "Dairy products (can thicken mucus)", "Alcohol"]
    },
    gastro: {
      eat:   ["ORS solution — sip frequently", "Banana (BRAT diet)", "Plain boiled rice", "Toast / rusk", "Curd — probiotic, helps gut", "Coconut water", "Clear vegetable soup"],
      avoid: ["Oily and fried food", "Spicy food", "Raw vegetables", "Caffeinated drinks", "Dairy except curd", "Junk food", "Sugary drinks"]
    },
    headache: {
      eat:   ["Plenty of water — dehydration worsens headaches", "Banana — rich in magnesium", "Almonds and walnuts", "Spinach", "Ginger tea", "Watermelon", "Peppermint tea"],
      avoid: ["Excess caffeine (can trigger rebound headache)", "Alcohol", "Processed meats (contain nitrites)", "Too much salt", "Skipping meals", "Artificial sweeteners", "Aged cheese"]
    },
    respiratory: {
      eat:   ["Warm soups and broths", "Ginger tea with honey", "Honey and lemon water", "Turmeric milk", "Garlic in food", "Pomegranate juice", "Warm water throughout the day"],
      avoid: ["Cold drinks and ice", "Dairy in excess (thickens mucus)", "Fried and oily foods", "Smoking and exposure to smoke", "Processed and packaged foods", "Spicy food if it triggers coughing"]
    },
    sore_throat: {
      eat:   ["Warm water with honey and lemon", "Ginger tea", "Turmeric milk at night", "Soft foods — khichdi, porridge", "Coconut water", "Warm soups", "Ice chips (numbs pain temporarily)"],
      avoid: ["Cold drinks", "Ice cream", "Spicy food", "Alcohol", "Hard and crunchy foods", "Acidic foods like tomatoes and citrus"]
    },
    nausea: {
      eat:   ["Ginger tea — best natural anti-nausea", "Plain crackers or dry rusk", "Banana", "Clear broths", "Coconut water", "Small frequent meals", "Cold or room-temperature foods (less smell)"],
      avoid: ["Oily and fried food", "Spicy food", "Strong-smelling foods", "Dairy", "Large heavy meals", "Sugary drinks", "Alcohol"]
    },
    general: {
      eat:   ["Fresh fruits", "Vegetable soup", "Warm water throughout the day", "Light dal-rice", "Curd", "Green vegetables", "Coconut water"],
      avoid: ["Junk food", "Oily and fried food", "Cold drinks", "Spicy food", "Alcohol", "Heavy meals"]
    }
  };

  // ── REMEDIES DATA ─────────────────────────────────────────
  // Replaces duplicate data in: suggestions.js, severity.js,
  // remedies.html, symptom_remedies.html
  var REMEDIES = {
    covid_like: [
      "Drink Kadha (tulsi, ginger, black pepper, cloves) twice daily to boost immunity",
      "Steam inhalation for 10 minutes twice a day — add eucalyptus oil",
      "Monitor oxygen with a pulse oximeter; go to hospital if SpO2 drops below 94%",
      "Isolate yourself and wear a mask even at home",
      "Gargle with warm salt water + turmeric 3 times a day",
      "Take complete bed rest and stay well hydrated"
    ],
    flu: [
      "Drink warm ginger tea with honey twice daily — reduces fever and body ache",
      "Steam inhalation with eucalyptus oil for 10 minutes to relieve congestion",
      "Rest and sleep at least 8–9 hours every night",
      "Gargle with warm salt water to soothe sore throat",
      "Take Vitamin C — orange juice or fresh amla",
      "Apply warm compress on forehead and limbs for body ache"
    ],
    viral_fever: [
      "Apply cool damp cloth on forehead to reduce fever",
      "Drink tulsi + black pepper + ginger decoction twice daily",
      "Take a lukewarm sponge bath if fever rises above 102°F",
      "Drink 2–3 litres of water or coconut water daily",
      "Take complete bed rest — avoid all physical exertion",
      "Monitor temperature every 2 hours; see doctor if above 103°F"
    ],
    common_cold: [
      "Steam inhalation 2–3 times a day for 10 minutes each",
      "Drink turmeric milk (haldi doodh) at night before bed",
      "Mix ginger juice + honey + lemon in warm water — drink twice daily",
      "Gargle with warm salt water twice a day",
      "Use saline nasal drops for nasal congestion relief",
      "Keep your head elevated while sleeping to reduce stuffiness"
    ],
    gastro: [
      "Drink ORS solution every hour to prevent dehydration — this is the most important step",
      "Eat banana — firms loose stools and replenishes potassium",
      "Follow the BRAT diet — Banana, Rice, Applesauce, Toast",
      "Eat curd with every small meal — probiotics restore gut bacteria",
      "Avoid solid food for a few hours if vomiting is active",
      "Rest completely and avoid physical activity until stools normalise"
    ],
    headache: [
      "Massage temples and neck gently with peppermint or lavender oil",
      "Drink a large glass of water immediately — dehydration is the top cause",
      "Apply a cold compress on the forehead for 10–15 minutes",
      "Rest in a dark, quiet room — close curtains and turn off screens",
      "Practice deep breathing: inhale 4 counts, hold 4, exhale 4",
      "If migraine, avoid bright lights and strong smells for the duration"
    ],
    respiratory: [
      "Steam inhalation with Vicks or eucalyptus oil for 10 minutes",
      "Sit upright or prop yourself up with pillows — never lie flat when breathing is difficult",
      "Drink warm fluids like ginger tea or hot water every 30 minutes",
      "Avoid all dust, smoke, cold air, and strong fragrances",
      "Practice slow, deep belly breathing — inhale 4 counts, hold 2, exhale 6",
      "Seek immediate medical attention if breathlessness worsens or chest pain intensifies"
    ],
    sore_throat: [
      "Gargle with warm salt water every 2–3 hours — reduces inflammation",
      "Mix 1 tsp honey with a pinch of black pepper — swallow slowly without water",
      "Drink warm turmeric milk at night before bed",
      "Suck on a clove (laung) for natural pain relief",
      "Have ginger tea with honey 2–3 times a day",
      "Avoid whispering — it strains vocal cords more than normal speaking"
    ],
    nausea: [
      "Sip ginger tea very slowly — the most effective natural anti-nausea remedy",
      "Inhale peppermint oil or apply to wrists and temples",
      "Eat plain crackers or dry rusk in very small amounts",
      "Sip cold water or lemon water slowly between small meals",
      "Sit or stand upright — lying flat worsens nausea",
      "Eat small meals every 2–3 hours rather than 3 large meals"
    ],
    general: [
      "Drink warm water regularly — aim for 8–10 glasses throughout the day",
      "Take proper rest — 7–8 hours of sleep speeds up recovery",
      "Steam inhalation helps if you have any cold or cough symptoms",
      "Drink turmeric milk at night — anti-inflammatory and immunity boosting",
      "Eat light, easy-to-digest meals — khichdi, soup, curd",
      "Consult a doctor if symptoms persist beyond 2–3 days or worsen"
    ]
  };

  // ── DISEASE DIET (for the browse-all-diseases diet.html page) ──
  // Extends the condition-specific DIET above with extra diseases
  // that don't appear in the symptom checker.
  var DISEASE_DIET = {
    Asthma:                { eat: ["Ginger tea", "Honey", "Turmeric milk", "Garlic", "Spinach", "Apples", "Avocado"],            avoid: ["Processed foods", "Sulphites (wine, dried fruits)", "Cold drinks", "Excess salt", "Artificial colours"] },
    Arthritis:             { eat: ["Fatty fish (salmon)", "Walnuts", "Berries", "Spinach", "Olive oil", "Ginger", "Turmeric"],   avoid: ["Fried food", "Processed sugar", "Red meat", "Alcohol", "Refined carbs"] },
    "Common Cold":         { eat: ["Warm soups", "Tulsi tea", "Ginger-honey milk", "Garlic", "Vitamin C fruits", "Warm water"],  avoid: ["Cold water", "Ice cream", "Fried snacks", "Excess sugar", "Alcohol"] },
    "COVID-19 Like Illness": { eat: ["Warm turmeric milk", "High protein foods (dal, eggs)", "Fresh fruits", "Giloy tea", "Zinc-rich foods"], avoid: ["Cold foods", "Alcohol", "Junk food", "Excess sugar", "Processed food"] },
    Constipation:          { eat: ["High-fibre foods (oats, beans)", "Fruits (papaya, guava)", "Water (3L daily)", "Leafy greens", "Prunes"], avoid: ["Refined flour (maida)", "Fried food", "Red meat", "Alcohol", "Low-fibre foods"] },
    Diabetes:              { eat: ["Bitter gourd (karela)", "Fenugreek (methi)", "Brown rice", "Whole grains", "Leafy greens", "Amla"], avoid: ["White rice", "Sugary drinks", "Sweets and desserts", "Refined flour", "Fruit juices"] },
    Dengue:                { eat: ["Papaya leaf juice", "Coconut water", "Pomegranate juice", "Kiwi", "Vegetable soup", "ORS"], avoid: ["Oily food", "Spicy food", "Caffeine", "Alcohol", "Junk food"] },
    Diarrhea:              { eat: ["ORS solution", "Banana", "Plain boiled rice", "Toast / rusk", "Curd (probiotic)", "Coconut water"], avoid: ["Oily food", "Spicy food", "Raw vegetables", "Caffeinated drinks", "Dairy (except curd)"] },
    Fever:                 { eat: ["Warm water", "Coconut water", "Vegetable soup", "Light khichdi", "Fresh fruits", "Herbal teas"], avoid: ["Oily food", "Spicy food", "Junk food", "Cold drinks", "Heavy meals"] },
    "Flu (Influenza)":     { eat: ["Warm vegetable soup", "Oranges", "Ginger tea with honey", "Light khichdi", "Bananas"],      avoid: ["Junk food", "Cold drinks", "Oily foods", "Spicy food", "Alcohol"] },
    Gastritis:             { eat: ["Curd (probiotic)", "Banana", "Oats", "Coconut water", "Boiled vegetables", "Ginger tea"],   avoid: ["Spicy food", "Alcohol", "Coffee", "Citrus fruits", "Fried food", "Carbonated drinks"] },
    "Headache / Migraine": { eat: ["Plenty of water", "Banana", "Almonds", "Spinach", "Ginger tea", "Watermelon", "Magnesium-rich foods"], avoid: ["Excess caffeine", "Alcohol", "Processed meats", "Too much salt", "Skipping meals"] },
    "Hypertension (High BP)": { eat: ["Banana", "Leafy greens", "Beets", "Garlic", "Oats", "Low-fat dairy", "Berries"],       avoid: ["Excess salt", "Processed foods", "Alcohol", "Red meat", "Caffeine", "Pickles"] },
    Jaundice:              { eat: ["Sugarcane juice", "Coconut water", "Papaya", "Lemon water", "Vegetable soup", "Rice gruel"], avoid: ["Oily food", "Spicy food", "Alcohol", "Red meat", "Fried food", "Junk food"] },
    "Kidney Stones":       { eat: ["Plenty of water (3-4L)", "Lemon water", "Coconut water", "Low-oxalate fruits", "Calcium-rich foods"], avoid: ["Spinach (excess)", "Nuts (excess)", "Salt", "Animal protein (excess)", "Vitamin C supplements"] },
    Malaria:               { eat: ["Warm soups", "Coconut water", "Papaya", "Pomegranate", "Light khichdi", "Ginger tea"],      avoid: ["Spicy food", "Oily food", "Alcohol", "Junk food", "Cold drinks"] },
    "Nausea / Vomiting":   { eat: ["Ginger tea", "Plain crackers / rusk", "Banana", "Clear broths", "Coconut water", "Small frequent meals"], avoid: ["Oily food", "Spicy food", "Strong smells", "Dairy", "Large heavy meals"] },
    Obesity:               { eat: ["Fruits and vegetables", "Whole grains", "Lean protein (dal, fish)", "Water before meals", "Green tea"], avoid: ["Sugary drinks", "Junk food", "Fried food", "White bread/rice", "Late-night eating"] },
    "Sore Throat":         { eat: ["Warm water with honey and lemon", "Ginger tea", "Turmeric milk", "Soft foods (khichdi)", "Coconut water"], avoid: ["Cold drinks", "Ice cream", "Spicy food", "Alcohol", "Hard crunchy foods"] },
    Typhoid:               { eat: ["Boiled water", "Light khichdi", "Banana", "Boiled potatoes", "Curd", "Coconut water", "Vegetable soup"], avoid: ["Oily food", "Spicy food", "Raw vegetables", "Junk food", "Alcohol", "Unboiled water"] },
    "Viral Fever":         { eat: ["Warm herbal teas", "Papaya, pomegranate", "Light rice porridge (kanji)", "Coconut water", "Honey"], avoid: ["Oily food", "Cold items", "Spicy curries", "Junk food", "Caffeine"] }
  };

  // ── DIAGNOSIS FUNCTION ────────────────────────────────────
  // Central logic that maps symptom array → condition key.
  // Replaces the separate diagnose() in symptom.js and
  // detectCondition() in severity.js / SeverityLogic.js.
  function diagnose(symptoms) {
    var has = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (symptoms.indexOf(arguments[i]) === -1) return false;
      }
      return true;
    };
    var any = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (symptoms.indexOf(arguments[i]) !== -1) return true;
      }
      return false;
    };

    // Order matters — more specific checks first
    if (has("chest_pain") && any("breathlessness", "cough"))            return "respiratory";
    if (has("fever", "cough", "loss_of_taste"))                         return "covid_like";
    if (has("fever", "body_pain", "cough") && any("headache", "fatigue")) return "flu";
    if (has("fever") && any("cold", "cough") && has("sore_throat"))     return "common_cold";
    if (has("fever") && any("fatigue", "body_pain") && !any("cough", "cold")) return "viral_fever";
    if (any("diarrhea", "nausea") && any("fever", "fatigue"))           return "gastro";
    if (has("nausea") && !any("fever", "cough"))                        return "nausea";
    if (has("sore_throat") && !has("fever"))                            return "sore_throat";
    if (has("headache") && !any("fever", "cough", "cold"))              return "headache";
    if (any("fever", "cough", "cold", "fatigue"))                       return "viral_fever";
    return "general";
  }

  // ── HELPERS ───────────────────────────────────────────────
  // Get full condition object by key
  function getCondition(key) {
    for (var i = 0; i < CONDITIONS.length; i++) {
      if (CONDITIONS[i].key === key) return CONDITIONS[i];
    }
    return CONDITIONS[CONDITIONS.length - 1]; // fallback to "general"
  }

  // Map any condition key variant to a canonical key
  // Handles keys that come from backend (e.g. old format)
  function normalizeConditionKey(raw) {
    if (!raw) return "general";
    var c = raw.toLowerCase().trim();
    if (getCondition(c).key !== "general" || c === "general") return c;
    if (c.indexOf("covid") !== -1)         return "covid_like";
    if (c.indexOf("flu") !== -1 || c.indexOf("influenza") !== -1) return "flu";
    if (c.indexOf("respiratory") !== -1 || c.indexOf("chest") !== -1 || c.indexOf("breath") !== -1) return "respiratory";
    if (c.indexOf("cold") !== -1)          return "common_cold";
    if (c.indexOf("viral") !== -1)         return "viral_fever";
    if (c.indexOf("gastro") !== -1 || c.indexOf("diarrhea") !== -1 || c.indexOf("vomit") !== -1) return "gastro";
    if (c.indexOf("head") !== -1 || c.indexOf("migraine") !== -1) return "headache";
    if (c.indexOf("throat") !== -1)        return "sore_throat";
    if (c.indexOf("nausea") !== -1)        return "nausea";
    return "general";
  }

  // Get diet for a condition key
  function getDiet(key) {
    return DIET[key] || DIET["general"];
  }

  // Get remedies for a condition key
  function getRemedies(key) {
    return REMEDIES[key] || REMEDIES["general"];
  }

  // ── EXPOSE ON WINDOW ──────────────────────────────────────
  window.DHAS = window.DHAS || {};
  window.DHAS.CONDITIONS          = CONDITIONS;
  window.DHAS.SYMPTOM_LABELS      = SYMPTOM_LABELS;
  window.DHAS.DIET                = DIET;
  window.DHAS.DISEASE_DIET        = DISEASE_DIET;
  window.DHAS.REMEDIES            = REMEDIES;
  window.DHAS.diagnose            = diagnose;
  window.DHAS.getCondition        = getCondition;
  window.DHAS.normalizeConditionKey = normalizeConditionKey;
  window.DHAS.getDiet             = getDiet;
  window.DHAS.getRemedies         = getRemedies;

})();