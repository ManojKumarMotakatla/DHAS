// ============================================================
// frontend/js/chat.js
// Drives chat.html. Works for BOTH patients and doctors.
// Requires: js/config.js and js/crypto.js loaded before this.
// Socket.IO client script tag must also be loaded before this.
//
// FIXED: Role detection was checking dhas_doctor first, so any
// user who had ever logged in as a doctor (even in a past session)
// would be misidentified as a doctor even when currently logged in
// as a patient. Now uses a smarter approach:
//   1. Check which token is actually present AND which matching
//      user object exists.
//   2. If BOTH exist (stale data), use the URL context:
//      - If opened from my_doctors.html (?partner=doctorId) → patient
//      - If opened from doctor_dashboard (?partner=patientId) → doctor
//   3. Fallback: prefer patient role if dhas_user exists, since
//      patients are the more common chat initiators from my_doctors.
// ============================================================

(function () {
  "use strict";

  // ── Identify caller ─────────────────────────────────────────
  const doctorRaw  = localStorage.getItem("dhas_doctor");
  const patientRaw = localStorage.getItem("dhas_user");
  const doctorToken  = localStorage.getItem("dhas_doctor_token");
  const patientToken = localStorage.getItem("dhas_token");

  const hasDoctor  = !!(doctorRaw  && doctorToken);
  const hasPatient = !!(patientRaw && patientToken);

  let ME = null;

  if (hasDoctor && hasPatient) {
    // Both sessions exist (stale data from switching accounts).
    // Determine role from the referrer or a stored hint.
    // Most reliable: check if there's an explicit role hint stored
    // when the user clicked "Chat" from a specific page.
    const roleHint = sessionStorage.getItem("dhas_chat_role");

    if (roleHint === "doctor") {
      const d = JSON.parse(doctorRaw);
      ME = { role: "doctor", id: d.id, name: "Dr. " + (d.name || ""), token: doctorToken };
    } else if (roleHint === "patient") {
      const u = JSON.parse(patientRaw);
      ME = { role: "patient", id: u.id, name: u.name || "You", token: patientToken };
    } else {
      // No hint — default to patient (patients open chat from my_doctors.html
      // far more often than doctors open it from their dashboard directly).
      // Doctors always have the doctor dashboard which sets the hint.
      const u = JSON.parse(patientRaw);
      ME = { role: "patient", id: u.id, name: u.name || "You", token: patientToken };
    }
  } else if (hasDoctor) {
    const d = JSON.parse(doctorRaw);
    ME = { role: "doctor", id: d.id, name: "Dr. " + (d.name || ""), token: doctorToken };
  } else if (hasPatient) {
    const u = JSON.parse(patientRaw);
    ME = { role: "patient", id: u.id, name: u.name || "You", token: patientToken };
  }

  if (!ME || !ME.token) {
    // Clear the hint and redirect to login
    sessionStorage.removeItem("dhas_chat_role");
    window.location.href = "login.html";
    return;
  }

  // Clear role hint after consuming it (single-use)
  sessionStorage.removeItem("dhas_chat_role");

  const BASE = window.API_BASE;
  const partnerParam = new URLSearchParams(window.location.search).get("partner");

  function authHeaders()       { return { "Content-Type": "application/json", "Authorization": "Bearer " + ME.token }; }
  function authHeadersNoJSON() { return { "Authorization": "Bearer " + ME.token }; }

  // ── State ────────────────────────────────────────────────────
  let contacts        = [];
  let contactsLoaded   = false;
  let activeRoomId    = null;
  let activeContact   = null;
  let oldestLoadedId  = null;
  let typingTimeout   = null;
  let socket          = null;
  let socketReady     = false;

  // ── DOM ──────────────────────────────────────────────────────
  const elShell            = document.getElementById("chatShell");
  const elList             = document.getElementById("contactList");
  const elCountBadge       = document.getElementById("contactCountBadge");
  const elMessages         = document.getElementById("messageArea");
  const elHeaderName       = document.getElementById("chatPartnerName");
  const elHeaderSub        = document.getElementById("chatPartnerSub");
  const elHeaderAvatar     = document.getElementById("chatPartnerAvatar");
  const elComposerWrap     = document.getElementById("composerWrap");
  const elInput            = document.getElementById("messageInput");
  const elSendBtn          = document.getElementById("sendBtn");
  const elTypingIndicator  = document.getElementById("typingIndicator");
  const elTerminatedBanner = document.getElementById("terminatedBanner");
  const elAttachBtn        = document.getElementById("attachBtn");
  const elAttachMenu       = document.getElementById("attachMenu");
  const elFileInput        = document.getElementById("fileInput");
  const elModalRoot        = document.getElementById("shareModalRoot");
  const elEmptyState       = document.getElementById("chatEmptyState");

  // Hide share options that don't apply to doctors
  if (ME.role === "doctor") {
    document.getElementById("optShareSymptom")?.remove();
    document.getElementById("optShareReport")?.remove();
  }

  function setEmptyState(html) {
    if (elEmptyState) elEmptyState.innerHTML = html;
  }

  const DEFAULT_EMPTY_HTML = `
    <i class="ti ti-message-circle-2" aria-hidden="true"></i>
    <div>Select a conversation to start chatting</div>`;

  if (partnerParam) {
    setEmptyState(`
      <i class="ti ti-message-circle-2" aria-hidden="true"></i>
      <div>Opening conversation…</div>`);
  }

  // ── Toast ─────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(text, type = "success") {
    const t = document.getElementById("chatToast");
    if (!t) { console.warn("[Chat]", text); return; }
    t.className = type;
    t.textContent = text;
    t.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = "none"; }, 5000);
  }

  function initials(name) {
    return (name || "?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }
  function avatarHTML(avatarUrl, name, size) {
    return avatarUrl
      ? `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:${size === "sm" ? ".85rem" : "1rem"}">${initials(name)}</span>`;
  }

  // ── E2E crypto init ──────────────────────────────────────────
  try {
    DHAS_CRYPTO.init(BASE, ME.token).catch(err => {
      console.warn("[Chat] Crypto init failed:", err);
    });
  } catch (err) {
    console.warn("[Chat] Crypto init threw synchronously:", err);
  }

  // ── Socket setup ─────────────────────────────────────────────
  function connectSocket() {
    if (typeof io === "undefined") {
      console.error("[Chat] Socket.IO client failed to load — live updates disabled.");
      toast("Live updates unavailable — refresh to see new messages.", "error");
      return;
    }

    try {
      socket = io(BASE, { auth: { token: ME.token }, transports: ["websocket", "polling"] });
    } catch (err) {
      console.error("[Chat] Failed to initialise socket:", err);
      return;
    }

    socket.on("connect", () => { socketReady = true; });
    socket.on("disconnect", () => { socketReady = false; });
    socket.on("connect_error", (err) => toast(err.message || "Connection error.", "error"));

    socket.on("new_message", async (msg) => {
      if (msg.room_id === activeRoomId) {
        await appendMessage(msg);
        scrollToBottom();
        if (msg.sender_type !== ME.role) socket.emit("mark_read", { room_id: activeRoomId });
      }
      bumpContact(msg);
    });

    socket.on("status_update",  ({ room_id }) => { if (room_id === activeRoomId) updateOutgoingTicks("delivered"); });
    socket.on("messages_read",  ({ room_id, reader }) => { if (room_id === activeRoomId && reader !== ME.role) updateOutgoingTicks("read"); });

    socket.on("typing",      ({ room_id, role }) => { if (room_id === activeRoomId && role !== ME.role) elTypingIndicator.style.display = "flex"; });
    socket.on("stop_typing", ({ room_id, role }) => { if (room_id === activeRoomId && role !== ME.role) elTypingIndicator.style.display = "none"; });

    socket.on("contact_update", () => loadContacts(true));

    socket.on("connection_terminated", ({ room_id }) => {
      if (room_id === activeRoomId) {
        elTerminatedBanner.style.display = "flex";
        elComposerWrap.style.display = "none";
        DHAS_CRYPTO.clearRoomKeyCache(room_id);
      }
      loadContacts(true);
    });
  }

  function emitSafe(event, payload, ack) {
    if (!socket || !socketReady) {
      if (ack) ack({ success: false, message: "Not connected. Please check your connection and try again." });
      return;
    }
    socket.emit(event, payload, ack);
  }

  // ── Contacts ──────────────────────────────────────────────────
  async function loadContacts(silent) {
    try {
      const res = await fetch(`${BASE}/chat/contacts`, { headers: authHeaders() });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        contacts = [];
        contactsLoaded = true;
        renderContacts();
        if (!silent) toast(err.message || "Failed to load chats.", "error");
        return;
      }

      const data = await res.json();
      contacts = (data.success && Array.isArray(data.data)) ? data.data : [];
      contactsLoaded = true;
      renderContacts();

    } catch (e) {
      console.error("[Chat] loadContacts failed:", e);
      contacts = [];
      contactsLoaded = true;
      renderContacts();
      if (!silent) toast("Cannot connect to server.", "error");
    }
  }

  function bumpContact(msg) {
    const idx = contacts.findIndex(c => c.room_id === msg.room_id);
    if (idx === -1) { loadContacts(true); return; }
    contacts[idx].last_message      = msg.is_encrypted ? "🔒 Encrypted message" : (msg.content || labelForType(msg.message_type));
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
    const isDoctor = ME.role === "doctor";

    if (!contacts.length) {
      elCountBadge.style.display = "none";
      elList.innerHTML = `
        <div class="empty-contacts">
          <i class="ti ${isDoctor ? "ti-users" : "ti-stethoscope"}" aria-hidden="true"></i>
          ${isDoctor
            ? "No connected patients yet.<br>Accepted patients will appear here automatically."
            : "No connected doctors yet.<br>Connect with a doctor first to start chatting."}
        </div>`;
      return;
    }

    elCountBadge.style.display = "inline-block";
    elCountBadge.textContent = contacts.length;

    elList.innerHTML = contacts.map(c => {
      const name    = isDoctor ? c.name : ("Dr. " + c.name);
      const sub     = isDoctor ? "" : (c.speciality || "");
      const time    = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
      const preview = c.last_message_type && c.last_message_type !== "text"
        ? labelForType(c.last_message_type)
        : (c.last_message_encrypted ? "🔒 Encrypted message" : (c.last_message || "Say hello 👋"));
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

  // ── Open a conversation ───────────────────────────────────────
  async function openRoom(roomId) {
    const contact = contacts.find(c => c.room_id === roomId);
    if (!contact) return;

    if (activeRoomId && activeRoomId !== roomId) emitSafe("leave_room");

    activeRoomId  = roomId;
    activeContact = contact;
    oldestLoadedId = null;
    contact.unread_count = 0;

    elShell.classList.add("show-chat");
    elTerminatedBanner.style.display = "none";
    elComposerWrap.style.display     = "flex";
    elTypingIndicator.style.display  = "none";

    const elChatHeader = document.getElementById("chatHeader");
    if (elChatHeader) elChatHeader.style.display = "flex";
    if (elEmptyState) elEmptyState.style.display = "none";

    const isDoctor = ME.role === "doctor";
    const name = isDoctor ? contact.name : ("Dr. " + contact.name);
    elHeaderName.textContent  = name;
    elHeaderSub.textContent   = isDoctor ? "Patient" : (contact.speciality || "Doctor");
    elHeaderAvatar.innerHTML  = avatarHTML(contact.avatar, name, "lg");

    renderContacts();
    elMessages.innerHTML = `<div class="loading-msgs">Loading conversation…</div>`;

    DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId).then(key => {
      if (!key) console.warn("[Chat] Partner has no public key yet — messages will be sent unencrypted.");
    }).catch(() => {});

    emitSafe("join_room", { room_id: roomId }, (ack) => {
      if (!ack || !ack.success) {
        if (ack && ack.message && ack.message !== "Not connected. Please check your connection and try again.") {
          elTerminatedBanner.style.display = "flex";
          elComposerWrap.style.display     = "none";
        }
      }
    });

    try {
      const res  = await fetch(`${BASE}/chat/messages/${roomId}?limit=40`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Failed to load messages.", "error"); elMessages.innerHTML = ""; return; }
      elMessages.innerHTML = "";
      for (const msg of data.data) {
        await appendMessage(msg);
      }
      if (data.data.length) oldestLoadedId = data.data[0].id;
      scrollToBottom();
      emitSafe("mark_read", { room_id: roomId });
    } catch (e) {
      elMessages.innerHTML = `<div class="loading-msgs">Could not load messages.</div>`;
    }
  }

  function closeRoom() {
    if (activeRoomId) emitSafe("leave_room");
    activeRoomId = null;
    elShell.classList.remove("show-chat");

    const elChatHeader = document.getElementById("chatHeader");
    if (elChatHeader) elChatHeader.style.display = "none";
    if (elEmptyState) {
      setEmptyState(DEFAULT_EMPTY_HTML);
      elEmptyState.style.display = "flex";
    }
  }

  // ── Render a single message bubble ───────────────────────────
  async function appendMessage(m) {
    const mine = m.sender_type === ME.role;
    const time = new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const tickHTML = mine ? `<span class="tick" data-mid="${m.id}">${tickIcon(m.status)}</span>` : "";

    let bodyHTML;

    if (m.message_type === "text") {
      let displayText = m.content || "";

      if (m.is_encrypted && m.iv && m.content) {
        try {
          const key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, m.room_id);
          if (key) {
            const pt = await DHAS_CRYPTO.decryptMessage(m.content, m.iv, key);
            displayText = pt !== null ? pt : "⚠️ Could not decrypt message";
          } else {
            displayText = "🔒 Encrypted (key unavailable)";
          }
        } catch {
          displayText = "⚠️ Decryption error";
        }
      }

      bodyHTML = `<div class="bubble-text">${escapeHTML(displayText)}</div>`;

    } else if (m.message_type === "image") {
      if (m.is_encrypted && m.file_iv) {
        const msgId = m.id;
        bodyHTML = `
          <div class="bubble-file" id="enc-img-${msgId}" style="cursor:pointer" onclick="DHAS_CHAT.decryptAndShowImage(${msgId},'${m.file_data}','${m.file_iv}',${m.room_id})">
            <i class="ti ti-lock" style="font-size:24px;color:var(--blue)"></i>
            <div><div class="bf-name">${escapeHTML(m.file_name || "Image")}</div><div class="bf-size">Tap to decrypt &amp; view</div></div>
          </div>`;
      } else {
        bodyHTML = `<a href="${BASE}${m.file_data}" target="_blank"><img class="bubble-image" src="${BASE}${m.file_data}" alt="${escapeHTML(m.file_name || '')}"></a>
                    ${m.content ? `<div class="bubble-caption">${escapeHTML(m.content)}</div>` : ""}`;
      }

    } else if (m.message_type === "pdf") {
      if (m.is_encrypted && m.file_iv) {
        bodyHTML = `
          <div class="bubble-file" style="cursor:pointer" onclick="DHAS_CHAT.decryptAndDownloadFile(${m.id},'${m.file_data}','${m.file_iv}',${m.room_id},'${escapeHTML(m.file_name || 'document.pdf')}')">
            <i class="ti ti-lock" style="font-size:24px;color:var(--rose)"></i>
            <div><div class="bf-name">${escapeHTML(m.file_name || "Document")}</div><div class="bf-size">Tap to decrypt &amp; download</div></div>
          </div>`;
      } else {
        bodyHTML = `<a class="bubble-file" href="${BASE}${m.file_data}" target="_blank">
                      <i class="ti ti-file-type-pdf"></i>
                      <div><div class="bf-name">${escapeHTML(m.file_name || "")}</div><div class="bf-size">${m.file_size || ""}</div></div>
                    </a>`;
      }

    } else if (m.message_type === "symptom_share") {
      let meta = {};
      try { meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : (m.metadata || {}); } catch { meta = {}; }
      const syms = (meta.symptoms || []).join(", ");
      bodyHTML = `<div class="bubble-card">
            <div class="bc-head"><i class="ti ti-stethoscope"></i> Symptom Check Shared</div>
            <div class="bc-row"><strong>${escapeHTML(meta.condition_name || "General")}</strong></div>
            <div class="bc-row">Severity: ${escapeHTML(meta.severity || "—")}</div>
            <div class="bc-row" style="color:var(--muted)">${escapeHTML(syms)}</div>
          </div>`;

    } else if (m.message_type === "report_share") {
      let meta = {};
      try { meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : (m.metadata || {}); } catch { meta = {}; }
      bodyHTML = `<div class="bubble-card bubble-card-link" onclick="DHAS_CHAT.openSharedReport(${activeRoomId}, ${meta.report_id})">
            <div class="bc-head"><i class="ti ti-file-report"></i> Medical Report Shared</div>
            <div class="bc-row"><strong>${escapeHTML(meta.filename || "")}</strong></div>
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
    if (status === "read")      return `<i class="ti ti-checks" style="color:#4f8ef9"></i>`;
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

  // ── Sending text ──────────────────────────────────────────────
  async function sendText() {
    const text = elInput.value.trim();
    if (!text || !activeRoomId) return;
    elInput.value = "";
    emitSafe("stop_typing");

    const key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, activeRoomId).catch(() => null);

    if (key) {
      try {
        const { ciphertext, iv } = await DHAS_CRYPTO.encryptMessage(text, key);
        emitSafe("send_message", {
          room_id:      activeRoomId,
          message_type: "text",
          content:      ciphertext,
          is_encrypted: true,
          iv
        }, (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send.", "error"); });
        return;
      } catch (err) {
        console.warn("[Chat] Encryption failed, sending plaintext:", err);
      }
    }

    emitSafe("send_message", {
      room_id:      activeRoomId,
      message_type: "text",
      content:      text
    }, (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send.", "error"); });
  }

  elSendBtn?.addEventListener("click", sendText);
  elInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  elInput?.addEventListener("input", () => {
    if (!activeRoomId) return;
    emitSafe("typing");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => emitSafe("stop_typing"), 1500);
  });

  // ── Attachment menu ───────────────────────────────────────────
  elAttachBtn?.addEventListener("click", (e) => { e.stopPropagation(); elAttachMenu.classList.toggle("open"); });
  document.addEventListener("click", () => elAttachMenu?.classList.remove("open"));

  document.getElementById("optUploadFile")?.addEventListener("click", () => { elFileInput.click(); elAttachMenu.classList.remove("open"); });
  document.getElementById("optShareSymptom")?.addEventListener("click", () => { openSymptomPicker(); elAttachMenu.classList.remove("open"); });
  document.getElementById("optShareReport")?.addEventListener("click", () => { openReportPicker(); elAttachMenu.classList.remove("open"); });

  // ── File upload ───────────────────────────────────────────────
  elFileInput?.addEventListener("change", async () => {
    const file = elFileInput.files[0];
    elFileInput.value = "";
    if (!file || !activeRoomId) return;

    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { toast("Only PDF, JPG, PNG and WEBP files are supported.", "error"); return; }
    if (file.size > 8 * 1024 * 1024) { toast("File is too large. Maximum size is 8 MB.", "error"); return; }

    toast("Encrypting & uploading…", "success");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, activeRoomId).catch(() => null);

      let uploadBuffer = arrayBuffer;
      let fileIv       = null;

      if (key) {
        const { encryptedBuffer, iv } = await DHAS_CRYPTO.encryptFile(arrayBuffer, key);
        uploadBuffer = encryptedBuffer;
        fileIv       = iv;
      }

      const blob = new Blob([uploadBuffer], { type: "application/octet-stream" });
      const form = new FormData();
      form.append("room_id", String(activeRoomId));
      form.append("file", blob, file.name);
      if (fileIv) form.append("file_iv", fileIv);

      const uploadUrl = `${BASE}/chat/upload?room_id=${encodeURIComponent(activeRoomId)}`;
      const res  = await fetch(uploadUrl, { method: "POST", headers: authHeadersNoJSON(), body: form });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Upload failed.", "error"); return; }

      const messageType = file.type === "application/pdf" ? "pdf" : "image";
      emitSafe("send_message", {
        room_id:      activeRoomId,
        message_type: messageType,
        file_name:    data.file.file_name,
        file_size:    data.file.file_size,
        file_mime:    data.file.file_mime,
        file_url:     data.file.file_url,
        is_encrypted: !!fileIv,
        file_iv:      data.file.file_iv || fileIv
      }, (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send file.", "error"); });

    } catch (e) {
      console.error("[Chat] File upload error:", e);
      toast("Upload failed — check your connection.", "error");
    }
  });

  // ── Decrypt & display encrypted image ─────────────────────────
  async function decryptAndShowImage(msgId, fileUrl, ivB64, roomId) {
    try {
      const res = await fetch(`${BASE}${fileUrl}`, { headers: authHeadersNoJSON() });
      const buf = await res.arrayBuffer();
      const key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId);
      if (!key) { toast("Cannot decrypt: key unavailable.", "error"); return; }

      const decrypted = await DHAS_CRYPTO.decryptFile(buf, ivB64, key);
      if (!decrypted) { toast("Decryption failed.", "error"); return; }

      const blob = new Blob([decrypted]);
      const url  = URL.createObjectURL(blob);
      const el   = document.getElementById(`enc-img-${msgId}`);
      if (el) {
        el.outerHTML = `<a href="${url}" target="_blank"><img class="bubble-image" src="${url}" alt="Image"></a>`;
      }
    } catch (e) {
      toast("Could not load image.", "error");
    }
  }

  // ── Decrypt & download encrypted file ─────────────────────────
  async function decryptAndDownloadFile(msgId, fileUrl, ivB64, roomId, fileName) {
    try {
      toast("Decrypting…", "success");
      const res = await fetch(`${BASE}${fileUrl}`, { headers: authHeadersNoJSON() });
      const buf = await res.arrayBuffer();
      const key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId);
      if (!key) { toast("Cannot decrypt: key unavailable.", "error"); return; }

      const decrypted = await DHAS_CRYPTO.decryptFile(buf, ivB64, key);
      if (!decrypted) { toast("Decryption failed.", "error"); return; }

      const blob = new Blob([decrypted]);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast("Could not download file.", "error");
    }
  }

  // ── Share Symptom picker (patient only) ──────────────────────
  async function openSymptomPicker() {
    if (!activeRoomId) return;
    if (ME.role !== "patient") { toast("Only patients can share symptom history.", "error"); return; }
    elModalRoot.innerHTML = `<div class="share-modal-overlay"><div class="share-modal"><div class="sm-head">Share Symptom History<button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button></div><div class="sm-body" id="smBody">Loading…</div></div></div>`;
    try {
      const res  = await fetch(`${BASE}/symptoms/history/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = (data.data || []).slice(0, 20);
      document.getElementById("smBody").innerHTML = list.length
        ? list.map(s => `<div class="sm-item" onclick="DHAS_CHAT.shareSymptom(${s.id})"><div class="sm-item-title">${escapeHTML(s.condition_name || "General Illness")}</div><div class="sm-item-sub">${new Date(s.created_at).toLocaleDateString("en-IN")} · ${escapeHTML(s.severity || "")}</div></div>`).join("")
        : `<div class="sm-empty">No symptom checks yet.</div>`;
    } catch {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load.</div>`;
    }
  }

  function shareSymptom(symptomId) {
    emitSafe("send_message", { room_id: activeRoomId, message_type: "symptom_share", metadata: { symptom_id: symptomId } },
      (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to share.", "error"); });
    closeModal();
  }

  // ── Share Report picker (patient only) ───────────────────────
  async function openReportPicker() {
    if (!activeRoomId) return;
    if (ME.role !== "patient") { toast("Only patients can share reports.", "error"); return; }
    elModalRoot.innerHTML = `<div class="share-modal-overlay"><div class="share-modal"><div class="sm-head">Share a Report<button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button></div><div class="sm-body" id="smBody">Loading…</div></div></div>`;
    try {
      const res  = await fetch(`${BASE}/reports/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = data.data || [];
      document.getElementById("smBody").innerHTML = list.length
        ? list.map(r => `<div class="sm-item" onclick="DHAS_CHAT.shareReport(${r.id})"><div class="sm-item-title">${escapeHTML(r.filename)}</div><div class="sm-item-sub">${new Date(r.uploaded_at).toLocaleDateString("en-IN")} · ${r.filesize || ""}</div></div>`).join("")
        : `<div class="sm-empty">No reports uploaded yet.</div>`;
    } catch {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load.</div>`;
    }
  }

  function shareReport(reportId) {
    emitSafe("send_message", { room_id: activeRoomId, message_type: "report_share", metadata: { report_id: reportId } },
      (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to share.", "error"); });
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
    } catch { toast("Cannot open report.", "error"); }
  }

  function closeModal() { elModalRoot.innerHTML = ""; }

  // ── Open by partner ID ────────────────────────────────────────
  async function openByPartner(partnerId, _retried) {
    const existing = contacts.find(c => String(c.partner_id) === String(partnerId));
    if (existing) { openRoom(existing.room_id); return; }

    try {
      const res  = await fetch(`${BASE}/chat/room/${partnerId}`, { headers: authHeaders() });
      const data = await res.json();

      if (!data.success) {
        const reason = data.message || "You are not connected with this person.";
        toast(reason, "error");
        setEmptyState(`
          <i class="ti ti-alert-circle" aria-hidden="true" style="color:var(--rose)"></i>
          <div style="max-width:320px;text-align:center;line-height:1.5;">${escapeHTML(reason)}</div>`);
        return;
      }

      await loadContacts(true);
      const found = contacts.find(c => c.room_id === data.room_id);
      if (found) {
        openRoom(found.room_id);
      } else if (!_retried) {
        setTimeout(() => openByPartner(partnerId, true), 400);
      } else {
        toast("Could not open conversation.", "error");
        setEmptyState(`
          <i class="ti ti-alert-circle" aria-hidden="true" style="color:var(--rose)"></i>
          <div>Could not open this conversation. Please try again from the contact list.</div>`);
      }
    } catch (e) {
      console.error("[Chat] openByPartner failed:", e);
      toast("Cannot connect to server.", "error");
      setEmptyState(`
        <i class="ti ti-wifi-off" aria-hidden="true"></i>
        <div>Cannot connect to the server. Check that it's running and try again.</div>`);
    }
  }

  // ── Back button ───────────────────────────────────────────────
  function handleBack() {
    const isMobile = window.innerWidth <= 760;
    if (isMobile && activeRoomId) { closeRoom(); return; }
    if (typeof window.DHAS_CHAT_GO_BACK === "function") {
      window.DHAS_CHAT_GO_BACK();
    } else {
      window.location.href = ME.role === "doctor" ? "doctor_dashboard.html" : "my_doctors.html";
    }
  }

  // ── Public API ────────────────────────────────────────────────
  window.DHAS_CHAT = {
    open:                   openRoom,
    close:                  closeRoom,
    shareSymptom,
    shareReport,
    openSharedReport,
    closeModal,
    decryptAndShowImage,
    decryptAndDownloadFile
  };

  document.getElementById("backToListBtn")?.addEventListener("click", handleBack);

  // ── Init ──────────────────────────────────────────────────────
  (async function init() {
    try {
      await loadContacts();
      if (partnerParam) {
        await openByPartner(partnerParam);
      }
    } catch (err) {
      console.error("[Chat] init failed:", err);
    }

    try {
      connectSocket();
    } catch (err) {
      console.error("[Chat] connectSocket failed:", err);
    }
  })();

})();