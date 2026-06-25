// ============================================================
// Backend/controllers/keyController.js
//
// Stores and serves ECDH PUBLIC keys only. The server never sees,
// stores, or could possibly reconstruct a private key — it is
// purely a bulletin board so doctor and patient browsers can find
// each other's public key and derive a shared AES key locally.
//
// Used by both patients (req.userId via requireAuth) and doctors
// (req.doctorId via requireDoctorAuth) — see chatRoutes.js for how
// "/keys/me" is mounted twice under each auth middleware.
// ============================================================

const db = require("../config/db");

/* ── POST /keys/me  (save/replace MY public key) ──────────────
   Body: { public_key: <JWK string> }
   Called once per device after the browser generates (or loads)
   its ECDH key pair. Safe to call repeatedly — overwrites. */
const saveMyPublicKey = async (req, res) => {
    const { public_key } = req.body;
    if (!public_key || typeof public_key !== "string" || public_key.length > 2000) {
        return res.status(400).json({ success: false, message: "A valid public key is required." });
    }

    try {
        if (req.role === "doctor") {
            await db.promise().query("UPDATE doctors SET public_key = ? WHERE id = ?", [public_key, req.doctorId]);
        } else {
            await db.promise().query("UPDATE users SET public_key = ? WHERE id = ?", [public_key, req.userId]);
        }
        res.json({ success: true, message: "Public key saved." });
    } catch (err) {
        console.error("saveMyPublicKey error:", err.message);
        res.status(500).json({ success: false, message: "Failed to save key." });
    }
};

/* ── GET /keys/me  (do I already have a stored key + what is it) ── */
const getMyPublicKey = async (req, res) => {
    try {
        let rows;
        if (req.role === "doctor") {
            [rows] = await db.promise().query("SELECT public_key FROM doctors WHERE id = ?", [req.doctorId]);
        } else {
            [rows] = await db.promise().query("SELECT public_key FROM users WHERE id = ?", [req.userId]);
        }
        res.json({ success: true, public_key: rows[0]?.public_key || null });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to load key." });
    }
};

/* ── GET /keys/partner/:room_id  (the OTHER person's public key) ──
   Scoped to a room the caller is actually in, re-using the same
   verifyRoomAccess() guard the rest of chat uses — so this can't be
   used to fetch an arbitrary stranger's public key. */
const getPartnerPublicKey = async (req, res) => {
    const { verifyRoomAccess, otherParty } = require("../utils/chatAccess");
    const myId = req.role === "doctor" ? req.doctorId : req.userId;

    const room = await verifyRoomAccess(req.params.room_id, req.role, myId);
    if (!room) return res.status(403).json({ success: false, message: "Access denied." });

    const partner = otherParty(room, req.role);

    try {
        let rows;
        if (partner.role === "doctor") {
            [rows] = await db.promise().query("SELECT public_key, name FROM doctors WHERE id = ?", [partner.id]);
        } else {
            [rows] = await db.promise().query("SELECT public_key, name FROM users WHERE id = ?", [partner.id]);
        }
        if (!rows.length || !rows[0].public_key) {
            return res.json({ success: true, public_key: null, message: "Partner has not set up encryption yet." });
        }
        res.json({ success: true, public_key: rows[0].public_key });
    } catch (err) {
        console.error("getPartnerPublicKey error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load partner key." });
    }
};

module.exports = { saveMyPublicKey, getMyPublicKey, getPartnerPublicKey };