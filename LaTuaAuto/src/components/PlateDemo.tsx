'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { parsePlate } from '@/lib/plate';

// Интерактивна демонстрация: валидира формата локално. НИЩО не се изпраща и
// НИКОГА не се казва дали табелата е регистрирана (виж safety принцип 3).
export function PlateDemo() {
  const t = useTranslations('home');
  const [value, setValue] = useState('');
  const parsed = value.trim() ? parsePlate(value) : null;
  const kindLabel = parsed
    ? t(
        parsed.kind === 'AUTO'
          ? 'demoKindAuto'
          : parsed.kind === 'MOTO'
            ? 'demoKindMoto'
            : parsed.kind === 'RIMORCHIO'
              ? 'demoKindRimorchio'
              : 'demoKindLegacy',
      )
    : '';

  return (
    <div className="card">
      <label htmlFor="plate-demo" className="label">
        {t('demoLabel')}
      </label>
      <input
        id="plate-demo"
        className="field font-plate text-xl uppercase tracking-widest"
        placeholder={t('demoPlaceholder')}
        value={value}
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="mt-3 min-h-6 text-sm" aria-live="polite">
        {value.trim() ? (
          parsed ? (
            <>
              <span className="plate mr-2 align-middle text-base">{parsed.display}</span>
              <span className="text-emerald-700">{t('demoValid', { kind: kindLabel })}</span>
            </>
          ) : (
            <span className="text-amber-700">{t('demoInvalid')}</span>
          )
        ) : null}
      </p>
    </div>
  );
}
