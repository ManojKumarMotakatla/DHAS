// ── Symptom → Condition logic ──
const CONDITION_MAP = {
  covid_like:  { label: "COVID-19 Like Illness", emoji: "🦠", desc: "Your symptoms resemble a COVID-like viral illness.", severity: "moderate" },
  flu:         { label: "Flu (Influenza)",        emoji: "🤒", desc: "Your symptoms are consistent with seasonal flu.",   severity: "moderate" },
  viral_fever: { label: "Viral Fever",            emoji: "🌡️", desc: "You likely have a viral fever infection.",          severity: "mild"     },
  common_cold: { label: "Common Cold",            emoji: "🤧", desc: "Symptoms suggest a common cold.",                  severity: "mild"     },
  gastro:      { label: "Diarrhea / Gastro",      emoji: "🚽", desc: "You may have a gastrointestinal infection.",       severity: "mild"     },
  headache:    { label: "Headache / Migraine",    emoji: "🤕", desc: "Your main issue appears to be headache or migraine.", severity: "mild"  },
  sore_throat: { label: "Sore Throat",            emoji: "🗣️", desc: "Your symptoms point to throat irritation or infection.", severity: "mild" },
  nausea:      { label: "Nausea / Vomiting",      emoji: "🤢", desc: "You seem to be experiencing nausea or vomiting.", severity: "mild"     },
  general:     { label: "General Illness",        emoji: "🏥", desc: "Non-specific symptoms detected. Rest and stay hydrated.", severity: "mild" },
};

function diagnose(symptoms) {
  const s = symptoms;
  const has = (...keys) => keys.every(k => s.includes(k));
  const any = (...keys) => keys.some(k => s.includes(k));

  if (has('fever') && has('cough') && has('loss_of_taste')) return 'covid_like';
  if (has('fever') && has('body_pain') && has('cough') && any('headache','fatigue')) return 'flu';
  if (has('fever') && any('cold','cough') && has('sore_throat')) return 'common_cold';
  if (has('fever') && any('fatigue','body_pain') && !any('cough','cold')) return 'viral_fever';
  if (any('diarrhea','nausea') && any('fever','fatigue')) return 'gastro';
  if (has('nausea') && !any('fever','cough')) return 'nausea';
  if (has('sore_throat') && !has('fever')) return 'sore_throat';
  if (has('headache') && !any('fever','cough','cold')) return 'headache';
  if (any('fever','cough','cold','fatigue')) return 'viral_fever';
  return 'general';
}

// ── Toggle checkbox ──
function toggleCheck(el, id) {
  const cb = document.getElementById(id);
  cb.checked = !cb.checked;
  el.classList.toggle('checked', cb.checked);
  updateCount();
}

function updateCount() {
  const checked = document.querySelectorAll('#symptomList input[type=checkbox]:checked').length;
  const el = document.getElementById('selectedCount');
  if (el) {
    el.textContent = checked > 0
      ? `${checked} symptom${checked > 1 ? 's' : ''} selected`
      : '';
  }
}

// ── Submit ──
function submitSymptoms() {
  const checked = [...document.querySelectorAll('#symptomList input[type=checkbox]:checked')]
    .map(cb => cb.value);

  if (checked.length === 0) {
    alert('Please select at least one symptom.');
    return;
  }

  const conditionKey = diagnose(checked);
  const condition    = CONDITION_MAP[conditionKey];

  // Save for symptom_diet.html and symptom_remedies.html
  localStorage.setItem('dhas_symptom_condition', conditionKey);

  // Show result panel
  showResult(condition, conditionKey, checked);
}

