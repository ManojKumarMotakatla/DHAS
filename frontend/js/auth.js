// ============================================
// DHAS - auth.js (frontend)
// Handles login & register with DB responses
//
// SECURITY: This file receives SHA-256 hashed
// passwords from login.html / register.html.
// Plain-text passwords NEVER reach this file.
// The hash is sent to the backend, where it
// should be hashed again (bcrypt) before storage.
// ============================================


// ── LOGIN ─────────────────────────────────────────────────────
// Called by login.html AFTER the password is hashed.
// Parameters: email (string), hashedPassword (SHA-256 hex string)
// ──────────────────────────────────────────────────────────────
function handleLogin(email, hashedPassword) {

    if (!email || !hashedPassword) {
        showError("Please fill in all fields.");
        return;
    }

    fetch("http://https://dhas-production.up.railway.app/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ Only the hash is sent — plain text NEVER leaves the browser
        body: JSON.stringify({ email, password: hashedPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // ✅ Store only safe session info — NEVER store password or hash
            localStorage.setItem("dhas_user", JSON.stringify(data.user));
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


// ── REGISTER ──────────────────────────────────────────────────
// Called by register.html AFTER the password is hashed.
// Parameters: name, email (strings), hashedPassword (SHA-256 hex)
// ──────────────────────────────────────────────────────────────
function handleRegister(name, email, hashedPassword) {

    if (!name || !email || !hashedPassword) {
        showError("Please fill in all fields.");
        return;
    }

    fetch("http://https://dhas-production.up.railway.app/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ Only the hash is sent — plain text NEVER leaves the browser
        body: JSON.stringify({ name, email, password: hashedPassword })
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


// ── LOGOUT ────────────────────────────────────────────────────
// Called from dashboard.html navbar
// ──────────────────────────────────────────────────────────────
function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("dhas_user");   // clear session only
        window.location.href = "login.html";
    }
}


// ── Show error message ─────────────────────────────────────────
function showError(msg) {
    // register.html style
    const el = document.getElementById("errorMsg");
    const ok = document.getElementById("successMsg");
    if (ok) ok.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }

    // login.html Bootstrap style
    const el2 = document.getElementById("loginError");
    if (el2) { el2.textContent = msg; el2.classList.remove("d-none"); }
}

// ── Show success message ───────────────────────────────────────
function showSuccess(msg) {
    const el = document.getElementById("successMsg");
    const er = document.getElementById("errorMsg");
    if (er) er.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

// ── "Go to Register" button on login page ─────────────────────
function showRegisterLink() {
    let btn = document.getElementById("registerRedirectBtn");
    if (!btn) {
        btn = document.createElement("a");
        btn.id            = "registerRedirectBtn";
        btn.href          = "register.html";   // ✅ Fixed typo: was "regiester.html"
        btn.className     = "btn-dhas primary mt-12";
        btn.style.cssText = "display:block;text-align:center;margin-top:10px;";
        btn.textContent   = "Go to Register →";
        const anchor = document.getElementById("loginError") || document.getElementById("errorMsg");
        if (anchor) anchor.after(btn);
    }
}

// ── "Go to Login" button on register page ─────────────────────
function showLoginLink() {
    let btn = document.getElementById("loginRedirectBtn");
    if (!btn) {
        btn = document.createElement("a");
        btn.id            = "loginRedirectBtn";
        btn.href          = "login.html";
        btn.className     = "btn-dhas primary mt-12";
        btn.style.cssText = "display:block;text-align:center;margin-top:10px;";
        btn.textContent   = "Go to Login →";
        const anchor = document.getElementById("errorMsg");
        if (anchor) anchor.after(btn);
    }
}
// ── GOOGLE AUTH ───────────────────────────────────────────────
// Called by handleCredentialResponse in login.html / register.html
// after decoding the Google JWT. Saves user to DB if new,
// or logs them in if they already exist.
// ──────────────────────────────────────────────────────────────
async function handleGoogleAuth(name, email, googleId) {
    try {
        const res = await fetch("http://https://dhas-production.up.railway.app/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, google_id: googleId })
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem("dhas_user", JSON.stringify(data.user));
            window.location.href = "dashboard.html";
        } else {
            showError(data.message || "Google sign-in failed.");
        }

    } catch (err) {
        console.error("Google auth error:", err);
        showError("Cannot connect to server. Make sure backend is running.");
    }
}