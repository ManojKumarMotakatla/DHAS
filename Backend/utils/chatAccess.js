// ============================================================
// Backend/utils/chatAccess.js
//
// Shared helpers used by BOTH the REST chat controller and the
// Socket.IO layer, so room-membership / connection-status checks
// live in exactly one place.
// ============================================================

const db = require("../config/db");

/**
 * Verifies that {role, id} is a participant of chat room `roomId`
 * AND that the underlying doctor-patient connection is still
 * 'accepted'. Returns the room row (doctor_id, patient_id, status)
 * or null if access should be denied.
 *
 * Because chat_rooms has ON DELETE CASCADE from
 * doctor_patient_connections, a disconnected pair's room row is
 * gone entirely — so this check alone is enough to guarantee
 * "no messages after disconnect", even before any live socket
 * notification reaches the client.
 */
async function verifyRoomAccess(roomId, role, id) {
    const numericRoomId = parseInt(roomId, 10);
    if (!numericRoomId || isNaN(numericRoomId)) return null;

    const [rows] = await db.promise().query(
        `SELECT cr.id, cr.connection_id, cr.doctor_id, cr.patient_id, dpc.status
         FROM chat_rooms cr
         JOIN doctor_patient_connections dpc ON dpc.id = cr.connection_id
         WHERE cr.id = ?`,
        [numericRoomId]
    );

    if (rows.length === 0) return null;
    const room = rows[0];

    if (room.status !== "accepted") return null;
    if (role === "doctor"  && room.doctor_id  !== id) return null;
    if (role === "patient" && room.patient_id !== id) return null;

    return room;
}

/**
 * Returns the chat_room id for an accepted connection, creating it
 * if it doesn't already exist. Call this right after a connection
 * is accepted (see INTEGRATION_GUIDE.md for the doctorController.js
 * hook). Safe to call repeatedly — INSERT IGNORE-style behaviour.
 */
async function ensureRoomForConnection(connectionId, doctorId, patientId) {
    const [existing] = await db.promise().query(
        "SELECT id FROM chat_rooms WHERE connection_id = ?",
        [connectionId]
    );
    if (existing.length > 0) return existing[0].id;

    const [result] = await db.promise().query(
        "INSERT INTO chat_rooms (connection_id, doctor_id, patient_id) VALUES (?, ?, ?)",
        [connectionId, doctorId, patientId]
    );
    return result.insertId;
}

/** Resolves the "other side" of a room relative to the caller. */
function otherParty(room, myRole) {
    return myRole === "doctor"
        ? { role: "patient", id: room.patient_id }
        : { role: "doctor",  id: room.doctor_id };
}

module.exports = { verifyRoomAccess, ensureRoomForConnection, otherParty };