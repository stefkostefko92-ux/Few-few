import { jsonLdString } from '@/lib/seo';

/**
 * Един път за структурираните данни. Блокът
 * `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: … }} />`
 * беше преписан 16 пъти в 11 файла — а всяко от тези места е `dangerouslySet…`
 * върху съдържание, което частично идва от чужд сървър (име на сървър със
 * `</script>` затваря блока). Шестнайсет копия значат шестнайсет възможности
 * някой да пропусне `jsonLdString`; един компонент значи, че екранирането не е
 * по избор.
 *
 * Затова `data` е `unknown`, а не готов низ: през този компонент НЕ може да се
 * подаде неекраниран текст.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
  );
}
