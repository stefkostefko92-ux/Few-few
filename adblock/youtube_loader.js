// Hands the live-update YouTube extras to youtube_main.js (MAIN world) as inert
// JSON on a DOM event — data, never code: extra ad field names, extra ad renderer
// names, request flags and the flags kill switch.
//
// youtube_main itself is no longer injected from here: the service worker registers
// it as a MAIN-world document_start content script (background.js, YT_MAIN_SCRIPT_ID).
// The old <script src="chrome-extension://…"> injection ran after an async storage
// read — late for YouTube's first player request — and left a trace in the page.
// On/off, the per-site allowlist and the YouTube session bypass are applied to that
// registration by the service worker.
(function () {
  // Stall watchdog stage 1 (youtube_skip): this tab reloaded because playback
  // never started → no request flags this time.
  let noFlags = false;
  try { noFlags = sessionStorage.getItem("tbab_yt_noflags") === "1"; } catch {}

  chrome.storage?.local.get(["liveConfig"], (data) => {
    let yt = data && data.liveConfig && data.liveConfig.youtube;
    if (!yt || typeof yt !== "object") yt = {};
    const cfg = {
      adFields: Array.isArray(yt.adFields) ? yt.adFields.slice(0, 50) : [],
      adRenderers: Array.isArray(yt.adRenderers) ? yt.adRenderers.slice(0, 100) : [],
      requestFlags: Array.isArray(yt.requestFlags) ? yt.requestFlags.slice(0, 10) : [],
      disableRequestFlags: yt.disableRequestFlags === true || noFlags,
    };
    if (!cfg.adFields.length && !cfg.adRenderers.length && !cfg.requestFlags.length && !cfg.disableRequestFlags) return;
    try { document.dispatchEvent(new CustomEvent("tbab-yt-cfg", { detail: JSON.stringify(cfg) })); } catch {}
  });
})();
