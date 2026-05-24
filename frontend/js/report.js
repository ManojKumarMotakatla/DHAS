// ============================================
// DHAS - report.js (icons edition)
// Upload, view, and delete medical reports
// Files stored as base64 in MySQL database
// ============================================

const BASE_URL = "http://localhost:3006";

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

    const savedScroll = sessionStorage.getItem("dhas_report_scroll");
    if (savedScroll) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 100);
        sessionStorage.removeItem("dhas_report_scroll");
    }

    if (window.location.hash.startsWith("#view:")) {
        const id = window.location.hash.replace("#view:", "");
        showReportViewer(id);
    } else {
        showReportList();
    }
};

function showReportList() {
    document.getElementById("listSection").style.display = "block";
    document.getElementById("viewerSection").style.display = "none";
    displayReports();
}

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
                    <button class="viewer-back-btn" onclick="goBackToList()">
                      <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Reports
                    </button>
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

        const { iconEl, iconLabel } = fileIconEl(data.filetype);

        viewerSection.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
                <button class="viewer-back-btn" onclick="goBackToList()">
                  <i class="ti ti-arrow-left" style="font-size:16px" aria-hidden="true"></i> Back
                </button>
                <div style="flex:1;font-size:0.95rem;font-weight:700;color:var(--text,#0f172a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:7px;">
                  <i class="ti ${iconEl}" style="font-size:18px;color:var(--blue,#2a6cf6);flex-shrink:0" aria-hidden="true"></i>
                  ${data.filename}
                </div>
                <a href="${data.dataurl}"
                   download="${data.filename}"
                   class="download-btn">
                    <i class="ti ti-download" style="font-size:16px" aria-hidden="true"></i>
                    Download
                </a>
            </div>
            ${contentHTML}`;
    } catch (err) {
        console.error("View report error:", err);
        viewerSection.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <p style="color:red;">Cannot connect to server.</p>
                <button class="viewer-back-btn" onclick="goBackToList()">
                  <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Reports
                </button>
            </div>`;
    }
}

function viewReport(id) {
    sessionStorage.setItem("dhas_report_scroll", window.scrollY);
    window.location.hash = `view:${id}`;
    showReportViewer(id);
}

function goBackToList() {
    window.location.hash = "";
    showReportList();
}

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

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.type)) {
        alert("Only PDF, JPG, and PNG files are supported.");
        return;
    }

    if (file.size > 4 * 1024 * 1024) {
        alert("File is too large. Please upload files smaller than 4 MB.");
        return;
    }

    const uploadBtn = document.getElementById("uploadBtn");
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = "Uploading…"; }

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
                    <i class="ti ti-notes big" aria-hidden="true"></i>
                    <p>No reports uploaded yet.<br>Upload your first medical report above.</p>
                </div>`;
            return;
        }

        list.innerHTML = data.data.map(r => {
            const { iconEl } = fileIconEl(r.filetype);
            const dateStr = new Date(r.uploaded_at).toLocaleDateString("en-IN");
            return `
            <div class="report-item">
                <div style="flex:1;min-width:0;">
                    <div class="report-name">
                      <i class="ti ${iconEl}" aria-hidden="true"></i>
                      ${r.filename}
                    </div>
                    <div class="report-date">
                      <i class="ti ti-calendar" aria-hidden="true"></i>
                      ${dateStr} &nbsp;|&nbsp; ${r.filesize}
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                    <button class="view-btn"
                            onclick="viewReport(${r.id})" title="View">
                        <i class="ti ti-eye" aria-hidden="true"></i>
                        View
                    </button>
                    <button class="reminder-delete" onclick="deleteReport(${r.id})" title="Delete">
                      <i class="ti ti-trash" aria-hidden="true"></i>
                      Delete
                    </button>
                </div>
            </div>
        `}).join("");

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

/**
 * Returns { iconEl, iconLabel } — Tabler icon class names based on MIME type
 */
function fileIconEl(type) {
    if (!type)                          return { iconEl: "ti-file",       iconLabel: "File" };
    if (type === "application/pdf")     return { iconEl: "ti-file-type-pdf", iconLabel: "PDF" };
    if (type.startsWith("image/"))      return { iconEl: "ti-photo",      iconLabel: "Image" };
    return { iconEl: "ti-file", iconLabel: "File" };
}