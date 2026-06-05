require("dotenv").config();

const express     = require("express");
const cors        = require("cors");
const path        = require("path");
const fs          = require("fs");
const rateLimit   = require("express-rate-limit");

const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads/reports");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3006";

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (origin === ALLOWED_ORIGIN) return callback(null, true);
        if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)) {
            return callback(null, true);
        }
        if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
    },
    methods:        ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials:    true
}));

app.options("/{*splat}", cors());

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      300,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: "Too many requests. Please wait a few minutes." }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      15,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: "Too many login attempts. Please wait 15 minutes." }
});

app.use(globalLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));

// ── Static file serving ───────────────────────────────────────
// Serve uploaded report files (protected by auth at the API level;
// direct URL access is obscured by the timestamp+userid filename)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.static(path.join(__dirname, "frontend")));
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/test", (req, res) => {
    res.json({ success: true, message: "DHAS Backend is running", timestamp: new Date().toISOString() });
});

const authRoutes        = require("./Backend/routes/authRoutes");
const symptomRoutes     = require("./Backend/routes/symptomRoutes");
const reminderRoutes    = require("./Backend/routes/reminderRoutes");
const reminderLogRoutes = require("./Backend/routes/reminderlogroutes");
const reportRoutes      = require("./Backend/routes/reportRoutes");
const profileRoutes     = require("./Backend/routes/profileRoutes");

app.use("/login",       authLimiter);
app.use("/register",    authLimiter);
app.use("/auth/google", authLimiter);

app.use("/",              authRoutes);
app.use("/profile",       profileRoutes);
app.use("/symptoms",      symptomRoutes);
app.use("/reminders",     reminderRoutes);
app.use("/reminder-logs", reminderLogRoutes);

// Reports use larger body limit for the initial upload (base64 → buffer conversion)
app.use("/reports", express.json({ limit: "10mb" }), reportRoutes);

app.use("/{*splat}", (req, res) => {
    if (req.accepts("html") && !req.path.startsWith("/api")) {
        return res.status(404).sendFile(path.join(__dirname, "frontend", "404.html"), (err) => {
            if (err) res.status(404).json({ success: false, message: "Not found." });
        });
    }
    res.status(404).json({ success: false, message: "Not found." });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "File too large. Maximum size is 8 MB." });
    }
    if (err.message === "Not allowed by CORS") {
        return res.status(403).json({ success: false, message: "CORS policy blocked this request." });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ DHAS Server running on http://localhost:${PORT}`);
    console.log(`📁 Reports stored at: ${uploadsDir}`);
    console.log(`📱 For mobile: find your IP with "ipconfig" (Windows) or "ifconfig" (Mac/Linux)`);
    console.log(`   Then open: http://<YOUR-LOCAL-IP>:${PORT} on your phone`);
});