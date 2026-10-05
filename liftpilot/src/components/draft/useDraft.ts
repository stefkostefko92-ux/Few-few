'use client';

// The draft of a form kept as it is filled in (src/server/draft-actions.ts): a second and a half after the last change,
// when the values read as the server keeps them (a value being typed out of range waits until it is back in range).
import { useEffect, useRef, useState } from 'react';
import { saveDraftAction } from '@/server/draft-actions';
import type { DraftScope } from '@/lib/draft-input';

export interface DraftTarget {
  projectId: string;
  scope: DraftScope;
  /** when the draft the form opened with was kept, as the server writes dates; null: the form opened without one */
  resumed: string | null;
}

export type DraftState = { kind: 'none' } | { kind: 'resumed'; at: string } | { kind: 'saved'; at: Date } | { kind: 'failed' };

const DELAY = 1500;

export function useDraft(target: DraftTarget | null, data: unknown, valid: boolean): DraftState {
  const [state, setState] = useState<DraftState>(target?.resumed ? { kind: 'resumed', at: target.resumed } : { kind: 'none' });
  const json = JSON.stringify(data), opened = useRef(json);
  useEffect(() => {
    // nothing kept before the form changes, nor while a value is out of range
    if (!target || !valid || json === opened.current) return;
    const timer = setTimeout(() => {
      saveDraftAction({ projectId: target.projectId, scope: target.scope, data: JSON.parse(json) as unknown }).then(
        (r) => setState(r.ok ? { kind: 'saved', at: new Date(r.at) } : { kind: 'failed' }),
        () => setState({ kind: 'failed' }),
      );
    }, DELAY);
    return () => clearTimeout(timer);
  }, [json, target, valid]);
  return state;
}