// ── Show Result ──
function showResult(condition, key, symptoms) {
  // Hide the symptom list UI
  document.getElementById('symptomList').style.display  = 'none';
  document.getElementById('selectedCount').style.display = 'none';

  // Hide the two action buttons
  document.querySelectorAll('.btn-dhas').forEach(b => b.style.display = 'none');

  // Hide the page title & alert if present
  const title = document.querySelector('.page-title');
  const alert = document.querySelector('.dhas-alert');
  if (title) title.style.display = 'none';
  if (alert) alert.style.display = 'none';

  // Build severity badge color
  const sevColor = { mild: '#10b981', moderate: '#f59e0b', severe: '#ef4444' };
  const sevLabel = { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };
  const color = sevColor[condition.severity] || '#10b981';
  const sev   = sevLabel[condition.severity] || 'Mild';

  // Inject result card
  const wrap = document.querySelector('.page-wrap');
  const card = document.createElement('div');
  card.id = 'resultPanel';
  card.innerHTML = `
    <style>
      .res-hero {
        background: linear-gradient(135deg, #0f172a, #1e3a5f);
        border-radius: 20px;
        padding: 26px 20px 22px;
        margin-bottom: 16px;
        text-align: center;
        position: relative;
        overflow: hidden;
        animation: rFadeIn 0.4s ease;
      }
      .res-hero::before {
        content:'';
        position:absolute; inset:0;
        background: radial-gradient(circle at 70% 30%, rgba(37,99,235,0.35), transparent 65%);
      }
      @keyframes rFadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

      .res-emoji  { font-size: 3rem; display:block; margin-bottom:10px; position:relative; }
      .res-title  { font-family:'Playfair Display',serif; color:#fff; font-size:1.55rem; font-weight:900; margin-bottom:6px; position:relative; }
      .res-desc   { color:rgba(255,255,255,0.65); font-size:0.85rem; position:relative; line-height:1.5; margin-bottom:14px; }
      .res-sev    {
        display:inline-flex; align-items:center; gap:6px;
        padding:5px 14px; border-radius:50px;
        font-size:0.78rem; font-weight:800; letter-spacing:0.5px;
        position:relative;
      }
      .res-sev-dot { width:7px; height:7px; border-radius:50%; }

      .res-symptoms {
        background: rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 10px 14px;
        margin-top: 12px;
        position: relative;
      }
      .res-sym-label { color:rgba(255,255,255,0.45); font-size:0.72rem; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; margin-bottom:6px; }
      .res-sym-tags  { display:flex; flex-wrap:wrap; gap:6px; }
      .res-sym-tag   {
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius:50px;
        padding:3px 10px;
        color:rgba(255,255,255,0.8);
        font-size:0.78rem; font-weight:600;
      }

      .res-actions { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; animation: rFadeIn 0.5s ease; }

      .res-action-btn {
        display:flex; align-items:center; gap:16px;
        padding:18px 20px;
        border-radius:16px;
        border: 2.5px solid var(--border, #e2e8f0);
        background:#fff;
        cursor:pointer;
        transition: all 0.22s;
        text-decoration:none;
        font-family:'DM Sans',sans-serif;
      }
      .res-action-btn:hover { transform:translateX(4px); }
      .res-action-btn.diet:hover   { border-color:#2563eb; background:#eff6ff; }
      .res-action-btn.remedy:hover { border-color:#10b981; background:#f0fdf4; }

      .rab-icon {
        width:46px; height:46px; border-radius:13px;
        display:flex; align-items:center; justify-content:center;
        font-size:1.5rem; flex-shrink:0;
      }
      .rab-icon.diet   { background:linear-gradient(135deg,#dbeafe,#bfdbfe); }
      .rab-icon.remedy { background:linear-gradient(135deg,#d1fae5,#a7f3d0); }

      .rab-text .rab-label { font-weight:800; font-size:0.98rem; color:#1e293b; }
      .rab-text .rab-sub   { font-size:0.78rem; color:#94a3b8; margin-top:2px; }
      .rab-arrow { margin-left:auto; color:#94a3b8; font-size:1.2rem; transition:transform 0.2s; }
      .res-action-btn:hover .rab-arrow { transform:translateX(4px); }

      .res-back {
        display:inline-flex; align-items:center; gap:8px;
        padding:11px 22px; border-radius:13px;
        border:2px solid #e2e8f0; background:#fff;
        color:#1e293b; font-weight:700; font-size:0.87rem;
        cursor:pointer; width:100%; justify-content:center;
        transition:all 0.2s; font-family:'DM Sans',sans-serif;
      }
      .res-back:hover { border-color:#2563eb; color:#2563eb; background:#eff6ff; }
    </style>

    <!-- Result Hero -->
    <div class="res-hero">
      <span class="res-emoji">${condition.emoji}</span>
      <div class="res-title">${condition.label}</div>
      <div class="res-desc">${condition.desc}</div>
      <span class="res-sev" style="background:${color}22;border:1.5px solid ${color}55;color:${color};">
        <span class="res-sev-dot" style="background:${color};"></span>
        ${sev} Severity
      </span>
      <div class="res-symptoms">
        <div class="res-sym-label">Symptoms you reported</div>
        <div class="res-sym-tags">
          ${symptoms.map(s => `<span class="res-sym-tag">${s.replace(/_/g,' ')}</span>`).join('')}
        </div>
      </div>
    </div>

    <!-- Action Buttons → go to symptom-specific pages -->
    <div class="res-actions">
      <a href="symptom_diet.html" class="res-action-btn diet">
        <div class="rab-icon diet">🥗</div>
        <div class="rab-text">
          <div class="rab-label">View Diet Plan</div>
          <div class="rab-sub">Foods to eat & avoid for ${condition.label}</div>
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

    <!-- Check Again -->
    <button class="res-back" onclick="resetSymptoms()">← Check Again</button>
  `;

  wrap.appendChild(card);
}

// ── Reset ──
function resetSymptoms() {
  document.getElementById('resultPanel').remove();
  document.getElementById('symptomList').style.display  = 'block';
  document.getElementById('selectedCount').style.display = 'block';

  const title = document.querySelector('.page-title');
  const alert = document.querySelector('.dhas-alert');
  if (title) title.style.display = '';
  if (alert) alert.style.display = '';

  document.querySelectorAll('.btn-dhas').forEach(b => b.style.display = '');
  document.querySelectorAll('#symptomList input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('.symptom-item')?.classList.remove('checked');
  });
  updateCount();
}