// ============================================================
// DHAS — frontend/js/auth.js
//
// FIX P1.1 — REMOVED SHA-256 hashing from the frontend.
//
// THE BUG THAT WAS HERE:
//   Frontend was hashing the password with SHA-256 before
//   sending it to the backend. The backend then called:
//     bcrypt.compare(sha256_string, bcrypt_hash)
//   Bcrypt was comparing a SHA-256 hash against a bcrypt hash
//   of the ORIGINAL password. These will never match unless
//   the password was also registered with the same SHA-256
//   pre-hash, creating a brittle dependency.
//
//   The correct flow is:
//     Frontend  → sends plain password over HTTPS
//     Backend   → bcrypt.hash(plain) on register
//     Backend   → bcrypt.compare(plain, stored_hash) on login
//
// FIX P1.5 — Uses window.API_BASE from config.js instead of
//             the hardcoded "http://localhost:3007" string.
//
// FIX P1.6 — Uses window.getAuthHeaders from config.js.
//             The local getHeaders() function is removed.
//
// IMPORTANT: config.js MUST be loaded before this file.
//   <script src="js/config.js"></script>
//   <script src="js/auth.js"></script>
// ============================================================

// ── LOGIN ──────────────────────────────────────────────────────
// Called from login.html after the user submits the form.
// Sends plain password — bcrypt on the backend handles security.
function handleLogin(email, password) {
    if (!email || !password) {
        showError("Please fill in all fields.");
        return;
    }

    fetch(window.API_BASE + "/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password })   // ← plain password, no SHA-256
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
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
        showError("Cannot connect to server. Make sure the backend is running.");
    });
}

// ── REGISTER ────────────────────────────────────────────────────
// Called from register.html. Sends plain password.
function handleRegister(name, email, password) {
    if (!name || !email || !password) {
        showError("Please fill in all fields.");
        return;
    }

    fetch(window.API_BASE + "/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, email, password })   // ← plain password
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
        showError("Cannot connect to server. Make sure the backend is running.");
    });
}

// ── LOGOUT ──────────────────────────────────────────────────────
function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("dhas_user");
        localStorage.removeItem("dhas_token");
        window.location.href = "login.html";
    }
}

// ── GOOGLE AUTH ──────────────────────────────────────────────────
async function handleGoogleAuth(name, email, googleId) {
    try {
        const res  = await fetch(window.API_BASE + "/auth/google", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name, email, google_id: googleId })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem("dhas_token", data.token);
            localStorage.setItem("dhas_user",  JSON.stringify(data.user));
            window.location.href = "dashboard.html";
        } else {
            showError(data.message || "Google sign-in failed.");
        }
    } catch (err) {
        console.error("Google auth error:", err);
        showError("Cannot connect to server. Make sure the backend is running.");
    }
}

// ── UI HELPERS ───────────────────────────────────────────────────
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
    btn.id              = "registerRedirectBtn";
    btn.href            = "register.html";
    btn.className       = "btn-dhas primary mt-12";
    btn.style.cssText   = "display:block;text-align:center;margin-top:10px;";
    btn.textContent     = "Go to Register →";
    const anchor = document.getElementById("loginError") || document.getElementById("errorMsg");
    if (anchor) anchor.after(btn);
}

function showLoginLink() {
    if (document.getElementById("loginRedirectBtn")) return;
    const btn = document.createElement("a");
    btn.id              = "loginRedirectBtn";
    btn.href            = "login.html";
    btn.className       = "btn-dhas primary mt-12";
    btn.style.cssText   = "display:block;text-align:center;margin-top:10px;";
    btn.textContent     = "Go to Login →";
    const anchor = document.getElementById("errorMsg");
    if (anchor) anchor.after(btn);
}