// ── CHANGED: stores JWT token; all API calls send Authorization header ──
//
// WHY THIS MATTERS:
//   Before: fetch("/profile/5", { body: {user_id:5} })
//     → anyone could change 5 to 999 in DevTools
//   After:  fetch("/profile/5", { headers: { Authorization: "Bearer <token>" } })
//     → the server ignores what the frontend claims; it reads user_id from the token
//
// STORAGE: token goes in localStorage under "dhas_token".
// It is sent automatically by the getHeaders() helper below.
// ─────────────────────────────────────────────────────────────────────

const API = "http://localhost:3006";

/* ── Helper: build auth headers for every fetch call ────────── */
function getHeaders() {
    const token = localStorage.getItem("dhas_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
}

/* Expose globally so report.js, reminder.js, symptom.js, etc. can use it */
window.getAuthHeaders = getHeaders;
window.API_BASE       = API;

/* ── LOGIN ────────────────────────────────────────────────────── */
function handleLogin(email, hashedPassword) {
    if (!email || !hashedPassword) { showError("Please fill in all fields."); return; }

    fetch(API + "/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password: hashedPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // CHANGED: store the token alongside the user object
            localStorage.setItem("dhas_token", data.token);
            localStorage.setItem("dhas_user",  JSON.stringify(data.user));
            window.location.href = "dashboard.html";

        } else if (data.notRegistered) {
            showError("No account found with this email. Please register first.");
            showRegisterLink();
        } else {
            showError(data.message || "Login failed. Please try again.");
        }
    })
    .catch(err => {
        console.error(err);
        showError("Cannot connect to server. Make sure backend is running.");
    });
}

/* ── REGISTER ─────────────────────────────────────────────────── */
function handleRegister(name, email, hashedPassword) {
    if (!name || !email || !hashedPassword) { showError("Please fill in all fields."); return; }

    fetch(API + "/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, email, password: hashedPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showSuccess("Account created successfully! Redirecting to login...");
            setTimeout(() => window.location.href = "login.html", 1500);
        } else if (data.alreadyExists) {
            showError("This email is already registered.");
            showLoginLink();
        } else {
            showError(data.message || "Registration failed. Please try again.");
        }
    })
    .catch(err => {
        console.error(err);
        showError("Cannot connect to server. Make sure backend is running.");
    });
}

/* ── LOGOUT ───────────────────────────────────────────────────── */
function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        // CHANGED: also clear the token
        localStorage.removeItem("dhas_user");
        localStorage.removeItem("dhas_token");
        window.location.href = "login.html";
    }
}

/* ── GOOGLE AUTH ──────────────────────────────────────────────── */
async function handleGoogleAuth(name, email, googleId) {
    try {
        const res  = await fetch(API + "/auth/google", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name, email, google_id: googleId })
        });
        const data = await res.json();

        if (data.success) {
            // CHANGED: store token
            localStorage.setItem("dhas_token", data.token);
            localStorage.setItem("dhas_user",  JSON.stringify(data.user));
            window.location.href = "dashboard.html";
        } else {
            showError(data.message || "Google sign-in failed.");
        }
    } catch (err) {
        console.error("Google auth error:", err);
        showError("Cannot connect to server. Make sure backend is running.");
    }
}

/* ── UI helpers ────────────────────────────────────────────────── */
function showError(msg) {
    const el  = document.getElementById("errorMsg");
    const ok  = document.getElementById("successMsg");
    if (ok) ok.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }

    const el2 = document.getElementById("loginError");
    if (el2) { el2.textContent = msg; el2.classList.remove("d-none"); el2.style.display = "block"; }
}

function showSuccess(msg) {
    const el = document.getElementById("successMsg");
    const er = document.getElementById("errorMsg");
    if (er) er.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

function showRegisterLink() {
    if (document.getElementById("registerRedirectBtn")) return;
    const btn = document.createElement("a");
    btn.id        = "registerRedirectBtn";
    btn.href      = "register.html";
    btn.className = "btn-dhas primary mt-12";
    btn.style.cssText = "display:block;text-align:center;margin-top:10px;";
    btn.textContent   = "Go to Register →";
    const anchor = document.getElementById("loginError") || document.getElementById("errorMsg");
    if (anchor) anchor.after(btn);
}

function showLoginLink() {
    if (document.getElementById("loginRedirectBtn")) return;
    const btn = document.createElement("a");
    btn.id        = "loginRedirectBtn";
    btn.href      = "login.html";
    btn.className = "btn-dhas primary mt-12";
    btn.style.cssText = "display:block;text-align:center;margin-top:10px;";
    btn.textContent   = "Go to Login →";
    const anchor = document.getElementById("errorMsg");
    if (anchor) anchor.after(btn);
}