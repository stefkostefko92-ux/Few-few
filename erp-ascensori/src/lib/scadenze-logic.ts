// Прагове на известяване 90/60/30 дни — чиста логика за автоматизма.
// Всеки флаг се вдига еднократно при преминаване на прага си.

export interface ScadenzaFlags {
  dataScadenza: Date;
  notificato90: boolean;
  notificato60: boolean;
  notificato30: boolean;
  completata: boolean;
}

export type Soglia = 90 | 60 | 30;

/** Кои известия трябва да се изпратят сега (без повторения). */
export function sogliePendenti(s: ScadenzaFlags, oggi: Date): Soglia[] {
  if (s.completata) return [];
  const giorni = Math.ceil(
    (s.dataScadenza.getTime() - oggi.getTime()) / 86_400_000,
  );
  const out: Soglia[] = [];
  if (giorni <= 90 && !s.notificato90) out.push(90);
  if (giorni <= 60 && !s.notificato60) out.push(60);
  if (giorni <= 30 && !s.notificato30) out.push(30);
  return out;
}

/** Дни до срока (отрицателно = просрочен). */
export function giorniRimanenti(dataScadenza: Date, oggi: Date): number {
  return Math.ceil((dataScadenza.getTime() - oggi.getTime()) / 86_400_000);
}

/** Цветен статус на автомобил по най-близката от трите дати: verde/giallo/rosso. */
export function statoAutomezzo(
  scadenze: Array<Date | null>,
  oggi: Date,
): "verde" | "giallo" | "rosso" {
  const date = scadenze.filter((d): d is Date => d !== null);
  if (date.length === 0) return "verde";
  const minGiorni = Math.min(...date.map((d) => giorniRimanenti(d, oggi)));
  if (minGiorni < 15) return "rosso";
  if (minGiorni < 45) return "giallo";
  return "verde";
}
