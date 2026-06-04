// ============================================
// DHAS - language.js
// Functional language selection with translations
// for key UI strings across the app.
// ============================================

// ── Translation dictionary ─────────────────────────────────
const TRANSLATIONS = {
  English: {
    dashboard:        "Dashboard",
    symptoms:         "Symptoms",
    reports:          "Reports",
    diet:             "Diet",
    remedies:         "Remedies",
    reminders:        "Reminders",
    steps:            "Steps",
    profile:          "Profile",
    language:         "Language",
    logout:           "Logout",
    checkSymptoms:    "Check My Condition",
    selectSymptoms:   "Select Your Symptoms",
    symptomsSubtitle: "Choose all symptoms you are currently experiencing",
    fever:            "Fever",
    cold:             "Cold / Runny Nose",
    headache:         "Headache",
    cough:            "Cough",
    fatigue:          "Fatigue / Tiredness",
    bodyPain:         "Body Pain / Ache",
    soreThroat:       "Sore Throat",
    nausea:           "Nausea / Vomiting",
    diarrhea:         "Diarrhea / Loose Motion",
    lossOfTaste:      "Loss of Taste / Smell",
    chestPain:        "Chest Pain",
    breathlessness:   "Breathlessness",
    goodMorning:      "morning",
    goodAfternoon:    "afternoon",
    goodEvening:      "evening",
    stepGoal:         "Goal",
    stepsLabel:       "Steps",
    distanceLabel:    "Distance",
    caloriesLabel:    "Calories",
    saveReminder:     "Save Reminder",
    medicineName:     "Medicine Name",
    uploadReport:     "Upload Report",
    noSymptoms:       "No symptoms found. Please go back and select your symptoms.",
    selectAtLeastOne: "Please select at least one symptom.",
    profileSaved:     "Profile saved successfully.",
    loginTitle:       "Sign In",
    registerTitle:    "Create Account",
    emailLabel:       "Email Address",
    passwordLabel:    "Password",
    nameLabel:        "Full Name",
    todaySteps:       "Today's Stats",
    weeklyRecord:     "This Week's Record"
  },

  Hindi: {
    dashboard:        "डैशबोर्ड",
    symptoms:         "लक्षण",
    reports:          "रिपोर्ट",
    diet:             "आहार",
    remedies:         "उपचार",
    reminders:        "अनुस्मारक",
    steps:            "कदम",
    profile:          "प्रोफ़ाइल",
    language:         "भाषा",
    logout:           "लॉग आउट",
    checkSymptoms:    "मेरी स्थिति जांचें",
    selectSymptoms:   "अपने लक्षण चुनें",
    symptomsSubtitle: "वर्तमान में अनुभव किए जा रहे सभी लक्षण चुनें",
    fever:            "बुखार",
    cold:             "सर्दी / नाक बहना",
    headache:         "सिरदर्द",
    cough:            "खांसी",
    fatigue:          "थकान / कमज़ोरी",
    bodyPain:         "शरीर दर्द",
    soreThroat:       "गले में खराश",
    nausea:           "मतली / उल्टी",
    diarrhea:         "दस्त / पतला मल",
    lossOfTaste:      "स्वाद / गंध की कमी",
    chestPain:        "सीने में दर्द",
    breathlessness:   "सांस लेने में कठिनाई",
    goodMorning:      "सुबह",
    goodAfternoon:    "दोपहर",
    goodEvening:      "शाम",
    stepGoal:         "लक्ष्य",
    stepsLabel:       "कदम",
    distanceLabel:    "दूरी",
    caloriesLabel:    "कैलोरी",
    saveReminder:     "अनुस्मारक सहेजें",
    medicineName:     "दवा का नाम",
    uploadReport:     "रिपोर्ट अपलोड करें",
    noSymptoms:       "कोई लक्षण नहीं मिला। कृपया वापस जाएं और लक्षण चुनें।",
    selectAtLeastOne: "कृपया कम से कम एक लक्षण चुनें।",
    profileSaved:     "प्रोफ़ाइल सफलतापूर्वक सहेजी गई।",
    loginTitle:       "लॉग इन करें",
    registerTitle:    "खाता बनाएं",
    emailLabel:       "ईमेल पता",
    passwordLabel:    "पासवर्ड",
    nameLabel:        "पूरा नाम",
    todaySteps:       "आज के आंकड़े",
    weeklyRecord:     "इस सप्ताह का रिकॉर्ड"
  },

  Telugu: {
    dashboard:        "డాష్‌బోర్డ్",
    symptoms:         "లక్షణాలు",
    reports:          "నివేదికలు",
    diet:             "ఆహారం",
    remedies:         "చికిత్సలు",
    reminders:        "రిమైండర్లు",
    steps:            "అడుగులు",
    profile:          "ప్రొఫైల్",
    language:         "భాష",
    logout:           "లాగ్ అవుట్",
    checkSymptoms:    "నా స్థితి తనిఖీ చేయండి",
    selectSymptoms:   "మీ లక్షణాలు ఎంచుకోండి",
    symptomsSubtitle: "మీరు ప్రస్తుతం అనుభవిస్తున్న అన్ని లక్షణాలను ఎంచుకోండి",
    fever:            "జ్వరం",
    cold:             "జలుబు / ముక్కు కారడం",
    headache:         "తలనొప్పి",
    cough:            "దగ్గు",
    fatigue:          "అలసట / నీరసం",
    bodyPain:         "శరీర నొప్పి",
    soreThroat:       "గొంతు నొప్పి",
    nausea:           "వికారం / వాంతి",
    diarrhea:         "విరేచనాలు",
    lossOfTaste:      "రుచి / వాసన తెలియకపోవడం",
    chestPain:        "ఛాతీ నొప్పి",
    breathlessness:   "శ్వాస తీసుకోవడంలో కష్టం",
    goodMorning:      "ఉదయం",
    goodAfternoon:    "మధ్యాహ్నం",
    goodEvening:      "సాయంత్రం",
    stepGoal:         "లక్ష్యం",
    stepsLabel:       "అడుగులు",
    distanceLabel:    "దూరం",
    caloriesLabel:    "కేలరీలు",
    saveReminder:     "రిమైండర్ సేవ్ చేయండి",
    medicineName:     "మందు పేరు",
    uploadReport:     "నివేదిక అప్‌లోడ్ చేయండి",
    noSymptoms:       "లక్షణాలు కనుగొనబడలేదు. దయచేసి వెనక్కి వెళ్ళి లక్షణాలు ఎంచుకోండి.",
    selectAtLeastOne: "దయచేసి కనీసం ఒక లక్షణం ఎంచుకోండి.",
    profileSaved:     "ప్రొఫైల్ విజయవంతంగా సేవ్ చేయబడింది.",
    loginTitle:       "లాగిన్ చేయండి",
    registerTitle:    "ఖాతా సృష్టించండి",
    emailLabel:       "ఇమెయిల్ చిరునామా",
    passwordLabel:    "పాస్‌వర్డ్",
    nameLabel:        "పూర్తి పేరు",
    todaySteps:       "నేటి గణాంకాలు",
    weeklyRecord:     "ఈ వారపు రికార్డు"
  }
};

