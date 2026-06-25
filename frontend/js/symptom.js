
// ============================================
// DHAS - symptom.js
// Symptom checker — saves to DB + localStorage
// ============================================

const BASE_URL = window.API_BASE || "http://localhost:3007";

const LS_SYMPTOMS  = "dhas_symptoms";
const LS_CONDITION = "dhas_symptom_condition";

function getUser() {
    try { return JSON.parse(localStorage.getItem("dhas_user")); } catch { return null; }
}

// ── In-page toast ──────────────────────────────────────────────
let _toastTimer = null;
function showToast(text, type = "success", duration = 4500) {
    let toast = document.getElementById("dhasPageToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "dhasPageToast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);

        const style = document.createElement("style");
        style.textContent = `
            #dhasPageToast {
                position: fixed; bottom: 24px; left: 20px; z-index: 99999;
                max-width: 340px; min-width: 240px; padding: 13px 18px;
                border-radius: 14px; font-size: 0.87rem; font-weight: 600;
                line-height: 1.5; display: none; align-items: flex-start;
                gap: 10px; box-shadow: 0 6px 28px rgba(0,0,0,0.18);
                font-family: 'DM Sans', sans-serif;
                animation: dhasToastIn 0.3s cubic-bezier(.4,0,.2,1);
            }
            #dhasPageToast.success { background:#d1fae5; border:1.5px solid #86efac; color:#166534; }
            #dhasPageToast.error   { background:#fee2e2; border:1.5px solid #fca5a5; color:#991b1b; }
            html.dark #dhasPageToast.success, body.dark #dhasPageToast.success { background:#052e16; border-color:#166534; color:#86efac; }
            html.dark #dhasPageToast.error,   body.dark #dhasPageToast.error   { background:#450a0a; border-color:#991b1b; color:#fca5a5; }
            @keyframes dhasToastIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            #dhasPageToast .toast-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
            #dhasPageToast .toast-dismiss { margin-left:auto; background:none; border:none; cursor:pointer; color:inherit; opacity:0.6; font-size:14px; padding:0 0 0 8px; flex-shrink:0; }
            #dhasPageToast .toast-dismiss:hover { opacity:1; }
        `;
        document.head.appendChild(style);
    }

    const iconClass = type === "success" ? "ti-circle-check" : "ti-alert-circle";
    toast.className = type;
    toast.innerHTML = `<i class="ti ${iconClass} toast-icon" aria-hidden="true"></i><span>${text}</span><button class="toast-dismiss" onclick="this.parentElement.style.display='none'" aria-label="Dismiss"><i class="ti ti-x"></i></button>`;
    toast.style.display = "flex";
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { toast.style.display = "none"; }, duration);
}

// ── Condition Map ──────────────────────────────────────────────
// severityLabel MUST be exactly "High", "Medium", or "Low"
// These exact strings are saved to the DB and read back by symptom_history.html
// DO NOT use "Moderate", "Mild", "Severe" — only these three values
const CONDITION_MAP = {
    covid_like: {
        label: "COVID-19 Like Illness",
        icon: "ti-virus",
        iconBg: "rgba(239,68,68,0.15)",
        iconColor: "#ef4444",
        desc: "Your symptoms resemble a COVID-like viral illness.",
        severity: "severe",
        severityLabel: "High"
    },
    flu: {
        label: "Flu (Influenza)",
        icon: "ti-thermometer",
        iconBg: "rgba(249,115,22,0.15)",
        iconColor: "#f97316",
        desc: "Your symptoms are consistent with seasonal flu.",
        severity: "moderate",
        severityLabel: "High"
    },
    viral_fever: {
        label: "Viral Fever",
        icon: "ti-temperature",
        iconBg: "rgba(234,179,8,0.15)",
        iconColor: "#eab308",
        desc: "You likely have a viral fever infection.",
        severity: "mild",
        severityLabel: "Medium"
    },
    common_cold: {
        label: "Common Cold",
        icon: "ti-cloud-snow",
        iconBg: "rgba(14,165,233,0.15)",
        iconColor: "#0ea5e9",
        desc: "Symptoms suggest a common cold.",
        severity: "mild",
        severityLabel: "Low"
    },
    gastro: {
        label: "Diarrhea / Gastro",
        icon: "ti-droplet",
        iconBg: "rgba(20,184,166,0.15)",
        iconColor: "#14b8a6",
        desc: "You may have a gastrointestinal infection.",
        severity: "mild",
        severityLabel: "Medium"
    },
    headache: {
        label: "Headache / Migraine",
        icon: "ti-brain",
        iconBg: "rgba(139,92,246,0.15)",
        iconColor: "#8b5cf6",
        desc: "Your main issue appears to be headache or migraine.",
        severity: "mild",
        severityLabel: "Medium"
    },
    sore_throat: {
        label: "Sore Throat",
        icon: "ti-microphone",
        iconBg: "rgba(236,72,153,0.15)",
        iconColor: "#ec4899",
        desc: "Your symptoms point to throat irritation or infection.",
        severity: "mild",
        severityLabel: "Low"
    },
    nausea: {
        label: "Nausea / Vomiting",
        icon: "ti-mood-sick",
        iconBg: "rgba(16,185,129,0.15)",
        iconColor: "#10b981",
        desc: "You seem to be experiencing nausea or vomiting.",
        severity: "mild",
        severityLabel: "Low"
    },
    respiratory: {
        label: "Respiratory Distress",
        icon: "ti-lungs",
        iconBg: "rgba(239,68,68,0.2)",
        iconColor: "#dc2626",
        desc: "Chest pain and breathlessness can be serious. Seek immediate attention.",
        severity: "severe",
        severityLabel: "High"
    },
    general: {
        label: "General Illness",
        icon: "ti-stethoscope",
        iconBg: "rgba(99,102,241,0.15)",
        iconColor: "#6366f1",
        desc: "Non-specific symptoms detected. Rest and stay hydrated.",
        severity: "mild",
        severityLabel: "Low"
    },
};

