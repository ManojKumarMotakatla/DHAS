// ── reportRoutes.js — CHANGED: protected with requireAuth ────
const express  = require("express");
const router   = express.Router();
const { uploadReport, getReports, viewReport, deleteReport } = require("../controllers/reportController");
const { requireAuth } = require("../middleware/authMiddleware");

router.post(   "/upload",    requireAuth, uploadReport);
router.get(    "/view/:id",  requireAuth, viewReport);
router.get(    "/:user_id",  requireAuth, getReports);
router.delete( "/:id",       requireAuth, deleteReport);

module.exports = router;