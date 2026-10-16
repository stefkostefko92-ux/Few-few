'use client';

// The survey sheets and the reports are filled in where the signal is poor (shafts, basements, machine rooms): a server
// action that gets no answer — the network gone, or an answer the router cannot read — must not throw into the error
// boundary, which would unmount the form and lose everything typed. Wrapped, the action answers like a refusal of the
// server instead: the form stays, with its values, and says what happened. Next's own navigations (the redirect after a
// save) go on as they are. Before hydration the form keeps the server action itself, so that it still works without
// JavaScript (React renders the action's form fields only for a server action); from the first render after hydration
// the wrapped one runs (useActionState takes the newest action of each render). «No answer» is not «nothing done»: the
// request may have reached the server and only its answer been lost (a connection cut on the way back), so a write sent
// again must not count twice — the survey sheet's form sends the same key with every attempt (`prepare`, newWriteKey) and
// the server knows the save it already made.
import { useMemo, useSyncExternalStore } from 'react';
import { unstable_rethrow } from 'next/navigation';

/** Why no answer came: the network (the browser is offline, or the connection broke — before the request got through or
 *  after, on the answer's way back: the browser cannot tell) or anything else. */
export type NoAnswer = 'offline' | 'failed';

export function noAnswerOf(err: unknown): NoAnswer {
  // fetch rejects with a TypeError when the connection fails, whether the server got the request or not; a server's error
  // comes as a plain Error
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline || err instanceof TypeError ? 'offline' : 'failed';
}

type Action<S> = (prev: S, fd: FormData) => Promise<S>;
type Failure<S> = (why: NoAnswer, prev: S, fd: FormData) => S;
type Settle<S> = (out: S, prev: S) => S;
type Prepare = (fd: FormData) => void;

/** A key for one write, the same on every attempt to send it (a v4 UUID). crypto.randomUUID exists only in a secure
 *  context (https, localhost); elsewhere the same shape from crypto.getRandomValues. */
export function newWriteKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `action`, with a failure to answer turned into `onFailure`'s state (the redirects of Next are thrown on); `settle`, when
 *  given, sees every answer with the state it followed; `prepare`, when given, completes the form's data before each
 *  attempt (the write key). */
export function keepOnFailure<S>(action: Action<S>, onFailure: Failure<S>, settle?: Settle<S>, prepare?: Prepare): Action<S> {
  return async (prev, fd) => {
    prepare?.(fd);
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
 *  callbacks are module-level functions (or memoised), so the wrapped action is made once. Before hydration nothing is
 *  prepared: the browser's own submit carries the form as it is (no write key — a page load answers or fails visibly). */
export function useGuardedAction<S>(action: Action<S>, onFailure: Failure<S>, settle?: Settle<S>, prepare?: Prepare): Action<S> {
  const hydrated = useHydrated();
  const guarded = useMemo(() => keepOnFailure(action, onFailure, settle, prepare), [action, onFailure, settle, prepare]);
  return hydrated ? guarded : action;
}
