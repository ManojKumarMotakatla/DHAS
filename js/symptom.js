// Handle symptom form

document.getElementById("symptomForm").addEventListener("submit", function(e) {
    e.preventDefault();

    // Get selected symptoms
    let symptoms = [];

    if (document.getElementById("fever").checked) symptoms.push("fever");
    if (document.getElementById("cold").checked) symptoms.push("cold");
    if (document.getElementById("headache").checked) symptoms.push("headache");
    if (document.getElementById("cough").checked) symptoms.push("cough");
    if (document.getElementById("fatigue").checked) symptoms.push("fatigue");

    // Validation
    if (symptoms.length === 0) {
        alert("Please select at least one symptom");
        return;
    }

    // Store symptoms (temporary)
    localStorage.setItem("symptoms", JSON.stringify(symptoms));

    // Redirect to results page
    window.location.href = "results.html";
});