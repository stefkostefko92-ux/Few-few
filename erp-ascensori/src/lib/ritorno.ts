// Къде да върнем потребителя след вход.
//
// Заслужава свой файл, защото е класическа дупка: „?da=" идва от адреса, тоест
// от когото и да е, и `router.push(da)` без проверка е ОТВОРЕНО ПРЕНАСОЧВАНЕ —
// подхвърлен линк „влез тук" изхвърля служителя на чужд сайт, който изглежда
// като нашия, веднага след като е написал паролата си.
//
// Затова минава само път, който е ЯВНО вътрешен.

export const RITORNO_PREDEFINITO = "/dashboard";

export function ritornoSicuro(da: string | null | undefined): string {
  if (!da) return RITORNO_PREDEFINITO;
  // `//host` и `/\host` са валидни ПРОТОКОЛНО-ОТНОСИТЕЛНИ адреси: браузърът ги
  // праща навън, макар да започват с наклонена черта.
  if (!da.startsWith("/") || da.startsWith("//") || da.startsWith("/\\"))
    return RITORNO_PREDEFINITO;
  // Управляващи знаци и интервали позволяват заобикаляне на проверката горе,
  // след като браузърът ги отреже.
  if (/[\u0000-\u0020\u007F]/.test(da)) return RITORNO_PREDEFINITO;
  // Обратно на входа няма смисъл и прави цикъл.
  if (da.startsWith("/login")) return RITORNO_PREDEFINITO;
  return da;
}
