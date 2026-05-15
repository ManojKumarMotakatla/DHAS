const express = require("express");
const router  = express.Router();
const { getProfile, saveProfile, deleteAccount } = require("../controllers/profileController");

/* ── Middleware: validate numeric user_id for param routes ── */
const validateUserId = (req, res, next) => {
    const id = req.params.user_id;
    if (!id || isNaN(id) || parseInt(id) <= 0) {
        return res.json({ success: false, message: "Invalid user ID." });
    }
    next();
};

/* ── Routes ── */
// POST /profile/save  — must be declared BEFORE /:user_id to avoid param match
router.post("/profile/save", saveProfile);

router.get("/profile/:user_id",    validateUserId, getProfile);
router.delete("/profile/:user_id", validateUserId, deleteAccount);

module.exports = router;