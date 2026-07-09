import Link from "next/link";
import { Crest } from "@/components/Crest";

export default function NotFound() {
  return (
    <div className="container-content grid min-h-[55vh] place-items-center py-16 text-center">
      <div>
        <Crest className="mx-auto h-24 w-auto opacity-90" />
        <p className="mt-6 font-display text-5xl font-extrabold text-brand-900">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">
          Страницата не е намерена
        </h1>
        <p className="mt-2 text-slate-600">
          Възможно е връзката да е остаряла или сгрешена.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            Към началото
          </Link>
          <Link href="/programa" className="btn-secondary">
            Програма
          </Link>
        </div>
      </div>
    </div>
  );
}
