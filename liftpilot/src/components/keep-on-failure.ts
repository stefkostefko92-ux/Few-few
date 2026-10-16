'use client';

// The survey sheets and the reports are filled in where the signal is poor (shafts, basements, machine rooms): a server
// action that gets no answer — the network gone, or an answer the router cannot read — must not throw into the error
// boundary, which would unmount the form and lose everything typed. Wrapped, the action answers like a refusal of the
// server instead: the form stays, with its values, and says what happened. Next's own navigations (the redirect after a
// save) go on as they are. Before hydration the form keeps the server action itself, so that it still works without
// JavaScript (React renders the action's form fields only for a server action); from the first render after hydration
// the wrapped one runs (useActionState takes the newest action of each render).
import { useMemo, useSyncExternalStore } from 'react';
import { unstable_rethrow } from 'next/navigation';

/** Why no answer came: the network (the browser is offline, or the request never got through) or anything else. */
export type NoAnswer = 'offline' | 'failed';

export function noAnswerOf(err: unknown): NoAnswer {
  // fetch rejects with a TypeError when the request does not get through; a server's error comes as a plain Error
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline || err instanceof TypeError ? 'offline' : 'failed';
}

type Action<S> = (prev: S, fd: FormData) => Promise<S>;
type Failure<S> = (why: NoAnswer, prev: S, fd: FormData) => S;

/** `action`, with a failure to answer turned into `onFailure`'s state (the redirects of Next are thrown on); `settle`, when
 *  given, sees every answer with the state it followed. */
export function keepOnFailure<S>(action: Action<S>, onFailure: Failure<S>, settle?: (out: S, prev: S) => S): Action<S> {
  return async (prev, fd) => {
    let out: S;
    try {
      out = await action(prev, fd);
    } catch (err) {
      unstable_rethrow(err);
      out = onFailure(noAnswerOf(err), prev, fd);
    }
    return settle ? settle(out, prev) : out;
  };
}

const noSubscription = (): (() => void) => () => {};

/** True once the page is hydrated (false on the server and while hydrating). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/** The action to give useActionState: the server action until hydration, then the same action kept from failing. The
 *  callbacks are module-level functions (or memoised), so the wrapped action is made once. */
export function useGuardedAction<S>(action: Action<S>, onFailure: Failure<S>, settle?: (out: S, prev: S) => S): Action<S> {
  const hydrated = useHydrated();
  const guarded = useMemo(() => keepOnFailure(action, onFailure, settle), [action, onFailure, settle]);
  return hydrated ? guarded : action;
}
