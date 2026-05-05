// ============================================
// DHAS - auth.js (frontend)
// Handles login & register with DB responses
// ============================================

function handleLogin() {
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    // Basic validation
    if (!email || !password) {
        showError("Please fill in all fields.");
        return;
    }

    fetch("http://localhost:3007/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Save user info to localStorage
            localStorage.setItem("dhas_user", JSON.stringify(data.user));
            // Go to dashboard
            window.location.href = "dashboard.html";

        } else if (data.notRegistered) {
            // User doesn't exist → tell them to register
            showError("No account found with this email. Please register first.");
            // Show register link button
            showRegisterLink();

        } else {
            // Wrong password or other error
            showError(data.message || "Login failed. Please try again.");
        }
    })
    .catch(err => {
        console.error(err);
        showError("Cannot connect to server. Make sure backend is running.");
    });
}


function handleRegister() {
    const name     = document.getElementById("name").value.trim();
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    // Validation
    if (!name || !email || !password) {
        showError("Please fill in all fields.");
        return;
    }
    if (password.length < 6) {
        showError("Password must be at least 6 characters.");
        return;
    }
    if (!email.includes("@")) {
        showError("Please enter a valid email address.");
        return;
    }

    fetch("http://localhost:3007/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showSuccess("Account created successfully! Redirecting to login...");
            setTimeout(() => window.location.href = "login.html", 1500);

        } else if (data.alreadyExists) {
            // Already registered → go to login
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


// ── Show error message ──────────────────────
function showError(msg) {
    const el = document.getElementById("errorMsg");
    const ok = document.getElementById("successMsg");
    if (ok) ok.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

// ── Show success message ────────────────────
function showSuccess(msg) {
    const el = document.getElementById("successMsg");
    const er = document.getElementById("errorMsg");
    if (er) er.style.display = "none";
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

// ── Show "Go to Register" button on login page ──
function showRegisterLink() {
    let btn = document.getElementById("registerRedirectBtn");
    if (!btn) {
        btn = document.createElement("a");
        btn.id = "registerRedirectBtn";
        btn.href = "regiester.html";
        btn.className = "btn-dhas primary mt-12";
        btn.style.display = "block";
        btn.style.textAlign = "center";
        btn.textContent = "Go to Register →";
        document.getElementById("errorMsg").after(btn);
    }
}

// ── Show "Go to Login" button on register page ──
function showLoginLink() {
    let btn = document.getElementById("loginRedirectBtn");
    if (!btn) {
        btn = document.createElement("a");
        btn.id = "loginRedirectBtn";
        btn.href = "login.html";
        btn.className = "btn-dhas primary mt-12";
        btn.style.display = "block";
        btn.style.textAlign = "center";
        btn.textContent = "Go to Login →";
        document.getElementById("errorMsg").after(btn);
    }
}