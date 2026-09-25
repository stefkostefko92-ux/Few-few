// frontend/src/i18n/dashboard/all.js
// Всички езици на таблото наведнъж — САМО за тестовете (паритет на ключовете).
// Приложението ползва index.js: английският е в главния чънк, другите се
// зареждат при нужда (редизайн 25.09.2026: 7 × ~19 KB gzip тежаха на ПЪРВОТО
// зареждане на лендинга, който изобщо не ги ползва).
import en from "./en.js";
import bg from "./bg.js";
import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import it from "./it.js";
import nl from "./nl.js";
import pl from "./pl.js";

export const DASHBOARD_LOCALES = { en, bg, de, es, fr, it, nl, pl };
