const express = require("express");
const router  = express.Router();
const { uploadReport, getReports, deleteReport } = require("../controllers/reportController");

router.post("/upload",       uploadReport);
router.get("/get/:user_id",  getReports);
router.delete("/delete/:id", deleteReport);

module.exports = router;