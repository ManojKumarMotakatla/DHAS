const express = require("express");
const router  = express.Router();
const { uploadReport, getReports, viewReport, deleteReport } = require("../controllers/reportController");

router.post("/upload",      uploadReport);
router.get("/view/:id",     viewReport);     // ← new (must be BEFORE /:user_id)
router.get("/:user_id",     getReports);     // ← changed from /get/:user_id
router.delete("/:id",       deleteReport);   // ← changed from /delete/:id

module.exports = router;