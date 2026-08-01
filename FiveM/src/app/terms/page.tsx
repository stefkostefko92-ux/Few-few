import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Общи условия',
  description: 'Условия за ползване на директорията FiveM Bulgaria и за листване на сървър.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <div className="max-w-2xl space-y-4 text-slate-200">
      <h1 className="text-3xl font-semibold tracking-tight">Общи условия</h1>

      <p>
        FiveM Bulgaria е независима директория на български FiveM сървъри, поддържана от Carbon
        Stealth VCC. Проектът не е свързан с Rockstar Games, Take-Two Interactive или Cfx.re и не
        предоставя игрови сървъри.
      </p>

      <h2 className="pt-4 text-xl font-semibold">Листване на сървър</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Листването е безплатно и минава през ръчна модерация. Не дължим обосновка при отказ.</li>
        <li>
          Подателят декларира, че има право да представлява сървъра и че подадените текстове и линкове
          са негови или има разрешение за тях.
        </li>
        <li>
          Отказваме или сваляме листинг при незаконно съдържание, продажба на чужда интелектуална
          собственост, реклами за читове или подвеждащи данни.
        </li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold">Ревюта</h2>
      <p>
        Ревютата са мнения на посетители и се публикуват след преглед. Махаме обиди, лични данни,
        реклама и очевидно фалшиви оценки. Оценките не са проверени покупки и не са класация.
      </p>

      <h2 className="pt-4 text-xl font-semibold">Отговорност</h2>
      <p>
        Статусът на сървърите се чете автоматично от техните публични endpoint-и и може да е
        неактуален или непълен. Не отговаряме за съдържанието, правилата или поведението на трети
        сървъри и за вреди от ползването им.
      </p>

      <h2 className="pt-4 text-xl font-semibold">Сигнали</h2>
      <p>
        Сигнал за незаконно съдържание или за нарушени права:{' '}
        <a href="mailto:info@carbonstealth.eu" className="text-fivem-400 hover:underline">
          info@carbonstealth.eu
        </a>
        . Разглеждаме сигналите и уведомяваме подателя за решението.
      </p>
    </div>
  );
}
