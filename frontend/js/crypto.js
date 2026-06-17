// ============================================================
// DHAS — frontend/js/crypto.js
//
// E2E Encryption using Web Crypto API:
//   - ECDH P-256 key exchange (asymmetric, for key agreement)
//   - AES-256-GCM symmetric encryption (for messages + files)
//
// FLOW:
//   1. On first load for a room, generateAndStoreKeyPair() runs
//      if no key exists in localStorage yet.
//   2. Public key is uploaded to /keys/me (POST).
//   3. When opening a chat room, fetchPartnerPublicKey(roomId)
//      gets the other side's public key from /keys/partner/:room_id
//   4. deriveSharedKey() runs ECDH to produce a CryptoKey (AES-GCM).
//   5. encryptMessage(text, key) → { ciphertext (base64), iv (base64) }
//   6. decryptMessage(ciphertext, iv, key) → plaintext string
//   7. encryptFile(arrayBuffer, key) → { encryptedBuffer, iv (base64) }
//   8. decryptFile(arrayBuffer, iv, key) → decrypted ArrayBuffer
//
// All keys are stored in localStorage as JWK strings.
// Private key is marked extractable=true so we can persist it.
// (Non-extractable would require re-keying on every fresh browser
//  session — unacceptable UX for a demo app.)
//
// KNOWN TRADEOFF: localStorage is readable by XSS. For production,
// a backend-issued session-scoped key or IndexedDB with
// non-extractable CryptoKey would be stronger. For this app's
// threat model (demo, LAN, no cross-origin JS) it's acceptable.
// ============================================================

