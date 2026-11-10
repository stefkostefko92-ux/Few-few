import type { LegalDoc } from '@/content/legal';
import { slugify } from '@/lib/slug';
import { ADDRESS_ONE_LINE, PUBLISHER } from '@/lib/site';

/**
 * Правните документи се рендират от структура (заглавие · абзац · списък), а
 * не от готов HTML: така преводът се сверява ред по ред и нищо не се губи
 * между двата езика.
 */
export function LegalArticle({ doc, withController = false }: { doc: LegalDoc; withController?: boolean }) {
  return (
    <article>
      <header className="max-w-3xl">
        <h1 className="page-title">{doc.title}</h1>

      {/* Дата на редакцията — чл. 12, ал. 1 ОРЗД и чл. 14, ал. 2 DSA. Без нея
          читателят не знае коя версия чете, а уведомяването за промяна е
          недоказуемо. */}
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1 text-sm text-silver-400">
          <time dateTime={doc.effective}>{doc.effective}</time> — дата, от която тази редакция е в сила
        </p>
      </header>

      <div className="hairline mt-10 max-w-3xl" aria-hidden="true" />

      <div className="prose-doc mt-8">

      {withController && (
        <p>
          <strong>{PUBLISHER.legalName}</strong>, {ADDRESS_ONE_LINE}, {PUBLISHER.eik} ·{' '}
          <a
            href={`mailto:${PUBLISHER.emailPrivacy}`}
            className="link"
          >
            {PUBLISHER.emailPrivacy}
          </a>
        </p>
      )}

      {doc.blocks.map((block, index) => {
        if (block.h) {
          /**
           * `id` на всяко заглавие НЕ е удобство. Чл. 7, ал. 4а от
           * Дир. 2005/29/ЕО иска параметрите на класирането в специален раздел,
           * ПРЯКО достъпен от страницата с резултатите — а без `id` няма котва,
           * тоест изискването беше физически неизпълнимо, докато компонентът
           * рендира само текст.
           */
          return (
            <h2
              key={index}
              // Стабилната котва печели пред слугифицираното заглавие — виж
              // `LegalBlock.anchor`: преведено заглавие = преведено id =
              // счупена връзка от другия език.
              id={block.anchor ?? slugify(block.h)}
            >
              {block.h}
            </h2>
          );
        }
        if (block.ul) {
          return (
            <ul key={index}>
              {block.ul.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.p}</p>;
      })}

      <p className="pt-4 text-sm text-silver-500">
        <a href={`mailto:${PUBLISHER.email}`} className="link">
          {PUBLISHER.email}
        </a>
      </p>
      </div>
    </article>
  );
}
