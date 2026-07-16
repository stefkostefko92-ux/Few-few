import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-content flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-6xl font-extrabold text-brand-700">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        Страницата не е намерена
      </h1>
      <p className="mt-2 max-w-md text-slate-600">
        Възможно е предприятието или разделът да е преместен. Върнете се към
        началото или разгледайте каталога.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          Начало
        </Link>
        <Link href="/predpriyatiya" className="btn-secondary">
          Всички предприятия
        </Link>
      </div>
    </div>
  );
}