const DHAS_CRYPTO = (() => {
  "use strict";

  const LS_KEY_PAIR = "dhas_ecdh_keypair";     // { publicKeyJwk, privateKeyJwk }
  const ALGO_ECDH   = { name: "ECDH", namedCurve: "P-256" };
  const ALGO_AES    = { name: "AES-GCM", length: 256 };

  // ── helpers ────────────────────────────────────────────────
  function ab2b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function b642ab(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  // ── 1. Key pair generation + persistence ──────────────────
  async function generateAndStoreKeyPair() {
    const existing = loadStoredKeyPair();
    if (existing) return existing;

    const pair = await crypto.subtle.generateKey(
      ALGO_ECDH,
      true,          // extractable so we can save to localStorage
      ["deriveKey"]
    );

    const pubJwk  = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

    const stored = {
      publicKeyJwk:  pubJwk,
      privateKeyJwk: privJwk
    };
    localStorage.setItem(LS_KEY_PAIR, JSON.stringify(stored));
    return stored;
  }

  function loadStoredKeyPair() {
    try {
      const raw = localStorage.getItem(LS_KEY_PAIR);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.publicKeyJwk || !parsed.privateKeyJwk) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function getPrivateCryptoKey() {
    const stored = loadStoredKeyPair();
    if (!stored) throw new Error("No ECDH key pair in storage. Call generateAndStoreKeyPair first.");
    return crypto.subtle.importKey(
      "jwk",
      stored.privateKeyJwk,
      ALGO_ECDH,
      false,
      ["deriveKey"]
    );
  }

  // Returns my public key as a JWK string ready to POST to /keys/me
  async function getMyPublicKeyJwk() {
    const stored = loadStoredKeyPair();
    if (!stored) throw new Error("No key pair stored.");
    return JSON.stringify(stored.publicKeyJwk);
  }

  // ── 2. Upload my public key to server ─────────────────────
  async function uploadMyPublicKey(apiBase, token) {
    const pubJwk = await getMyPublicKeyJwk();
    const res = await fetch(apiBase + "/keys/me", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body:    JSON.stringify({ public_key: pubJwk })
    });
    const data = await res.json();
    if (!data.success) console.warn("[DHAS Crypto] Key upload failed:", data.message);
    return data.success;
  }

  // ── 3. Fetch partner's public key ─────────────────────────
  async function fetchPartnerPublicKey(apiBase, token, roomId) {
    const res = await fetch(`${apiBase}/keys/partner/${roomId}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await res.json();
    if (!data.success || !data.public_key) return null;
    return data.public_key; // JWK string
  }

  // ── 4. Derive AES-GCM shared key via ECDH ─────────────────
  async function deriveSharedKey(partnerPublicKeyJwkStr) {
    const partnerPubJwk  = JSON.parse(partnerPublicKeyJwkStr);
    const partnerPubKey  = await crypto.subtle.importKey(
      "jwk",
      partnerPubJwk,
      ALGO_ECDH,
      false,
      []
    );
    const myPrivKey = await getPrivateCryptoKey();

    return crypto.subtle.deriveKey(
      { name: "ECDH", public: partnerPubKey },
      myPrivKey,
      ALGO_AES,
      false,    // AES key is non-extractable — never leaves browser memory
      ["encrypt", "decrypt"]
    );
  }

  // ── 5. Encrypt a text message ──────────────────────────────
  async function encryptMessage(plaintext, aesKey) {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct  = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      enc.encode(plaintext)
    );
    return {
      ciphertext: ab2b64(ct),
      iv:         ab2b64(iv.buffer)
    };
  }

  // ── 6. Decrypt a text message ──────────────────────────────
  async function decryptMessage(ciphertextB64, ivB64, aesKey) {
    try {
      const ct  = b642ab(ciphertextB64);
      const iv  = new Uint8Array(b642ab(ivB64));
      const pt  = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ct
      );
      return new TextDecoder().decode(pt);
    } catch (err) {
      console.warn("[DHAS Crypto] decryptMessage failed:", err.message);
      return null;
    }
  }

  // ── 7. Encrypt a file (ArrayBuffer) ───────────────────────
  async function encryptFile(arrayBuffer, aesKey) {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      arrayBuffer
    );
    return {
      encryptedBuffer: ct,
      iv: ab2b64(iv.buffer)
    };
  }

  // ── 8. Decrypt a file (ArrayBuffer) ───────────────────────
  async function decryptFile(encryptedBuffer, ivB64, aesKey) {
    try {
      const iv = new Uint8Array(b642ab(ivB64));
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encryptedBuffer
      );
    } catch (err) {
      console.warn("[DHAS Crypto] decryptFile failed:", err.message);
      return null;
    }
  }

  // ── Per-room key cache (avoids re-deriving every message) ──
  const _roomKeyCache = {};

  async function getOrDeriveRoomKey(apiBase, token, roomId) {
    if (_roomKeyCache[roomId]) return _roomKeyCache[roomId];

    const partnerJwkStr = await fetchPartnerPublicKey(apiBase, token, roomId);
    if (!partnerJwkStr) return null;    // partner hasn't set up E2E yet

    const key = await deriveSharedKey(partnerJwkStr);
    _roomKeyCache[roomId] = key;
    return key;
  }

  function clearRoomKeyCache(roomId) {
    if (roomId) delete _roomKeyCache[roomId];
    else Object.keys(_roomKeyCache).forEach(k => delete _roomKeyCache[k]);
  }

  // ── Init: called once on page load ────────────────────────
  // Generates key pair if needed, then uploads public key.
  async function init(apiBase, token) {
    try {
      await generateAndStoreKeyPair();
      await uploadMyPublicKey(apiBase, token);
      console.log("[DHAS Crypto] E2E ready.");
    } catch (err) {
      console.warn("[DHAS Crypto] Init failed:", err.message);
    }
  }

  return {
    init,
    getOrDeriveRoomKey,
    clearRoomKeyCache,
    encryptMessage,
    decryptMessage,
    encryptFile,
    decryptFile,
    // Exposed for debugging only:
    generateAndStoreKeyPair,
    getMyPublicKeyJwk
  };
})();

window.DHAS_CRYPTO = DHAS_CRYPTO;