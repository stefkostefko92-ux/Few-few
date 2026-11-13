// localize.js — превежда каталога на командите по речник (23.10.2026).
// ЕДНО И СЪЩО копие байт по байт във frontend/src/i18n/commandsCatalog/ и в
// bot/src/utils/commandsCatalogL10n/ (страницата „Команди“ и /help в Discord);
// синхронът се пази от bot/src/__tests__/commandsCatalogL10n.test.js.
// Речникът е по английските имена; липсващ превод оставя английския текст,
// вместо да покаже празно поле.

/**
 * Връща копие на каталога на езика на речника. `key` пази английското име на
 * категорията — по него работи филтърът, независимо от езика.
 */
export function localizeCatalog(catalog, dict) {
  const tx = (s) => (dict?.text && s in dict.text ? dict.text[s] : s);
  return (catalog || []).map((cat) => {
    const [name, description] = dict?.categories?.[cat.category] || [cat.category, cat.description];
    return {
      ...cat,
      key: cat.category,
      category: name,
      description,
      commands: (cat.commands || []).map((c) => ({
        ...c,
        description: dict?.commands?.[c.name] ?? c.description,
        dashboard: tx(c.dashboard),
        permission: tx(c.permission),
        signature: dict?.signatures?.[c.name] ?? c.signature,
      })),
      dashboardOnly: (cat.dashboardOnly || []).map((f) => {
        const [feature, fdesc] = dict?.features?.[f.feature] || [f.feature, f.description];
        return { ...f, feature, description: fdesc, dashboard: tx(f.dashboard) };
      }),
    };
  });
}
