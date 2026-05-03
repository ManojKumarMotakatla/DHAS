// Get stored symptoms
const symptoms = JSON.parse(localStorage.getItem("symptoms")) || [];

// Display symptoms
document.getElementById("symptomList").innerText = symptoms.join(", ");

// Severity logic
let severity = "Low";
let suggestion = "";

// Simple logic
if (symptoms.includes("fever") && symptoms.includes("cough")) {
    severity = "High";
} else if (symptoms.length >= 3) {
    severity = "Medium";
}

// Suggestions based on severity
if (severity === "Low") {
    suggestion = "Take rest, drink plenty of water, and monitor your symptoms.";
} else if (severity === "Medium") {
    suggestion = "Follow home remedies and consider consulting a doctor if symptoms persist.";
} else {
    suggestion = "⚠️ Your condition may be serious. Please consult a doctor immediately.";
}

// Display results
document.getElementById("severity").innerText = severity;
document.getElementById("suggestions").innerText = suggestion;

// Back button function
function goBack() {
    window.location.href = "symptom.html";
}