"use strict";

/*
 * PIM Interactive UI Safe Edition
 * Hanya menambah interaksi visual. Tidak membaca, menulis, atau merender ulang data aset.
 */
(() => {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const THEME_KEY = "pim-dashboard-theme";

  const svg = (body) => `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${body}
    </svg>`;

  const icons = {
    search: svg('<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path>'),
    sun: svg('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>'),
    expand: svg('<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>'),
    up: svg('<path d="m18 15-6-6-6 6"></path>'),
    close: svg('<path d="m6 6 12 12M18 6 6 18"></path>')
  };

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);

    const themeButton = qs("#safeThemeButton");
    if (themeButton) {
      themeButton.innerHTML = theme === "dark" ? icons.sun : icons.moon;
      themeButton.title = theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap";
    }
  }

  function createControls() {
    if (qs("#safeUiControls")) return;

    const controls = document.createElement("div");
    controls.id = "safeUiControls";
    controls.className = "safe-ui-controls";
    controls.innerHTML = `
      <button id="safeQuickSearchButton" class="safe-icon-button" type="button" title="Pencarian cepat">
        ${icons.search}
      </button>
      <button id="safeThemeButton" class="safe-icon-button" type="button" title="Ganti tema">
        ${icons.moon}
      </button>
    `;
    document.body.appendChild(controls);

    const quickSearch = document.createElement("div");
    quickSearch.id = "safeQuickSearch";
    quickSearch.className = "safe-quick-search hidden";
    quickSearch.innerHTML = `
      <div class="safe-quick-search-box">
        <div class="safe-quick-search-head">
          ${icons.search}
          <input id="safeQuickSearchInput" type="search" placeholder="Cari aset, tagname, equipment, atau funloc..." autocomplete="off">
          <button id="safeQuickSearchClose" class="safe-icon-button" type="button">${icons.close}</button>
        </div>
        <div class="safe-quick-actions">
          <button type="button" data-safe-view="dashboard">Dashboard</button>
          <button type="button" data-safe-view="assets">Daftar Aset</button>
          <button type="button" data-safe-view="manage">Kelola</button>
        </div>
        <p>Tekan Enter untuk membuka Daftar Aset dengan kata pencarian tersebut.</p>
      </div>
    `;
    document.body.appendChild(quickSearch);

    const backToTop = document.createElement("button");
    backToTop.id = "safeBackToTop";
    backToTop.className = "safe-back-to-top";
    backToTop.type = "button";
    backToTop.title = "Kembali ke atas";
    backToTop.innerHTML = icons.up;
    document.body.appendChild(backToTop);

    const progress = document.createElement("div");
    progress.id = "safeScrollProgress";
    progress.className = "safe-scroll-progress";
    document.body.appendChild(progress);
  }

  function createMapTools() {
    const map = qs(".map");
    const image = qs(".map img");
    if (!map || !image || qs("#safeMapTools")) return;

    let zoom = 1;

    const tools = document.createElement("div");
    tools.id = "safeMapTools";
    tools.className = "safe-map-tools";
    tools.innerHTML = `
      <button id="safeMapFullscreen" type="button">${icons.expand}<span>Fullscreen</span></button>
      <div>
        <button id="safeZoomOut" type="button">−</button>
        <span id="safeZoomValue">100%</span>
        <button id="safeZoomIn" type="button">+</button>
      </div>
    `;
    map.appendChild(tools);

    const applyZoom = () => {
      image.style.transform = `scale(${zoom})`;
      const value = qs("#safeZoomValue");
      if (value) value.textContent = `${Math.round(zoom * 100)}%`;
    };

    qs("#safeZoomIn")?.addEventListener("click", () => {
      zoom = Math.min(2, zoom + 0.15);
      applyZoom();
    });

    qs("#safeZoomOut")?.addEventListener("click", () => {
      zoom = Math.max(1, zoom - 0.15);
      applyZoom();
    });

    qs("#safeMapFullscreen")?.addEventListener("click", async () => {
      if (!document.fullscreenElement) {
        await map.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    });
  }

  function openQuickSearch() {
    qs("#safeQuickSearch")?.classList.remove("hidden");
    window.setTimeout(() => qs("#safeQuickSearchInput")?.focus(), 20);
  }

  function closeQuickSearch() {
    qs("#safeQuickSearch")?.classList.add("hidden");
  }

  function openView(viewName) {
    if (typeof window.showView === "function") {
      window.showView(viewName);
    }
  }

  function submitQuickSearch() {
    const query = qs("#safeQuickSearchInput")?.value.trim() || "";
    openView("assets");

    window.setTimeout(() => {
      const assetSearch = qs("#search");
      if (!assetSearch) return;

      assetSearch.value = query;
      assetSearch.dispatchEvent(new Event("input", { bubbles: true }));
      assetSearch.focus();
    }, 50);

    closeQuickSearch();
  }

  function updateActiveNavigation(event) {
    const button = event.target.closest("[data-view]");
    if (!button) return;

    qsa("[data-view]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.view === button.dataset.view);
    });
  }

  function updateScrollIndicators() {
    const maximum = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maximum > 0 ? window.scrollY / maximum : 0;

    const progress = qs("#safeScrollProgress");
    if (progress) progress.style.width = `${Math.min(100, ratio * 100)}%`;

    qs("#safeBackToTop")?.classList.toggle("visible", window.scrollY > 450);
  }

  function bindEvents() {
    qs("#safeThemeButton")?.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "light";
      setTheme(current === "dark" ? "light" : "dark");
    });

    qs("#safeQuickSearchButton")?.addEventListener("click", openQuickSearch);
    qs("#safeQuickSearchClose")?.addEventListener("click", closeQuickSearch);

    qs("#safeQuickSearch")?.addEventListener("click", (event) => {
      if (event.target.id === "safeQuickSearch") closeQuickSearch();
    });

    qs("#safeQuickSearchInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitQuickSearch();
    });

    qsa("[data-safe-view]").forEach((button) => {
      button.addEventListener("click", () => {
        openView(button.dataset.safeView);
        closeQuickSearch();
      });
    });

    qs("#safeBackToTop")?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.addEventListener("click", updateActiveNavigation);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openQuickSearch();
      }

      if (event.key === "Escape") closeQuickSearch();
    });

    window.addEventListener("scroll", updateScrollIndicators, { passive: true });
  }

  function initialize() {
    createControls();
    createMapTools();
    bindEvents();
    updateScrollIndicators();
    setTheme(localStorage.getItem(THEME_KEY) || "light");

    const dashboardNavigation = qs('[data-view="dashboard"]');
    dashboardNavigation?.classList.add("is-active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
