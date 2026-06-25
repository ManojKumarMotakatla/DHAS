// ============================================================
// DHAS — language.js
// Full translation support: English, Hindi, Telugu
// Reads dhas_language from localStorage and applies on every page.
// Uses data-i18n attributes: <span data-i18n="fever">Fever</span>
// ============================================================

var TRANSLATIONS = {
  English: {
    dashboard:"Dashboard", symptoms:"Symptoms", reports:"Reports",
    diet:"Diet", remedies:"Remedies", reminders:"Reminders",
    steps:"Steps", profile:"Profile", language:"Language", logout:"Logout",
    checkSymptoms:"Check My Condition", selectSymptoms:"Select Your Symptoms",
    symptomsSubtitle:"Choose all symptoms you are currently experiencing",
    fever:"Fever", cold:"Cold / Runny Nose", headache:"Headache",
    cough:"Cough", fatigue:"Fatigue / Tiredness", bodyPain:"Body Pain / Ache",
    soreThroat:"Sore Throat", nausea:"Nausea / Vomiting",
    diarrhea:"Diarrhea / Loose Motion", lossOfTaste:"Loss of Taste / Smell",
    chestPain:"Chest Pain", breathlessness:"Breathlessness",
    goodMorning:"morning", goodAfternoon:"afternoon", goodEvening:"evening",
    stepGoal:"Goal", stepsLabel:"Steps", distanceLabel:"Distance", caloriesLabel:"Calories",
    saveReminder:"Save Reminder", medicineName:"Medicine Name",
    uploadReport:"Upload Report",
    noSymptoms:"No symptoms found. Please go back and select your symptoms.",
    selectAtLeastOne:"Please select at least one symptom.",
    profileSaved:"Profile saved successfully.",
    loginTitle:"Sign In", registerTitle:"Create Account",
    emailLabel:"Email Address", passwordLabel:"Password", nameLabel:"Full Name",
    todaySteps:"Today's Stats", weeklyRecord:"This Week's Record",
    healthSnapshot:"Health Snapshot", quickActions:"Quick Actions",
    activeReminders:"Today's Active Reminders", yourResults:"Your Results",
    likelyCond:"Likely Condition", severityLevel:"Severity Level",
    recommendation:"Recommendation", dietGuide:"Diet Guide",
    homeRemedies:"Home Remedies",
    uploadReports:"Upload & manage your health documents securely",
    medicineReminders:"Never miss a dose — set smart medication alerts"
  },
  Hindi: {
    dashboard:"डैशबोर्ड", symptoms:"लक्षण", reports:"रिपोर्ट",
    diet:"आहार", remedies:"उपचार", reminders:"अनुस्मारक",
    steps:"कदम", profile:"प्रोफ़ाइल", language:"भाषा", logout:"लॉग आउट",
    checkSymptoms:"मेरी स्थिति जांचें", selectSymptoms:"अपने लक्षण चुनें",
    symptomsSubtitle:"वर्तमान में अनुभव किए जा रहे सभी लक्षण चुनें",
    fever:"बुखार", cold:"सर्दी / नाक बहना", headache:"सिरदर्द",
    cough:"खांसी", fatigue:"थकान / कमज़ोरी", bodyPain:"शरीर दर्द",
    soreThroat:"गले में खराश", nausea:"मतली / उल्टी",
    diarrhea:"दस्त / पतला मल", lossOfTaste:"स्वाद / गंध की कमी",
    chestPain:"सीने में दर्द", breathlessness:"सांस लेने में कठिनाई",
    goodMorning:"सुबह", goodAfternoon:"दोपहर", goodEvening:"शाम",
    stepGoal:"लक्ष्य", stepsLabel:"कदम", distanceLabel:"दूरी", caloriesLabel:"कैलोरी",
    saveReminder:"अनुस्मारक सहेजें", medicineName:"दवा का नाम",
    uploadReport:"रिपोर्ट अपलोड करें",
    noSymptoms:"कोई लक्षण नहीं मिला। कृपया वापस जाएं और लक्षण चुनें।",
    selectAtLeastOne:"कृपया कम से कम एक लक्षण चुनें।",
    profileSaved:"प्रोफ़ाइल सफलतापूर्वक सहेजी गई।",
    loginTitle:"लॉग इन करें", registerTitle:"खाता बनाएं",
    emailLabel:"ईमेल पता", passwordLabel:"पासवर्ड", nameLabel:"पूरा नाम",
    todaySteps:"आज के आंकड़े", weeklyRecord:"इस सप्ताह का रिकॉर्ड",
    healthSnapshot:"स्वास्थ्य स्नैपशॉट", quickActions:"त्वरित क्रियाएं",
    activeReminders:"आज के सक्रिय अनुस्मारक", yourResults:"आपके परिणाम",
    likelyCond:"संभावित स्थिति", severityLevel:"गंभीरता स्तर",
    recommendation:"सिफारिश", dietGuide:"आहार मार्गदर्शिका",
    homeRemedies:"घरेलू उपचार",
    uploadReports:"अपने स्वास्थ्य दस्तावेज़ सुरक्षित रूप से अपलोड करें",
    medicineReminders:"दवा लेना न भूलें — स्मार्ट अलर्ट सेट करें"
  },
  Telugu: {
    dashboard:"డాష్‌బోర్డ్", symptoms:"లక్షణాలు", reports:"నివేదికలు",
    diet:"ఆహారం", remedies:"చికిత్సలు", reminders:"రిమైండర్లు",
    steps:"అడుగులు", profile:"ప్రొఫైల్", language:"భాష", logout:"లాగ్ అవుట్",
    checkSymptoms:"నా స్థితి తనిఖీ చేయండి", selectSymptoms:"మీ లక్షణాలు ఎంచుకోండి",
    symptomsSubtitle:"మీరు ప్రస్తుతం అనుభవిస్తున్న అన్ని లక్షణాలను ఎంచుకోండి",
    fever:"జ్వరం", cold:"జలుబు / ముక్కు కారడం", headache:"తలనొప్పి",
    cough:"దగ్గు", fatigue:"అలసట / నీరసం", bodyPain:"శరీర నొప్పి",
    soreThroat:"గొంతు నొప్పి", nausea:"వికారం / వాంతి",
    diarrhea:"విరేచనాలు", lossOfTaste:"రుచి / వాసన తెలియకపోవడం",
    chestPain:"ఛాతీ నొప్పి", breathlessness:"శ్వాస తీసుకోవడంలో కష్టం",
    goodMorning:"ఉదయం", goodAfternoon:"మధ్యాహ్నం", goodEvening:"సాయంత్రం",
    stepGoal:"లక్ష్యం", stepsLabel:"అడుగులు", distanceLabel:"దూరం", caloriesLabel:"కేలరీలు",
    saveReminder:"రిమైండర్ సేవ్ చేయండి", medicineName:"మందు పేరు",
    uploadReport:"నివేదిక అప్‌లోడ్ చేయండి",
    noSymptoms:"లక్షణాలు కనుగొనబడలేదు. దయచేసి వెనక్కి వెళ్ళి లక్షణాలు ఎంచుకోండి.",
    selectAtLeastOne:"దయచేసి కనీసం ఒక లక్షణం ఎంచుకోండి.",
    profileSaved:"ప్రొఫైల్ విజయవంతంగా సేవ్ చేయబడింది.",
    loginTitle:"లాగిన్ చేయండి", registerTitle:"ఖాతా సృష్టించండి",
    emailLabel:"ఇమెయిల్ చిరునామా", passwordLabel:"పాస్‌వర్డ్", nameLabel:"పూర్తి పేరు",
    todaySteps:"నేటి గణాంకాలు", weeklyRecord:"ఈ వారపు రికార్డు",
    healthSnapshot:"ఆరోగ్య స్నాప్‌షాట్", quickActions:"త్వరిత చర్యలు",
    activeReminders:"నేటి క్రియాశీల రిమైండర్లు", yourResults:"మీ ఫలితాలు",
    likelyCond:"సంభావ్య పరిస్థితి", severityLevel:"తీవ్రత స్థాయి",
    recommendation:"సిఫార్సు", dietGuide:"ఆహార మార్గదర్శి",
    homeRemedies:"ఇంటి చికిత్సలు",
    uploadReports:"మీ ఆరోగ్య పత్రాలు సురక్షితంగా అప్‌లోడ్ చేయండి",
    medicineReminders:"మందు వేయడం మర్చిపోవద్దు — స్మార్ట్ హెచ్చరికలు సెట్ చేయండి"
  }
};