// ── Diagnosis Logic ────────────────────────────────────────────
function diagnose(symptoms) {
    const has = (...keys) => keys.every(k => symptoms.includes(k));
    const any = (...keys) => keys.some(k => symptoms.includes(k));

    if (has("chest_pain") && any("breathlessness", "cough"))              return "respiratory";
    if (has("fever", "cough", "loss_of_taste"))                           return "covid_like";
    if (has("fever", "body_pain", "cough") && any("headache", "fatigue")) return "flu";
    if (has("fever") && any("cold", "cough") && has("sore_throat"))       return "common_cold";
    if (has("fever") && any("fatigue", "body_pain") && !any("cough", "cold")) return "viral_fever";
    if (any("diarrhea", "nausea") && any("fever", "fatigue"))             return "gastro";
    if (has("nausea") && !any("fever", "cough"))                          return "nausea";
    if (has("sore_throat") && !has("fever"))                              return "sore_throat";
    if (has("headache") && !any("fever", "cough", "cold"))                return "headache";
    if (any("fever", "cough", "cold", "fatigue"))                         return "viral_fever";
    return "general";
}

// ── Symptom Labels ─────────────────────────────────────────────
const SYMPTOM_LABELS = {
    fever:          "Fever",
    cold:           "Cold / Runny Nose",
    headache:       "Headache",
    cough:          "Cough",
    fatigue:        "Fatigue",
    body_pain:      "Body Pain",
    sore_throat:    "Sore Throat",
    nausea:         "Nausea / Vomiting",
    diarrhea:       "Diarrhea",
    loss_of_taste:  "Loss of Taste / Smell",
    chest_pain:     "Chest Pain",
    breathlessness: "Breathlessness"
};

// ── Toggle checkbox ────────────────────────────────────────────
function toggleCheck(el, id) {
    const cb = document.getElementById(id);
    cb.checked = !cb.checked;
    el.classList.toggle("checked", cb.checked);
    updateCount();
}

function updateCount() {
    const checked = document.querySelectorAll("#symptomList input[type=checkbox]:checked").length;
    const el = document.getElementById("selectedCount");
    if (el) {
        el.textContent = checked > 0
            ? `${checked} symptom${checked > 1 ? "s" : ""} selected`
            : "";
    }
}

// ── Submit Symptoms ────────────────────────────────────────────
async function submitSymptoms() {
    const checked = [...document.querySelectorAll("#symptomList input[type=checkbox]:checked")]
        .map(cb => cb.value);

    if (checked.length === 0) {
        showToast("Please select at least one symptom.", "error");
        return;
    }

    const conditionKey = diagnose(checked);
    const condition    = CONDITION_MAP[conditionKey];

    localStorage.setItem(LS_SYMPTOMS,  JSON.stringify(checked));
    localStorage.setItem(LS_CONDITION, conditionKey);

    const user = getUser();
    if (user) {
        saveSymptomsToDB(user.id, checked, condition.label, condition.severityLabel)
            .catch(err => console.warn("DB save failed (non-critical):", err));
    }

    showResult(condition, conditionKey, checked);
}

