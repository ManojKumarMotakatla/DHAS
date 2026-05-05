// ============================================
// DHAS - report.js
// Upload and display medical reports
// ============================================

window.onload = function () {
  displayReports();
};

function uploadReport() {
  const fileInput = document.getElementById("reportFile");
  const file = fileInput.files[0];

  if (!file) { alert("Please select a file to upload."); return; }

  // Validate type
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
  if (!allowed.includes(file.type)) {
    alert("Only PDF, JPG, and PNG files are supported.");
    return;
  }

  let reports = JSON.parse(localStorage.getItem("dhas_reports")) || [];
  reports.push({
    name: file.name,
    size: formatSize(file.size),
    date: new Date().toLocaleDateString("en-IN"),
    type: file.type,
    id: Date.now()
  });
  localStorage.setItem("dhas_reports", JSON.stringify(reports));

  fileInput.value = "";
  displayReports();
}

function deleteReport(id) {
  let reports = JSON.parse(localStorage.getItem("dhas_reports")) || [];
  reports = reports.filter(r => r.id !== id);
  localStorage.setItem("dhas_reports", JSON.stringify(reports));
  displayReports();
}

function displayReports() {
  const list = document.getElementById("reportList");
  const reports = JSON.parse(localStorage.getItem("dhas_reports")) || [];

  if (reports.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No reports uploaded yet.<br>Upload your first medical report above.</p>
      </div>`;
    return;
  }

  list.innerHTML = reports.map(r => `
    <div class="report-item">
      <div>
        <div class="report-name">${fileIcon(r.type)} ${r.name}</div>
        <div class="report-date">📅 ${r.date} &nbsp;|&nbsp; ${r.size}</div>
      </div>
      <button class="reminder-delete" onclick="deleteReport(${r.id})" title="Delete">🗑️</button>
    </div>
  `).join("");
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(type) {
  if (type === "application/pdf") return "📄";
  if (type.startsWith("image/")) return "🖼️";
  return "📁";
}