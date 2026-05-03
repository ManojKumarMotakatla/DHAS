// Load reminders on page load
window.onload = function () {
    displayReminders();
};

// Handle form submit
document.getElementById("reminderForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const medicine = document.getElementById("medicine").value.trim();
    const time = document.getElementById("time").value;

    if (medicine === "" || time === "") {
        alert("Please fill all fields");
        return;
    }

    // Get existing reminders
    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];

    // Add new reminder
    reminders.push({ medicine, time });

    // Save to localStorage
    localStorage.setItem("reminders", JSON.stringify(reminders));

    // Clear input
    document.getElementById("reminderForm").reset();

    // Refresh list
    displayReminders();
});

// Display reminders
function displayReminders() {
    const list = document.getElementById("reminderList");
    list.innerHTML = "";

    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];

    reminders.forEach((reminder, index) => {
        let li = document.createElement("li");
        li.className = "list-group-item";

        li.innerText = reminder.medicine + " - " + reminder.time;

        list.appendChild(li);
    });
}

// Back button
function goBack() {
    window.location.href = "dashboard.html";
}