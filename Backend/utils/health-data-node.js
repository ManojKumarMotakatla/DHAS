// ============================================================
// DHAS — Backend/utils/health-data-node.js
//
// FIX P3.1 — Node.js / CommonJS version of the health data.
// This is the BACKEND counterpart to frontend/js/health-data.js.
//
// Both files must stay in sync. The frontend version wraps
// everything in an IIFE and assigns to window.DHAS.
// This version uses module.exports so Node can require() it.
//
// Replace Backend/utils/SeverityLogic.js and
// Backend/utils/suggestions.js with this single file.
// ============================================================

const CONDITIONS = [
    {
        key:        "covid_like",
        name:       "COVID-19 Like Illness",
        symptoms:   ["fever", "cough", "loss_of_taste", "fatigue", "breathlessness"],
        minMatch:   3,
        severity:   "High",
        suggestion: "Your symptoms resemble COVID-19. Please isolate, monitor oxygen levels, and consult a doctor immediately."
    },
    {
        key:        "flu",
        name:       "Influenza (Flu)",
        symptoms:   ["fever", "body_pain", "headache", "fatigue", "cough"],
        minMatch:   3,
        severity:   "High",
        suggestion: "You may have the flu. Take rest, stay hydrated, and consult a doctor. Paracetamol can help with fever."
    },
    {
        key:        "respiratory",
        name:       "Respiratory Distress",
        symptoms:   ["breathlessness", "chest_pain", "cough"],
        minMatch:   2,
        severity:   "High",
        suggestion: "Chest pain and breathlessness can be serious. Please seek immediate medical attention."
    },
    {
        key:        "viral_fever",
        name:       "Viral Fever",
        symptoms:   ["fever", "headache", "fatigue", "body_pain"],
        minMatch:   3,
        severity:   "Medium",
        suggestion: "You may have viral fever. Rest, drink fluids, and take paracetamol. See a doctor if fever exceeds 103°F."
    },
    {
        key:        "gastro",
        name:       "Gastroenteritis",
        symptoms:   ["nausea", "diarrhea", "fatigue", "body_pain"],
        minMatch:   2,
        severity:   "Medium",
        suggestion: "You may have a stomach infection. Stay hydrated with ORS, eat light foods, and see a doctor if symptoms persist."
    },
    {
        key:        "headache",
        name:       "Migraine / Headache",
        symptoms:   ["headache", "nausea", "fatigue"],
        minMatch:   2,
        severity:   "Medium",
        suggestion: "You may have a migraine. Rest in a dark quiet room, stay hydrated, and take OTC pain relief if needed."
    },
    {
        key:        "common_cold",
        name:       "Common Cold",
        symptoms:   ["cold", "cough", "sore_throat", "headache"],
        minMatch:   2,
        severity:   "Low",
        suggestion: "Looks like a common cold. Drink warm fluids, rest, and try steam inhalation. Should resolve in 5–7 days."
    },
    {
        key:        "sore_throat",
        name:       "Sore Throat",
        symptoms:   ["sore_throat", "cough", "cold"],
        minMatch:   1,
        severity:   "Low",
        suggestion: "Gargle with warm salt water and stay hydrated. Should improve in a few days."
    },
    {
        key:        "nausea",
        name:       "Nausea / Vomiting",
        symptoms:   ["nausea"],
        minMatch:   1,
        severity:   "Low",
        suggestion: "Sip ginger tea slowly and eat small bland meals. See a doctor if vomiting persists beyond 24 hours."
    },
    {
        key:        "general",
        name:       "General Illness",
        symptoms:   [],
        minMatch:   0,
        severity:   "Low",
        suggestion: "Take rest, drink plenty of water, and monitor your symptoms. Consult a doctor if you don't feel better in 2–3 days."
    }
];

