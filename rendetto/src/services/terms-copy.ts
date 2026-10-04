import { join } from 'node:path';
import ejs from 'ejs';
import { COMPANY, LEGAL_UPDATED } from '../company.js';
import { viewHelpers } from '../http/view.js';
import { translatorFor, type Locale } from '../i18n.js';
import type { MailAttachment } from '../mail/mailer.js';
import { ROOT } from '../paths.js';
import { legalPath } from '../seo/paths.js';
import { legalNumbers } from './legal-numbers.js';

/**
 * Общите условия в сила днес като самостоятелен HTML файл — копието на траен носител към
 * потвърждението на поръчката. Текстът е същият шаблон като страницата (`legal/terms/<език>.ejs`);
 * относителните връзки водят към сайта през `<base>`.
 */
export async function termsCopy(
  locale: Locale,
  publicBase: string,
  contact: string,
): Promise<MailAttachment> {
  const content = await ejs.renderFile(join(ROOT, 'views', 'legal', 'terms-copy.ejs'), {
    ...legalNumbers(locale),
    locale,
    t: translatorFor(locale),
    fmt: viewHelpers(locale),
    company: COMPANY,
    contact,
    legalPath,
    publicBase,
    updated: LEGAL_UPDATED.terms,
  });
  return {
    filename: `rendetto-terms-${LEGAL_UPDATED.terms}-${locale}.html`,
    content,
    contentType: 'text/html; charset=utf-8',
  };
}
