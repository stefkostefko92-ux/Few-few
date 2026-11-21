'use client';

import { useEffect, useRef } from 'react';

/** Date → „YYYY-MM-DDTHH:mm“ в часовата зона на браузъра (за datetime-local). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * datetime-local, попълнено от записан момент (ISO) в часовата зона на
 * браузъра — сървърът не знае зоната на човека. Записът я връща обратно през
 * TimeZoneField (tz) в същата форма.
 */
export function LocalDateTimeInput({
  name,
  iso,
  className,
}: {
  name: string;
  iso: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!ref.current || !iso) return;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    const value = toLocalInput(date);
    ref.current.defaultValue = value;
    ref.current.value = value;
  }, [iso]);
  return <input ref={ref} type="datetime-local" name={name} className={className} />;
}
