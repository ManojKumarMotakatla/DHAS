const express   = require("express");
const router    = express.Router();
const { saveSymptoms, getSymptoms } = require("../controllers/symptomController");

router.post("/save",          saveSymptoms);
router.get("/history/:user_id", getSymptoms);

module.exports = router;