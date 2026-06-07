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

  function start() {
    run = true;
    scan();
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  chrome.storage?.local.get(["enabled", "features", "allowlist"], (data) => {
    const allowed = (data.allowlist || []).some(hostMatches);
    const metaOn = (data.features || {}).meta !== false;
    if (data.enabled !== false && metaOn && !allowed) start();
  });

  chrome.storage?.onChanged.addListener((c) => {
    if (c.features) {
      const metaOn = (c.features.newValue || {}).meta !== false;
      if (metaOn && !run) start();
      else if (!metaOn) run = false;
    }
  });
})();
