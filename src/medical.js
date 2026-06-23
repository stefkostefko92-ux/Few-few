// Структурирани (контролирани) медицински списъци с двуезични етикети, за да
// може чужд спешен екип да разчете най-честите алергии и състояния. Свободният
// текст остава за всичко извън списъка (без автоматичен превод — опасно).

export const ALLERGIES = [
  { key: 'penicillin', bg: 'Пеницилин', en: 'Penicillin' },
  { key: 'cephalosporins', bg: 'Цефалоспорини', en: 'Cephalosporins' },
  { key: 'sulfonamides', bg: 'Сулфонамиди', en: 'Sulfonamides' },
  { key: 'nsaid', bg: 'НСПВС (ибупрофен и др.)', en: 'NSAIDs (ibuprofen etc.)' },
  { key: 'aspirin', bg: 'Аспирин', en: 'Aspirin' },
  { key: 'anesthetics', bg: 'Анестетици', en: 'Anaesthetics' },
  { key: 'iodine', bg: 'Йод / контрастна материя', en: 'Iodine / contrast dye' },
  { key: 'latex', bg: 'Латекс', en: 'Latex' },
  { key: 'peanuts', bg: 'Фъстъци', en: 'Peanuts' },
  { key: 'nuts', bg: 'Ядки', en: 'Tree nuts' },
  { key: 'shellfish', bg: 'Морски дарове', en: 'Shellfish' },
  { key: 'eggs', bg: 'Яйца', en: 'Eggs' },
  { key: 'milk', bg: 'Мляко (лактоза)', en: 'Milk (lactose)' },
  { key: 'gluten', bg: 'Глутен', en: 'Gluten' },
  { key: 'bee', bg: 'Ужилване от пчела/оса', en: 'Bee/wasp stings' },
];

export const CONDITIONS = [
  { key: 'diabetes_t1', bg: 'Диабет тип 1', en: 'Type 1 diabetes' },
  { key: 'diabetes_t2', bg: 'Диабет тип 2', en: 'Type 2 diabetes' },
  { key: 'epilepsy', bg: 'Епилепсия', en: 'Epilepsy' },
  { key: 'asthma', bg: 'Астма', en: 'Asthma' },
  { key: 'copd', bg: 'ХОББ', en: 'COPD' },
  { key: 'heart', bg: 'Сърдечно заболяване', en: 'Heart disease' },
  { key: 'hypertension', bg: 'Високо кръвно налягане', en: 'Hypertension' },
  { key: 'arrhythmia', bg: 'Аритмия', en: 'Arrhythmia' },
  { key: 'pacemaker', bg: 'Пейсмейкър', en: 'Pacemaker' },
  { key: 'stroke', bg: 'Прекаран инсулт', en: 'Previous stroke' },
  { key: 'anticoagulants', bg: 'Прием на антикоагуланти', en: 'On anticoagulants' },
  { key: 'kidney', bg: 'Бъбречно заболяване', en: 'Kidney disease' },
  { key: 'liver', bg: 'Чернодробно заболяване', en: 'Liver disease' },
  { key: 'thyroid', bg: 'Заболяване на щитовидната жлеза', en: 'Thyroid disorder' },
  { key: 'pregnancy', bg: 'Бременност', en: 'Pregnancy' },
  { key: 'hemophilia', bg: 'Хемофилия', en: 'Haemophilia' },
  { key: 'cancer', bg: 'Онкологично заболяване', en: 'Cancer' },
];

// Държави с код за избор при спешния телефон (ЕС + чести). dial = код за избиране.
export const COUNTRIES = [
  { iso: 'BG', dial: '+359', bg: 'България', en: 'Bulgaria' },
  { iso: 'AT', dial: '+43', bg: 'Австрия', en: 'Austria' },
  { iso: 'BE', dial: '+32', bg: 'Белгия', en: 'Belgium' },
  { iso: 'HR', dial: '+385', bg: 'Хърватия', en: 'Croatia' },
  { iso: 'CY', dial: '+357', bg: 'Кипър', en: 'Cyprus' },
  { iso: 'CZ', dial: '+420', bg: 'Чехия', en: 'Czechia' },
  { iso: 'DK', dial: '+45', bg: 'Дания', en: 'Denmark' },
  { iso: 'FI', dial: '+358', bg: 'Финландия', en: 'Finland' },
  { iso: 'FR', dial: '+33', bg: 'Франция', en: 'France' },
  { iso: 'DE', dial: '+49', bg: 'Германия', en: 'Germany' },
  { iso: 'GR', dial: '+30', bg: 'Гърция', en: 'Greece' },
  { iso: 'HU', dial: '+36', bg: 'Унгария', en: 'Hungary' },
  { iso: 'IE', dial: '+353', bg: 'Ирландия', en: 'Ireland' },
  { iso: 'IT', dial: '+39', bg: 'Италия', en: 'Italy' },
  { iso: 'NL', dial: '+31', bg: 'Нидерландия', en: 'Netherlands' },
  { iso: 'PL', dial: '+48', bg: 'Полша', en: 'Poland' },
  { iso: 'PT', dial: '+351', bg: 'Португалия', en: 'Portugal' },
  { iso: 'RO', dial: '+40', bg: 'Румъния', en: 'Romania' },
  { iso: 'ES', dial: '+34', bg: 'Испания', en: 'Spain' },
  { iso: 'SE', dial: '+46', bg: 'Швеция', en: 'Sweden' },
  { iso: 'CH', dial: '+41', bg: 'Швейцария', en: 'Switzerland' },
  { iso: 'GB', dial: '+44', bg: 'Великобритания', en: 'United Kingdom' },
  { iso: 'NO', dial: '+47', bg: 'Норвегия', en: 'Norway' },
  { iso: 'TR', dial: '+90', bg: 'Турция', en: 'Turkey' },
  { iso: 'RS', dial: '+381', bg: 'Сърбия', en: 'Serbia' },
  { iso: 'MK', dial: '+389', bg: 'Северна Македония', en: 'North Macedonia' },
  { iso: 'US', dial: '+1', bg: 'САЩ', en: 'United States' },
  { iso: 'UA', dial: '+380', bg: 'Украйна', en: 'Ukraine' },
];

const labelOf = (list, key, lang) => {
  const it = list.find((x) => x.key === key);
  return it ? (lang === 'en' ? it.en : it.bg) : key;
};

// CSV от ключове → масив от преведени етикети (за показване).
export function medLabels(list, csv, lang) {
  return String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((k) => labelOf(list, k, lang));
}
