const express = require("express");
const router  = express.Router();
const { registerDoctor, loginDoctor, getPatients, getPatientDetail, connectDoctor, getDoctorProfile, getAllDoctors, googleAuthDoctor } = require("../controllers/doctorController");
const { requireDoctorAuth } = require("../middleware/doctorAuthMiddleware");
const { requireAuth } = require("../middleware/authMiddleware");

// Public routes (no auth)
router.post("/register",              registerDoctor);
router.post("/login",                 loginDoctor);
router.post("/auth/google",           googleAuthDoctor);
router.get( "/all",                   getAllDoctors);   // public doctor directory

// Doctor-auth required
router.get( "/profile",               requireDoctorAuth, getDoctorProfile);
router.get( "/patients",              requireDoctorAuth, getPatients);
router.get( "/patients/:patient_id",  requireDoctorAuth, getPatientDetail);

// Patient-auth required (patient connects to doctor)
router.post("/connect",               requireAuth, connectDoctor);

module.exports = router;