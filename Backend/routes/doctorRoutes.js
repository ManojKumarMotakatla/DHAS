const express = require("express");
const router  = express.Router();
const {
    registerDoctor, loginDoctor,
    getDoctorProfile, updateDoctorProfile, getPublicDoctor,
    getAllDoctors, getPatients, getPatientDetail,
    connectDoctor, googleAuthDoctor, deleteDoctorAccount,
    getMyDoctors,
    getPendingRequests, acceptConnection, rejectConnection, getConnectionStatus
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
router.get(   "/profile",                          requireDoctorAuth, getDoctorProfile);
router.post(  "/profile/update",                   requireDoctorAuth, updateDoctorProfile);
router.get(   "/patients",                         requireDoctorAuth, getPatients);
router.get(   "/patients/:patient_id",             requireDoctorAuth, getPatientDetail);
router.get(   "/pending-requests",                 requireDoctorAuth, getPendingRequests);
router.post(  "/accept/:connection_id",            requireDoctorAuth, acceptConnection);
router.post(  "/reject/:connection_id",            requireDoctorAuth, rejectConnection);
router.delete("/delete-account",                   requireDoctorAuth, deleteDoctorAccount);

// ── Patient-auth required ────────────────────────────────────
router.post("/connect",                            requireAuth, connectDoctor);
router.get( "/my-doctors/:user_id",                requireAuth, getMyDoctors);
router.get( "/connection-status/:user_id",         requireAuth, getConnectionStatus);

module.exports = router;