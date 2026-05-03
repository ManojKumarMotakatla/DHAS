// Load step count on page load
let steps = localStorage.getItem("steps") || 0;

// Display initial steps
document.getElementById("stepCount").innerText = steps;

// Add step
function addStep() {
    steps++;
    localStorage.setItem("steps", steps);
    document.getElementById("stepCount").innerText = steps;
}

// Reset steps
function resetSteps() {
    steps = 0;
    localStorage.setItem("steps", steps);
    document.getElementById("stepCount").innerText = steps;
}

// Back button
function goBack() {
    window.location.href = "dashboard.html";
}