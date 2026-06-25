const jwt = require("jsonwebtoken");

const requireDoctorAuth = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer "))
        return res.status(401).json({ success: false, message: "Doctor authentication required." });

    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "doctor")
            return res.status(403).json({ success: false, message: "Access restricted to doctors." });
        req.doctorId = decoded.doctorId;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid or expired session. Please log in again." });
    }
};

module.exports = { requireDoctorAuth };