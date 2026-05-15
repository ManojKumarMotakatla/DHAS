// ============================================
// DHAS - report.js
// Upload, view, and delete medical reports
// Files stored as base64 in MySQL database
// ============================================

const BASE_URL = "https://dhas-production.up.railway.app";

// ── Get logged-in user from localStorage ──────────────────────
function getUser() {
    return JSON.parse(localStorage.getItem("dhas_user"));
}

window.onload = function () {
    const user = getUser();
    if (!user) {
        alert("Please login first.");
        window.location.href = "login.html";
        return;
    }
    displayReports();
};

// ── Upload Report ──────────────────────────────────────────────
function uploadReport() {
    const user = getUser();
    if (!user) { alert("Please login first."); return; }

    const fileInput = document.getElementById("reportFile");
    const file = fileInput.files[0];

    if (!file) { alert("Please select a file to upload."); return; }

    // Validate type
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.type)) {
        alert("Only PDF, JPG, and PNG files are supported.");
        return;
    }

    // Size guard – 4 MB max
    if (file.size > 4 * 1024 * 1024) {
        alert("File is too large. Please upload files smaller than 4 MB.");
        return;
    }

    // Read file as base64 Data URL
    const reader = new FileReader();
    reader.onload = async function (e) {
        const dataUrl = e.target.result;

        try {
            const res = await fetch(`${BASE_URL}/reports/upload`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id:  user.id,
                    filename: file.name,
                    filesize: formatSize(file.size),
                    filetype: file.type,
                    dataurl:  dataUrl        // base64 stored in DB
                })
            });

            const data = await res.json();

            if (data.success) {
                fileInput.value = "";
                displayReports();
            } else {
                alert(data.message || "Upload failed. Please try again.");
            }

        } catch (err) {
            console.error("Upload error:", err);
            alert("Cannot connect to server. Make sure backend is running.");
        }
    };

    reader.onerror = function () {
        alert("Failed to read file. Please try again.");
    };

    reader.readAsDataURL(file);
}

// ── Display Reports ────────────────────────────────────────────
async function displayReports() {
    const user = getUser();
    if (!user) return;

    const list = document.getElementById("reportList");
    list.innerHTML = `<p style="text-align:center;color:#888;">Loading reports...</p>`;

    try {
        const res  = await fetch(`${BASE_URL}/reports/${user.id}`);
        const data = await res.json();

        if (!data.success || data.data.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No reports uploaded yet.<br>Upload your first medical report above.</p>
                </div>`;
            return;
        }

        list.innerHTML = data.data.map(r => `
            <div class="report-item">
                <div style="flex:1;min-width:0;">
                    <div class="report-name">${fileIcon(r.filetype)} ${r.filename}</div>
                    <div class="report-date">📅 ${new Date(r.uploaded_at).toLocaleDateString("en-IN")} &nbsp;|&nbsp; ${r.filesize}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                    <button class="btn-dhas primary"
                            style="width:auto;padding:6px 14px;font-size:0.8rem;"
                            onclick="viewReport(${r.id})" title="View">
                        View
                    </button>
                    <button class="reminder-delete" onclick="deleteReport(${r.id})" title="Delete">Delete</button>
                </div>
            </div>
        `).join("");

    } catch (err) {
        console.error("Fetch reports error:", err);
        list.innerHTML = `<p style="text-align:center;color:red;">Failed to load reports.</p>`;
    }
}

// ── View Report ────────────────────────────────────────────────
async function viewReport(id) {
    const user = getUser();
    if (!user) return;

    try {
        const res  = await fetch(`${BASE_URL}/reports/view/${id}`);
        const data = await res.json();

        if (!data.success || !data.dataurl) {
            alert("File data not found.");
            return;
        }

        const win = window.open();
        if (data.filetype === "application/pdf") {
            win.document.write(`
                <html><head><title>${data.filename}</title></head>
                <body style="margin:0">
                    <iframe src="${data.dataurl}" width="100%" height="100%"
                            style="border:none;position:fixed;top:0;left:0;width:100%;height:100%">
                    </iframe>
                </body></html>`);
        } else {
            win.document.write(`
                <html><head><title>${data.filename}</title></head>
                <body style="margin:0;background:#111;display:flex;
                             align-items:center;justify-content:center;min-height:100vh;">
                    <img src="${data.dataurl}"
                         style="max-width:100%;max-height:100vh;object-fit:contain;">
                </body></html>`);
        }
        win.document.close();

    } catch (err) {
        console.error("View report error:", err);
        alert("Cannot connect to server.");
    }
}

// ── Delete Report ──────────────────────────────────────────────
async function deleteReport(id) {
    if (!confirm("Delete this report?")) return;

    try {
        const res  = await fetch(`${BASE_URL}/reports/${id}`, { method: "DELETE" });
        const data = await res.json();

        if (data.success) {
            displayReports();
        } else {
            alert("Failed to delete report.");
        }

    } catch (err) {
        console.error("Delete report error:", err);
        alert("Cannot connect to server.");
    }
}

// ── Helpers ────────────────────────────────────────────────────
function formatSize(bytes) {
    if (bytes < 1024)        return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(type) {
    if (!type) return "📁";
    if (type === "application/pdf") return "📄";
    if (type.startsWith("image/"))  return "🖼️";
    return "📁";
}