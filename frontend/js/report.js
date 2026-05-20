// ============================================
// DHAS - report.js
// Upload, view, and delete medical reports
// Files stored as base64 in MySQL database
// ============================================

const BASE_URL = "http://localhost:3006";

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

    // If returning from viewer, restore scroll
    const savedScroll = sessionStorage.getItem("dhas_report_scroll");
    if (savedScroll) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 100);
        sessionStorage.removeItem("dhas_report_scroll");
    }

    // Check if we're in viewer mode (hash-based routing)
    if (window.location.hash.startsWith("#view:")) {
        const id = window.location.hash.replace("#view:", "");
        showReportViewer(id);
    } else {
        showReportList();
    }
};

// ── Show the main report list view ──────────────────────────────
function showReportList() {
    document.getElementById("listSection").style.display = "block";
    document.getElementById("viewerSection").style.display = "none";
    displayReports();
}

// ── Show the embedded report viewer ─────────────────────────────
async function showReportViewer(id) {
    document.getElementById("listSection").style.display = "none";
    const viewerSection = document.getElementById("viewerSection");
    viewerSection.style.display = "block";
    viewerSection.innerHTML = `<p style="text-align:center;color:#888;padding:40px 0;">Loading report…</p>`;

    try {
        const res  = await fetch(`${BASE_URL}/reports/view/${id}`);
        const data = await res.json();

        if (!data.success || !data.dataurl) {
            viewerSection.innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <p style="color:red;">File data not found.</p>
                    <button class="btn-dhas secondary" onclick="goBackToList()">← Back to Reports</button>
                </div>`;
            return;
        }

        const isPDF   = data.filetype === "application/pdf";
        const isImage = data.filetype && data.filetype.startsWith("image/");

        let contentHTML = "";
        if (isPDF) {
            contentHTML = `
                <iframe
                    src="${data.dataurl}"
                    style="width:100%;height:75vh;border:none;border-radius:12px;"
                    title="${data.filename}">
                </iframe>`;
        } else if (isImage) {
            contentHTML = `
                <img
                    src="${data.dataurl}"
                    alt="${data.filename}"
                    style="max-width:100%;border-radius:12px;display:block;margin:0 auto;">`;
        } else {
            contentHTML = `<p style="color:#555;text-align:center;">Cannot preview this file type. Please download it.</p>`;
        }

        viewerSection.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
                <button class="btn-dhas secondary"
                        style="width:auto;padding:8px 18px;"
                        onclick="goBackToList()">← Back to Reports</button>
                <div style="flex:1;font-size:0.95rem;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${fileIcon(data.filetype)} ${data.filename}
                </div>
                <a href="${data.dataurl}"
                   download="${data.filename}"
                   class="btn-dhas primary"
                   style="width:auto;padding:8px 18px;font-size:0.85rem;text-decoration:none;">
                    ⬇ Download
                </a>
            </div>
            ${contentHTML}`;
    } catch (err) {
        console.error("View report error:", err);
        viewerSection.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <p style="color:red;">Cannot connect to server.</p>
                <button class="btn-dhas secondary" onclick="goBackToList()">← Back to Reports</button>
            </div>`;
    }
}

// ── Navigate to viewer (same tab, hash routing) ─────────────────
function viewReport(id) {
    // Save scroll position so we restore it when going back
    sessionStorage.setItem("dhas_report_scroll", window.scrollY);
    window.location.hash = `view:${id}`;
    showReportViewer(id);
}

// ── Navigate back to list ────────────────────────────────────────
function goBackToList() {
    window.location.hash = "";
    showReportList();
}

// Handle browser back/forward buttons
window.addEventListener("hashchange", () => {
    if (window.location.hash.startsWith("#view:")) {
        const id = window.location.hash.replace("#view:", "");
        showReportViewer(id);
    } else {
        showReportList();
    }
});

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

    const uploadBtn = document.getElementById("uploadBtn");
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = "Uploading…"; }

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
                    dataurl:  dataUrl
                })
            });

            const data = await res.json();

            if (data.success) {
                fileInput.value = "";
                displayReports();
            } else {
                const detail = data.dbMessage ? `\n\nDB: ${data.dbError} — ${data.dbMessage}` : "";
                alert((data.message || "Upload failed. Please try again.") + detail);
            }

        } catch (err) {
            console.error("Upload error:", err);
            alert("Cannot connect to server. Make sure backend is running.");
        } finally {
            if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = "Upload Report"; }
        }
    };

    reader.onerror = function () {
        alert("Failed to read file. Please try again.");
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = "Upload Report"; }
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