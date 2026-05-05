// ============================================
// DHAS - symptom.js
// Collects selected symptoms, saves, redirects
// ============================================

const ALL_SYMPTOMS = [
  "fever","cold","headache","cough","fatigue",
  "body_pain","sore_throat","nausea","diarrhea",
  "loss_of_taste","chest_pain","breathlessness"
];

// Toggle checked state on click
function toggleCheck(el, id) {
  const cb = document.getElementById(id);
  cb.checked = !cb.checked;
  el.classList.toggle("checked", cb.checked);
  updateCount();
}

// Update selected count display
function updateCount() {
  const selected = ALL_SYMPTOMS.filter(s => {
    const el = document.getElementById(s);
    return el && el.checked;
  });
  const display = document.getElementById("selectedCount");
  if (display) {
    display.textContent = selected.length > 0
      ? `${selected.length} symptom(s) selected`
      : "No symptoms selected yet";
  }
}

// Submit symptoms
function submitSymptoms() {
  const selected = ALL_SYMPTOMS.filter(s => {
    const el = document.getElementById(s);
    return el && el.checked;
  });

  if (selected.length === 0) {
    alert("Please select at least one symptom.");
    return;
  }

  localStorage.setItem("dhas_symptoms", JSON.stringify(selected));
  window.location.href = "results.html";
}

// Init count display
updateCount();