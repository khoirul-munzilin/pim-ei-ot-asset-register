"use strict";

/*
 * Compatibility hotfix untuk app.js versi lama.
 * app.js memakai identifier `table` pada pesan timeout galeri,
 * tetapi identifier tersebut belum didefinisikan.
 */
window.table = window.table || "asset_photos";

window.addEventListener("error", (event) => {
  if (String(event.message || "").includes("table is not defined")) {
    console.warn("Photo gallery compatibility hotfix applied.");
  }
});
