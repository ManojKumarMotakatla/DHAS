const db = require("../config/db");
const bcrypt = require("bcrypt");

/* ════════════════════════════════════════════════════════════════
   DHAS - Authentication Controller
   
   SECURITY FLOW:
   1. Browser: Password is SHA-256 hashed (login.html / register.html)
   2. Network: Only SHA-256 hash is sent to backend (NOT plain text)
   3. Backend: SHA-256 hash is bcrypt-hashed with unique salt
   4. Database: Only bcrypt hash is stored (NOT plain password, NOT SHA-256)
   
   This 2-layer approach protects against:
   - Rainbow table attacks (bcrypt salt)
   - Database leaks (even if DB is compromised, password can't be recovered)
   - Developer/admin seeing passwords (they only see bcrypt hash)
════════════════════════════════════════════════════════════════ */


/* ────────────────────────────────────────────────────────────────
   REGISTER — Create new user account
   
   Input from browser: { name, email, password: <SHA-256 hash> }
   Stored in DB: { name, email, password: <bcrypt hash> }
──────────────────────────────────────────────────────────────── */
const register = async (req, res) => {
    const { name, email, password } = req.body;

    // ✅ Validate input exists
    if (!name || !email || !password) {
        return res.json({
            success: false,
            message: "All fields are required."
        });
    }

    try {
        // ✅ Check if email already registered
        const checkSql = "SELECT id FROM users WHERE email = ?";
        
        db.query(checkSql, [email], async (err, result) => {
            if (err) {
                console.error("DB Error (check):", err);
                return res.json({
                    success: false,
                    message: "Database error. Please try again."
                });
            }

            // ✅ Duplicate email check
            if (result.length > 0) {
                return res.json({
                    success: false,
                    message: "This email is already registered. Please login.",
                    alreadyExists: true
                });
            }

            try {
                // ════════════════════════════════════════════════════════
                // 🔐 BCRYPT LAYER — Hash the incoming SHA-256 hash
                // ════════════════════════════════════════════════════════
                const salt = await bcrypt.genSalt(10);
                const bcryptHash = await bcrypt.hash(password, salt);

                console.log(`✅ Register: ${email} | bcrypt-hash generated`);

                // ════════════════════════════════════════════════════════
                // 💾 STORE IN DATABASE — Only the bcrypt hash
                // ════════════════════════════════════════════════════════
                const insertSql = `
                    INSERT INTO users (name, email, password, created_at)
                    VALUES (?, ?, ?, NOW())
                `;

                db.query(insertSql, [name, email, bcryptHash], (err2) => {
                    if (err2) {
                        console.error("DB Error (insert):", err2);
                        return res.json({
                            success: false,
                            message: "Registration failed. Please try again."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Account created successfully! Please login."
                    });
                });

            } catch (hashError) {
                console.error("Bcrypt Error:", hashError);
                return res.json({
                    success: false,
                    message: "Error processing password. Please try again."
                });
            }
        });

    } catch (error) {
        console.error("Register Error:", error);
        return res.json({
            success: false,
            message: "Server error. Please try again later."
        });
    }
};


/* ────────────────────────────────────────────────────────────────
   LOGIN — Authenticate user
   
   Input from browser: { email, password: <SHA-256 hash> }
   Compared with DB: stored <bcrypt hash>
──────────────────────────────────────────────────────────────── */
const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({
            success: false,
            message: "Email and password are required."
        });
    }

    const checkEmailSql = "SELECT id, name, email, password FROM users WHERE email = ?";
    
    db.query(checkEmailSql, [email], async (err, result) => {
        if (err) {
            console.error("DB Error (check):", err);
            return res.json({
                success: false,
                message: "Database error. Please try again."
            });
        }

        if (result.length === 0) {
            return res.json({
                success: false,
                message: "No account found with this email. Please register first.",
                notRegistered: true
            });
        }

        const user = result[0];

        // ── Google-only account trying to login with password ──────
        // If user signed up via Google, they have no password in DB.
        // Tell them to use Google Sign-In instead.
        if (!user.password) {
            return res.json({
                success: false,
                message: "This account uses Google Sign-In. Please login with Google."
            });
        }

        try {
            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                console.log(`❌ Login failed: ${email} (wrong password)`);
                return res.json({
                    success: false,
                    message: "Incorrect password. Please try again."
                });
            }

            console.log(`✅ Login success: ${email}`);
            res.json({
                success: true,
                message: "Login successful!",
                user: {
                    id:    user.id,
                    name:  user.name,
                    email: user.email
                }
            });

        } catch (error) {
            console.error("Bcrypt Compare Error:", error);
            return res.json({
                success: false,
                message: "Authentication error. Please try again."
            });
        }
    });
};


/* ────────────────────────────────────────────────────────────────
   GOOGLE AUTH — Login or Register via Google Sign-In
   
   Input from browser: { name, email, google_id }
   - If user exists (by google_id or email): log them in
   - If email exists but no google_id: link Google to their account
   - If new user: create account with no password
──────────────────────────────────────────────────────────────── */
const googleAuth = (req, res) => {
    const { name, email, google_id } = req.body;

    if (!email || !google_id) {
        return res.status(400).json({
            success: false,
            message: "Missing Google credentials."
        });
    }

    // Check if user already exists by google_id OR email
    const checkSql = "SELECT * FROM users WHERE google_id = ? OR email = ?";

    db.query(checkSql, [google_id, email], (err, rows) => {
        if (err) {
            console.error("Google Auth DB Error (check):", err);
            return res.json({
                success: false,
                message: "Database error. Please try again."
            });
        }

        if (rows.length > 0) {
            // ── Existing user ──────────────────────────────────────
            const user = rows[0];

            if (!user.google_id) {
                // They registered with email/password before — link Google ID now
                const linkSql = "UPDATE users SET google_id = ?, provider = 'google' WHERE id = ?";

                db.query(linkSql, [google_id, user.id], (err2) => {
                    if (err2) {
                        console.error("Google Auth DB Error (link):", err2);
                        return res.json({
                            success: false,
                            message: "Failed to link Google account."
                        });
                    }

                    console.log(`✅ Google linked to existing account: ${email}`);
                    return res.json({
                        success: true,
                        user: { id: user.id, name: user.name, email: user.email }
                    });
                });

            } else {
                // Already a Google user — just log them in
                console.log(`✅ Google login: ${email}`);
                return res.json({
                    success: true,
                    user: { id: user.id, name: user.name, email: user.email }
                });
            }

        } else {
            // ── New user — create account with no password ─────────
            const insertSql = `
                INSERT INTO users (name, email, password, provider, google_id, created_at)
                VALUES (?, ?, NULL, 'google', ?, NOW())
            `;

            db.query(insertSql, [name, email, google_id], (err2, result) => {
                if (err2) {
                    console.error("Google Auth DB Error (insert):", err2);
                    return res.json({
                        success: false,
                        message: "Failed to create account. Please try again."
                    });
                }

                console.log(`✅ New Google user registered: ${email}`);
                res.json({
                    success: true,
                    user: { id: result.insertId, name, email }
                });
            });
        }
    });
};


module.exports = { register, login, googleAuth };