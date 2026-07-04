// Apply the saved theme to <html data-theme="...">.
(function () {
  try {
    chrome.storage.local.get("theme", (d) => {
      document.documentElement.dataset.theme = d.theme || "carbon";
    });
    chrome.storage.onChanged.addListener((c) => {
      if (c.theme) {
        document.documentElement.dataset.theme = c.theme.newValue || "carbon";
      }
    });
  } catch (e) {}
})();
