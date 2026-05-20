// ============================================
// DHAS - symptom.js
// Symptom checker — saves to DB + localStorage
// ============================================

const BASE_URL = "http://localhost:3006";

// ── localStorage keys (single source of truth) ──
const LS_SYMPTOMS  = "dhas_symptoms";        // array of checked symptom values
const LS_CONDITION = "dhas_symptom_condition"; // condition key string

// ── Get logged-in user ──────────────────────────────────────────
function getUser() {
    try { return JSON.parse(localStorage.getItem("dhas_user")); } catch { return null; }
}

// ── Symptom → Condition logic ───────────────────────────────────
const CONDITION_MAP = {
    covid_like:  { label: "COVID-19 Like Illness", emoji: "🦠", desc: "Your symptoms resemble a COVID-like viral illness.", severity: "moderate", severityLabel: "Moderate" },
    flu:         { label: "Flu (Influenza)",        emoji: "🤒", desc: "Your symptoms are consistent with seasonal flu.",   severity: "moderate", severityLabel: "Moderate" },
    viral_fever: { label: "Viral Fever",            emoji: "🌡️", desc: "You likely have a viral fever infection.",          severity: "mild",     severityLabel: "Mild"     },
    common_cold: { label: "Common Cold",            emoji: "🤧", desc: "Symptoms suggest a common cold.",                  severity: "mild",     severityLabel: "Mild"     },
    gastro:      { label: "Diarrhea / Gastro",      emoji: "🚽", desc: "You may have a gastrointestinal infection.",       severity: "mild",     severityLabel: "Mild"     },
    headache:    { label: "Headache / Migraine",    emoji: "🤕", desc: "Your main issue appears to be headache or migraine.", severity: "mild",  severityLabel: "Mild"     },
    sore_throat: { label: "Sore Throat",            emoji: "🗣️", desc: "Your symptoms point to throat irritation or infection.", severity: "mild", severityLabel: "Mild"  },
    nausea:      { label: "Nausea / Vomiting",      emoji: "🤢", desc: "You seem to be experiencing nausea or vomiting.", severity: "mild",     severityLabel: "Mild"     },
    respiratory: { label: "Respiratory Distress",   emoji: "😤", desc: "Chest pain and breathlessness can be serious. Seek immediate attention.", severity: "severe", severityLabel: "High" },
    general:     { label: "General Illness",        emoji: "🏥", desc: "Non-specific symptoms detected. Rest and stay hydrated.", severity: "mild", severityLabel: "Mild" },
};

function diagnose(symptoms) {
    const has = (...keys) => keys.every(k => symptoms.includes(k));
    const any = (...keys) => keys.some(k => symptoms.includes(k));

    if (has("chest_pain") && any("breathlessness","cough"))         return "respiratory";
    if (has("fever","cough","loss_of_taste"))                        return "covid_like";
    if (has("fever","body_pain","cough") && any("headache","fatigue")) return "flu";
    if (has("fever") && any("cold","cough") && has("sore_throat"))  return "common_cold";
    if (has("fever") && any("fatigue","body_pain") && !any("cough","cold")) return "viral_fever";
    if (any("diarrhea","nausea") && any("fever","fatigue"))         return "gastro";
    if (has("nausea") && !any("fever","cough"))                     return "nausea";
    if (has("sore_throat") && !has("fever"))                        return "sore_throat";
    if (has("headache") && !any("fever","cough","cold"))            return "headache";
    if (any("fever","cough","cold","fatigue"))                      return "viral_fever";
    return "general";
}

// ── Toggle checkbox ─────────────────────────────────────────────
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

// ── Submit ──────────────────────────────────────────────────────
async function submitSymptoms() {
    const checked = [...document.querySelectorAll("#symptomList input[type=checkbox]:checked")]
        .map(cb => cb.value);

    if (checked.length === 0) {
        alert("Please select at least one symptom.");
        return;
    }

    const conditionKey = diagnose(checked);
    const condition    = CONDITION_MAP[conditionKey];

    // ── Save to localStorage (for severity.js / diet / remedies pages) ──
    localStorage.setItem(LS_SYMPTOMS,  JSON.stringify(checked));
    localStorage.setItem(LS_CONDITION, conditionKey);

    // ── Save to DB (non-blocking — don't wait for response) ──────
    const user = getUser();
    if (user) {
        saveSymptomsToDB(user.id, checked, condition.label, condition.severityLabel)
            .catch(err => console.warn("DB save failed (non-critical):", err));
    }

    // ── Show result UI immediately ────────────────────────────────
    showResult(condition, conditionKey, checked);
}

// ── POST symptoms to backend ────────────────────────────────────
async function saveSymptomsToDB(user_id, symptoms, condition_name, severity) {
    const res = await fetch(`${BASE_URL}/symptoms/save`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id, symptoms, condition_name, severity })
    });
    const data = await res.json();
    if (!data.success) console.warn("symptom save:", data.message);
    return data;
}

