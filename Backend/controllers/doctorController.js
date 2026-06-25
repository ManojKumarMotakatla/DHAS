const db     = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");

function signToken(doctorId) {
    return jwt.sign({ doctorId, role: "doctor" }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function generateInviteCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "DR-";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ── REQUIRED FIELDS for profile verification ───────────────────
// A doctor is marked is_verified=1 only when ALL of these are filled.
// Doctors are created with is_verified=0 and auto-promoted when they
// complete their profile via Edit Profile.
const REQUIRED_PROFILE_FIELDS = [
    "speciality",
    "experience_years",
    "hospital",
    "city",
    "state",
    "languages",
    "bio"
];

/**
 * Checks the doctor's current DB row and sets is_verified accordingly.
 * Called after every profile update.
 */
async function syncVerifiedStatus(doctorId) {
    const [rows] = await db.promise().query(
        `SELECT speciality, experience_years, hospital, city, state, languages, bio
         FROM doctors WHERE id = ?`,
        [doctorId]
    );
    if (rows.length === 0) return;

    const d = rows[0];
    const isComplete =
        d.speciality       && String(d.speciality).trim()       !== "" &&
        d.experience_years !== null && d.experience_years        !== "" &&
        d.hospital         && String(d.hospital).trim()         !== "" &&
        d.city             && String(d.city).trim()             !== "" &&
        d.state            && String(d.state).trim()            !== "" &&
        d.languages        && String(d.languages).trim()        !== "" &&
        d.bio              && String(d.bio).trim()              !== "";

    await db.promise().query(
        "UPDATE doctors SET is_verified = ? WHERE id = ?",
        [isComplete ? 1 : 0, doctorId]
    );
}

/**
 * FIX: Looks up the chat_room tied to a connection (if any) and tells
 * the live socket layer the conversation has ended, so any open chat
 * window on the other side gets a real-time "connection ended" banner
 * instead of silently failing the next time it tries to send/poll.
 * Safe no-op if no room exists yet (e.g. the pair never opened chat).
 * Wrapped in try/catch so a socket/init hiccup never breaks the
 * disconnect/accept/reject HTTP response itself.
 */
async function notifyChatRoomEnded(connectionId) {
    try {
        const [rows] = await db.promise().query(
            "SELECT id FROM chat_rooms WHERE connection_id = ?",
            [connectionId]
        );
        if (rows.length === 0) return;
        const { notifyConnectionTerminated } = require("../config/socket");
        notifyConnectionTerminated(rows[0].id);
    } catch (err) {
        console.error("notifyChatRoomEnded error:", err.message);
    }
}

/* ── REGISTER ── */
const registerDoctor = async (req, res) => {
    const { name, email, password, speciality } = req.body;
    if (!name || !email || !password || !speciality)
        return res.json({ success: false, message: "Name, email, password and speciality are required." });

    try {
        const [exists] = await db.promise().query("SELECT id FROM doctors WHERE email = ?", [email.toLowerCase()]);
        if (exists.length > 0)
            return res.json({ success: false, message: "Email already registered.", alreadyExists: true });

        const hash = await bcrypt.hash(password, 10);
        let invite_code = generateInviteCode();
        let [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        while (codeCheck.length > 0) {
            invite_code = generateInviteCode();
            [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        }

        // is_verified = 0 on registration — doctor must complete profile first
        await db.promise().query(
            "INSERT INTO doctors (name, email, password, speciality, invite_code, is_verified) VALUES (?, ?, ?, ?, ?, 0)",
            [name.trim(), email.toLowerCase(), hash, speciality, invite_code]
        );

        res.json({ success: true, message: "Doctor account created! Please login and complete your profile to appear in the directory." });
    } catch (err) {
        console.error("Doctor register error:", err.message);
        res.json({ success: false, message: "Registration failed. Please try again." });
    }
};

/* ── LOGIN ── */
const loginDoctor = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.json({ success: false, message: "Email and password required." });

    try {
        const [rows] = await db.promise().query("SELECT * FROM doctors WHERE email = ?", [email.toLowerCase()]);
        if (rows.length === 0)
            return res.json({ success: false, message: "No doctor account found with this email.", notRegistered: true });

        const doctor = rows[0];

        if (!doctor.password) {
            return res.json({
                success: false,
                message: "This account was created using Google Sign-In. Please continue with Google."
            });
        }

        const match = await bcrypt.compare(password, doctor.password);
        if (!match)
            return res.json({ success: false, message: "Incorrect password." });

        const token = signToken(doctor.id);
        res.json({
            success: true,
            token,
            doctor: {
                id: doctor.id, name: doctor.name, email: doctor.email,
                speciality: doctor.speciality, invite_code: doctor.invite_code
            }
        });
    } catch (err) {
        console.error("Doctor login error:", err.message);
        res.json({ success: false, message: "Login failed. Please try again." });
    }
};

/* ── GET DOCTOR PROFILE (authenticated) ── */
const getDoctorProfile = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, name, email, speciality, invite_code, created_at,
                    experience_years, hospital, city, state,
                    languages, bio, expertise, profile_photo, is_verified
             FROM doctors WHERE id = ?`,
            [req.doctorId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Doctor not found." });
        res.json({ success: true, doctor: rows[0] });
    } catch (err) {
        res.json({ success: false, message: "Failed to load profile." });
    }
};

/* ── UPDATE DOCTOR PROFILE (authenticated) ── */
const updateDoctorProfile = async (req, res) => {
    const doctorId = req.doctorId;
    const {
        speciality, experience_years, hospital,
        city, state, languages, bio, expertise, profile_photo
    } = req.body;

    try {
        const fields = [];
        const values = [];

        if (speciality       !== undefined) { fields.push("speciality = ?");        values.push(speciality || "General Physician"); }
        if (experience_years !== undefined) { fields.push("experience_years = ?");  values.push(experience_years || null); }
        if (hospital         !== undefined) { fields.push("hospital = ?");          values.push(hospital || null); }
        if (city             !== undefined) { fields.push("city = ?");              values.push(city || null); }
        if (state            !== undefined) { fields.push("state = ?");             values.push(state || null); }
        if (languages        !== undefined) { fields.push("languages = ?");         values.push(languages || null); }
        if (bio              !== undefined) { fields.push("bio = ?");               values.push(bio || null); }
        if (expertise        !== undefined) {
            fields.push("expertise = ?");
            values.push(Array.isArray(expertise) ? JSON.stringify(expertise) : expertise);
        }
        if (profile_photo !== undefined && profile_photo !== null) {
            fields.push("profile_photo = ?");
            values.push(profile_photo);
        }

        if (fields.length === 0) {
            return res.json({ success: false, message: "No fields to update." });
        }

        values.push(doctorId);
        await db.promise().query(
            `UPDATE doctors SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        // ── Auto-sync verified status based on profile completeness ──
        await syncVerifiedStatus(doctorId);

        // ── Return fresh profile ──
        const [rows] = await db.promise().query(
            `SELECT id, name, email, speciality, invite_code, created_at,
                    experience_years, hospital, city, state,
                    languages, bio, expertise, profile_photo, is_verified
             FROM doctors WHERE id = ?`,
            [doctorId]
        );

        res.json({ success: true, message: "Profile updated.", doctor: rows[0] });
    } catch (err) {
        console.error("updateDoctorProfile error:", err.message);
        res.json({ success: false, message: "Failed to update profile. Please try again." });
    }
};

/* ── GET PUBLIC DOCTOR PROFILE (by ID — no auth needed) ── */
const getPublicDoctor = async (req, res) => {
    const doctorId = parseInt(req.params.id);
    try {
        const [rows] = await db.promise().query(
            `SELECT d.id, d.name, d.speciality, d.invite_code, d.created_at,
                    d.experience_years, d.hospital,
                    d.city, d.state, d.languages, d.bio, d.expertise,
                    d.profile_photo, d.is_verified,
                    (SELECT COUNT(*) FROM doctor_patient_connections WHERE doctor_id = d.id AND status = 'accepted') AS patient_count
             FROM doctors d
             WHERE d.id = ? AND d.is_verified = 1`,
            [doctorId]
        );
        if (rows.length === 0)
            return res.status(404).json({ success: false, message: "Doctor not found or profile not yet complete." });

        res.json({ success: true, doctor: rows[0] });
    } catch (err) {
        console.error("getPublicDoctor error:", err.message);
        res.json({ success: false, message: "Failed to load doctor profile." });
    }
};

/* ── GET ALL VERIFIED DOCTORS (public) ── */
// Only returns doctors with is_verified = 1 (profile fully completed)
const getAllDoctors = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT d.id, d.name, d.speciality, d.invite_code, d.created_at,
                    d.experience_years, d.hospital,
                    d.city, d.state, d.languages, d.bio, d.profile_photo, d.is_verified,
                    (SELECT COUNT(*) FROM doctor_patient_connections WHERE doctor_id = d.id AND status = 'accepted') AS patient_count
             FROM doctors d
             WHERE d.is_verified = 1
             ORDER BY d.name ASC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getAllDoctors error:", err.message);
        res.json({ success: false, message: "Failed to load doctors." });
    }
};

