require("dotenv").config();

const express     = require("express");
const cors        = require("cors");
const path        = require("path");
const rateLimit   = require("express-rate-limit");

const app = express();

// ── CORS — allow localhost and any local network IP (for mobile testing) ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3006";

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        // Allow the configured origin
        if (origin === ALLOWED_ORIGIN) return callback(null, true);
        // Allow local network IPs for mobile testing (192.168.x.x, 10.x.x.x)
        if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
    },
    methods:     ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

// ── Rate limiting ────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: "Too many requests. Please wait a few minutes." }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      10,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: "Too many login attempts. Please wait 15 minutes." }
});

app.use(globalLimiter);

// ── Body parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// ── Static files ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/test", (req, res) => {
    res.send("✅ DHAS Backend is running...");
});

// ── API Routes ─────────────────────────────────────────────────────────────
const authRoutes        = require("./Backend/routes/authRoutes");
const symptomRoutes     = require("./Backend/routes/symptomRoutes");
const reminderRoutes    = require("./Backend/routes/reminderRoutes");
const reminderLogRoutes = require("./Backend/routes/reminderlogroutes");
const reportRoutes      = require("./Backend/routes/reportRoutes");
const profileRoutes     = require("./Backend/routes/profileRoutes");

// Apply auth rate limiter to auth endpoints
app.use("/login",       authLimiter);
app.use("/register",    authLimiter);
app.use("/auth/google", authLimiter);

app.use("/",               authRoutes);
app.use("/profile",        profileRoutes);
app.use("/symptoms",       symptomRoutes);
app.use("/reminders",      reminderRoutes);
app.use("/reminder-logs",  reminderLogRoutes);

// Report upload needs higher body size limit
app.use("/reports", express.json({ limit: "20mb" }), reportRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.accepts("html") && !req.path.startsWith("/api")) {
        return res.status(404).sendFile(path.join(__dirname, "frontend", "404.html"), (err) => {
            if (err) res.status(404).json({ success: false, message: "Not found." });
        });
    }
    res.status(404).json({ success: false, message: "Not found." });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "File too large. Maximum size is 15 MB." });
    }
    if (err.message === "Not allowed by CORS") {
        return res.status(403).json({ success: false, message: "CORS policy blocked this request." });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📱 For mobile testing use: http://<your-local-IP>:${PORT}`);
    console.log(`   Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)`);
});