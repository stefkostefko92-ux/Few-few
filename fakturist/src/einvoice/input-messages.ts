/**
 * Съобщенията на модела (zod в model.ts) са на български — английските им двойници за изгледа на
 * приложението на английски (формата за документ, проверката на входяща фактура). Непознато съобщение
 * (вграденото на zod) остава същото на двата езика. Тестът пази, че всяко съобщение в model.ts е тук.
 */
export const INPUT_MESSAGES_EN: Readonly<Record<string, string>> = {
  'Невалидно число': 'Invalid number',
  'Дата във формат ГГГГ-ММ-ДД': 'Date in YYYY-MM-DD format',
  'Невалидна дата': 'Invalid date',
  'Код на държава по ISO 3166-1': 'Country code per ISO 3166-1',
  'Схема по списъка EAS': 'Scheme from the EAS code list',
  'Мерна единица по UN/ECE Rec. 20': 'Unit of measure per UN/ECE Rec. 20',
  'Валута по ISO 4217': 'Currency per ISO 4217',
  'Код по списъка VATEX': 'Code from the VATEX list',
};

export function inputMessage(message: string): { bg: string; en: string } {
  return { bg: message, en: INPUT_MESSAGES_EN[message] ?? message };
}
