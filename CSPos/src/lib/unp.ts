// УНП — уникален номер на продажбата (Приложение № 29 към чл. 52а, Наредба Н-18):
// <8 знака индивидуален № на ФУ> - <4 знака код на оператор> - <7 цифри пореден №>,
// разделени задължително с „-“. Генерира се при откриване на продажбата.
// Задължителен при деклариран СУПТО режим; иначе — вътрешен идентификатор.

export function buildUnp(
  fiscalDeviceSerial: string,
  operatorCode: number,
  sequence: number
): string {
  const device = fiscalDeviceSerial.slice(0, 8).padStart(8, "0");
  const operator = String(operatorCode).padStart(4, "0").slice(0, 4);
  const seq = String(sequence).padStart(7, "0").slice(-7);
  return `${device}-${operator}-${seq}`;
}

export function isValidUnp(unp: string): boolean {
  return /^.{8}-.{4}-\d{7}$/.test(unp);
}
