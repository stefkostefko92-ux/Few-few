// IndexNow — мигновено уведомяване на търсачките (Bing, Yandex, Seznam…) при
// публикуване/промяна на визитка. Google не поддържа IndexNow, но чете sitemap-а.
const KEY = process.env.INDEXNOW_KEY || '';
const prod = process.env.NODE_ENV === 'production';

export const indexNowKey = () => KEY;

if (!KEY && prod) {
  console.warn('⚠ INDEXNOW_KEY липсва — автоматичното подаване към Bing е изключено.');
}

// Подава списък URL-и към IndexNow. Fire-and-forget — не блокира отговора и не
// хвърля към извикващия (видимостта е best-effort, не критичен път).
export async function submitUrls(base, urls) {
  if (!KEY || !urls?.length) return;
  try {
    const host = new URL(base).host;
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: KEY,
        keyLocation: `${base}/${KEY}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
    if (!res.ok) console.warn(`IndexNow отговори ${res.status} за ${urls.length} URL(и).`);
  } catch (err) {
    console.warn('IndexNow подаване се провали:', err.message);
  }
}
