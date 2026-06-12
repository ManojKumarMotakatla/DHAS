const express = require("express");
const router  = express.Router();
const {
    registerDoctor, loginDoctor,
    getDoctorProfile, updateDoctorProfile, getPublicDoctor,
    getAllDoctors, getPatients, getPatientDetail,
    connectDoctor, googleAuthDoctor, deleteDoctorAccount,
    getMyDoctors          // ← NEW: patient's connected doctors
} = require("../controllers/doctorController");
const { requireDoctorAuth } = require("../middleware/doctorAuthMiddleware");
const { requireAuth }       = require("../middleware/authMiddleware");

// ── Public routes (no auth needed) ──────────────────────────
router.post("/register",              registerDoctor);
router.post("/login",                 loginDoctor);
router.post("/auth/google",           googleAuthDoctor);
router.get( "/all",                   getAllDoctors);
router.get( "/public/:id",            getPublicDoctor);

// ── Doctor-auth required ─────────────────────────────────────
router.get(  "/profile",              requireDoctorAuth, getDoctorProfile);
router.post( "/profile/update",       requireDoctorAuth, updateDoctorProfile);
router.get(  "/patients",             requireDoctorAuth, getPatients);
router.get(  "/patients/:patient_id", requireDoctorAuth, getPatientDetail);
router.delete("/delete-account",      requireDoctorAuth, deleteDoctorAccount);

// ── Patient-auth required ────────────────────────────────────
router.post("/connect",               requireAuth, connectDoctor);
// NEW: patient sees their own connected doctors
router.get( "/my-doctors/:user_id",   requireAuth, getMyDoctors);

module.exports = router;