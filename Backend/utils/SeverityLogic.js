// ============================================
// DHAS - SeverityLogic.js
// Rule-based symptom → condition → severity
// ============================================

const CONDITIONS = [
    {
        name: "COVID-19 Like Illness",
        key:  "covid_like",
        symptoms: ["fever", "cough", "loss_of_taste", "fatigue", "breathlessness"],
        minMatch: 3,
        severity: "High",
        suggestion: "Your symptoms resemble COVID-19. Please isolate, monitor oxygen levels, and consult a doctor immediately."
    },
    {
        name: "Influenza (Flu)",
        key:  "flu",
        symptoms: ["fever", "body_pain", "headache", "fatigue", "cough"],
        minMatch: 3,
        severity: "High",
        suggestion: "You may have the flu. Take rest, stay hydrated, and consult a doctor. Paracetamol can help with fever."
    },
    {
        name: "Viral Fever",
        key:  "viral_fever",
        symptoms: ["fever", "headache", "fatigue", "body_pain"],
        minMatch: 3,
        severity: "Medium",
        suggestion: "You may have viral fever. Rest, drink fluids, and take paracetamol. See a doctor if fever exceeds 103°F."
    },
    {
        name: "Common Cold",
        key:  "common_cold",
        symptoms: ["cold", "cough", "sore_throat", "headache"],
        minMatch: 2,
        severity: "Low",
        suggestion: "Looks like a common cold. Drink warm fluids, rest, and try steam inhalation. Should resolve in 5–7 days."
    },
    {
        name: "Gastroenteritis",
        key:  "gastro",
        symptoms: ["nausea", "diarrhea", "fatigue", "body_pain"],
        minMatch: 2,
        severity: "Medium",
        suggestion: "You may have a stomach infection. Stay hydrated with ORS, eat light foods, and see a doctor if symptoms persist."
    },
    {
        name: "Migraine / Headache",
        key:  "headache",
        symptoms: ["headache", "nausea", "fatigue"],
        minMatch: 2,
        severity: "Medium",
        suggestion: "You may have a migraine. Rest in a dark quiet room, stay hydrated, and take OTC pain relief if needed."
    },
    {
        name: "Respiratory Distress",
        key:  "respiratory",
        symptoms: ["breathlessness", "chest_pain", "cough"],
        minMatch: 2,
        severity: "High",
        suggestion: "Chest pain and breathlessness can be serious. Please seek immediate medical attention."
    },
    {
        name: "General Illness",
        key:  "general",
        symptoms: [],
        minMatch: 0,
        severity: "Low",
        suggestion: "Take rest, drink plenty of water, and monitor your symptoms. Consult a doctor if you don't feel better in 2–3 days."
    }
];

// Detect condition from symptoms array
function detectCondition(symptoms) {
    for (const condition of CONDITIONS) {
        if (condition.key === "general") continue;
        const matched = condition.symptoms.filter(s => symptoms.includes(s)).length;
        if (matched >= condition.minMatch) return condition;
    }
    return CONDITIONS.find(c => c.key === "general");
}

module.exports = { detectCondition, CONDITIONS };