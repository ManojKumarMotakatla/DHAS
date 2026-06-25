// ============================================================
// frontend/js/chat.js  — v3
//
// NEW IN THIS VERSION:
//  - Presence: header shows "● Online" (green) or "Last seen Xm ago"
//    for the open conversation's partner. Sourced from (in order):
//      1. join_room socket ack's `partner_presence` field
//      2. GET /chat/presence/:room_id REST fallback (in case the ack
//         is slow or the join_room call fails for some reason)
//      3. live presence_update socket events while the room is open
//  - Contact list rows show a small online dot on the avatar when
//    that partner is currently online.
//  - Message status humanized: own sent messages now show
//    "Sent / Delivered Xm ago / Seen Xm ago" instead of just a tick
//    icon, refreshed every 30s so "just now" ages into "2m ago" etc
//    without needing a new event from the server.
//  - Contact list preview includes a small "Delivered"/"Seen" status
//    when the last message in that conversation was sent by you.
//
// (Carries forward the v2 fix: live socket messages are decrypted
//  immediately instead of waiting for the next page load.)
// ============================================================

(function () {
  "use strict";

  // ── Identify caller ─────────────────────────────────────────
  const doctorRaw    = localStorage.getItem("dhas_doctor");
  const patientRaw   = localStorage.getItem("dhas_user");
  const doctorToken  = localStorage.getItem("dhas_doctor_token");
  const patientToken = localStorage.getItem("dhas_token");

  const hasDoctor  = !!(doctorRaw  && doctorToken);
  const hasPatient = !!(patientRaw && patientToken);

  let ME = null;

  if (hasDoctor && hasPatient) {
    const roleHint = sessionStorage.getItem("dhas_chat_role");
    if (roleHint === "doctor") {
      const d = JSON.parse(doctorRaw);
      ME = { role: "doctor", id: d.id, name: "Dr. " + (d.name || ""), token: doctorToken };
    } else {
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
    sessionStorage.removeItem("dhas_chat_role");
    window.location.href = "login.html";
    return;
  }

  sessionStorage.removeItem("dhas_chat_role");

  const BASE = window.API_BASE;
  const partnerParam = new URLSearchParams(window.location.search).get("partner");

  function authHeaders()       { return { "Content-Type": "application/json", "Authorization": "Bearer " + ME.token }; }
  function authHeadersNoJSON() { return { "Authorization": "Bearer " + ME.token }; }

  // ── State ────────────────────────────────────────────────────
  let contacts        = [];
  let activeRoomId     = null;
  let activeContact    = null;
  let typingTimeout    = null;
  let socket           = null;
  let socketReady      = false;

  // NEW: presence of the partner in the currently-open room.
  // Shape: { online: boolean, last_seen: ISOString|null }
  let partnerPresence = { online: false, last_seen: null };

  // Track rendered message IDs to prevent duplicates
  const renderedMsgIds = new Set();

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
      ? `<img src="${avatarUrl}" alt="${escapeHTML(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:${size === "sm" ? ".85rem" : "1rem"}">${initials(name)}</span>`;
  }

  // ── NEW: relative time humanizer ────────────────────────────
  // Used for "Last seen at HH:MM AM/PM", "Delivered/Seen Xm ago", etc.
  // For presence ("last seen") we show an absolute clock time so users
  // know exactly when the partner was last active — same as WhatsApp/
  // Telegram. For message status we keep the relative form.
  function humanizeTimeAgo(isoOrDate, opts) {
    if (!isoOrDate) return "";
    const then = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(then)) return "";
    const now  = new Date();
    const diffSec = Math.floor((now - then) / 1000);

    // opts.absolute = true → always show "at HH:MM AM/PM" (used for presence)
    if (opts && opts.absolute) {
      const timeStr = then.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      // Midnight-boundary helpers
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesMid   = new Date(todayMid - 86400000);
      if (then >= todayMid) return "at " + timeStr;
      if (then >= yesMid)   return "Yesterday at " + timeStr;
      // Older: show date + time
      return then.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " at " + timeStr;
    }

    // Relative form (for message Sent/Delivered/Seen labels)
    if (diffSec < 10)   return "just now";
    if (diffSec < 60)   return diffSec + "s ago";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60)   return diffMin + " min ago";
    const diffHr  = Math.floor(diffMin / 60);
    if (diffHr   < 24)  return diffHr + (diffHr === 1 ? " hour ago" : " hours ago");
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay  < 7)   return diffDay + (diffDay === 1 ? " day ago" : " days ago");
    return then.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
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
      console.error("[Chat] Socket.IO client not loaded.");
      toast("Live updates unavailable — refresh to see new messages.", "error");
      return;
    }

    try {
      socket = io(BASE, {
        auth: { token: ME.token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
    } catch (err) {
      console.error("[Chat] Failed to initialise socket:", err);
      return;
    }

    socket.on("connect", () => {
      console.log("[Chat] Socket connected:", socket.id);
      socketReady = true;
      // Re-join current room after reconnect
      if (activeRoomId) {
        socket.emit("join_room", { room_id: activeRoomId }, (ack) => {
          applyJoinAckPresence(ack);
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[Chat] Socket disconnected:", reason);
      socketReady = false;
    });

    socket.on("connect_error", (err) => {
      console.warn("[Chat] Socket connect error:", err.message);
    });

    // ── new_message: render synchronously, then decrypt + restart
    //    the "Sent X ago" relative-time refresh for our own messages.
    socket.on("new_message", (msg) => {
      console.log("[Chat] new_message received:", msg.id, "room:", msg.room_id, "active:", activeRoomId);

      bumpContact(msg);

      if (String(msg.room_id) === String(activeRoomId)) {
        if (renderedMsgIds.has(msg.id)) {
          console.log("[Chat] Skipping duplicate message:", msg.id);
          return;
        }
        renderMessageNow(msg, true);
        decryptOneMessage(msg.id);

        if (msg.sender_type !== ME.role) {
          emitSafe("mark_read", { room_id: activeRoomId });
        }
      }
    });

    socket.on("status_update", ({ room_id }) => {
      if (String(room_id) === String(activeRoomId)) updateOutgoingTicks("delivered");
    });

    socket.on("messages_read", ({ room_id, reader }) => {
      if (String(room_id) === String(activeRoomId) && reader !== ME.role) updateOutgoingTicks("read");
    });

    socket.on("typing", ({ room_id, role }) => {
      if (String(room_id) === String(activeRoomId) && role !== ME.role) {
        if (elTypingIndicator) elTypingIndicator.style.display = "flex";
      }
    });

    socket.on("stop_typing", ({ room_id, role }) => {
      if (String(room_id) === String(activeRoomId) && role !== ME.role) {
        if (elTypingIndicator) elTypingIndicator.style.display = "none";
      }
    });

    socket.on("contact_update", () => {
      loadContacts(true);
    });

    // NEW: live presence changes for ANYONE we share a room with.
    // We only need to react if it's the currently-open partner, but
    // we also refresh the contact list so the online dot there stays
    // accurate even for conversations that aren't open right now.
    socket.on("presence_update", ({ role, id, online, last_seen }) => {
      // Update the matching contact row's presence in-memory + re-render.
      const c = contacts.find(c => c.partner_id === id &&
        ((ME.role === "doctor" && role === "patient") || (ME.role === "patient" && role === "doctor")));
      if (c) {
        c.online = online;
        c.last_seen = last_seen;
        renderContacts();
      }

      // If this is the partner of the room currently open, update the header.
      if (activeContact && activeContact.partner_id === id) {
        partnerPresence = { online, last_seen };
        renderPresence();
      }
    });

    socket.on("connection_terminated", ({ room_id }) => {
      if (String(room_id) === String(activeRoomId)) {
        if (elTerminatedBanner) elTerminatedBanner.style.display = "flex";
        if (elComposerWrap) elComposerWrap.style.display = "none";
        DHAS_CRYPTO.clearRoomKeyCache(room_id);
      }
      loadContacts(true);
    });
  }

  function emitSafe(event, payload, ack) {
    if (!socket || !socketReady) {
      console.warn("[Chat] emitSafe: socket not ready for", event);
      if (ack) ack({ success: false, message: "Not connected. Please check your connection." });
      return;
    }
    socket.emit(event, payload, ack);
  }

  // ── NEW: presence rendering for the chat header ───────────────
  function renderPresence() {
    if (!elHeaderSub || !activeContact) return;
    const isDoctor = ME.role === "doctor";
    const roleLabel = isDoctor ? "Patient" : (activeContact.speciality || "Doctor");

    if (partnerPresence.online) {
      elHeaderSub.innerHTML = `<span style="color:var(--green);font-weight:700;">● Online</span>`;
    } else if (partnerPresence.last_seen) {
      elHeaderSub.innerHTML = `${escapeHTML(roleLabel)} · Last seen ${humanizeTimeAgo(partnerPresence.last_seen, { absolute: true })}`;
    } else {
      // No last_seen timestamp yet (user never connected to the presence system),
      // show a generic "Last seen recently" so the header is never just the role label.
      elHeaderSub.innerHTML = `${escapeHTML(roleLabel)} · <span style="color:var(--muted)">Last seen recently</span>`;
    }
  }

  // NEW: applies the partner_presence field that join_room's ack now carries.
  function applyJoinAckPresence(ack) {
    if (ack && ack.partner_presence) {
      partnerPresence = ack.partner_presence;
      renderPresence();
    } else {
      // Fallback: ack didn't include it (older server / failed join) —
      // ask the REST endpoint directly so the header isn't stuck blank.
      fetchPresenceFallback();
    }
  }

  async function fetchPresenceFallback() {
    if (!activeRoomId) return;
    try {
      const res  = await fetch(`${BASE}/chat/presence/${activeRoomId}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        partnerPresence = { online: data.online, last_seen: data.last_seen };
        renderPresence();
      }
    } catch (e) {
      console.warn("[Chat] presence fallback fetch failed:", e);
    }
  }

  // ── Contacts ──────────────────────────────────────────────────
  async function loadContacts(silent) {
    try {
      const res = await fetch(`${BASE}/chat/contacts`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        contacts = [];
        renderContacts();
        if (!silent) toast(err.message || "Failed to load chats.", "error");
        return;
      }
      const data = await res.json();
      contacts = (data.success && Array.isArray(data.data)) ? data.data : [];
      renderContacts();

      // NEW: if the active room's contact came back with fresh presence
      // (e.g. after a silent refresh), keep the open header in sync too.
      if (activeRoomId) {
        const c = contacts.find(c => Number(c.room_id) === Number(activeRoomId));
        if (c) {
          partnerPresence = { online: !!c.online, last_seen: c.last_seen || null };
          renderPresence();
        }
      }
    } catch (e) {
      console.error("[Chat] loadContacts failed:", e);
      contacts = [];
      renderContacts();
      if (!silent) toast("Cannot connect to server.", "error");
    }
  }

  function bumpContact(msg) {
    const idx = contacts.findIndex(c => String(c.room_id) === String(msg.room_id));
    if (idx === -1) { loadContacts(true); return; }

    contacts[idx].last_message        = msg.is_encrypted ? "🔒 Encrypted message" : (msg.content || labelForType(msg.message_type));
    contacts[idx].last_message_type   = msg.message_type;
    contacts[idx].last_message_at     = msg.created_at;
    contacts[idx].last_message_status = msg.status;
    contacts[idx].last_message_mine   = msg.sender_type === ME.role;

    if (String(msg.room_id) !== String(activeRoomId) && msg.sender_type !== ME.role) {
      contacts[idx].unread_count = (contacts[idx].unread_count || 0) + 1;
    }

    const [bumped] = contacts.splice(idx, 1);
    contacts.unshift(bumped);
    renderContacts();
  }

  function labelForType(t) {
    return {
      image:          "📷 Photo",
      pdf:            "📄 Document",
      symptom_share:  "🩺 Symptom check shared",
      report_share:   "📁 Report shared"
    }[t] || "Message";
  }

  // NEW: small "Delivered" / "Seen" prefix for the contact list preview,
  // shown only when the last message in that conversation was sent by us.
  function statusPrefixForContact(c) {
    if (!c.last_message_mine || !c.last_message_status) return "";
    if (c.last_message_status === "read")      return `<i class="ti ti-checks" style="color:#4f8ef9;font-size:13px;vertical-align:-1px;"></i> `;
    if (c.last_message_status === "delivered") return `<i class="ti ti-checks" style="font-size:13px;vertical-align:-1px;"></i> `;
    return `<i class="ti ti-check" style="font-size:13px;vertical-align:-1px;"></i> `;
  }

  function renderContacts() {
    const isDoctor = ME.role === "doctor";
    if (!elCountBadge || !elList) return;

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
      const time    = c.last_message_at
        ? new Date(c.last_message_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : "";
      const preview = c.last_message_type && c.last_message_type !== "text"
        ? labelForType(c.last_message_type)
        : (c.last_message_encrypted ? "🔒 Encrypted message" : (c.last_message || "Say hello 👋"));

      // NEW: online dot overlay on the avatar.
      const onlineDot = c.online
        ? `<span style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;background:var(--green);border:2px solid var(--surface);"></span>`
        : "";

      return `
        <div class="contact-row ${String(c.room_id) === String(activeRoomId) ? "active" : ""}"
             data-room="${c.room_id}" onclick="DHAS_CHAT.open(${c.room_id})">
          <div class="contact-avatar" style="position:relative;">${avatarHTML(c.avatar, name, "lg")}${onlineDot}</div>
          <div class="contact-info">
            <div class="contact-top">
              <span class="contact-name">${escapeHTML(name)}</span>
              <span class="contact-time">${time}</span>
            </div>
            <div class="contact-bottom">
              <span class="contact-preview">${sub ? escapeHTML(sub) + " · " : ""}${statusPrefixForContact(c)}${escapeHTML(preview)}</span>
              ${c.unread_count > 0 ? `<span class="unread-badge">${c.unread_count}</span>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // ── Open a conversation ───────────────────────────────────────
  async function openRoom(roomId) {
    roomId = Number(roomId);
    const contact = contacts.find(c => Number(c.room_id) === roomId);
    if (!contact) {
      console.warn("[Chat] openRoom: contact not found for room", roomId);
      return;
    }

    if (activeRoomId && activeRoomId !== roomId) {
      emitSafe("leave_room");
    }

    activeRoomId  = roomId;
    activeContact = contact;
    contact.unread_count = 0;

    // NEW: seed presence from whatever the contact list already knows
    // (from the last /chat/contacts fetch) so the header isn't blank
    // for the brief moment before join_room's ack / REST fallback land.
    partnerPresence = { online: !!contact.online, last_seen: contact.last_seen || null };

    // Clear rendered tracking for new room
    renderedMsgIds.clear();

    if (elShell) elShell.classList.add("show-chat");
    if (elTerminatedBanner) elTerminatedBanner.style.display = "none";
    if (elComposerWrap) elComposerWrap.style.display = "flex";
    if (elTypingIndicator) elTypingIndicator.style.display = "none";

    const elChatHeader = document.getElementById("chatHeader");
    if (elChatHeader) elChatHeader.style.display = "flex";
    if (elEmptyState) elEmptyState.style.display = "none";

    const isDoctor = ME.role === "doctor";
    const name = isDoctor ? contact.name : ("Dr. " + contact.name);
    if (elHeaderName) elHeaderName.textContent  = name;
    if (elHeaderAvatar) elHeaderAvatar.innerHTML = avatarHTML(contact.avatar, name, "lg");
    renderPresence(); // NEW — paints "Online" / "Last seen…" / role label immediately

    renderContacts();

    if (elMessages) elMessages.innerHTML = `<div class="loading-msgs">Loading conversation…</div>`;

    // Pre-fetch E2E key in background
    DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId).catch(() => {});

    // Join socket room
    emitSafe("join_room", { room_id: roomId }, (ack) => {
      if (!ack || !ack.success) {
        if (ack && ack.message && !ack.message.includes("Not connected")) {
          if (elTerminatedBanner) elTerminatedBanner.style.display = "flex";
          if (elComposerWrap) elComposerWrap.style.display = "none";
        }
        // Still try to get presence via REST even if join failed for
        // a transient reason, so the header doesn't stay stale.
        fetchPresenceFallback();
        return;
      }
      applyJoinAckPresence(ack); // NEW
    });

    // REST fallback in parallel too — covers the case where the socket
    // hasn't even connected yet (emitSafe above just queued a warning).
    fetchPresenceFallback();

    // Load message history
    try {
      const res  = await fetch(`${BASE}/chat/messages/${roomId}?limit=50`, { headers: authHeaders() });
      const data = await res.json();

      if (!data.success) {
        toast(data.message || "Failed to load messages.", "error");
        if (elMessages) elMessages.innerHTML = "";
        return;
      }

      if (elMessages) elMessages.innerHTML = "";
      renderedMsgIds.clear();

      const msgs = data.data || [];
      // Render all history messages synchronously first
      for (const msg of msgs) {
        renderMessageNow(msg, false);
      }

      // Then decrypt encrypted ones in background
      decryptVisibleMessages();

      scrollToBottom();
      emitSafe("mark_read", { room_id: roomId });

    } catch (e) {
      console.error("[Chat] Load messages error:", e);
      if (elMessages) elMessages.innerHTML = `<div class="loading-msgs">Could not load messages.</div>`;
    }
  }

  function closeRoom() {
    if (activeRoomId) emitSafe("leave_room");
    activeRoomId = null;
    activeContact = null;
    partnerPresence = { online: false, last_seen: null };
    renderedMsgIds.clear();

    if (elShell) elShell.classList.remove("show-chat");

    const elChatHeader = document.getElementById("chatHeader");
    if (elChatHeader) elChatHeader.style.display = "none";
    if (elEmptyState) {
      setEmptyState(DEFAULT_EMPTY_HTML);
      elEmptyState.style.display = "flex";
    }
  }

  // ── FIX: Synchronous message render ──────────────────────────
  // Renders the bubble immediately (no await), then patches text after decrypt.
  function renderMessageNow(m, scrollAfter) {
    if (!elMessages) return;

    // Skip duplicate
    if (renderedMsgIds.has(m.id)) return;
    renderedMsgIds.add(m.id);

    const mine = m.sender_type === ME.role;
    const time = new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    // NEW: own messages show a humanized "Sent / Delivered Xm ago / Seen
    // Xm ago" status line instead of just a bare tick icon. We still keep
    // the tick icon (it's a familiar visual shorthand) but pair it with text.
    const statusHTML = mine ? buildStatusHTML(m) : "";

    let bodyHTML = buildBubbleBodySync(m);

    const row = document.createElement("div");
    row.className    = "msg-row " + (mine ? "mine" : "theirs");
    row.dataset.msgId = String(m.id);
    if (mine) {
      // Stash the message's own created_at/status so the periodic
      // refresh (see startStatusTicker below) can recompute "Xm ago"
      // without re-fetching anything from the server.
      row.dataset.createdAt = m.created_at;
      row.dataset.status    = m.status || "sent";
    }
    row.innerHTML = `<div class="bubble">${bodyHTML}<div class="bubble-meta">${time} ${statusHTML}</div></div>`;
    elMessages.appendChild(row);

    if (scrollAfter) {
      // Use rAF so the DOM has actually painted before we scroll
      requestAnimationFrame(() => scrollToBottom());
    }
  }

  // NEW: builds the tick + humanized status text for a message I sent.
  // Uses the message's OWN timestamp for "Sent Xm ago" (status === "sent"),
  // and "now" as a stand-in for when delivered/read actually happened
  // since chat_messages doesn't store separate delivered_at/read_at
  // columns — this matches the granularity the rest of the schema
  // already supports without requiring a migration.
  function buildStatusHTML(m) {
    const status = m.status || "sent";
    const tick   = tickIcon(status);
    const label  = status === "read"      ? "Seen "      + humanizeTimeAgo(m.created_at)
                 : status === "delivered" ? "Delivered "  + humanizeTimeAgo(m.created_at)
                 :                          "Sent "       + humanizeTimeAgo(m.created_at);
    return `<span class="tick" data-mid="${m.id}" style="display:inline-flex;align-items:center;gap:3px;">${tick}<span class="status-label" style="font-size:.65rem;">${label}</span></span>`;
  }

  // Builds bubble HTML synchronously. Encrypted text shows a placeholder.
  function buildBubbleBodySync(m) {
    if (m.message_type === "text") {
      if (m.is_encrypted && m.iv && m.content) {
        // Placeholder — will be replaced by decryptOneMessage() / decryptVisibleMessages()
        return `<div class="bubble-text encrypted-placeholder" data-ct="${escapeAttr(m.content)}" data-iv="${escapeAttr(m.iv)}" data-room="${m.room_id}">🔒 Decrypting…</div>`;
      }
      return `<div class="bubble-text">${escapeHTML(m.content || "")}</div>`;

    } else if (m.message_type === "image") {
      if (m.is_encrypted && m.file_iv) {
        return `<div class="bubble-file" id="enc-img-${m.id}" style="cursor:pointer"
                  onclick="DHAS_CHAT.decryptAndShowImage(${m.id},'${escapeAttr(m.file_data)}','${escapeAttr(m.file_iv)}',${m.room_id})">
                  <i class="ti ti-lock" style="font-size:24px;color:var(--blue)"></i>
                  <div>
                    <div class="bf-name">${escapeHTML(m.file_name || "Image")}</div>
                    <div class="bf-size">Tap to decrypt &amp; view</div>
                  </div>
                </div>`;
      }
      return `<a href="${BASE}${m.file_data}" target="_blank">
                <img class="bubble-image" src="${BASE}${m.file_data}" alt="${escapeHTML(m.file_name || '')}">
              </a>
              ${m.content ? `<div class="bubble-caption">${escapeHTML(m.content)}</div>` : ""}`;

    } else if (m.message_type === "pdf") {
      if (m.is_encrypted && m.file_iv) {
        return `<div class="bubble-file" style="cursor:pointer"
                  onclick="DHAS_CHAT.decryptAndDownloadFile(${m.id},'${escapeAttr(m.file_data)}','${escapeAttr(m.file_iv)}',${m.room_id},'${escapeAttr(m.file_name || "document.pdf")}')">
                  <i class="ti ti-lock" style="font-size:24px;color:var(--rose)"></i>
                  <div>
                    <div class="bf-name">${escapeHTML(m.file_name || "Document")}</div>
                    <div class="bf-size">Tap to decrypt &amp; download</div>
                  </div>
                </div>`;
      }
      return `<a class="bubble-file" href="${BASE}${m.file_data}" target="_blank">
                <i class="ti ti-file-type-pdf"></i>
                <div>
                  <div class="bf-name">${escapeHTML(m.file_name || "")}</div>
                  <div class="bf-size">${m.file_size || ""}</div>
                </div>
              </a>`;

    } else if (m.message_type === "symptom_share") {
      let meta = {};
      try { meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : (m.metadata || {}); } catch { meta = {}; }
      const syms = Array.isArray(meta.symptoms) ? meta.symptoms.map(s => s.replace(/_/g," ")).join(", ") : "";
      const checkedAt = meta.checked_at ? new Date(meta.checked_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "";
      return `<div class="bubble-card">
                <div class="bc-head"><i class="ti ti-stethoscope"></i> Symptom Check Shared</div>
                <div class="bc-row"><strong>${escapeHTML(meta.condition_name || "General Illness")}</strong></div>
                <div class="bc-row">Severity: <strong>${escapeHTML(meta.severity || "—")}</strong></div>
                ${checkedAt ? `<div class="bc-row" style="color:var(--muted);font-size:.75rem;">Checked: ${checkedAt}</div>` : ""}
                ${syms ? `<div class="bc-row" style="color:var(--muted);font-size:.78rem;margin-top:4px;">${escapeHTML(syms)}</div>` : ""}
              </div>`;

    } else if (m.message_type === "report_share") {
      let meta = {};
      try { meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : (m.metadata || {}); } catch { meta = {}; }
      return `<div class="bubble-card bubble-card-link"
                onclick="DHAS_CHAT.openSharedReport(${activeRoomId}, ${meta.report_id})">
                <div class="bc-head"><i class="ti ti-file-report"></i> Medical Report Shared</div>
                <div class="bc-row"><strong>${escapeHTML(meta.filename || "")}</strong></div>
                ${meta.filesize ? `<div class="bc-row" style="color:var(--muted);font-size:.75rem;">${escapeHTML(meta.filesize)}</div>` : ""}
                <div class="bc-row" style="color:var(--muted)">Tap to view</div>
              </div>`;

    } else {
      return `<div class="bubble-text">Unsupported message type</div>`;
    }
  }

  // ── FIX (v2): decrypt a single placeholder by message id ───────
  async function decryptOneMessage(msgId) {
    if (!elMessages) return;
    const row = elMessages.querySelector(`[data-msg-id="${msgId}"]`);
    if (!row) return;
    const el = row.querySelector(".encrypted-placeholder");
    if (!el) return; // not an encrypted text message — nothing to do

    const ct     = el.dataset.ct;
    const iv     = el.dataset.iv;
    const roomId = el.dataset.room || activeRoomId;
    if (!ct || !iv || !roomId) return;

    let key = null;
    try {
      key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId);
    } catch (e) {
      console.warn("[Chat] Could not get room key for decryption:", e);
    }

    if (key) {
      try {
        const pt = await DHAS_CRYPTO.decryptMessage(ct, iv, key);
        el.textContent = pt !== null ? pt : "⚠️ Could not decrypt message";
      } catch {
        el.textContent = "⚠️ Decryption error";
      }
    } else {
      el.textContent = "🔒 Encrypted (key unavailable)";
    }
    el.classList.remove("encrypted-placeholder");
    delete el.dataset.ct;
    delete el.dataset.iv;
    delete el.dataset.room;
  }

  // Decrypt all encrypted text placeholders in the visible message list
  // (used for the initial bulk history load in openRoom())
  async function decryptVisibleMessages() {
    if (!elMessages) return;
    const placeholders = elMessages.querySelectorAll(".encrypted-placeholder");
    if (!placeholders.length) return;

    const roomId = activeRoomId;
    if (!roomId) return;

    let key = null;
    try {
      key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, roomId);
    } catch (e) {
      console.warn("[Chat] Could not get room key for decryption:", e);
    }

    for (const el of placeholders) {
      const ct     = el.dataset.ct;
      const iv     = el.dataset.iv;
      if (!ct || !iv) continue;

      if (key) {
        try {
          const pt = await DHAS_CRYPTO.decryptMessage(ct, iv, key);
          el.textContent = pt !== null ? pt : "⚠️ Could not decrypt message";
        } catch {
          el.textContent = "⚠️ Decryption error";
        }
      } else {
        el.textContent = "🔒 Encrypted (key unavailable)";
      }
      el.classList.remove("encrypted-placeholder");
      delete el.dataset.ct;
      delete el.dataset.iv;
      delete el.dataset.room;
    }
  }

  function tickIcon(status) {
    if (status === "read")      return `<i class="ti ti-checks" style="color:#4f8ef9"></i>`;
    if (status === "delivered") return `<i class="ti ti-checks"></i>`;
    return `<i class="ti ti-check"></i>`;
  }

  // Updates BOTH the tick icon and the humanized label for every one of
  // my own messages currently in the DOM, when a status_update /
  // messages_read socket event fires for this room.
  function updateOutgoingTicks(status) {
    if (!elMessages) return;
    elMessages.querySelectorAll(".msg-row.mine").forEach(row => {
      const tickEl = row.querySelector(".tick");
      if (!tickEl) return;
      row.dataset.status = status;
      const createdAt = row.dataset.createdAt;
      const label = status === "read"      ? "Seen "      + humanizeTimeAgo(createdAt)
                  : status === "delivered" ? "Delivered "  + humanizeTimeAgo(createdAt)
                  :                          "Sent "       + humanizeTimeAgo(createdAt);
      tickEl.innerHTML = `${tickIcon(status)}<span class="status-label" style="font-size:.65rem;">${label}</span>`;
    });
  }

  // NEW: periodic refresh so "just now" ages into "2m ago", "1 hour ago"
  // etc without needing any new event from the server. Runs every 30s.
  function refreshAllStatusLabels() {
    if (!elMessages) return;
    elMessages.querySelectorAll(".msg-row.mine").forEach(row => {
      const tickEl = row.querySelector(".tick");
      if (!tickEl) return;
      const status    = row.dataset.status || "sent";
      const createdAt = row.dataset.createdAt;
      if (!createdAt) return;
      const label = status === "read"      ? "Seen "      + humanizeTimeAgo(createdAt)
                  : status === "delivered" ? "Delivered "  + humanizeTimeAgo(createdAt)
                  :                          "Sent "       + humanizeTimeAgo(createdAt);
      const labelEl = tickEl.querySelector(".status-label");
      if (labelEl) labelEl.textContent = label;
    });
    // Also refresh "Last seen Xm ago" in the open header, if applicable.
    if (activeContact && !partnerPresence.online) renderPresence();
  }
  setInterval(refreshAllStatusLabels, 30000);

  function escapeHTML(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }

  function scrollToBottom() {
    if (elMessages) elMessages.scrollTop = elMessages.scrollHeight;
  }

  // ── Sending text ──────────────────────────────────────────────
  async function sendText() {
    const text = elInput ? elInput.value.trim() : "";
    if (!text || !activeRoomId) return;
    if (elInput) elInput.value = "";
    emitSafe("stop_typing");

    let key = null;
    try {
      key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, activeRoomId);
    } catch { key = null; }

    if (key) {
      try {
        const { ciphertext, iv } = await DHAS_CRYPTO.encryptMessage(text, key);
        emitSafe("send_message", {
          room_id:      activeRoomId,
          message_type: "text",
          content:      ciphertext,
          is_encrypted: true,
          iv
        }, (ack) => {
          if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send.", "error");
        });
        return;
      } catch (err) {
        console.warn("[Chat] Encryption failed, sending plaintext:", err);
      }
    }

    emitSafe("send_message", {
      room_id:      activeRoomId,
      message_type: "text",
      content:      text
    }, (ack) => {
      if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send.", "error");
    });
  }

  if (elSendBtn) elSendBtn.addEventListener("click", sendText);
  if (elInput) {
    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
    });
    elInput.addEventListener("input", () => {
      if (!activeRoomId) return;
      emitSafe("typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => emitSafe("stop_typing"), 1500);
    });
  }

  // ── Attachment menu ───────────────────────────────────────────
  if (elAttachBtn) {
    elAttachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elAttachMenu) elAttachMenu.classList.toggle("open");
    });
  }
  document.addEventListener("click", () => {
    if (elAttachMenu) elAttachMenu.classList.remove("open");
  });

  document.getElementById("optUploadFile")?.addEventListener("click", () => {
    if (elFileInput) elFileInput.click();
    if (elAttachMenu) elAttachMenu.classList.remove("open");
  });
  document.getElementById("optShareSymptom")?.addEventListener("click", () => {
    openSymptomPicker();
    if (elAttachMenu) elAttachMenu.classList.remove("open");
  });
  document.getElementById("optShareReport")?.addEventListener("click", () => {
    openReportPicker();
    if (elAttachMenu) elAttachMenu.classList.remove("open");
  });

  // ── File upload ───────────────────────────────────────────────
  if (elFileInput) {
    elFileInput.addEventListener("change", async () => {
      const file = elFileInput.files[0];
      elFileInput.value = "";
      if (!file || !activeRoomId) return;

      const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowed.includes(file.type)) { toast("Only PDF, JPG, PNG and WEBP files are supported.", "error"); return; }
      if (file.size > 8 * 1024 * 1024) { toast("File is too large. Maximum 8 MB.", "error"); return; }

      toast("Encrypting & uploading…", "success");

      try {
        const arrayBuffer = await file.arrayBuffer();
        let key = null;
        try { key = await DHAS_CRYPTO.getOrDeriveRoomKey(BASE, ME.token, activeRoomId); } catch { key = null; }

        let uploadBuffer = arrayBuffer;
        let fileIv = null;

        if (key) {
          const { encryptedBuffer, iv } = await DHAS_CRYPTO.encryptFile(arrayBuffer, key);
          uploadBuffer = encryptedBuffer;
          fileIv = iv;
        }

        const blob = new Blob([uploadBuffer], { type: "application/octet-stream" });
        const form = new FormData();
        form.append("room_id", String(activeRoomId));
        form.append("file", blob, file.name);
        if (fileIv) form.append("file_iv", fileIv);

        const res  = await fetch(`${BASE}/chat/upload?room_id=${encodeURIComponent(activeRoomId)}`, {
          method: "POST", headers: authHeadersNoJSON(), body: form
        });
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
        }, (ack) => {
          if (!ack || !ack.success) toast((ack && ack.message) || "Failed to send file.", "error");
        });

      } catch (e) {
        console.error("[Chat] File upload error:", e);
        toast("Upload failed — check your connection.", "error");
      }
    });
  }

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

  // ══════════════════════════════════════════════════════════════
  // MULTI-SELECT SYMPTOM PICKER (patient only)
  // ══════════════════════════════════════════════════════════════
  async function openSymptomPicker() {
    if (!activeRoomId) return;
    if (ME.role !== "patient") { toast("Only patients can share symptom history.", "error"); return; }

    elModalRoot.innerHTML = `
      <div class="share-modal-overlay" onclick="if(event.target===this)DHAS_CHAT.closeModal()">
        <div class="share-modal">
          <div class="sm-head">
            <span>Share Symptom History</span>
            <button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button>
          </div>
          <div style="padding:10px 14px 0;font-size:.75rem;color:var(--muted);">
            <i class="ti ti-info-circle" style="font-size:13px;vertical-align:middle;"></i>
            Select one or more checks to share their full details.
          </div>
          <div class="sm-body" id="smBody">
            <div style="text-align:center;padding:30px;color:var(--muted);">Loading…</div>
          </div>
          <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
            <button onclick="DHAS_CHAT.closeModal()" style="flex:1;padding:10px;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);border-radius:10px;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif;">Cancel</button>
            <button id="smSendBtn" onclick="DHAS_CHAT.sendSelectedSymptoms()" style="flex:2;padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue-lt));color:#fff;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="ti ti-send" style="font-size:14px"></i> Share Selected
            </button>
          </div>
        </div>
      </div>`;

    try {
      const res  = await fetch(`${BASE}/symptoms/history/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = (data.data || []).slice(0, 50);

      if (!list.length) {
        document.getElementById("smBody").innerHTML = `<div class="sm-empty">No symptom checks recorded yet.</div>`;
        return;
      }

      document.getElementById("smBody").innerHTML = list.map((s, i) => {
        const date = new Date(s.created_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
        const time = new Date(s.created_at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
        let syms = [];
        try { syms = JSON.parse(s.symptoms); } catch { syms = []; }
        const symLabels = syms.map(sv => sv.replace(/_/g," ")).join(", ");
        const sevColor = (s.severity || "").toLowerCase().includes("high") ? "#ef4444"
                       : (s.severity || "").toLowerCase().includes("medium") ? "#f59e0b"
                       : "#10b981";
        return `
          <label class="sm-item sm-check-item" style="cursor:pointer;display:flex;align-items:flex-start;gap:10px;" for="sym_${i}">
            <input type="checkbox" id="sym_${i}" value="${s.id}" data-index="${i}"
                   style="width:18px;height:18px;margin-top:3px;accent-color:var(--blue);flex-shrink:0;cursor:pointer;"
                   onchange="updateShareCount()">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <div class="sm-item-title">${escapeHTML(s.condition_name || "General Illness")}</div>
                <span style="background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}44;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;">${escapeHTML(s.severity || "")}</span>
              </div>
              <div class="sm-item-sub" style="margin-top:3px;">${date} at ${time}</div>
              ${symLabels ? `<div class="sm-item-sub" style="color:var(--muted);margin-top:2px;font-size:.7rem;">${escapeHTML(symLabels)}</div>` : ""}
            </div>
          </label>`;
      }).join("");

      window._symptomList = list;

    } catch (e) {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load symptom history.</div>`;
    }
  }

  function updateShareCount() {
    const checked = document.querySelectorAll("#smBody input[type=checkbox]:checked");
    const btn = document.getElementById("smSendBtn");
    if (btn) {
      btn.innerHTML = checked.length > 0
        ? `<i class="ti ti-send" style="font-size:14px"></i> Share ${checked.length} Check${checked.length > 1 ? "s" : ""}`
        : `<i class="ti ti-send" style="font-size:14px"></i> Share Selected`;
    }
  }

  async function sendSelectedSymptoms() {
    const checked = document.querySelectorAll("#smBody input[type=checkbox]:checked");
    if (!checked.length) { toast("Please select at least one symptom check.", "error"); return; }

    const btn = document.getElementById("smSendBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="ti ti-loader-2" style="animation:spin .7s linear infinite;font-size:14px"></i> Sending…`; }

    let sentCount = 0;
    for (const cb of checked) {
      const symptomId = Number(cb.value);
      await new Promise((resolve) => {
        emitSafe("send_message", {
          room_id: activeRoomId,
          message_type: "symptom_share",
          metadata: { symptom_id: symptomId }
        }, (ack) => {
          if (!ack || !ack.success) {
            toast((ack && ack.message) || "Failed to share one symptom check.", "error");
          } else {
            sentCount++;
          }
          resolve();
        });
      });
    }

    closeModal();
    if (sentCount > 0) toast(`Shared ${sentCount} symptom check${sentCount > 1 ? "s" : ""} successfully.`, "success");
  }

  // ══════════════════════════════════════════════════════════════
  // MULTI-SELECT REPORT PICKER (patient only)
  // ══════════════════════════════════════════════════════════════
  async function openReportPicker() {
    if (!activeRoomId) return;
    if (ME.role !== "patient") { toast("Only patients can share reports.", "error"); return; }

    elModalRoot.innerHTML = `
      <div class="share-modal-overlay" onclick="if(event.target===this)DHAS_CHAT.closeModal()">
        <div class="share-modal">
          <div class="sm-head">
            <span>Share Medical Reports</span>
            <button class="sm-close" onclick="DHAS_CHAT.closeModal()">✕</button>
          </div>
          <div style="padding:10px 14px 0;font-size:.75rem;color:var(--muted);">
            <i class="ti ti-info-circle" style="font-size:13px;vertical-align:middle;"></i>
            Select one or more reports to share.
          </div>
          <div class="sm-body" id="smBody">
            <div style="text-align:center;padding:30px;color:var(--muted);">Loading…</div>
          </div>
          <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
            <button onclick="DHAS_CHAT.closeModal()" style="flex:1;padding:10px;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);border-radius:10px;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif;">Cancel</button>
            <button id="smSendBtn" onclick="DHAS_CHAT.sendSelectedReports()" style="flex:2;padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue-lt));color:#fff;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="ti ti-send" style="font-size:14px"></i> Share Selected
            </button>
          </div>
        </div>
      </div>`;

    try {
      const res  = await fetch(`${BASE}/reports/${ME.id}`, { headers: authHeaders() });
      const data = await res.json();
      const list = data.data || [];

      if (!list.length) {
        document.getElementById("smBody").innerHTML = `<div class="sm-empty">No reports uploaded yet.</div>`;
        return;
      }

      document.getElementById("smBody").innerHTML = list.map((r, i) => {
        const date = new Date(r.uploaded_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
        const isPdf = (r.filetype || "").includes("pdf");
        const icon  = isPdf ? "ti-file-type-pdf" : "ti-photo";
        const iconColor = isPdf ? "#f25c7d" : "#2a6cf6";
        return `
          <label class="sm-item sm-check-item" style="cursor:pointer;display:flex;align-items:center;gap:10px;" for="rep_${i}">
            <input type="checkbox" id="rep_${i}" value="${r.id}"
                   style="width:18px;height:18px;accent-color:var(--blue);flex-shrink:0;cursor:pointer;"
                   onchange="updateReportShareCount()">
            <i class="ti ${icon}" style="font-size:26px;color:${iconColor};flex-shrink:0;"></i>
            <div style="flex:1;min-width:0;">
              <div class="sm-item-title" style="word-break:break-all;">${escapeHTML(r.filename)}</div>
              <div class="sm-item-sub">${date}${r.filesize ? " · " + escapeHTML(r.filesize) : ""}</div>
            </div>
          </label>`;
      }).join("");

    } catch (e) {
      document.getElementById("smBody").innerHTML = `<div class="sm-empty">Failed to load reports.</div>`;
    }
  }

  function updateReportShareCount() {
    const checked = document.querySelectorAll("#smBody input[type=checkbox]:checked");
    const btn = document.getElementById("smSendBtn");
    if (btn) {
      btn.innerHTML = checked.length > 0
        ? `<i class="ti ti-send" style="font-size:14px"></i> Share ${checked.length} Report${checked.length > 1 ? "s" : ""}`
        : `<i class="ti ti-send" style="font-size:14px"></i> Share Selected`;
    }
  }

  async function sendSelectedReports() {
    const checked = document.querySelectorAll("#smBody input[type=checkbox]:checked");
    if (!checked.length) { toast("Please select at least one report.", "error"); return; }

    const btn = document.getElementById("smSendBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="ti ti-loader-2" style="animation:spin .7s linear infinite;font-size:14px"></i> Sending…`; }

    let sentCount = 0;
    for (const cb of checked) {
      const reportId = Number(cb.value);
      await new Promise((resolve) => {
        emitSafe("send_message", {
          room_id: activeRoomId,
          message_type: "report_share",
          metadata: { report_id: reportId }
        }, (ack) => {
          if (!ack || !ack.success) {
            toast((ack && ack.message) || "Failed to share one report.", "error");
          } else {
            sentCount++;
          }
          resolve();
        });
      });
    }

    closeModal();
    if (sentCount > 0) toast(`Shared ${sentCount} report${sentCount > 1 ? "s" : ""} successfully.`, "success");
  }

  async function openSharedReport(roomId, reportId) {
    try {
      const res  = await fetch(`${BASE}/chat/report/${roomId}/${reportId}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { toast(data.message || "Cannot open report.", "error"); return; }
      const w = window.open();
      if (!w) { toast("Please allow popups to view reports.", "error"); return; }
      if (data.filetype === "application/pdf") {
        w.document.write(`<iframe src="${data.dataurl}" style="border:none;width:100%;height:100vh;"></iframe>`);
      } else {
        w.document.write(`<img src="${data.dataurl}" style="max-width:100%;">`);
      }
    } catch { toast("Cannot open report.", "error"); }
  }

  function closeModal() {
    if (elModalRoot) elModalRoot.innerHTML = "";
  }

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
      const found = contacts.find(c => Number(c.room_id) === Number(data.room_id));
      if (found) {
        openRoom(found.room_id);
      } else if (!_retried) {
        setTimeout(() => openByPartner(partnerId, true), 600);
      } else {
        toast("Could not open conversation.", "error");
        setEmptyState(`
          <i class="ti ti-alert-circle" aria-hidden="true" style="color:var(--rose)"></i>
          <div>Could not open this conversation. Please try again.</div>`);
      }
    } catch (e) {
      console.error("[Chat] openByPartner failed:", e);
      toast("Cannot connect to server.", "error");
      setEmptyState(`
        <i class="ti ti-wifi-off" aria-hidden="true"></i>
        <div>Cannot connect to the server. Check that it is running and try again.</div>`);
    }
  }

  // ── Back button ───────────────────────────────────────────────
  function handleBack() {
    const isMobile = window.innerWidth <= 760;
    if (isMobile && activeRoomId) { closeRoom(); return; }
    window.location.href = ME.role === "doctor" ? "doctor_dashboard.html" : "my_doctors.html";
  }

  // ── Public API ────────────────────────────────────────────────
  window.DHAS_CHAT = {
    open:                    openRoom,
    close:                   closeRoom,
    shareSymptom:            (id) => {
      emitSafe("send_message", { room_id: activeRoomId, message_type: "symptom_share", metadata: { symptom_id: id } },
        (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to share.", "error"); });
      closeModal();
    },
    sendSelectedSymptoms,
    sendSelectedReports,
    shareReport:             (id) => {
      emitSafe("send_message", { room_id: activeRoomId, message_type: "report_share", metadata: { report_id: id } },
        (ack) => { if (!ack || !ack.success) toast((ack && ack.message) || "Failed to share.", "error"); });
      closeModal();
    },
    openSharedReport,
    closeModal,
    decryptAndShowImage,
    decryptAndDownloadFile
  };

  // Expose helpers for inline onchange handlers
  window.updateShareCount       = updateShareCount;
  window.updateReportShareCount = updateReportShareCount;

  // Back button wiring
  document.getElementById("backToListBtn")?.addEventListener("click", handleBack);
  document.getElementById("topBackLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    handleBack();
  });

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

    // NEW: keep contact-list "last seen" / status timestamps fresh too,
    // not just the open conversation's header/bubbles.
    setInterval(() => renderContacts(), 30000);
  })();

})();