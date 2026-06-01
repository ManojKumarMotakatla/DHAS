// ── CHANGED: added dotenv + JWT middleware registration ──────
require("dotenv").config();   // ← NEW: must be first line so all process.env vars are set

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const db      = require("./Backend/config/db");

const app = express();

app.use(cors({
    origin:  "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.use(express.static(path.join(__dirname, "frontend")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/test", (req, res) => {
    res.send("✅ DHAS Backend is running...");
});

// ── API Routes ──────────────────────────────────────────────
const authRoutes     = require("./Backend/routes/authRoutes");
const symptomRoutes  = require("./Backend/routes/symptomRoutes");
const reminderRoutes = require("./Backend/routes/reminderRoutes");
const reportRoutes   = require("./Backend/routes/reportRoutes");
const profileRoutes  = require("./Backend/routes/profileRoutes");

// Auth routes are public (no JWT needed — they ARE the login)
app.use("/",          authRoutes);

// All other routes are protected — requireAuth is applied per-route inside each router
// ── CHANGED: replaced profileRoutes "/" mount so it doesn't shadow authRoutes ──
app.use("/profile",   profileRoutes);
app.use("/symptoms",  symptomRoutes);
app.use("/reminders", reminderRoutes);
app.use("/reports",   reportRoutes);

// ── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "File too large. Maximum size is 15 MB." });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Server error." });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});