/**
 * Преводите на админ панела живеят отделно (src/i18n/admin/*.json) и се
 * регистрират като `admin.*` в общия i18next каталог при зареждане на
 * lazy админ чънка — играчите не теглят админ текстове. Паритетът на
 * ключовете EN/BG/IT се гейтва от server/src/game/__tests__/adminI18n.test.ts.
 */
import i18n from 'i18next';
import en from '../../i18n/admin/en.json';
import bg from '../../i18n/admin/bg.json';
import it from '../../i18n/admin/it.json';

const bundles: Record<string, unknown> = { en, bg, it };
// Идемпотентно (deep + overwrite) — безопасно при HMR/повторен импорт.
for (const [lng, res] of Object.entries(bundles)) {
  i18n.addResourceBundle(lng, 'translation', { admin: res }, true, true);
}
