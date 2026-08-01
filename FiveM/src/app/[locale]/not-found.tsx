import Link from 'next/link';

import { Mascot } from '@/components/Mascot';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      {/* Средното ниво: градиенти без филтри — достатъчно на този размер. */}
      <Mascot detail="medium" size={140} expression="surprised" title={null} />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Тази страница я няма</h1>
        <p className="mt-3 max-w-md text-slate-300">
          Сървърът може да е свален от директорията или адресът да е сгрешен.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-fivem-500 px-4 py-2 font-medium text-fivem-950 hover:bg-fivem-400"
        >
          Към списъка със сървъри
        </Link>
        <Link href="/submit" className="rounded-lg border border-white/15 px-4 py-2 hover:border-fivem-500">
          Добави сървър
        </Link>
      </div>
    </div>
  );
}