/* ── GET CONNECTED PATIENTS (doctor view — accepted only) ── */
const getPatients = async (req, res) => {
    const doctorId = req.doctorId;
    try {
        const [rows] = await db.promise().query(`
            SELECT u.id, u.name, u.email, u.created_at,
                   p.blood_group, p.conditions, p.height, p.weight,
                   dpc.connected_at, dpc.status, dpc.id AS connection_id,
                   (SELECT COUNT(*) FROM symptoms WHERE user_id = u.id) AS symptom_count,
                   (SELECT COUNT(*) FROM reports  WHERE user_id = u.id) AS report_count
            FROM doctor_patient_connections dpc
            JOIN users         u ON u.id = dpc.patient_id
            LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE dpc.doctor_id = ? AND dpc.status = 'accepted'
            ORDER BY dpc.connected_at DESC
        `, [doctorId]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getPatients error:", err.message);
        res.json({ success: false, message: "Failed to load patients." });
    }
};

/* ── GET PENDING CONNECTION REQUESTS (doctor view) ── */
const getPendingRequests = async (req, res) => {
    const doctorId = req.doctorId;
    try {
        const [rows] = await db.promise().query(`
            SELECT dpc.id AS connection_id,
                   u.id AS patient_id, u.name, u.email, u.created_at AS joined_at,
                   p.blood_group, p.conditions, p.profile_image,
                   dpc.requested_at
            FROM doctor_patient_connections dpc
            JOIN users u ON u.id = dpc.patient_id
            LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE dpc.doctor_id = ? AND dpc.status = 'pending'
            ORDER BY dpc.requested_at DESC
        `, [doctorId]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getPendingRequests error:", err.message);
        res.json({ success: false, message: "Failed to load pending requests." });
    }
};

/* ── ACCEPT CONNECTION REQUEST (doctor action) ── */
const acceptConnection = async (req, res) => {
    const doctorId     = req.doctorId;
    const connectionId = parseInt(req.params.connection_id);

    try {
        const [rows] = await db.promise().query(
            "SELECT * FROM doctor_patient_connections WHERE id = ? AND doctor_id = ? AND status = 'pending'",
            [connectionId, doctorId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Pending request not found." });
        }

        await db.promise().query(
            "UPDATE doctor_patient_connections SET status = 'accepted', connected_at = NOW(), responded_at = NOW() WHERE id = ?",
            [connectionId]
        );

        // FIX: proactively create the chat room the moment a connection is
        // accepted, instead of waiting for someone to open /chat/contacts.
        // Harmless if it already exists (ensureRoomForConnection is idempotent).
        try {
            const { ensureRoomForConnection } = require("../utils/chatAccess");
            await ensureRoomForConnection(connectionId, doctorId, rows[0].patient_id);
        } catch (roomErr) {
            console.error("ensureRoomForConnection on accept failed:", roomErr.message);
        }

        res.json({ success: true, message: "Connection accepted." });
    } catch (err) {
        console.error("acceptConnection error:", err.message);
        res.json({ success: false, message: "Failed to accept connection." });
    }
};

/* ── REJECT CONNECTION REQUEST (doctor action) ── */
const rejectConnection = async (req, res) => {
    const doctorId     = req.doctorId;
    const connectionId = parseInt(req.params.connection_id);

    try {
        const [rows] = await db.promise().query(
            "SELECT * FROM doctor_patient_connections WHERE id = ? AND doctor_id = ? AND status = 'pending'",
            [connectionId, doctorId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Pending request not found." });
        }

        await db.promise().query(
            "UPDATE doctor_patient_connections SET status = 'rejected', responded_at = NOW() WHERE id = ?",
            [connectionId]
        );

        res.json({ success: true, message: "Connection declined." });
    } catch (err) {
        console.error("rejectConnection error:", err.message);
        res.json({ success: false, message: "Failed to decline connection." });
    }
};

/* ── DISCONNECT PATIENT (doctor removes an accepted patient) ── */
const disconnectPatient = async (req, res) => {
    const doctorId     = req.doctorId;
    const connectionId = parseInt(req.params.connection_id);

    if (isNaN(connectionId)) {
        return res.status(400).json({ success: false, message: "Invalid connection ID." });
    }

    try {
        const [anyRow] = await db.promise().query(
            "SELECT id, doctor_id, status FROM doctor_patient_connections WHERE id = ?",
            [connectionId]
        );

        if (anyRow.length === 0) {
            return res.status(404).json({ success: false, message: "Connection not found." });
        }

        if (anyRow[0].doctor_id !== doctorId) {
            return res.status(403).json({ success: false, message: "You are not authorized to remove this connection." });
        }

        if (anyRow[0].status !== "accepted") {
            return res.status(400).json({ success: false, message: "Only accepted connections can be disconnected." });
        }

        // FIX: notify any live chat session BEFORE the row (and its
        // cascading chat_rooms / chat_messages) is deleted, otherwise
        // we'd have no way to look up which room_id to notify.
        await notifyChatRoomEnded(connectionId);

        await db.promise().query(
            "DELETE FROM doctor_patient_connections WHERE id = ?",
            [connectionId]
        );

        res.json({ success: true, message: "Connection removed successfully." });
    } catch (err) {
        console.error("disconnectPatient error:", err.message);
        res.json({ success: false, message: "Failed to disconnect. Please try again." });
    }
};

/* ── DISCONNECT DOCTOR (patient removes an accepted doctor) ── */
const disconnectDoctor = async (req, res) => {
    const patientId    = req.userId;
    const connectionId = parseInt(req.params.connection_id);

    if (isNaN(connectionId)) {
        return res.status(400).json({ success: false, message: "Invalid connection ID." });
    }

    try {
        const [anyRow] = await db.promise().query(
            "SELECT id, patient_id, status FROM doctor_patient_connections WHERE id = ?",
            [connectionId]
        );

        if (anyRow.length === 0) {
            return res.status(404).json({ success: false, message: "Connection not found." });
        }

        if (anyRow[0].patient_id !== patientId) {
            return res.status(403).json({ success: false, message: "You are not authorized to remove this connection." });
        }

        if (anyRow[0].status !== "accepted") {
            return res.status(400).json({ success: false, message: "Only accepted connections can be disconnected." });
        }

        // FIX: same reasoning as disconnectPatient above.
        await notifyChatRoomEnded(connectionId);

        await db.promise().query(
            "DELETE FROM doctor_patient_connections WHERE id = ?",
            [connectionId]
        );

        res.json({ success: true, message: "Connection removed successfully." });
    } catch (err) {
        console.error("disconnectDoctor error:", err.message);
        res.json({ success: false, message: "Failed to disconnect. Please try again." });
    }
};

/* ── GET CONNECTION STATUS (patient view — all their requests) ── */
const getConnectionStatus = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (parseInt(req.userId) !== requestedId) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
        const [rows] = await db.promise().query(
            `SELECT dpc.id AS connection_id, dpc.status, dpc.requested_at, dpc.responded_at,
                    d.id AS doctor_id, d.name, d.speciality, d.invite_code, d.profile_photo
             FROM doctor_patient_connections dpc
             JOIN doctors d ON d.id = dpc.doctor_id
             WHERE dpc.patient_id = ?
             ORDER BY dpc.requested_at DESC`,
            [requestedId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getConnectionStatus error:", err.message);
        res.json({ success: false, message: "Failed to load connection status." });
    }
};

/* ── GET PATIENT DETAIL (doctor view) ── */
const getPatientDetail = async (req, res) => {
    const doctorId  = req.doctorId;
    const patientId = parseInt(req.params.patient_id);

    try {
        const [conn] = await db.promise().query(
            "SELECT id FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ? AND status = 'accepted'",
            [doctorId, patientId]
        );
        if (conn.length === 0)
            return res.status(403).json({ success: false, message: "This patient is not connected to you." });

        const [[profile]] = await db.promise().query(`
            SELECT u.name, u.email, p.phone, p.dob, p.gender, p.blood_group,
                   p.height, p.weight, p.conditions, p.profile_image
            FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = ?`, [patientId]);

        const [symptoms] = await db.promise().query(
            "SELECT symptoms, condition_name, severity, created_at FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            [patientId]
        );

        const [reports] = await db.promise().query(
            "SELECT id, filename, filesize, filetype, uploaded_at FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC",
            [patientId]
        );

        res.json({ success: true, profile, symptoms, reports });
    } catch (err) {
        console.error("getPatientDetail error:", err.message);
        res.json({ success: false, message: "Failed to load patient data." });
    }
};

/* ── GET SINGLE PATIENT REPORT (doctor view) ── */
// GET /doctor/patients/:patient_id/reports/:report_id
// Verifies doctor is accepted-connected to the patient before serving the file.
const getPatientReport = async (req, res) => {
    const doctorId  = req.doctorId;
    const patientId = parseInt(req.params.patient_id);
    const reportId  = parseInt(req.params.report_id);

    if (isNaN(patientId) || isNaN(reportId)) {
        return res.status(400).json({ success: false, message: "Invalid patient or report ID." });
    }

    try {
        // Verify doctor is connected to this patient
        const [conn] = await db.promise().query(
            "SELECT id FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ? AND status = 'accepted'",
            [doctorId, patientId]
        );
        if (conn.length === 0) {
            return res.status(403).json({ success: false, message: "Access denied. Patient is not connected to you." });
        }

        // Fetch the report (including dataurl)
        const [rows] = await db.promise().query(
            "SELECT id, filename, filetype, filesize, dataurl FROM reports WHERE id = ? AND user_id = ?",
            [reportId, patientId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Report not found." });
        }
        if (!rows[0].dataurl) {
            return res.status(404).json({ success: false, message: "Report file data not available." });
        }

        res.json({ success: true, ...rows[0] });
    } catch (err) {
        console.error("getPatientReport error:", err.message);
        res.status(500).json({ success: false, message: "Failed to load report." });
    }
};

/* ── CONNECT PATIENT TO DOCTOR (patient action — sets pending) ── */
const connectDoctor = async (req, res) => {
    const patientId   = req.userId;
    const { invite_code } = req.body;

    if (!invite_code)
        return res.json({ success: false, message: "Please enter an invite code." });

    try {
        const [doctors] = await db.promise().query(
            "SELECT id, name, speciality FROM doctors WHERE invite_code = ?",
            [invite_code.toUpperCase().trim()]
        );
        if (doctors.length === 0)
            return res.json({ success: false, message: "Invalid invite code. Please check with your doctor." });

        const doctor = doctors[0];

        const [existing] = await db.promise().query(
            "SELECT id, status FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ?",
            [doctor.id, patientId]
        );

        if (existing.length > 0) {
            const status = existing[0].status;
            if (status === 'accepted')
                return res.json({ success: false, message: `You are already connected to Dr. ${doctor.name}.` });
            if (status === 'pending')
                return res.json({ success: false, message: `Your request to Dr. ${doctor.name} is already pending approval.` });
            if (status === 'rejected') {
                await db.promise().query(
                    "UPDATE doctor_patient_connections SET status = 'pending', requested_at = NOW(), responded_at = NULL WHERE id = ?",
                    [existing[0].id]
                );
                return res.json({
                    success: true,
                    pending: true,
                    message: `Connection request re-sent to Dr. ${doctor.name}. Waiting for approval.`,
                    doctor
                });
            }
        }

        await db.promise().query(
            "INSERT INTO doctor_patient_connections (doctor_id, patient_id, status, requested_at) VALUES (?, ?, 'pending', NOW())",
            [doctor.id, patientId]
        );

        res.json({
            success: true,
            pending: true,
            message: `Connection request sent to Dr. ${doctor.name}. Waiting for their approval.`,
            doctor
        });
    } catch (err) {
        console.error("connectDoctor error:", err.message);
        res.json({ success: false, message: "Failed to connect. Please try again." });
    }
};

/* ── GET MY DOCTORS (patient view — all statuses) ── */
const getMyDoctors = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (parseInt(req.userId) !== requestedId) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
        const [rows] = await db.promise().query(
            `SELECT d.id, d.name, d.speciality, d.invite_code,
                    d.hospital, d.city, d.state, d.experience_years,
                    d.languages, d.bio, d.profile_photo, d.is_verified,
                    dpc.connected_at, dpc.status, dpc.requested_at, dpc.responded_at,
                    dpc.id AS connection_id
             FROM doctor_patient_connections dpc
             JOIN doctors d ON d.id = dpc.doctor_id
             WHERE dpc.patient_id = ?
             ORDER BY dpc.requested_at DESC`,
            [requestedId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getMyDoctors error:", err.message);
        res.json({ success: false, message: "Failed to load your doctors." });
    }
};

/* ── GOOGLE AUTH FOR DOCTORS ── */
const googleAuthDoctor = async (req, res) => {
    const { name, email, google_id } = req.body;

    if (!email || !google_id)
        return res.status(400).json({ success: false, message: "Missing Google credentials." });

    try {
        const [rows] = await db.promise().query(
            "SELECT * FROM doctors WHERE google_id = ? OR email = ?",
            [google_id, email.toLowerCase()]
        );

        if (rows.length > 0) {
            const doctor = rows[0];
            if (!doctor.google_id) {
                await db.promise().query(
                    "UPDATE doctors SET google_id = ? WHERE id = ?",
                    [google_id, doctor.id]
                );
            }
            const token = signToken(doctor.id);
            return res.json({
                success: true, token,
                doctor: {
                    id: doctor.id, name: doctor.name, email: doctor.email,
                    speciality: doctor.speciality, invite_code: doctor.invite_code
                }
            });
        }

        let invite_code = generateInviteCode();
        let [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        while (codeCheck.length > 0) {
            invite_code = generateInviteCode();
            [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        }

        // is_verified = 0 — must complete profile first
        const [result] = await db.promise().query(
            `INSERT INTO doctors
             (name, email, password, speciality, invite_code, google_id, is_verified)
             VALUES (?, ?, NULL, ?, ?, ?, 0)`,
            [name || "Doctor", email.toLowerCase(), "General Physician", invite_code, google_id]
        );

        const token = signToken(result.insertId);
        res.json({
            success: true, token,
            doctor: {
                id: result.insertId, name: name || "Doctor",
                email: email.toLowerCase(), speciality: "General Physician", invite_code
            }
        });

    } catch (err) {
        console.error("googleAuthDoctor error:", err.message);
        res.json({ success: false, message: "Google sign-in failed. Please try again." });
    }
};

/* ── DELETE DOCTOR ACCOUNT ── */
const deleteDoctorAccount = async (req, res) => {
    const doctorId = req.doctorId;
    try {
        await db.promise().query(
            "DELETE FROM doctor_patient_connections WHERE doctor_id = ?",
            [doctorId]
        );
        await db.promise().query(
            "DELETE FROM doctors WHERE id = ?",
            [doctorId]
        );
        return res.json({ success: true, message: "Doctor account deleted successfully." });
    } catch (err) {
        console.error("deleteDoctorAccount error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete account." });
    }
};

module.exports = {
    registerDoctor, loginDoctor,
    getDoctorProfile, updateDoctorProfile, getPublicDoctor,
    getAllDoctors, getPatients, getPatientDetail, getPatientReport,
    connectDoctor, googleAuthDoctor, deleteDoctorAccount,
    getMyDoctors,
    getPendingRequests, acceptConnection, rejectConnection, getConnectionStatus,
    disconnectPatient, disconnectDoctor
};