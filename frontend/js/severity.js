// ============================================
// DHAS - severity.js
// Rule-based symptom → condition → severity
// Also populates diet & remedies on results page
// FIX: changed window.onload to addEventListener to avoid
//      conflict with symptom.js which also uses window.onload
// ============================================

const CONDITIONS = [
    {
        name: "COVID-19 Like Illness", key: "covid_like",
        symptoms: ["fever","cough","loss_of_taste","fatigue","breathlessness"],
        minMatch: 3, severity: "High",
        suggestion: "Your symptoms resemble COVID-19. Please isolate, monitor oxygen levels, and consult a doctor immediately."
    },
    {
        name: "Influenza (Flu)", key: "flu",
        symptoms: ["fever","body_pain","headache","fatigue","cough"],
        minMatch: 3, severity: "High",
        suggestion: "You may have the flu. Take rest, stay hydrated, and consult a doctor. Paracetamol can help with fever."
    },
    {
        name: "Viral Fever", key: "viral_fever",
        symptoms: ["fever","headache","fatigue","body_pain"],
        minMatch: 3, severity: "Medium",
        suggestion: "You may have viral fever. Rest, drink fluids, and take paracetamol. See a doctor if fever exceeds 103°F."
    },
    {
        name: "Common Cold", key: "common_cold",
        symptoms: ["cold","cough","sore_throat","headache"],
        minMatch: 2, severity: "Low",
        suggestion: "Looks like a common cold. Drink warm fluids, rest, and try steam inhalation. Should resolve in 5–7 days."
    },
    {
        name: "Gastroenteritis", key: "gastro",
        symptoms: ["nausea","diarrhea","fatigue","body_pain"],
        minMatch: 2, severity: "Medium",
        suggestion: "You may have a stomach infection. Stay hydrated with ORS, eat light foods, and see a doctor if symptoms persist."
    },
    {
        name: "Migraine / Headache", key: "headache",
        symptoms: ["headache","nausea","fatigue"],
        minMatch: 2, severity: "Medium",
        suggestion: "You may have a migraine. Rest in a dark quiet room, stay hydrated, and take OTC pain relief if needed."
    },
    {
        name: "Respiratory Distress", key: "respiratory",
        symptoms: ["breathlessness","chest_pain","cough"],
        minMatch: 2, severity: "High",
        suggestion: "Chest pain and breathlessness can be serious. Please seek immediate medical attention."
    },
    {
        name: "General Illness", key: "general",
        symptoms: [], minMatch: 0, severity: "Low",
        suggestion: "Take rest, drink plenty of water, and monitor your symptoms. Consult a doctor if you don't feel better in 2–3 days."
    }
];

// Diet data per condition
const DIET_DATA = {
    covid_like: {
        eat:   ["Warm turmeric milk","High protein foods (dal, eggs, paneer)","Fresh fruits","Giloy tea","Zinc-rich foods (pumpkin seeds)"],
        avoid: ["Cold and raw foods","Alcohol","Junk food","Excess sugar"]
    },
    flu: {
        eat:   ["Warm vegetable soup","Oranges and citrus fruits","Ginger tea with honey","Light khichdi","Bananas"],
        avoid: ["Junk food","Cold drinks","Oily / fried foods","Spicy food"]
    },
    viral_fever: {
        eat:   ["Warm herbal teas","Papaya, pomegranate","Light rice porridge (kanji)","Coconut water","Honey"],
        avoid: ["Oily food","Cold items","Spicy curries","Junk food"]
    },
    common_cold: {
        eat:   ["Warm soups","Tulsi tea","Ginger-honey milk","Garlic in food","Vitamin C fruits"],
        avoid: ["Cold water / cold drinks","Ice cream","Fried snacks","Excess sugar"]
    },
    gastro: {
        eat:   ["ORS solution","Banana","Plain boiled rice","Toast / rusk","Curd (probiotic)","Coconut water"],
        avoid: ["Oily food","Spicy food","Raw vegetables","Caffeinated drinks"]
    },
    headache: {
        eat:   ["Plenty of water","Banana","Almonds and walnuts","Spinach","Ginger tea","Watermelon"],
        avoid: ["Excess caffeine","Alcohol","Processed meats","Too much salt"]
    },
    respiratory: {
        eat:   ["Warm soups","Ginger tea","Honey and lemon water","Turmeric milk","Light easy meals"],
        avoid: ["Cold drinks","Dairy in excess","Fried foods","Smoking / smoke exposure"]
    },
    general: {
        eat:   ["Fresh fruits","Vegetable soup","Warm water","Light dal-rice","Curd","Green vegetables"],
        avoid: ["Junk food","Oily food","Cold drinks","Spicy food"]
    }
};

