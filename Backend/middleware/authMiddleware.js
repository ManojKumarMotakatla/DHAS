// ── NEW FILE ──────────────────────────────────────────────────
// Backend/middleware/authMiddleware.js
//
// Verifies the JWT sent in the Authorization header.
// On success, sets req.userId to the real user ID from the token.
// On failure, returns 401 — the frontend cannot fake a user ID.
//
// HOW THE SECURITY WORKS:
// Before this file: frontend sends { user_id: 5 } in the body.
//   Any user could change that to { user_id: 999 } in DevTools.
// After this file:  backend extracts user_id from the signed token.
//   The token is signed with JWT_SECRET. Without the secret you
//   cannot forge a token, so user_id is now server-authoritative.
// ──────────────────────────────────────────────────────────────

const jwt = require("jsonwebtoken");

/**
 * Middleware that protects routes requiring a logged-in user.
 * Attach to any route that reads/writes user-specific data.
 *
 * Usage in a route file:
 *   const { requireAuth } = require("../middleware/authMiddleware");
 *   router.get("/profile/:user_id", requireAuth, getProfile);
 */
const requireAuth = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    // Expect:  Authorization: Bearer <token>
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }

    const token = authHeader.slice(7); // strip "Bearer "

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // decoded.userId is the value we stored when signing the token
        req.userId = decoded.userId;
        next();
    } catch (err) {
        const isExpired = err.name === "TokenExpiredError";
        return res.status(401).json({
            success: false,
            message: isExpired
                ? "Session expired. Please log in again."
                : "Invalid session. Please log in again."
        });
    }
};

/**
 * Checks that the authenticated user is accessing their own data.
 * Call after requireAuth.
 *
 * Usage in a controller:
 *   if (!isSelf(req, targetUserId)) return res.status(403).json(...)
 */
const isSelf = (req, targetUserId) => {
    return parseInt(req.userId) === parseInt(targetUserId);
};

module.exports = { requireAuth, isSelf };