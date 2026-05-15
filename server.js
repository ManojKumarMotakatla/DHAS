const express = require("express");
const cors    = require("cors");
const path    = require("path");
const db      = require("./backend/config/db");

const app = express();

// ── Middleware ──────────────────────────────
app.use(cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(express.static(path.join(__dirname,"frontend")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname,"frontend","index.html"));
});

// ── Test Route ──────────────────────────────
app.get("/test", (req, res) => {
    res.send("✅ DHAS Backend is running...");
});

// ── API Routes ──────────────────────────────
const authRoutes     = require("./backend/routes/authRoutes");
const symptomRoutes  = require("./backend/routes/symptomRoutes");
const reminderRoutes = require("./backend/routes/reminderRoutes");
const reportRoutes   = require("./backend/routes/reportRoutes");
const profileRoutes = require("./backend/routes/profileRoutes");
app.use("/", profileRoutes);  
app.use("/",          authRoutes);
app.use("/symptoms",  symptomRoutes);
app.use("/reminders", reminderRoutes);
app.use("/reports",   reportRoutes);

// ── Start Server ────────────────────────────
const PORT = process.env.PORT || 3006;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
