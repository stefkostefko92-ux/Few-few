// Service worker — възможно най-скучният, който върши работа.
//
// Какво НЕ прави и защо: не кешира отговори от `/api`. Гестионалът показва
// наличности, статуси и суми; поднесена стара стойност за giacenza или за статус
// на ордин е по-опасна от съобщение „няма връзка", защото изглежда като истина.
// Затова офлайн се пази само ОБВИВКАТА — а данните или са пресни, или ги няма.
//
// Стратегия:
//   • навигация → мрежа, при неуспех → офлайн страницата;
//   • статични ресурси на Next (`/_next/static/*`) → от кеша, те са с версия в
//     името и не се променят;
//   • всичко останало → направо в мрежата.

const VERSIONE = "erp-v1";
const PRECACHE = ["/offline.html", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSIONE)
      .then((c) => c.addAll(PRECACHE))
      // `skipWaiting` без него новата версия чака всички раздели да се затворят —
      // на телефон това значи „никога".
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chiavi) =>
        Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Само GET: кеширан POST би значел повторно изпратен рапортино или движение
  // по склада.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ??
          fetch(req).then((res) => {
            // Само успешните: кеширан 404 остава 404 до следващата версия.
            if (res.ok) {
              const copia = res.clone();
              caches.open(VERSIONE).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
  }
});
