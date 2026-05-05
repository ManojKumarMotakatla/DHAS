const express = require("express");
const cors    = require("cors");
const path    = require("path");
const db      = require("./backend/config/db");

const app = express();

// ── Middleware ──────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve Frontend ──────────────────────────
// server.js is inside frontend/ folder
// so __dirname points to frontend/ directly
app.use(express.static(__dirname));

// ── Test Route ──────────────────────────────
app.get("/test", (req, res) => {
    res.send("✅ DHAS Backend is running...");
});

// ── API Routes ──────────────────────────────
const authRoutes     = require("./backend/routes/authRoutes");
const symptomRoutes  = require("./backend/routes/symptomRoutes");
const reminderRoutes = require("./backend/routes/reminderRoutes");
const reportRoutes   = require("./backend/routes/reportRoutes");

app.use("/",          authRoutes);
app.use("/symptoms",  symptomRoutes);
app.use("/reminders", reminderRoutes);
app.use("/reports",   reportRoutes);

// ── Start Server ────────────────────────────
app.listen(3007, () => {
    console.log("✅ Server running on http://localhost:3007");
});