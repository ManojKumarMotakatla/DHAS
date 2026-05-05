const db = require("../config/db");

/* =========================
   REGISTER
========================= */
const register = (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.json({ success: false, message: "All fields are required." });
    }

    // Check if user already exists
    const checkSql = "SELECT * FROM users WHERE email = ?";
    db.query(checkSql, [email], (err, result) => {
        if (err) {
            return res.json({ success: false, message: "Database error." });
        }

        if (result.length > 0) {
            return res.json({ 
                success: false, 
                message: "Email already registered. Please login instead.",
                alreadyExists: true
            });
        }

        // Insert new user
        const insertSql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
        db.query(insertSql, [name, email, password], (err2) => {
            if (err2) {
                return res.json({ success: false, message: "Registration failed. Try again." });
            }
            res.json({ success: true, message: "Account created successfully! Please login." });
        });
    });
};

/* =========================
   LOGIN
========================= */
const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: "All fields are required." });
    }

    // First check if email exists
    const checkEmailSql = "SELECT * FROM users WHERE email = ?";
    db.query(checkEmailSql, [email], (err, result) => {
        if (err) {
            return res.json({ success: false, message: "Database error." });
        }

        if (result.length === 0) {
            // Not registered at all
            return res.json({ 
                success: false, 
                message: "No account found with this email. Please register first.",
                notRegistered: true
            });
        }

        // Email exists → check password
        const user = result[0];
        if (user.password !== password) {
            return res.json({ 
                success: false, 
                message: "Incorrect password. Please try again." 
            });
        }

        // All good → login success
        res.json({ 
            success: true, 
            message: "Login successful!",
            user: { id: user.id, name: user.name, email: user.email }
        });
    });
};

module.exports = { register, login };