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

/* ── REGISTER ── */
const registerDoctor = async (req, res) => {
    const { name, email, password, speciality } = req.body;
    if (!name || !email || !password)
        return res.json({ success: false, message: "Name, email and password are required." });

    try {
        const [exists] = await db.promise().query("SELECT id FROM doctors WHERE email = ?", [email.toLowerCase()]);
        if (exists.length > 0)
            return res.json({ success: false, message: "Email already registered.", alreadyExists: true });

        const hash       = await bcrypt.hash(password, 10);
        let invite_code  = generateInviteCode();

        // Ensure uniqueness
        let [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        while (codeCheck.length > 0) {
            invite_code = generateInviteCode();
            [codeCheck] = await db.promise().query("SELECT id FROM doctors WHERE invite_code = ?", [invite_code]);
        }

        const [result] = await db.promise().query(
            "INSERT INTO doctors (name, email, password, speciality, invite_code) VALUES (?, ?, ?, ?, ?)",
            [name.trim(), email.toLowerCase(), hash, speciality || "General Physician", invite_code]
        );

        res.json({ success: true, message: "Doctor account created! Please login." });
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

// Account created with Google Sign-In
if (!doctor.password) {
    return res.json({
        success: false,
        message: "This account was created using Google Sign-In. Please continue with Google."
    });
}

const match = await bcrypt.compare(password, doctor.password);

if (!match)
    return res.json({
        success: false,
        message: "Incorrect password."
    });
      

        const token = signToken(doctor.id);
        res.json({
            success: true,
            token,
            doctor: { id: doctor.id, name: doctor.name, email: doctor.email, speciality: doctor.speciality, invite_code: doctor.invite_code }
        });
    } catch (err) {
        console.error("Doctor login error:", err.message);
        res.json({ success: false, message: "Login failed. Please try again." });
    }
};

/* ── GET CONNECTED PATIENTS ── */
const getPatients = async (req, res) => {
    const doctorId = req.doctorId;
    try {
        const [rows] = await db.promise().query(`
            SELECT u.id, u.name, u.email, u.created_at,
                   p.blood_group, p.conditions, p.height, p.weight,
                   dpc.connected_at,
                   (SELECT COUNT(*) FROM symptoms WHERE user_id = u.id) AS symptom_count,
                   (SELECT COUNT(*) FROM reports  WHERE user_id = u.id) AS report_count
            FROM doctor_patient_connections dpc
            JOIN users         u ON u.id = dpc.patient_id
            LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE dpc.doctor_id = ?
            ORDER BY dpc.connected_at DESC
        `, [doctorId]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getPatients error:", err.message);
        res.json({ success: false, message: "Failed to load patients." });
    }
};

/* ── GET PATIENT DETAIL (symptoms + reports) ── */
const getPatientDetail = async (req, res) => {
    const doctorId  = req.doctorId;
    const patientId = parseInt(req.params.patient_id);

    try {
        // Verify this patient is connected to this doctor
        const [conn] = await db.promise().query(
            "SELECT id FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ?",
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

/* ── CONNECT PATIENT TO DOCTOR (called by patient) ── */
const connectDoctor = async (req, res) => {
    const patientId  = req.userId; // patient JWT
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
            "SELECT id FROM doctor_patient_connections WHERE doctor_id = ? AND patient_id = ?",
            [doctor.id, patientId]
        );
        if (existing.length > 0)
            return res.json({ success: false, message: `You are already connected to Dr. ${doctor.name}.` });

        await db.promise().query(
            "INSERT INTO doctor_patient_connections (doctor_id, patient_id) VALUES (?, ?)",
            [doctor.id, patientId]
        );

        res.json({ success: true, message: `Successfully connected to Dr. ${doctor.name} (${doctor.speciality}).`, doctor });
    } catch (err) {
        console.error("connectDoctor error:", err.message);
        res.json({ success: false, message: "Failed to connect. Please try again." });
    }
};

/* ── GET DOCTOR PROFILE (for dashboard header) ── */
const getDoctorProfile = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            "SELECT id, name, email, speciality, invite_code, created_at FROM doctors WHERE id = ?",
            [req.doctorId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Doctor not found." });
        res.json({ success: true, doctor: rows[0] });
    } catch (err) {
        res.json({ success: false, message: "Failed to load profile." });
    }
};
/* ── GET ALL DOCTORS (public — for patient directory) ── */
const getAllDoctors = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, name, speciality, invite_code, created_at,
                    (SELECT COUNT(*) FROM doctor_patient_connections WHERE doctor_id = doctors.id) AS patient_count
             FROM doctors
             ORDER BY name ASC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("getAllDoctors error:", err.message);
        res.json({ success: false, message: "Failed to load doctors." });
    }
};

/* ── GOOGLE AUTH FOR DOCTORS ── */
const googleAuthDoctor = async (req, res) => {
    const { name, email, google_id, speciality } = req.body;

    if (!email || !google_id)
        return res.status(400).json({
            success: false,
            message: "Missing Google credentials."
        });

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
                success: true,
                token,
                doctor: {
                    id: doctor.id,
                    name: doctor.name,
                    email: doctor.email,
                    speciality: doctor.speciality,
                    invite_code: doctor.invite_code
                }
            });
        }

        let invite_code = generateInviteCode();

        let [codeCheck] = await db.promise().query(
            "SELECT id FROM doctors WHERE invite_code = ?",
            [invite_code]
        );

        while (codeCheck.length > 0) {
            invite_code = generateInviteCode();

            [codeCheck] = await db.promise().query(
                "SELECT id FROM doctors WHERE invite_code = ?",
                [invite_code]
            );
        }

        const [result] = await db.promise().query(
            `INSERT INTO doctors
            (name, email, password, speciality, invite_code, google_id)
            VALUES (?, ?, NULL, ?, ?, ?)`,
            [
                name || "Doctor",
                email.toLowerCase(),
                speciality || "General Physician",
                invite_code,
                google_id
            ]
        );

        const token = signToken(result.insertId);

        res.json({
            success: true,
            token,
            doctor: {
                id: result.insertId,
                name: name || "Doctor",
                email: email.toLowerCase(),
                speciality: speciality || "General Physician",
                invite_code
            }
        });

    } catch (err) {
        console.error("googleAuthDoctor error:", err.message);
        res.json({
            success: false,
            message: "Google sign-in failed. Please try again."
        });
    }
};

module.exports = {
    registerDoctor,
    loginDoctor,
    getPatients,
    getPatientDetail,
    connectDoctor,
    getDoctorProfile,
    getAllDoctors,
    googleAuthDoctor
};