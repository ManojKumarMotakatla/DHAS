/**
 * DHAS — theme.js  (lightweight state manager)
 * Add <script src="theme.js"></script> as FIRST line in <head> of every page.
 * Each page owns its own CSS vars — this file only manages the dark class.
 */
(function () {
  const KEY = "dhas_theme";
  const saved = localStorage.getItem(KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let isDark = saved ? saved === "dark" : prefersDark;

  /* Apply to <html> immediately — body doesn't exist yet */
  document.documentElement.classList.toggle("dark", isDark);

  /* Apply to <body> + sync UI once DOM is ready */
  document.addEventListener("DOMContentLoaded", function () {
    document.body.classList.toggle("dark", isDark);
    _updateUI(isDark);
  });

  /* SVG paths */
  const MOON = '<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
  const SUN  = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z"/>';

  function _updateUI(dark) {
    document.querySelectorAll(".theme-label").forEach(el => {
      el.textContent = dark ? "Light" : "Dark";
    });
    document.querySelectorAll(".theme-icon").forEach(el => {
      el.innerHTML = dark ? SUN : MOON;
    });
  }

  /* Public API */
  window.toggleTheme = function () {
    isDark = !isDark;
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
    localStorage.setItem(KEY, isDark ? "dark" : "light");
    _updateUI(isDark);
  };

  window.isDarkMode = function () { return isDark; };

  /* Respect OS-level changes only if user hasn't set a preference */
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (!localStorage.getItem(KEY)) {
      isDark = e.matches;
      document.documentElement.classList.toggle("dark", isDark);
      if (document.body) document.body.classList.toggle("dark", isDark);
      _updateUI(isDark);
    }
  });
})();
