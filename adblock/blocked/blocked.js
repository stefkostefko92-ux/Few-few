// Страницата вместо опасен сайт (зловреден домейн от URLhaus). Chrome я отваря на мястото на
// навигацията (динамичното redirect правило в background.js) с адреса след „#“.
// Всеки сайт може да отвори тази страница (тя е web-accessible), затова: в рамка не прави нищо
// (иначе чужда страница би подлъгала клик на „Продължи“), а „Продължи“ минава само през
// service worker-а, който проверява, че адресът е http(s) и наистина е в списъка.
const $ = (id) => document.getElementById(id);

if (window.top !== window) {
  document.documentElement.textContent = "";
} else {
  let target = null;
  try {
    const u = new URL(location.hash.slice(1));
    if (/^https?:$/.test(u.protocol)) target = u;
  } catch {}

  if (target) {
    $("host").textContent = target.hostname;
    $("why").href = "https://urlhaus.abuse.ch/browse.php?search=" + encodeURIComponent(target.hostname);
    $("why").hidden = false;
    // a message in the user's own email app, with only the site name — nothing is sent by the extension
    $("mistake").href = "mailto:info@carbonstealth.eu?subject=" + encodeURIComponent("Warning page: " + target.hostname) +
      "&body=" + encodeURIComponent("Site: " + target.hostname + "\n\nWhy I think it is safe: ");
    $("mistake").hidden = false;
    $("go").hidden = false;
    $("note").hidden = false;
  }

  $("back").addEventListener("click", () => {
    // the warning replaced the navigation, so one step back is the page before it
    if (history.length > 1) { history.back(); return; }
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id !== undefined) chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
    });
  });

  $("go").addEventListener("click", () => {
    if (!target) return;
    $("go").disabled = true;
    chrome.runtime.sendMessage({ type: "proceedDangerous", url: target.href }, (r) => {
      if (r && r.ok && r.url) location.replace(r.url);
      else $("go").disabled = false;
    });
  });
}
