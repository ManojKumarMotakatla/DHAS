// ── CHANGED: login and googleAuth now sign and return a JWT ──
const db   = require("../config/db");
const bcrypt = require("bcrypt");
const jwt  = require("jsonwebtoken");

/* Helper: sign a token for the given user ID */
function signToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

/* ── REGISTER ────────────────────────────────────────────────── */
const register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.json({ success: false, message: "All fields are required." });
    }

    try {
        db.query("SELECT id FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) return res.json({ success: false, message: "Database error. Please try again." });

            if (result.length > 0) {
                return res.json({
                    success: false,
                    message: "This email is already registered. Please login.",
                    alreadyExists: true
                });
            }

            try {
                const salt       = await bcrypt.genSalt(10);
                const bcryptHash = await bcrypt.hash(password, salt);

                const insertSql = `INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, NOW())`;
                db.query(insertSql, [name, email, bcryptHash], (err2) => {
                    if (err2) return res.json({ success: false, message: "Registration failed. Please try again." });
                    res.json({ success: true, message: "Account created successfully! Please login." });
                });
            } catch (hashError) {
                return res.json({ success: false, message: "Error processing password. Please try again." });
            }
        });
    } catch (error) {
        return res.json({ success: false, message: "Server error. Please try again later." });
    }
};

/* ── LOGIN ───────────────────────────────────────────────────
   CHANGED: returns { token } alongside user object.
   The token is signed with JWT_SECRET and expires in 7 days.
   The frontend stores it and sends it as:
     Authorization: Bearer <token>
   on every subsequent request.
────────────────────────────────────────────────────────────── */
const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: "Email and password are required." });
    }

    db.query(
        "SELECT id, name, email, password FROM users WHERE email = ?",
        [email],
        async (err, result) => {
            if (err) return res.json({ success: false, message: "Database error. Please try again." });

            if (result.length === 0) {
                return res.json({
                    success: false,
                    message: "No account found with this email. Please register first.",
                    notRegistered: true
                });
            }

            const user = result[0];

            if (!user.password) {
                return res.json({
                    success: false,
                    message: "This account uses Google Sign-In. Please login with Google."
                });
            }

            try {
                const match = await bcrypt.compare(password, user.password);
                if (!match) {
                    return res.json({ success: false, message: "Incorrect password. Please try again." });
                }

                // ── CHANGED: sign and return token ──────────────
                const token = signToken(user.id);

                res.json({
                    success: true,
                    message: "Login successful!",
                    token,                        // ← NEW
                    user: { id: user.id, name: user.name, email: user.email }
                });
            } catch (error) {
                return res.json({ success: false, message: "Authentication error. Please try again." });
            }
        }
    );
};

/* ── GOOGLE AUTH ─────────────────────────────────────────────
   CHANGED: also returns token so Google-auth users get JWT too.
────────────────────────────────────────────────────────────── */
const googleAuth = (req, res) => {
    const { name, email, google_id } = req.body;

    if (!email || !google_id) {
        return res.status(400).json({ success: false, message: "Missing Google credentials." });
    }

    db.query(
        "SELECT * FROM users WHERE google_id = ? OR email = ?",
        [google_id, email],
        (err, rows) => {
            if (err) return res.json({ success: false, message: "Database error. Please try again." });

            if (rows.length > 0) {
                const user = rows[0];

                if (!user.google_id) {
                    // Link Google ID to existing email/password account
                    db.query(
                        "UPDATE users SET google_id = ?, provider = 'google' WHERE id = ?",
                        [google_id, user.id],
                        (err2) => {
                            if (err2) return res.json({ success: false, message: "Failed to link Google account." });

                            const token = signToken(user.id);   // ← NEW
                            return res.json({
                                success: true,
                                token,
                                user: { id: user.id, name: user.name, email: user.email }
                            });
                        }
                    );
                } else {
                    const token = signToken(user.id);           // ← NEW
                    return res.json({
                        success: true,
                        token,
                        user: { id: user.id, name: user.name, email: user.email }
                    });
                }
            } else {
                // New Google user
                const insertSql = `
                    INSERT INTO users (name, email, password, provider, google_id, created_at)
                    VALUES (?, ?, NULL, 'google', ?, NOW())
                `;
                db.query(insertSql, [name, email, google_id], (err2, result) => {
                    if (err2) return res.json({ success: false, message: "Failed to create account. Please try again." });

                    const token = signToken(result.insertId);   // ← NEW
                    res.json({
                        success: true,
                        token,
                        user: { id: result.insertId, name, email }
                    });
                });
            }
        }
    );
};

module.exports = { register, login, googleAuth };