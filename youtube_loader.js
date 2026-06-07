// Inject the YouTube ad remover into the page (MAIN world) only when YouTube
// ad blocking is enabled and the site isn't allowlisted. This lets the feature
// toggle and per-site allowlist fully control whether we touch YouTube at all.
(function () {
  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);

  function inject() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("youtube_main.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  chrome.storage?.local.get(["enabled", "features", "allowlist"], (data) => {
    const on = data.enabled !== false;
    const ytOn = (data.features || {}).youtube !== false;
    const allowed = (data.allowlist || []).some(hostMatches);
    if (on && ytOn && !allowed) inject();
  });
})();