// ── Apply translations to the current page ────────────────────
function applyTranslations(lang) {
  var t = TRANSLATIONS[lang] || TRANSLATIONS["English"];

  // data-i18n: replace textContent
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var key = el.getAttribute("data-i18n");
    if (t[key] !== undefined) el.textContent = t[key];
  });

  // data-i18n-placeholder: replace placeholder attribute
  document.querySelectorAll("[data-i18n-placeholder]").forEach(function(el) {
    var key = el.getAttribute("data-i18n-placeholder");
    if (t[key] !== undefined) el.placeholder = t[key];
  });

  // Page <title>
  var pageTitle = document.querySelector("title");
  if (pageTitle) {
    var base = pageTitle.getAttribute("data-i18n-title");
    if (base && t[base]) pageTitle.textContent = t[base] + " — DHAS";
  }

  // html lang attribute for screen readers
  var langCodes = { English: "en", Hindi: "hi", Telugu: "te" };
  document.documentElement.lang = langCodes[lang] || "en";
}

// ── Get a single translated string ────────────────────────────
function t(key) {
  var lang = localStorage.getItem("dhas_language") || "English";
  var dict = TRANSLATIONS[lang] || TRANSLATIONS["English"];
  return dict[key] !== undefined ? dict[key] : (TRANSLATIONS["English"][key] || key);
}

