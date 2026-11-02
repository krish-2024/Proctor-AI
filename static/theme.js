(function () {
  "use strict";

  const storageKey = "proctorai-theme";
  const savedTheme = localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;

    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(storageKey, nextTheme);
    button.setAttribute("aria-label", `Switch to ${nextTheme === "dark" ? "dark" : "light"} theme`);
    button.querySelector(".theme-icon").textContent = nextTheme === "dark" ? "☾" : "☀";
  });

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      const isDark = document.documentElement.dataset.theme === "dark";
      button.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
      button.querySelector(".theme-icon").textContent = isDark ? "☀" : "☾";
    });
  });
})();
