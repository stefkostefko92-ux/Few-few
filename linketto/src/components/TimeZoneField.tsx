'use client';

import { useEffect, useState } from 'react';

// Часовата зона на браузъра (напр. „Europe/Sofia“) за полетата datetime-local —
// сървърът тълкува „стенния“ час в нея (lib/zoned-time.ts). Без JavaScript е
// празно → UTC.
export function TimeZoneField({ name = 'tz' }: { name?: string }) {
  const [zone, setZone] = useState('');
  useEffect(() => {
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
    } catch {
      setZone('');
    }
  }, []);
  return <input type="hidden" name={name} value={zone} />;
}
