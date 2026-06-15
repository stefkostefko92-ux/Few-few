import Link from "next/link";

export type BannerData = {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
};

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Един рекламен слот. Ако банерът има изображение — показва него; иначе
// показва текстов банер. Винаги носи етикет „Реклама“ за прозрачност.
export function BannerCard({ banner }: { banner: BannerData }) {
  const href = banner.linkUrl || "/reklama";
  const external = isExternal(href);

  const inner = banner.imageUrl ? (
    <div className="relative h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.imageUrl}
        alt={banner.title || banner.sponsor || "Реклама"}
        className="h-40 w-full rounded-lg object-cover"
        loading="lazy"
      />
      {banner.sponsor && (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {banner.sponsor}
        </span>
      )}
    </div>
  ) : (
    <div className="flex h-40 flex-col justify-center rounded-lg bg-gradient-to-br from-brand-700 to-brand-900 p-4 text-white">
      {banner.sponsor && (
        <div className="text-xs font-medium text-brand-100">{banner.sponsor}</div>
      )}
      <div className="mt-1 text-lg font-bold leading-tight">{banner.title}</div>
      {banner.description && (
        <p className="mt-1 line-clamp-3 text-sm text-brand-50">{banner.description}</p>
      )}
    </div>
  );

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:shadow-md">
      <span className="absolute right-2 top-2 z-10 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Реклама
      </span>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer sponsored" className="block">
          {inner}
        </a>
      ) : (
        <Link href={href} className="block">
          {inner}
        </Link>
      )}
    </div>
  );
}

// Празен слот — кани нови рекламодатели.
export function BannerEmptySlot() {
  return (
    <Link
      href="/reklama"
      className="flex h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-center transition hover:border-brand-400"
    >
      <span className="text-sm font-semibold text-slate-700">Вашата реклама тук</span>
      <span className="mt-1 text-xs text-slate-500">само 20€ на месец →</span>
    </Link>
  );
}
