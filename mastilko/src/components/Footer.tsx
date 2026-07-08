import Link from "next/link";

export default function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-ink/10 bg-paper-warm">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-bold">Мастилко</p>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            Топло местенце за етикети, визитки и CV — безплатно, без
            регистрация, направо от браузъра към принтера.
          </p>
        </div>
        <nav aria-label="Инструменти" className="text-sm">
          <p className="mb-2 font-semibold text-ink">Инструменти</p>
          <ul className="space-y-1.5 text-ink-soft">
            <li><Link className="hover:text-tera-dark" href="/etiketi">Етикети за печат</Link></li>
            <li><Link className="hover:text-tera-dark" href="/vizitki">Визитки</Link></li>
            <li><Link className="hover:text-tera-dark" href="/cv">Автобиография (CV)</Link></li>
            <li><Link className="hover:text-tera-dark" href="/pismo">Мотивационно писмо</Link></li>
            <li><Link className="hover:text-tera-dark" href="/gramoti">Грамоти и сертификати</Link></li>
            <li><Link className="hover:text-tera-dark" href="/pokani">Покани и картички</Link></li>
            <li><Link className="hover:text-tera-dark" href="/tabelki">Табелки и надписи</Link></li>
            <li><Link className="hover:text-tera-dark" href="/wifi">WiFi стикер с QR</Link></li>
          </ul>
        </nav>
        <nav aria-label="Правна информация" className="text-sm">
          <p className="mb-2 font-semibold text-ink">Информация</p>
          <ul className="space-y-1.5 text-ink-soft">
            <li><Link className="hover:text-tera-dark" href="/impresum">Импресум и контакти</Link></li>
            <li><Link className="hover:text-tera-dark" href="/poveritelnost">Поверителност</Link></li>
            <li><Link className="hover:text-tera-dark" href="/usloviya">Условия за ползване</Link></li>
            <li>
              <a className="hover:text-tera-dark" href="https://carbonstealth.eu" rel="noopener">
                Carbon Stealth VCC · Бобов дол
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink/10 py-4 text-center text-xs text-ink-faint">
        © {new Date().getFullYear()} Carbon Stealth VCC · Направено с топлина в
        България 🇧🇬 · Без проследяване, без чужди реклами, без сметка
      </div>
    </footer>
  );
}