// ── Show Result ─────────────────────────────────────────────────
function showResult(condition, key, symptoms) {
    document.getElementById("symptomList").style.display   = "none";
    document.getElementById("selectedCount").style.display = "none";
    document.querySelectorAll(".btn-dhas").forEach(b => b.style.display = "none");

    const title = document.querySelector(".page-title");
    const alert = document.querySelector(".dhas-alert");
    if (title) title.style.display = "none";
    if (alert) alert.style.display = "none";

    const sevColor = { mild: "#10b981", moderate: "#f59e0b", severe: "#ef4444" };
    const color    = sevColor[condition.severity] || "#10b981";

    const wrap = document.querySelector(".page-wrap");
    const card = document.createElement("div");
    card.id = "resultPanel";
    card.innerHTML = `
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
            }
            @keyframes rFadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            .res-emoji  { font-size:3rem; display:block; margin-bottom:10px; position:relative; }
            .res-title  { font-family:'Playfair Display',serif; color:#fff; font-size:1.55rem; font-weight:900; margin-bottom:6px; position:relative; }
            .res-desc   { color:rgba(255,255,255,0.65); font-size:0.85rem; position:relative; line-height:1.5; margin-bottom:14px; }
            .res-sev    { display:inline-flex; align-items:center; gap:6px; padding:5px 14px; border-radius:50px; font-size:0.78rem; font-weight:800; letter-spacing:0.5px; position:relative; }
            .res-sev-dot { width:7px; height:7px; border-radius:50%; }
            .res-symptoms { background:rgba(255,255,255,0.07); border-radius:12px; padding:10px 14px; margin-top:12px; position:relative; }
            .res-sym-label { color:rgba(255,255,255,0.45); font-size:0.72rem; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; margin-bottom:6px; }
            .res-sym-tags  { display:flex; flex-wrap:wrap; gap:6px; }
            .res-sym-tag   { background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.18); border-radius:50px; padding:3px 10px; color:rgba(255,255,255,0.8); font-size:0.78rem; font-weight:600; }
            .res-actions { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; animation: rFadeIn 0.5s ease; }
            .res-action-btn { display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:16px; border:2.5px solid var(--border,#e2e8f0); background:#fff; cursor:pointer; transition:all 0.22s; text-decoration:none; font-family:'DM Sans',sans-serif; }
            .res-action-btn:hover { transform:translateX(4px); }
            .res-action-btn.diet:hover   { border-color:#2563eb; background:#eff6ff; }
            .res-action-btn.remedy:hover { border-color:#10b981; background:#f0fdf4; }
            .res-action-btn.history:hover { border-color:#8b5cf6; background:#f5f3ff; }
            .rab-icon { width:46px; height:46px; border-radius:13px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0; }
            .rab-icon.diet    { background:linear-gradient(135deg,#dbeafe,#bfdbfe); }
            .rab-icon.remedy  { background:linear-gradient(135deg,#d1fae5,#a7f3d0); }
            .rab-icon.history { background:linear-gradient(135deg,#ede9fe,#ddd6fe); }
            .rab-text .rab-label { font-weight:800; font-size:0.98rem; color:#1e293b; }
            .rab-text .rab-sub   { font-size:0.78rem; color:#94a3b8; margin-top:2px; }
            .rab-arrow { margin-left:auto; color:#94a3b8; font-size:1.2rem; transition:transform 0.2s; }
            .res-action-btn:hover .rab-arrow { transform:translateX(4px); }
            .res-back { display:inline-flex; align-items:center; gap:8px; padding:11px 22px; border-radius:13px; border:2px solid #e2e8f0; background:#fff; color:#1e293b; font-weight:700; font-size:0.87rem; cursor:pointer; width:100%; justify-content:center; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
            .res-back:hover { border-color:#2563eb; color:#2563eb; background:#eff6ff; }
        </style>

        <div class="res-hero">
            <span class="res-emoji">${condition.emoji}</span>
            <div class="res-title">${condition.label}</div>
            <div class="res-desc">${condition.desc}</div>
            <span class="res-sev" style="background:${color}22;border:1.5px solid ${color}55;color:${color};">
                <span class="res-sev-dot" style="background:${color};"></span>
                ${condition.severityLabel} Severity
            </span>
            <div class="res-symptoms">
                <div class="res-sym-label">Symptoms you reported</div>
                <div class="res-sym-tags">
                    ${symptoms.map(s => `<span class="res-sym-tag">${s.replace(/_/g, " ")}</span>`).join("")}
                </div>
            </div>
        </div>

        <div class="res-actions">
            <a href="symptom_diet.html" class="res-action-btn diet">
                <div class="rab-icon diet">🥗</div>
                <div class="rab-text">
                    <div class="rab-label">View Diet Plan</div>
                    <div class="rab-sub">Foods to eat &amp; avoid for ${condition.label}</div>
                </div>
                <span class="rab-arrow">›</span>
            </a>
            <a href="symptom_remedies.html" class="res-action-btn remedy">
                <div class="rab-icon remedy">🌿</div>
                <div class="rab-text">
                    <div class="rab-label">Home Remedies</div>
                    <div class="rab-sub">Natural relief steps for ${condition.label}</div>
                </div>
                <span class="rab-arrow">›</span>
            </a>
        </div>

        <button class="res-back" onclick="resetSymptoms()">← Check Again</button>
    `;

    wrap.appendChild(card);
}

// ── Reset ───────────────────────────────────────────────────────
function resetSymptoms() {
    document.getElementById("resultPanel").remove();
    document.getElementById("symptomList").style.display   = "block";
    document.getElementById("selectedCount").style.display = "block";

    const title = document.querySelector(".page-title");
    const alert = document.querySelector(".dhas-alert");
    if (title) title.style.display = "";
    if (alert) alert.style.display = "";

    document.querySelectorAll(".btn-dhas").forEach(b => b.style.display = "");
    document.querySelectorAll("#symptomList input[type=checkbox]").forEach(cb => {
        cb.checked = false;
        cb.closest(".symptom-item")?.classList.remove("checked");
    });
    updateCount();
}