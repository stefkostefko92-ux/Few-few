import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Политика за поверителност',
  description: 'Какви данни обработва FiveM Bulgaria и защо. Без бисквитки за проследяване.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl space-y-4 text-slate-200">
      <h1 className="text-3xl font-semibold tracking-tight">Политика за поверителност</h1>

      <p>
        Администратор: <strong>Carbon Stealth VCC</strong>, контакт:{' '}
        <a href="mailto:info@carbonstealth.eu" className="text-fivem-400 hover:underline">
          info@carbonstealth.eu
        </a>
        . Сайтът и базата се хостват в ЕС.
      </p>

      <h2 className="pt-4 text-xl font-semibold">Какво събираме</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Заявка за листване:</strong> име на сървъра, адрес/cfx код, Discord линк, имейл за
          връзка и бележката ти. Основание: чл. 6, ал. 1, б. „б“ и „е“ ОРЗД (стъпки по искане на
          подателя и наш законен интерес да поддържаме директорията). Пазим ги до 24 месеца.
        </li>
        <li>
          <strong>Ревю:</strong> оценка, текст и избрания псевдоним. Не искаме и не пазим име,
          имейл или IP адрес към ревюто.
        </li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold">Какво НЕ събираме</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Няма бисквитки за проследяване, няма рекламни пиксели, няма профилиране.</li>
        <li>
          Не четем и не съхраняваме списъците с играчи на сървърите (<code>players.json</code>) —
          имената и идентификаторите (Steam, Discord, лиценз) на играчите не влизат при нас. Пазим
          само общия брой играчи.
        </li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold">Твоите права</h2>
      <p>
        Достъп, поправка, изтриване, ограничаване, възражение и преносимост (чл. 15–21 ОРЗД) — пиши на
        адреса по-горе. Имаш право на жалба до Комисията за защита на личните данни (КЗЛД).
      </p>

      <p className="pt-4 text-sm text-slate-400">
        Данните на сървърите (име, статус, брой играчи) се четат от публичните endpoint-и на самите
        сървъри и не са лични данни.
      </p>
    </div>
  );
}
