// ============================================================
// Backend/middleware/chatAuthMiddleware.js
//
// The chat REST API is shared by both patients and doctors, who
// carry different JWT shapes:
//   patient token:  { userId }
//   doctor  token:  { doctorId, role: "doctor" }
//
// This middleware identifies which one sent the request and
// attaches req.role = "doctor" | "patient" plus the matching id,
// so a single set of routes/controllers can serve both sides —
// same trick already used by doctorAuthMiddleware.js, generalised.
// ============================================================

const jwt = require("jsonwebtoken");

const identifyChatUser = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Authentication required. Please log in." });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role === "doctor" && decoded.doctorId) {
            req.role     = "doctor";
            req.doctorId = decoded.doctorId;
        } else if (decoded.userId) {
            req.role   = "patient";
            req.userId = decoded.userId;
        } else {
            return res.status(401).json({ success: false, message: "Invalid session token." });
        }

        next();
    } catch (err) {
        const isExpired = err.name === "TokenExpiredError";
        return res.status(401).json({
            success: false,
            message: isExpired ? "Session expired. Please log in again." : "Invalid session. Please log in again."
        });
    }
};

module.exports = { identifyChatUser };