// Remedies data per condition
const REMEDIES_DATA = {
    covid_like: [
        "Drink Kadha (tulsi, ginger, black pepper, cloves) twice daily",
        "Steam inhalation twice daily for 10 minutes",
        "Monitor oxygen with pulse oximeter",
        "Isolate yourself and wear a mask at home",
        "Take complete rest and stay well hydrated"
    ],
    flu: [
        "Drink warm ginger tea with honey twice a day",
        "Steam inhalation with eucalyptus oil for 10 min",
        "Rest and sleep at least 8 hours",
        "Gargle with warm salt water for sore throat",
        "Take Vitamin C — orange juice, amla"
    ],
    viral_fever: [
        "Apply cool damp cloth on forehead to reduce fever",
        "Drink tulsi + black pepper + ginger decoction",
        "Take complete bed rest",
        "Drink 2–3 liters of water daily",
        "Sponge bath with lukewarm water if fever is high"
    ],
    common_cold: [
        "Steam inhalation 2–3 times a day",
        "Drink turmeric milk (haldi doodh) at night",
        "Ginger + honey + lemon in warm water",
        "Keep your nose and head warm",
        "Use saline nasal drops for congestion relief"
    ],
    gastro: [
        "Drink ORS solution to prevent dehydration",
        "Sip small amounts of water / coconut water frequently",
        "Follow BRAT diet — Banana, Rice, Applesauce, Toast",
        "Avoid solid food for a few hours if vomiting",
        "Rest and avoid physical activity"
    ],
    headache: [
        "Massage temples with peppermint or lavender oil",
        "Drink a large glass of water immediately",
        "Apply cold compress on forehead or neck",
        "Rest in a dark, quiet room",
        "Practice deep breathing or meditation for 10 min"
    ],
    respiratory: [
        "Steam inhalation with Vicks / eucalyptus oil",
        "Sit upright — do not lie flat if breathing is difficult",
        "Drink warm fluids like ginger tea or hot water",
        "Avoid dust, smoke, and cold air",
        "Seek immediate medical attention if breathlessness worsens"
    ],
    general: [
        "Drink warm water regularly (8–10 glasses/day)",
        "Take proper rest (7–8 hours sleep)",
        "Do steam inhalation for cold/cough",
        "Use turmeric milk at night",
        "Eat light and easy to digest meals"
    ]
};

// Symptom display labels
const SYMPTOM_LABELS = {
    fever: "Fever", cold: "Cold / Runny Nose", headache: "Headache",
    cough: "Cough", fatigue: "Fatigue", body_pain: "Body Pain",
    sore_throat: "Sore Throat", nausea: "Nausea / Vomiting",
    diarrhea: "Diarrhea", loss_of_taste: "Loss of Taste/Smell",
    chest_pain: "Chest Pain", breathlessness: "Breathlessness"
};

function detectCondition(symptoms) {
    for (const condition of CONDITIONS) {
        if (condition.key === "general") continue;
        const matched = condition.symptoms.filter(s => symptoms.includes(s)).length;
        if (matched >= condition.minMatch) return condition;
    }
    return CONDITIONS.find(c => c.key === "general");
}

function severityClass(severity) {
    return severity === "High" ? "high" : severity === "Medium" ? "medium" : "low";
}

function alertClass(severity) {
    return severity === "High" ? "danger" : severity === "Medium" ? "warning" : "success";
}

// ── FIX: use addEventListener instead of window.onload
//         to avoid silently killing symptom.js's onload handler ──
window.addEventListener("load", function () {
    // Read symptoms array written by symptom.js
    const symptoms = JSON.parse(localStorage.getItem("dhas_symptoms")) || [];

    // Also accept condition key directly if symptoms page already diagnosed
    const savedConditionKey = localStorage.getItem("dhas_symptom_condition");

    // If no raw symptoms but we have a saved condition key, map it back
    let result;
    if (symptoms.length === 0 && savedConditionKey) {
        result = CONDITIONS.find(c => c.key === savedConditionKey) || CONDITIONS.find(c => c.key === "general");
    } else if (symptoms.length === 0) {
        document.getElementById("alertBox").className = "dhas-alert info";
        document.getElementById("alertBox").textContent = "No symptoms found. Please go back and select your symptoms.";
        return;
    } else {
        result = detectCondition(symptoms);
    }

    localStorage.setItem("dhas_condition", result.key);
    // Keep both keys in sync
    localStorage.setItem("dhas_symptom_condition", result.key);

    // Symptoms as tags
    document.getElementById("symptomDisplay").innerHTML =
        symptoms.map(s => `<span class="condition-tag">${SYMPTOM_LABELS[s] || s}</span>`).join("");

    // Condition
    document.getElementById("conditionDisplay").innerHTML =
        `<span class="condition-tag" style="background:#f0fdf4;color:#166534;border-color:#86efac;font-size:1rem;">${result.name}</span>`;

    // Severity badge
    document.getElementById("severityDisplay").innerHTML =
        `<span class="severity-badge ${severityClass(result.severity)}">${result.severity}</span>`;

    // Suggestion
    document.getElementById("suggestionDisplay").textContent = result.suggestion;

    // Alert box
    const alertBox = document.getElementById("alertBox");
    alertBox.className = `dhas-alert ${alertClass(result.severity)}`;
    alertBox.textContent = result.severity === "High"
        ? "⚠️ High severity — please consult a doctor."
        : result.severity === "Medium"
        ? "⚡ Moderate symptoms — monitor closely."
        : "✅ Mild symptoms — rest and home care should help.";

    // ── Populate Diet Section ──
    const diet = DIET_DATA[result.key] || DIET_DATA["general"];
    const eatList   = document.getElementById("dietEat");
    const avoidList = document.getElementById("dietAvoid");

    if (eatList) {
        diet.eat.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            li.style.marginBottom = "4px";
            eatList.appendChild(li);
        });
    }
    if (avoidList) {
        diet.avoid.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            li.style.marginBottom = "4px";
            avoidList.appendChild(li);
        });
    }

    // ── Populate Remedies Section ──
    const remedies = REMEDIES_DATA[result.key] || REMEDIES_DATA["general"];
    const remList  = document.getElementById("remediesList");

    if (remList) {
        remedies.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            li.style.marginBottom = "6px";
            remList.appendChild(li);
        });
    }
});