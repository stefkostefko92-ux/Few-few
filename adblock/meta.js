// Hide sponsored posts on Facebook & Instagram.
//
// Meta serves sponsored posts inline from its own domain and obfuscates the
// "Sponsored" label, so they can't be blocked at the network layer without
// breaking the site. This is a best-effort cosmetic pass over the feed.
(function () {
  let run = false;

  const host = location.hostname.replace(/^www\./, "");
  const hostMatches = (d) => host === d || host.endsWith("." + d);
  const isIG = host.includes("instagram.");

  // "Sponsored" across the languages Meta localises into.
  const LABELS = new Set([
    "sponsored", "sponsorisé", "gesponsert", "gesponsord", "patrocinado",
    "patrocinada", "sponsorizzato", "sponsrad", "sponsoroitu", "sponset",
    "sponzorováno", "publicidad", "реклама", "спонсорирано", "广告", "贊助",
    "広告", "후원", "광고",
  ]);

  // True if a short element inside the post reads exactly as a sponsored label.
  function looksSponsored(post) {
    const nodes = post.querySelectorAll("a[role='link'], a, span");
    for (const el of nodes) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t && t.length <= 14 && LABELS.has(t)) return true;
    }
    // Links into Meta's ad surfaces are another reliable tell.
    return !!post.querySelector(
      "a[href*='/ads/about'], a[href*='ad_preferences'], a[href*='/business/ads']"
    );
  }

  function kill(el) {
    el.dataset.tbabHidden = "1";
    el.style.setProperty("display", "none", "important");
  }

  function scan() {
    if (!run) return;

    if (isIG) {
      document.querySelectorAll("article").forEach((a) => {
        if (a.dataset.tbabChecked) return;
        a.dataset.tbabChecked = "1";
        if (looksSponsored(a)) kill(a);
      });
      return;
    }

    // Facebook feed posts.
    document.querySelectorAll("div[role='article']").forEach((a) => {
      if (a.dataset.tbabChecked) return;
      a.dataset.tbabChecked = "1";
      if (looksSponsored(a)) kill(a);
    });
    // Right-column ads.
    document
      .querySelectorAll("[data-pagelet*='Rightrail'] [aria-label='Sponsored']")
      .forEach(kill);
  }

  let wired = false;
  function start() {
    run = true;
    scan();
    if (wired) return; // one observer per page, however often the gate flips
    wired = true;
    // Feeds mutate constantly; throttle the scan.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        scan();
      }, 350);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Same gate as the other cosmetic scripts: protection on, feature on, site
  // not allowlisted and cosmetics not switched off for it — on every change.
  const st = { enabled: true, feature: true, allowed: false, noCosm: false };
  function applyGate() {
    const want = st.enabled && st.feature && !st.allowed && !st.noCosm;
    if (want && !run) start();
    else if (!want) run = false;
  }
  chrome.storage?.local.get(["enabled", "features", "allowlist", "noCosmetics"], (data) => {
    st.enabled = data.enabled !== false;
    st.feature = (data.features || {}).meta !== false;
    st.allowed = (data.allowlist || []).some(hostMatches);
    st.noCosm = (data.noCosmetics || []).some(hostMatches);
    applyGate();
  });
  chrome.storage?.onChanged.addListener((c) => {
    if (c.enabled) st.enabled = c.enabled.newValue !== false;
    if (c.features) st.feature = (c.features.newValue || {}).meta !== false;
    if (c.allowlist) st.allowed = (c.allowlist.newValue || []).some(hostMatches);
    if (c.noCosmetics) st.noCosm = (c.noCosmetics.newValue || []).some(hostMatches);
    if (c.enabled || c.features || c.allowlist || c.noCosmetics) applyGate();
  });
})();
