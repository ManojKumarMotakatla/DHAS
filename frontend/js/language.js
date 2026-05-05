// ============================================
// DHAS - language.js
// Language selection and persistence
// ============================================

window.onload = function () {
  const saved = localStorage.getItem("dhas_language");
  if (saved) {
    highlightActive(saved);
  }
};

function setLanguage(lang) {
  localStorage.setItem("dhas_language", lang);
  highlightActive(lang);

  const msg = document.getElementById("selectedLangMsg");
  msg.style.display = "block";
  msg.textContent = "✅ Language set to " + lang + ". Changes will apply on next update.";
}

function highlightActive(lang) {
  const langs = ["English", "Hindi", "Telugu"];
  langs.forEach(l => {
    const btn = document.getElementById("btn-" + l);
    if (btn) btn.classList.toggle("active", l === lang);
  });
}