// ── Apply translations to the current page ─────────────────
function applyTranslations(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS["English"];

  // Translate elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });

  // Translate placeholders with data-i18n-placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (t[key]) el.placeholder = t[key];
  });
}

// ── Get current translation for a key ──────────────────────
function t(key) {
  const lang = localStorage.getItem("dhas_language") || "English";
  const dict = TRANSLATIONS[lang] || TRANSLATIONS["English"];
  return dict[key] || TRANSLATIONS["English"][key] || key;
}

// ── Apply on page load ─────────────────────────────────────
window.addEventListener("DOMContentLoaded", function () {
  const saved = localStorage.getItem("dhas_language");
  if (saved && saved !== "English") {
    applyTranslations(saved);
  }

  // If we're on the language page, highlight the active button
  if (document.getElementById("btn-English")) {
    highlightActive(saved || "English");
  }
});

// ── Language page functions ────────────────────────────────
function setLanguage(lang) {
  localStorage.setItem("dhas_language", lang);
  highlightActive(lang);
  applyTranslations(lang);

  const msg = document.getElementById("selectedLangMsg");
  if (msg) {
    msg.style.display = "block";
    const langNames = {
      English: "English 🇬🇧",
      Hindi:   "हिंदी 🇮🇳",
      Telugu:  "తెలుగు 🇮🇳"
    };
    msg.textContent = "✅ Language changed to " + (langNames[lang] || lang) + ". Pages will now display in this language.";
  }
}

function highlightActive(lang) {
  ["English", "Hindi", "Telugu"].forEach(l => {
    const btn = document.getElementById("btn-" + l);
    if (btn) btn.classList.toggle("active", l === lang);
  });
}

// ── Export for use in other scripts ───────────────────────
window.DHAS_LANG = {
  t,
  applyTranslations,
  TRANSLATIONS
};