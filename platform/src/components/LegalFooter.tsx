import Link from "next/link";

// Долен колонтитул с връзки към правните документи (за вход/панел).
export function LegalFooter() {
  return (
    <footer className="mt-10 border-t border-ink-900 py-6 text-center text-xs text-ink-600">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/legal/usloviya" className="hover:text-ink-300">
          Общи условия
        </Link>
        <Link href="/legal/poveritelnost" className="hover:text-ink-300">
          Поверителност
        </Link>
        <Link href="/legal/biskvitki" className="hover:text-ink-300">
          Бисквитки
        </Link>
      </nav>
      <p className="mt-2">© {new Date().getFullYear()} Carbon Stealth VCC</p>
    </footer>
  );
}
