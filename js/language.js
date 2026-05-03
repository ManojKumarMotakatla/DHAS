// Load selected language on page load
window.onload = function () {
    const lang = localStorage.getItem("language");
    if (lang) {
        document.getElementById("selectedLang").innerText = "Selected: " + lang;
    }
};

// Set language
function setLanguage(lang) {
    localStorage.setItem("language", lang);
    document.getElementById("selectedLang").innerText = "Selected: " + lang;
}

// Back button
function goBack() {
    window.location.href = "dashboard.html";
}