// ── Auto-apply on every page load ─────────────────────────────
(function autoApply() {
  var lang = localStorage.getItem("dhas_language") || "English";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { applyTranslations(lang); });
  } else {
    applyTranslations(lang);
  }
})();

// ── Language selection page functions ─────────────────────────
function setLanguage(lang) {
  localStorage.setItem("dhas_language", lang);
  highlightActive(lang);
  applyTranslations(lang);

  var msg     = document.getElementById("selectedLangMsg");
  var msgText = document.getElementById("selectedLangText");
  if (msg) {
    msg.style.display = "flex";
    var names = { English:"English 🇬🇧", Hindi:"हिंदी 🇮🇳", Telugu:"తెలుగు 🇮🇳" };
    var label = names[lang] || lang;
    if (msgText) {
      msgText.textContent = "Language changed to " + label + ". All pages will now display in this language.";
    } else {
      msg.innerHTML =
        '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
        '</svg>' +
        '<span>Language changed to ' + label + '. All pages will now display in this language.</span>';
    }
  }
}

function highlightActive(lang) {
  ["English","Hindi","Telugu"].forEach(function(l) {
    var btn = document.getElementById("btn-" + l);
    if (btn) btn.classList.toggle("active", l === lang);
  });
}

// Highlight on language page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function() {
    var lang = localStorage.getItem("dhas_language") || "English";
    if (document.getElementById("btn-English")) highlightActive(lang);
  });
} else {
  var lang = localStorage.getItem("dhas_language") || "English";
  if (document.getElementById("btn-English")) highlightActive(lang);
}

window.DHAS_LANG = { t: t, applyTranslations: applyTranslations, TRANSLATIONS: TRANSLATIONS };