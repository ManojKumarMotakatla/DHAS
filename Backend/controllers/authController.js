// ── CHANGED: P1.4 — no SQL error details sent to client
//            P5.2/P5.3 — backend input validation added
const db     = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");

function signToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

// ── P5.2/P5.3: Backend validation helpers ───────────────────────────────
function isValidEmail(email) {
    // RFC-compliant enough for backend — frontend already does deep validation
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function isStrongPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 6 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

function safeName(name) {
    return typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 100;
}

/* ── REGISTER ─────────────────────────────────────────────────────────── */
const register = async (req, res) => {
    const { name, email, password } = req.body;

    // P5.2/P5.3: Validate on backend, independent of frontend
    if (!safeName(name)) {
        return res.json({ success: false, message: "Full name must be 2–100 characters." });
    }
    if (!isValidEmail(email)) {
        return res.json({ success: false, message: "Please enter a valid email address." });
    }
    if (!isStrongPassword(password)) {
        return res.json({
            success: false,
            message: "Password must be at least 6 characters and include uppercase, lowercase, number, and symbol."
        });
    }

    try {
        db.query("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()], async (err, result) => {
            if (err) {
                // P1.4 FIX: log internally, send generic message to client
                console.error("Register query error:", err.message);
                return res.json({ success: false, message: "Registration failed. Please try again." });
            }

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

                db.query(
                    "INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, NOW())",
                    [name.trim(), email.trim().toLowerCase(), bcryptHash],
                    (err2) => {
                        if (err2) {
                            console.error("Register insert error:", err2.message);
                            return res.json({ success: false, message: "Registration failed. Please try again." });
                        }
                        res.json({ success: true, message: "Account created successfully! Please login." });
                    }
                );
            } catch (hashError) {
                console.error("Bcrypt error:", hashError.message);
                return res.json({ success: false, message: "Registration failed. Please try again." });
            }
        });
    } catch (error) {
        console.error("Register error:", error.message);
        return res.json({ success: false, message: "Server error. Please try again later." });
    }
};

/* ── LOGIN ────────────────────────────────────────────────────────────── */
const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: "Email and password are required." });
    }
    if (!isValidEmail(email)) {
        return res.json({ success: false, message: "Please enter a valid email address." });
    }

    db.query(
        "SELECT id, name, email, password FROM users WHERE email = ?",
        [email.trim().toLowerCase()],
        async (err, result) => {
            if (err) {
                console.error("Login query error:", err.message);
                return res.json({ success: false, message: "Login failed. Please try again." });
            }

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

                const token = signToken(user.id);
                res.json({
                    success: true,
                    message: "Login successful!",
                    token,
                    user: { id: user.id, name: user.name, email: user.email }
                });
            } catch (error) {
                console.error("Bcrypt compare error:", error.message);
                return res.json({ success: false, message: "Authentication error. Please try again." });
            }
        }
    );
};

/* ── GOOGLE AUTH ──────────────────────────────────────────────────────── */
const googleAuth = (req, res) => {
    const { name, email, google_id } = req.body;

    if (!email || !google_id) {
        return res.status(400).json({ success: false, message: "Missing Google credentials." });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "Invalid email from Google." });
    }

    db.query(
        "SELECT * FROM users WHERE google_id = ? OR email = ?",
        [google_id, email.trim().toLowerCase()],
        (err, rows) => {
            if (err) {
                console.error("Google auth query error:", err.message);
                return res.json({ success: false, message: "Login failed. Please try again." });
            }

            if (rows.length > 0) {
                const user = rows[0];

                if (!user.google_id) {
                    db.query(
                        "UPDATE users SET google_id = ?, provider = 'google' WHERE id = ?",
                        [google_id, user.id],
                        (err2) => {
                            if (err2) {
                                console.error("Google link error:", err2.message);
                                return res.json({ success: false, message: "Failed to link Google account." });
                            }
                            const token = signToken(user.id);
                            return res.json({
                                success: true,
                                token,
                                user: { id: user.id, name: user.name, email: user.email }
                            });
                        }
                    );
                } else {
                    const token = signToken(user.id);
                    return res.json({
                        success: true,
                        token,
                        user: { id: user.id, name: user.name, email: user.email }
                    });
                }
            } else {
                const insertSql = `
                    INSERT INTO users (name, email, password, provider, google_id, created_at)
                    VALUES (?, ?, NULL, 'google', ?, NOW())
                `;
                db.query(insertSql, [name || "User", email.trim().toLowerCase(), google_id], (err2, result) => {
                    if (err2) {
                        console.error("Google register error:", err2.message);
                        return res.json({ success: false, message: "Failed to create account. Please try again." });
                    }
                    const token = signToken(result.insertId);
                    res.json({
                        success: true,
                        token,
                        user: { id: result.insertId, name: name || "User", email: email.trim().toLowerCase() }
                    });
                });
            }
        }
    );
};

module.exports = { register, login, googleAuth };