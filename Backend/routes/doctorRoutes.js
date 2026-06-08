const express = require("express");
const router  = express.Router();
const {
    registerDoctor, loginDoctor,
    getDoctorProfile, updateDoctorProfile, getPublicDoctor,
    getAllDoctors, getPatients, getPatientDetail,
    connectDoctor, googleAuthDoctor
} = require("../controllers/doctorController");
const { requireDoctorAuth } = require("../middleware/doctorAuthMiddleware");
const { requireAuth }       = require("../middleware/authMiddleware");

// ── Public routes (no auth needed) ──────────────────────────
router.post("/register",              registerDoctor);
router.post("/login",                 loginDoctor);
router.post("/auth/google",           googleAuthDoctor);
router.get( "/all",                   getAllDoctors);          // verified doctors list for patients
router.get( "/public/:id",            getPublicDoctor);        // individual public doctor profile

// ── Doctor-auth required ─────────────────────────────────────
router.get(  "/profile",              requireDoctorAuth, getDoctorProfile);
router.post( "/profile/update",       requireDoctorAuth, updateDoctorProfile);
router.get(  "/patients",             requireDoctorAuth, getPatients);
router.get(  "/patients/:patient_id", requireDoctorAuth, getPatientDetail);

// ── Patient-auth required (patient connects to doctor) ───────
router.post("/connect",               requireAuth, connectDoctor);

module.exports = router;