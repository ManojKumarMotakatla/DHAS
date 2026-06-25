const express = require("express");
const router  = express.Router();
const {
    registerDoctor, loginDoctor,
    getDoctorProfile, updateDoctorProfile, getPublicDoctor,
    getAllDoctors, getPatients, getPatientDetail, getPatientReport,
    connectDoctor, googleAuthDoctor, deleteDoctorAccount,
    getMyDoctors,
    getPendingRequests, acceptConnection, rejectConnection, getConnectionStatus,
    disconnectPatient, disconnectDoctor
} = require("../controllers/doctorController");
const { requireDoctorAuth } = require("../middleware/doctorAuthMiddleware");
const { requireAuth }       = require("../middleware/authMiddleware");

// ── Public routes (no auth needed) ──────────────────────────────────────────
router.post("/register",              registerDoctor);
router.post("/login",                 loginDoctor);
router.post("/auth/google",           googleAuthDoctor);
router.get( "/all",                   getAllDoctors);
router.get( "/public/:id",            getPublicDoctor);

// ── Doctor-auth required ─────────────────────────────────────────────────────
router.get(   "/profile",                          requireDoctorAuth, getDoctorProfile);
router.post(  "/profile/update",                   requireDoctorAuth, updateDoctorProfile);
router.get(   "/patients",                                          requireDoctorAuth, getPatients);
router.get(   "/patients/:patient_id",                              requireDoctorAuth, getPatientDetail);
router.get(   "/patients/:patient_id/reports/:report_id",          requireDoctorAuth, getPatientReport);
router.get(   "/pending-requests",                 requireDoctorAuth, getPendingRequests);
router.post(  "/accept/:connection_id",            requireDoctorAuth, acceptConnection);
router.post(  "/reject/:connection_id",            requireDoctorAuth, rejectConnection);
router.delete("/delete-account",                   requireDoctorAuth, deleteDoctorAccount);

// Doctor disconnects one of their accepted patients
// DELETE /api/doctors/connections/:connection_id
// Auth: requireDoctorAuth — verifies doctor owns the connection
router.delete("/connections/:connection_id",       requireDoctorAuth, disconnectPatient);

// ── Patient-auth required ────────────────────────────────────────────────────
router.post("/connect",                            requireAuth, connectDoctor);
router.get( "/my-doctors/:user_id",                requireAuth, getMyDoctors);
router.get( "/connection-status/:user_id",         requireAuth, getConnectionStatus);

// Patient disconnects one of their accepted doctors
// DELETE /api/doctors/patient-connections/:connection_id
// Auth: requireAuth — verifies patient owns the connection
router.delete("/patient-connections/:connection_id", requireAuth, disconnectDoctor);

module.exports = router;