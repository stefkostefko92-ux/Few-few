// Минимален service worker — прави сайта инсталируем като приложение (PWA).
// Не кешира нищо: само препраща заявките към мрежата, за да са данните винаги
// актуални (резултати, класиране, новини).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
