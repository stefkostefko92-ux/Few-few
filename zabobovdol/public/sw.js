// Минимален service worker — само за да е приложението „инсталируемо"
// (изискване на Chrome за PWA/TWA и „Добави към началния екран").
// НЕ кешира страници и НЯМА офлайн режим — само препраща заявките към мрежата.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
// Наличието на fetch-хендлър е задължително за критериите за инсталируемост.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
