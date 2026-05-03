// Load reports on page load
window.onload = function () {
    displayReports();
};

// Handle upload
document.getElementById("reportForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const fileInput = document.getElementById("reportFile");
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a file");
        return;
    }

    // Get existing reports
    let reports = JSON.parse(localStorage.getItem("reports")) || [];

    // Save only file name (simple version)
    reports.push(file.name);

    localStorage.setItem("reports", JSON.stringify(reports));

    // Reset form
    document.getElementById("reportForm").reset();

    displayReports();
});

// Display reports
function displayReports() {
    const list = document.getElementById("reportList");
    list.innerHTML = "";

    let reports = JSON.parse(localStorage.getItem("reports")) || [];

    reports.forEach((report) => {
        let li = document.createElement("li");
        li.className = "list-group-item";
        li.innerText = report;

        list.appendChild(li);
    });
}

// Back button
function goBack() {
    window.location.href = "dashboard.html";
}