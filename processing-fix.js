"use strict";

/* Permanent UI safeguard for stuck processing overlays. */
(() => {
  const BUSY_ID = "appBusy";

  function unlockPage() {
    const busy = document.getElementById(BUSY_ID);
    if (busy) busy.remove();

    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.cursor = "";
    document.body.removeAttribute("aria-busy");

    document.querySelectorAll(".modal-backdrop, .loading-overlay, .processing-overlay")
      .forEach((element) => {
        const text = (element.textContent || "").trim().toLowerCase();
        if (text.includes("memproses") || text.includes("loading")) element.remove();
      });
  }

  // Remove any overlay already present.
  unlockPage();

  // Remove it again whenever an old script recreates it.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === BUSY_ID) {
          node.remove();
          unlockPage();
          return;
        }
        const nested = node.querySelector?.(`#${BUSY_ID}`);
        if (nested) {
          nested.remove();
          unlockPage();
          return;
        }
      }
    }
  });

  function start() {
    unlockPage();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener("pageshow", unlockPage);
  window.addEventListener("load", unlockPage);
  window.PIM_unlockPage = unlockPage;
})();
