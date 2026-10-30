'use client';

// One button that posts one action on a sheet (rilievi's small POST forms: «Sposta nel cestino», «Ripristina»,
// «Elimina definitivamente»): the sheet's id goes with it; on success the action moves on to another page with its
// notice, otherwise the refusal shows next to the button (`rilievi.error.<code>`) — also when no answer came (no signal:
// keep-on-failure.ts), instead of the error page.
import { useActionState } from 'react';
import { useLocale } from 'next-intl';
import { initialRilievoActionState, type RilievoActionState } from '@/lib/rilievi/action-state';
import Icon, { type IconName } from '../Icon';
import RefusalText from './RefusalText';
import { useGuardedAction, type NoAnswer } from '../keep-on-failure';

type Action = (prev: RilievoActionState, fd: FormData) => Promise<RilievoActionState>;

const noAnswer = (why: NoAnswer): RilievoActionState => ({ error: why });

export default function ActionButton({ action, id, label, icon, variant = 'btn' }: {
  action: Action; id: string; label: string; icon?: IconName; variant?: string;
}) {
  const locale = useLocale();
  const [state, run, pending] = useActionState(useGuardedAction(action, noAnswer), initialRilievoActionState);
  return (
    <form action={run} className="rv-row">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={variant} disabled={pending}>
        {icon ? <Icon name={icon} size={16} /> : null}
        {label}
      </button>
      {state.error ? <span className="alert alert-bad" role="alert"><RefusalText code={state.error} /></span> : null}
    </form>
  );
}
