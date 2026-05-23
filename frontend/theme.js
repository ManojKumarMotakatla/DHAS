/**
 * DHAS theme.js — load as FIRST script in <head>
 * Flat structure (no IIFE wrapping toggleTheme) so onclick="toggleTheme()" always works.
 */

var THEME_KEY = "dhas_theme";

var MOON_PATH = '<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
var SUN_PATH  = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z"/>';

/* Read saved preference or fall back to OS preference */
var _saved = localStorage.getItem(THEME_KEY);
var _osDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
var _isDark = _saved ? (_saved === "dark") : _osDark;

/* Apply class to <html> immediately (body doesn't exist yet) */
document.documentElement.classList.toggle("dark", _isDark);

/* Apply to body + sync UI elements once DOM is ready */
function _applyNow() {
    if (document.body) {
        document.body.classList.toggle("dark", _isDark);
    }
    _syncUI();
}

function _syncUI() {
    var labels = document.querySelectorAll(".theme-label");
    var icons  = document.querySelectorAll(".theme-icon");
    for (var i = 0; i < labels.length; i++) {
        labels[i].textContent = _isDark ? "Light" : "Dark";
    }
    for (var j = 0; j < icons.length; j++) {
        icons[j].innerHTML = _isDark ? SUN_PATH : MOON_PATH;
    }
}

/* Run as soon as possible */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _applyNow);
} else {
    _applyNow();
}

/* Public toggle — called by onclick="toggleTheme()" on every page */
function toggleTheme() {
    _isDark = !_isDark;
    document.documentElement.classList.toggle("dark", _isDark);
    if (document.body) {
        document.body.classList.toggle("dark", _isDark);
    }
    try {
        localStorage.setItem(THEME_KEY, _isDark ? "dark" : "light");
    } catch (e) {}
    _syncUI();
}

/* Public getter */
function isDarkMode() {
    return _isDark;
}

/* Respect OS changes only when user has no saved preference */
if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
        if (!localStorage.getItem(THEME_KEY)) {
            _isDark = e.matches;
            document.documentElement.classList.toggle("dark", _isDark);
            if (document.body) document.body.classList.toggle("dark", _isDark);
            _syncUI();
        }
    });
}