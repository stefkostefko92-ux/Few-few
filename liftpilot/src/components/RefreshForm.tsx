'use client';

// «Aggiorna con il software attuale»: the saved record made again in one click from what was entered, with the running
// engines (src/server/refresh-actions.ts). The button waits while the server saves, so a second click makes no copy.
import { useFormStatus } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { refreshCalculationAction, refreshLiftDesignAction, refreshRoomDesignAction } from '@/server/refresh-actions';

const ACTION = { lift: refreshLiftDesignAction, calc: refreshCalculationAction, room: refreshRoomDesignAction } as const;

function Submit() {
  const t = useTranslations('refresh'), { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? t('pending') : t('button')}</button>;
}

export default function RefreshForm({ kind, id }: { kind: keyof typeof ACTION; id: string }) {
  const locale = useLocale();
  return (
    <form action={ACTION[kind]}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <Submit />
    </form>
  );
}