// ── Save to DB ─────────────────────────────────────────────────
// Saves condition.label as condition_name and condition.severityLabel as severity
// severityLabel is always exactly "High", "Medium", or "Low"
async function saveSymptomsToDB(user_id, symptoms, condition_name, severity) {
    const res = await fetch(`${BASE_URL}/symptoms/save`, {
        method:  "POST",
        headers: window.getAuthHeaders(),
        body:    JSON.stringify({ user_id, symptoms, condition_name, severity })
    });
    const data = await res.json();
    if (!data.success) console.warn("symptom save:", data.message);
    return data;
}

// ── Show Result Card ───────────────────────────────────────────
function showResult(condition, key, symptoms) {
    document.getElementById("symptomList").style.display   = "none";
    document.getElementById("selectedCount").style.display = "none";
    document.querySelectorAll(".btn-dhas").forEach(b => b.style.display = "none");

    const title   = document.querySelector(".page-title");
    const alertEl = document.querySelector(".dhas-alert");
    if (title)   title.style.display   = "none";
    if (alertEl) alertEl.style.display = "none";

    const sevColor = {
        High:   "#ef4444",
        Medium: "#f59e0b",
        Low:    "#10b981"
    };
    const color = sevColor[condition.severityLabel] || "#10b981";

    const wrap = document.querySelector(".page-wrap");
    const card = document.createElement("div");
    card.id = "resultPanel";

    card.innerHTML = `
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
        <style>
            .res-hero {
                background: linear-gradient(135deg, #0f172a, #1e3a5f);
                border-radius: 20px; padding: 26px 20px 22px;
                margin-bottom: 16px; text-align: center;
                position: relative; overflow: hidden;
                animation: rFadeIn 0.4s ease;
            }
            .res-hero::before {
                content:''; position:absolute; inset:0;
                background: radial-gradient(circle at 70% 30%, rgba(37,99,235,0.35), transparent 65%);
                pointer-events: none;
            }
            @keyframes rFadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            .res-icon-wrap {
                width: 72px; height: 72px; border-radius: 22px;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 14px; position: relative;
                border: 2px solid rgba(255,255,255,0.15);
            }
            .res-icon-wrap i { font-size: 34px; }
            .res-title  { color:#fff; font-size:1.55rem; font-weight:800; margin-bottom:6px; position:relative; font-family:'Fraunces',serif; }
            .res-desc   { color:rgba(255,255,255,0.65); font-size:0.85rem; position:relative; line-height:1.5; margin-bottom:14px; }
            .res-sev    { display:inline-flex; align-items:center; gap:6px; padding:5px 14px; border-radius:50px; font-size:0.78rem; font-weight:800; letter-spacing:0.5px; position:relative; }
            .res-sev i  { font-size: 10px; }
            .res-symptoms { background:rgba(255,255,255,0.07); border-radius:12px; padding:10px 14px; margin-top:12px; position:relative; }
            .res-sym-label { color:rgba(255,255,255,0.45); font-size:0.72rem; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; margin-bottom:6px; }
            .res-sym-tags  { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
            .res-sym-tag   { background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.18); border-radius:50px; padding:3px 10px; color:rgba(255,255,255,0.8); font-size:0.78rem; font-weight:600; display:inline-flex; align-items:center; gap:5px; }
            .res-sym-tag i { font-size: 11px; }
            .res-actions { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; animation: rFadeIn 0.5s ease; }
            .res-action-btn { display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:16px; border:2px solid var(--border,#e2e8f0); background:var(--surface,#fff); cursor:pointer; transition:all 0.22s; text-decoration:none; font-family:'DM Sans',sans-serif; }
            html.dark .res-action-btn, body.dark .res-action-btn { background:#111c3c; border-color:#1e2e58; }
            .res-action-btn:hover { transform:translateX(4px); }
            .res-action-btn.diet:hover   { border-color:#2563eb; background:#eff6ff; }
            .res-action-btn.remedy:hover { border-color:#10b981; background:#f0fdf4; }
            html.dark .res-action-btn.diet:hover   { background:rgba(37,99,235,0.12); }
            html.dark .res-action-btn.remedy:hover { background:rgba(16,185,129,0.12); }
            .rab-icon { width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .rab-icon i { font-size: 24px; }
            .rab-icon.diet   { background:linear-gradient(135deg,#dbeafe,#bfdbfe); color:#1e40af; }
            .rab-icon.remedy { background:linear-gradient(135deg,#d1fae5,#a7f3d0); color:#065f46; }
            .rab-text .rab-label { font-weight:800; font-size:0.98rem; color:var(--text,#1e293b); }
            .rab-text .rab-sub   { font-size:0.78rem; color:var(--text-muted,#94a3b8); margin-top:2px; }
            html.dark .rab-text .rab-label { color:#e8efff; }
            .rab-arrow { margin-left:auto; color:#94a3b8; font-size:1.1rem; transition:transform 0.2s; display:flex; align-items:center; }
            .rab-arrow i { font-size: 20px; }
            .res-action-btn:hover .rab-arrow { transform:translateX(4px); }
            .res-back { display:inline-flex; align-items:center; gap:8px; padding:11px 22px; border-radius:13px; border:2px solid var(--border,#e2e8f0); background:var(--surface,#fff); color:var(--text,#1e293b); font-weight:700; font-size:0.87rem; cursor:pointer; width:100%; justify-content:center; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
            html.dark .res-back { background:#111c3c; border-color:#1e2e58; color:#e8efff; }
            .res-back:hover { border-color:#2563eb; color:#2563eb; background:#eff6ff; }
            .res-back i { font-size: 16px; }
        </style>

        <div class="res-hero">
            <div class="res-icon-wrap" style="background:${condition.iconBg};">
                <i class="ti ${condition.icon}" style="color:${condition.iconColor};" aria-hidden="true"></i>
            </div>
            <div class="res-title">${condition.label}</div>
            <div class="res-desc">${condition.desc}</div>
            <span class="res-sev" style="background:${color}22;border:1.5px solid ${color}55;color:${color};">
                <i class="ti ti-point-filled" aria-hidden="true"></i>
                ${condition.severityLabel} Severity
            </span>
            <div class="res-symptoms">
                <div class="res-sym-label">Symptoms you reported</div>
                <div class="res-sym-tags">
                    ${symptoms.map(s => `<span class="res-sym-tag"><i class="ti ti-check" aria-hidden="true"></i>${SYMPTOM_LABELS[s] || s.replace(/_/g," ")}</span>`).join("")}
                </div>
            </div>
        </div>

        <div class="res-actions">
            <a href="symptom_diet.html" class="res-action-btn diet">
                <div class="rab-icon diet">
                    <i class="ti ti-salad" aria-hidden="true"></i>
                </div>
                <div class="rab-text">
                    <div class="rab-label">View Diet Plan</div>
                    <div class="rab-sub">Foods to eat &amp; avoid for ${condition.label}</div>
                </div>
                <span class="rab-arrow"><i class="ti ti-chevron-right" aria-hidden="true"></i></span>
            </a>
            <a href="symptom_remedies.html" class="res-action-btn remedy">
                <div class="rab-icon remedy">
                    <i class="ti ti-plant" aria-hidden="true"></i>
                </div>
                <div class="rab-text">
                    <div class="rab-label">Home Remedies</div>
                    <div class="rab-sub">Natural relief steps for ${condition.label}</div>
                </div>
                <span class="rab-arrow"><i class="ti ti-chevron-right" aria-hidden="true"></i></span>
            </a>
        </div>

        <button class="res-back" onclick="resetSymptoms()">
            <i class="ti ti-refresh" aria-hidden="true"></i>
            Check Again
        </button>
    `;

    wrap.appendChild(card);
}

// ── Reset / Check Again ────────────────────────────────────────
function resetSymptoms() {
    const panel = document.getElementById("resultPanel");
    if (panel) panel.remove();

    document.getElementById("symptomList").style.display   = "block";
    document.getElementById("selectedCount").style.display = "block";

    const title   = document.querySelector(".page-title");
    const alertEl = document.querySelector(".dhas-alert");
    if (title)   title.style.display   = "";
    if (alertEl) alertEl.style.display = "";

    document.querySelectorAll(".btn-dhas").forEach(b => b.style.display = "");
    document.querySelectorAll("#symptomList input[type=checkbox]").forEach(cb => {
        cb.checked = false;
        cb.closest(".symptom-item")?.classList.remove("checked");
    });
    updateCount();
}
