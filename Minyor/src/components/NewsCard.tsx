import Link from "next/link";
import { CalendarDays } from "@/components/icons";
import { formatDate } from "@/lib/format";

export type PostLike = {
  slug: string;
  title: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  publishedAt?: Date | null;
};

export function NewsCard({ post }: { post: PostLike }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/novini/${post.slug}`} className="block">
        <div className="relative aspect-[16/9] bg-brand-100">
          {post.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-800 to-brand-900">
              <span className="font-display text-2xl font-bold text-gold-400/80">
                Миньор
              </span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {formatDate(post.publishedAt)}
        </p>
        <h3 className="mt-2 font-display text-lg font-bold leading-snug text-slate-900">
          <Link href={`/novini/${post.slug}`} className="hover:text-brand-700">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm text-slate-600">{post.excerpt}</p>
        )}
        <div className="mt-4 pt-1">
          <Link
            href={`/novini/${post.slug}`}
            className="text-sm font-semibold text-brand-800 hover:underline"
          >
            Прочети повече →
          </Link>
        </div>
      </div>
    </article>
  );
}