const DIET = {
    covid_like: {
        eat:   ["Warm turmeric milk", "High protein foods (dal, eggs, paneer)", "Fresh fruits", "Giloy / Ashwagandha tea", "Zinc-rich foods (pumpkin seeds, chickpeas)"],
        avoid: ["Cold and raw foods", "Alcohol", "Junk food", "Excess sugar"]
    },
    flu: {
        eat:   ["Warm vegetable soup", "Oranges and citrus fruits", "Ginger tea with honey", "Light khichdi", "Bananas"],
        avoid: ["Junk food", "Cold drinks", "Oily / fried foods", "Spicy food", "Alcohol"]
    },
    viral_fever: {
        eat:   ["Warm herbal teas", "Papaya, pomegranate", "Light rice porridge (kanji)", "Coconut water", "Honey"],
        avoid: ["Oily food", "Cold items", "Spicy curries", "Junk food"]
    },
    common_cold: {
        eat:   ["Warm soups", "Tulsi tea", "Ginger-honey milk", "Garlic in food", "Vitamin C fruits"],
        avoid: ["Cold water / cold drinks", "Ice cream", "Fried snacks", "Excess sugar"]
    },
    gastro: {
        eat:   ["ORS solution", "Banana", "Plain boiled rice", "Toast / rusk", "Curd (probiotic)", "Coconut water"],
        avoid: ["Oily food", "Spicy food", "Raw vegetables", "Caffeinated drinks"]
    },
    headache: {
        eat:   ["Plenty of water", "Banana", "Almonds and walnuts", "Spinach", "Ginger tea", "Watermelon"],
        avoid: ["Excess caffeine", "Alcohol", "Processed meats", "Too much salt"]
    },
    respiratory: {
        eat:   ["Warm soups", "Ginger tea", "Honey and lemon water", "Turmeric milk", "Light easy meals"],
        avoid: ["Cold drinks", "Dairy in excess", "Fried foods", "Smoking / smoke exposure"]
    },
    sore_throat: {
        eat:   ["Warm water with honey and lemon", "Ginger tea", "Turmeric milk", "Soft foods (khichdi)", "Coconut water"],
        avoid: ["Cold drinks", "Ice cream", "Spicy food", "Alcohol", "Hard crunchy foods"]
    },
    nausea: {
        eat:   ["Ginger tea", "Plain crackers / rusk", "Banana", "Clear broths", "Coconut water"],
        avoid: ["Oily food", "Spicy food", "Strong-smelling foods", "Dairy", "Large heavy meals"]
    },
    general: {
        eat:   ["Fresh fruits", "Vegetable soup", "Warm water", "Light dal-rice", "Curd", "Green vegetables"],
        avoid: ["Junk food", "Oily food", "Cold drinks", "Spicy food"]
    }
};

const REMEDIES = {
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
    sore_throat: [
        "Gargle with warm salt water every 2–3 hours",
        "Mix 1 tsp honey with a pinch of black pepper — swallow slowly",
        "Drink warm turmeric milk at night before bed",
        "Suck on a clove (laung) for natural pain relief",
        "Have ginger tea with honey 2–3 times a day"
    ],
    nausea: [
        "Sip ginger tea very slowly",
        "Inhale peppermint oil or apply to wrists",
        "Eat plain crackers or dry rusk in very small amounts",
        "Sip cold water or lemon water slowly",
        "Sit or stand upright — do not lie flat"
    ],
    general: [
        "Drink warm water regularly (8–10 glasses/day)",
        "Take proper rest (7–8 hours sleep)",
        "Do steam inhalation for cold/cough",
        "Use turmeric milk at night",
        "Eat light and easy to digest meals"
    ]
};

// ── detectCondition ───────────────────────────────────────────
// Drop-in replacement for the old detectCondition() in
// Backend/utils/SeverityLogic.js. Same signature, same return shape.
function detectCondition(symptoms) {
    for (const condition of CONDITIONS) {
        if (condition.key === "general") continue;
        const matched = condition.symptoms.filter(s => symptoms.includes(s)).length;
        if (matched >= condition.minMatch) return condition;
    }
    return CONDITIONS.find(c => c.key === "general");
}

// ── getSuggestions ────────────────────────────────────────────
// Drop-in replacement for getSuggestions() in
// Backend/utils/suggestions.js. Returns { diet, remedies }.
function getSuggestions(conditionKey) {
    return {
        diet:     DIET[conditionKey]     || DIET["general"],
        remedies: REMEDIES[conditionKey] || REMEDIES["general"]
    };
}

module.exports = {
    CONDITIONS,
    DIET,
    REMEDIES,
    detectCondition,
    getSuggestions
};