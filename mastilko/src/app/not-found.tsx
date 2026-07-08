import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <Logo className="h-14 w-14 opacity-70" />
      <h1 className="font-display mt-6 text-3xl font-bold">
        Тук няма нищо за печат 🤷
      </h1>
      <p className="mt-3 text-ink-soft">
        Страницата не съществува или е преместена. Но мастилото не чака —
        избери си инструмент:
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/etiketi" className="btn-primary">Етикети</Link>
        <Link href="/vizitki" className="btn-secondary">Визитки</Link>
        <Link href="/cv" className="btn-secondary">CV</Link>
      </div>
    </div>
  );
}
