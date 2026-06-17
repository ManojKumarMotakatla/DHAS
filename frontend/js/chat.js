// ============================================================
// frontend/js/chat.js
// Drives chat.html. Works for BOTH patients and doctors — role
// is detected from whichever token/profile is in localStorage.
// Requires: js/config.js loaded first (window.API_BASE), and the
// Socket.IO client script tag loaded before this file.
// ============================================================

(function () {
  "use strict";

  /* ── Identify caller ─────────────────────────────────────── */
  const doctorRaw  = localStorage.getItem("dhas_doctor");
  const patientRaw = localStorage.getItem("dhas_user");

  let ME = null;
  if (doctorRaw) {
    const d = JSON.parse(doctorRaw);
    ME = { role: "doctor", id: d.id, name: "Dr. " + (d.name || ""), token: localStorage.getItem("dhas_doctor_token") };
  } else if (patientRaw) {
    const u = JSON.parse(patientRaw);
    ME = { role: "patient", id: u.id, name: u.name || "You", token: localStorage.getItem("dhas_token") };
  }
  if (!ME || !ME.token) {
    window.location.href = "login.html";
    return;
  }

  const BASE = window.API_BASE;

  function authHeaders() {
    return { "Content-Type": "application/json", "Authorization": "Bearer " + ME.token };
  }
  function authHeadersNoJSON() {
    return { "Authorization": "Bearer " + ME.token };
  }

  /* ── State ───────────────────────────────────────────────── */
  let contacts        = [];
  let activeRoomId     = null;
  let activeContact    = null;
  let oldestLoadedId   = null;
  let typingTimeout     = null;
  let socket            = null;

  /* ── DOM ─────────────────────────────────────────────────── */
  const elShell      = document.getElementById("chatShell");
  const elList       = document.getElementById("contactList");
  const elMessages    = document.getElementById("messageArea");
  const elHeaderName  = document.getElementById("chatPartnerName");
  const elHeaderSub   = document.getElementById("chatPartnerSub");
  const elHeaderAvatar= document.getElementById("chatPartnerAvatar");
  const elComposerWrap= document.getElementById("composerWrap");
  const elInput       = document.getElementById("messageInput");
  const elSendBtn      = document.getElementById("sendBtn");
  const elTypingIndicator = document.getElementById("typingIndicator");
  const elTerminatedBanner = document.getElementById("terminatedBanner");
  const elAttachBtn    = document.getElementById("attachBtn");
  const elAttachMenu    = document.getElementById("attachMenu");
  const elFileInput     = document.getElementById("fileInput");
  const elModalRoot     = document.getElementById("shareModalRoot");

  /* ── Toast ───────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(text, type = "success") {
    const t = document.getElementById("chatToast");
    t.className = type;
    t.textContent = text;
    t.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = "none"; }, 4000);
  }

  function initials(name) {
    return (name || "?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function avatarHTML(avatarUrl, name, size) {
    return avatarUrl
      ? `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:${size === "sm" ? ".85rem" : "1rem"}">${initials(name)}</span>`;
  }

  /* ── Socket setup ────────────────────────────────────────── */
  function connectSocket() {
    socket = io(BASE, { auth: { token: ME.token }, transports: ["websocket", "polling"] });

    socket.on("connect_error", (err) => toast(err.message || "Connection error.", "error"));

    socket.on("new_message", (msg) => {
      if (msg.room_id === activeRoomId) {
        appendMessage(msg);
        scrollToBottom();
        if (msg.sender_type !== ME.role) socket.emit("mark_read", { room_id: activeRoomId });
      }
      bumpContact(msg);
    });

    socket.on("status_update", ({ room_id }) => {
      if (room_id === activeRoomId) updateOutgoingTicks("delivered");
    });
    socket.on("messages_read", ({ room_id, reader }) => {
      if (room_id === activeRoomId && reader !== ME.role) updateOutgoingTicks("read");
    });

    socket.on("typing", ({ room_id, role }) => {
      if (room_id === activeRoomId && role !== ME.role) {
        elTypingIndicator.style.display = "flex";
      }
    });
    socket.on("stop_typing", ({ room_id, role }) => {
      if (room_id === activeRoomId && role !== ME.role) {
        elTypingIndicator.style.display = "none";
      }
    });

    socket.on("contact_update", () => loadContacts(true));

    socket.on("connection_terminated", ({ room_id }) => {
      if (room_id === activeRoomId) {
        elTerminatedBanner.style.display = "flex";
        elComposerWrap.style.display = "none";
      }
      loadContacts(true);
    });
  }

  /* ── Contacts ────────────────────────────────────────────── */
  async function loadContacts(silent) {
    try {
      const res = await fetch(`${BASE}/chat/contacts`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { if (!silent) toast(data.message || "Failed to load chats.", "error"); return; }
      contacts = data.data || [];
      renderContacts();
    } catch (e) {
      if (!silent) toast("Cannot connect to server.", "error");
    }
  }

  function bumpContact(msg) {
    const idx = contacts.findIndex(c => c.room_id === msg.room_id);
    if (idx === -1) { loadContacts(true); return; }
    contacts[idx].last_message      = msg.content || labelForType(msg.message_type);
    contacts[idx].last_message_type = msg.message_type;
    contacts[idx].last_message_at   = msg.created_at;
    if (msg.room_id !== activeRoomId && msg.sender_type !== ME.role) {
      contacts[idx].unread_count = (contacts[idx].unread_count || 0) + 1;
    }
    const [bumped] = contacts.splice(idx, 1);
    contacts.unshift(bumped);
    renderContacts();
  }

  function labelForType(t) {
    return { image: "📷 Photo", pdf: "📄 Document", symptom_share: "🩺 Symptom check shared", report_share: "📁 Report shared" }[t] || "Message";
  }

  function renderContacts() {
    if (!contacts.length) {
      elList.innerHTML = `<div class="empty-contacts">No connected ${ME.role === "doctor" ? "patients" : "doctors"} yet.</div>`;
      return;
    }
    elList.innerHTML = contacts.map(c => {
      const name = ME.role === "doctor" ? c.name : ("Dr. " + c.name);
      const sub  = ME.role === "doctor" ? "" : (c.speciality || "");
      const time = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
      const preview = c.last_message_type && c.last_message_type !== "text" ? labelForType(c.last_message_type) : (c.last_message || "Say hello 👋");
      return `
        <div class="contact-row ${c.room_id === activeRoomId ? "active" : ""}" data-room="${c.room_id}" onclick="DHAS_CHAT.open(${c.room_id})">
          <div class="contact-avatar">${avatarHTML(c.avatar, name, "lg")}</div>
          <div class="contact-info">
            <div class="contact-top"><span class="contact-name">${name}</span><span class="contact-time">${time}</span></div>
            <div class="contact-bottom">
              <span class="contact-preview">${sub ? sub + " · " : ""}${preview}</span>
              ${c.unread_count > 0 ? `<span class="unread-badge">${c.unread_count}</span>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  /* ── Open a conversation ─────────────────────────────────── */
  async function openRoom(roomId) {
    const contact = contacts.find(c => c.room_id === roomId);
    if (!contact) return;

    if (activeRoomId && activeRoomId !== roomId) socket.emit("leave_room");

    activeRoomId   = roomId;
    activeContact  = contact;
    oldestLoadedId = null;
    contact.unread_count = 0;

    elShell.classList.add("show-chat");
    elTerminatedBanner.style.display = "none";
    elComposerWrap.style.display = "flex";
    elTypingIndicator.style.display = "none";

    const name = ME.role === "doctor" ? contact.name : ("Dr. " + contact.name);
    elHeaderName.textContent = name;
    elHeaderSub.textContent  = ME.role === "doctor" ? "Patient" : (contact.speciality || "Doctor");
    elHeaderAvatar.innerHTML = avatarHTML(contact.avatar, name, "lg");

    renderContacts();
    elMessages.innerHTML = `<div class="loading-msgs">Loading conversation…</div>`;

    socket.emit("join_room", { room_id: roomId }, (ack) => {
      if (!ack.success) {
        elTerminatedBanner.style.display = "flex";
        elComposerWrap.style.display = "none";
      }
    });

    try {
      const res  = await fetch(`${BASE}/chat/messages/${roomId}?limit=40`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Failed to load messages.", "error"); return; }
      elMessages.innerHTML = "";
      data.data.forEach(appendMessage);
      if (data.data.length) oldestLoadedId = data.data[0].id;
      scrollToBottom();
      socket.emit("mark_read", { room_id: roomId });
    } catch (e) {
      elMessages.innerHTML = `<div class="loading-msgs">Could not load messages.</div>`;
    }
  }

  function closeRoom() {
    if (activeRoomId) socket.emit("leave_room");
    activeRoomId = null;
    elShell.classList.remove("show-chat");
  }

  /* ── Render a single message bubble ─────────────────────── */
  function appendMessage(m) {
    const mine = m.sender_type === ME.role;
    const time = new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const tickHTML = mine ? `<span class="tick" data-mid="${m.id}">${tickIcon(m.status)}</span>` : "";

    let bodyHTML;
    if (m.message_type === "text") {
      bodyHTML = `<div class="bubble-text">${escapeHTML(m.content)}</div>`;
    } else if (m.message_type === "image") {
      bodyHTML = `<a href="${BASE}${m.file_data}" target="_blank"><img class="bubble-image" src="${BASE}${m.file_data}" alt="${m.file_name}"></a>
                  ${m.content ? `<div class="bubble-caption">${escapeHTML(m.content)}</div>` : ""}`;
    } else if (m.message_type === "pdf") {
      bodyHTML = `<a class="bubble-file" href="${BASE}${m.file_data}" target="_blank">
                    <i class="ti ti-file-type-pdf"></i>
                    <div><div class="bf-name">${m.file_name}</div><div class="bf-size">${m.file_size || ""}</div></div>
                  </a>`;
    } else if (m.message_type === "symptom_share") {
      const meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
      const syms = (meta.symptoms || []).join(", ");
      bodyHTML = `<div class="bubble-card">
            <div class="bc-head"><i class="ti ti-stethoscope"></i> Symptom Check Shared</div>
            <div class="bc-row"><strong>${meta.condition_name || "General"}</strong></div>
            <div class="bc-row">Severity: ${meta.severity || "—"}</div>
            <div class="bc-row" style="color:var(--muted)">${syms}</div>
          </div>`;
    } else if (m.message_type === "report_share") {
      const meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
      bodyHTML = `<div class="bubble-card bubble-card-link" onclick="DHAS_CHAT.openSharedReport(${activeRoomId}, ${meta.report_id})">
            <div class="bc-head"><i class="ti ti-file-report"></i> Medical Report Shared</div>
            <div class="bc-row"><strong>${meta.filename}</strong></div>
            <div class="bc-row" style="color:var(--muted)">Tap to view</div>
          </div>`;
    } else {
      bodyHTML = `<div class="bubble-text">Unsupported message</div>`;
    }

    const row = document.createElement("div");
    row.className = "msg-row " + (mine ? "mine" : "theirs");
    row.innerHTML = `<div class="bubble">${bodyHTML}<div class="bubble-meta">${time} ${tickHTML}</div></div>`;
    elMessages.appendChild(row);
  }

  function tickIcon(status) {
    if (status === "read") return `<i class="ti ti-checks" style="color:#4f8ef9"></i>`;
    if (status === "delivered") return `<i class="ti ti-checks"></i>`;
    return `<i class="ti ti-check"></i>`;
  }
  function updateOutgoingTicks(status) {
    document.querySelectorAll(".tick").forEach(el => { el.innerHTML = tickIcon(status); });
  }

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
  function scrollToBottom() { elMessages.scrollTop = elMessages.scrollHeight; }

  /* ── Sending ─────────────────────────────────────────────── */
  function sendText() {
    const text = elInput.value.trim();
    if (!text || !activeRoomId) return;
    socket.emit("send_message", { room_id: activeRoomId, message_type: "text", content: text }, (ack) => {
      if (!ack.success) toast(ack.message || "Failed to send.", "error");
    });
    elInput.value = "";
    socket.emit("stop_typing");
  }

  elSendBtn.addEventListener("click", sendText);
  elInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });
  elInput.addEventListener("input", () => {
    if (!activeRoomId) return;
    socket.emit("typing");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop_typing"), 1500);
  });

  /* ── Attachment menu ─────────────────────────────────────── */
  elAttachBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    elAttachMenu.classList.toggle("open");
  });
  document.addEventListener("click", () => elAttachMenu.classList.remove("open"));

  document.getElementById("optUploadFile").addEventListener("click", () => { elFileInput.click(); elAttachMenu.classList.remove("open"); });
  document.getElementById("optShareSymptom").addEventListener("click", () => { openSymptomPicker(); elAttachMenu.classList.remove("open"); });
  document.getElementById("optShareReport").addEventListener("click", () => { openReportPicker(); elAttachMenu.classList.remove("open"); });

  elFileInput.addEventListener("change", async () => {
    const file = elFileInput.files[0];
    elFileInput.value = "";
    if (!file || !activeRoomId) return;

    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { toast("Only PDF, JPG, PNG and WEBP files are supported.", "error"); return; }
    if (file.size > 8 * 1024 * 1024) { toast("File is too large. Maximum size is 8 MB.", "error"); return; }

    const form = new FormData();
    form.append("file", file);
    form.append("room_id", activeRoomId);

    toast("Uploading…", "success");
    try {
      const res  = await fetch(`${BASE}/chat/upload`, { method: "POST", headers: authHeadersNoJSON(), body: form });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Upload failed.", "error"); return; }

      const messageType = file.type === "application/pdf" ? "pdf" : "image";
      socket.emit("send_message", {
        room_id: activeRoomId, message_type: messageType,
        file_name: data.file.file_name, file_size: data.file.file_size,
        file_mime: data.file.file_mime, file_url: data.file.file_url
      }, (ack) => { if (!ack.success) toast(ack.message || "Failed to send file.", "error"); });
    } catch (e) {
      toast("Upload failed — check your connection.", "error");
    }
  });

  /* ── Share Symptom History picker ───────────────────────── */
  async function openSymptomPicker() {
    if (!activeRoomId) return;
    elModalRoot.innerHTML = `<div class="share-modal-overlay"><div class="share-modal"><div class="sm-head">Share Symptom History<button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button></div><div class="sm-body" id="smBody">Loading…</div></div></div>`;
    try {
      const res  = await fetch(`${BASE}/symptoms/history/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = (data.data || []).slice(0, 20);
      document.getElementById("smBody").innerHTML = list.length ? list.map(s => `
        <div class="sm-item" onclick="DHAS_CHAT.shareSymptom(${s.id})">
          <div class="sm-item-title">${s.condition_name || "General Illness"}</div>
          <div class="sm-item-sub">${new Date(s.created_at).toLocaleDateString("en-IN")} · ${s.severity || ""}</div>
        </div>`).join("") : `<div class="sm-empty">No symptom checks yet.</div>`;
    } catch (e) {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load.</div>`;
    }
  }
  function shareSymptom(symptomId) {
    socket.emit("send_message", { room_id: activeRoomId, message_type: "symptom_share", metadata: { symptom_id: symptomId } }, (ack) => {
      if (!ack.success) toast(ack.message || "Failed to share.", "error");
    });
    closeModal();
  }

  /* ── Share Existing Report picker ───────────────────────── */
  async function openReportPicker() {
    if (!activeRoomId) return;
    elModalRoot.innerHTML = `<div class="share-modal-overlay"><div class="share-modal"><div class="sm-head">Share a Report<button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button></div><div class="sm-body" id="smBody">Loading…</div></div></div>`;
    try {
      const res  = await fetch(`${BASE}/reports/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = data.data || [];
      document.getElementById("smBody").innerHTML = list.length ? list.map(r => `
        <div class="sm-item" onclick="DHAS_CHAT.shareReport(${r.id})">
          <div class="sm-item-title">${r.filename}</div>
          <div class="sm-item-sub">${new Date(r.uploaded_at).toLocaleDateString("en-IN")} · ${r.filesize || ""}</div>
        </div>`).join("") : `<div class="sm-empty">No reports uploaded yet.</div>`;
    } catch (e) {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load.</div>`;
    }
  }
  function shareReport(reportId) {
    socket.emit("send_message", { room_id: activeRoomId, message_type: "report_share", metadata: { report_id: reportId } }, (ack) => {
      if (!ack.success) toast(ack.message || "Failed to share.", "error");
    });
    closeModal();
  }

  async function openSharedReport(roomId, reportId) {
    try {
      const res  = await fetch(`${BASE}/chat/report/${roomId}/${reportId}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Cannot open report.", "error"); return; }
      const w = window.open();
      if (data.filetype === "application/pdf") {
        w.document.write(`<iframe src="${data.dataurl}" style="border:none;width:100%;height:100vh;"></iframe>`);
      } else {
        w.document.write(`<img src="${data.dataurl}" style="max-width:100%;">`);
      }
    } catch (e) { toast("Cannot open report.", "error"); }
  }

  function closeModal() { elModalRoot.innerHTML = ""; }

  /* ── Public API used by inline onclick handlers ─────────── */
  window.DHAS_CHAT = {
    open: openRoom,
    close: closeRoom,
    shareSymptom, shareReport, openSharedReport, closeModal
  };

  /* ── Open straight into a conversation via ?partner=<id> ────
     partner = the OTHER person's id (doctor.id if I'm a patient,
     patient/user.id if I'm a doctor) — exactly what my_doctors.html
     and doctor_dashboard.html now pass on their "Chat" buttons. */
  async function openByPartner(partnerId) {
    const existing = contacts.find(c => String(c.partner_id) === String(partnerId));
    if (existing) { openRoom(existing.room_id); return; }

    try {
      const res  = await fetch(`${BASE}/chat/room/${partnerId}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) {
        toast(data.message || "You are not connected with this person.", "error");
        return;
      }
      await loadContacts(true);
      const found = contacts.find(c => c.room_id === data.room_id);
      if (found) openRoom(found.room_id);
      else toast("Could not open conversation.", "error");
    } catch (e) {
      toast("Cannot connect to server.", "error");
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  connectSocket();
  document.getElementById("backToListBtn")?.addEventListener("click", closeRoom);

  (async function init() {
    await loadContacts();
    const partnerParam = new URLSearchParams(window.location.search).get("partner");
    if (partnerParam) openByPartner(partnerParam);
  })();
})();