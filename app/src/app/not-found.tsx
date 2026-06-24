import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-content py-20 text-center">
      <p className="text-6xl font-extrabold text-brand-700">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        Страницата не е намерена
      </h1>
      <p className="mt-2 text-slate-600">
        Възможно е връзката да е остаряла или страницата да е преместена.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn-primary">
          Към началото
        </Link>
        <Link href="/tarsene" className="btn-secondary">
          Търсене
        </Link>
      </div>
    </div>
  );
}
