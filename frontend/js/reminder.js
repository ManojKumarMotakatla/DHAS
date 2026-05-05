// ============================================
// DHAS - reminder.js
// Medicine reminders with delete support
// ============================================

window.onload = function () {
  displayReminders();
};

function addReminder() {
  const medicine  = document.getElementById("medicine").value.trim();
  const time      = document.getElementById("time").value;
  const frequency = document.getElementById("frequency").value;

  if (!medicine) { alert("Please enter medicine name."); return; }
  if (!time)     { alert("Please select a time."); return; }

  let reminders = JSON.parse(localStorage.getItem("dhas_reminders")) || [];
  reminders.push({ medicine, time, frequency, id: Date.now() });
  localStorage.setItem("dhas_reminders", JSON.stringify(reminders));

  // Clear inputs
  document.getElementById("medicine").value = "";
  document.getElementById("time").value = "";

  displayReminders();
}

function deleteReminder(id) {
  let reminders = JSON.parse(localStorage.getItem("dhas_reminders")) || [];
  reminders = reminders.filter(r => r.id !== id);
  localStorage.setItem("dhas_reminders", JSON.stringify(reminders));
  displayReminders();
}

function displayReminders() {
  const list = document.getElementById("reminderList");
  const reminders = JSON.parse(localStorage.getItem("dhas_reminders")) || [];

  if (reminders.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💊</div>
        <p>No reminders set yet.<br>Add your first medicine reminder above.</p>
      </div>`;
    return;
  }

  list.innerHTML = reminders.map(r => `
    <div class="reminder-item">
      <div>
        <div class="reminder-name">💊 ${r.medicine}</div>
        <div class="reminder-time">🕐 ${formatTime(r.time)} &nbsp;|&nbsp; ${r.frequency}</div>
      </div>
      <button class="reminder-delete" onclick="deleteReminder(${r.id})" title="Delete">🗑️</button>
    </div>
  `).join("");
}

function formatTime(t) {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}