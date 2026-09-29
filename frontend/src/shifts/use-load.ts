import { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { describeShiftError } from './shift-data';

export type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/** Runs `load` on mount and whenever `deps` change; stale responses are ignored. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load().then((data) => { if (active) setState({ status: 'ready', data }); }).catch((error: unknown) => { if (active) setState({ status: 'error', error }); });
    return () => { active = false; };
  }, deps);
  return state;
}

/** Signs the user out of the workspace shell when the server says the session is gone. */
export function useExpireOnUnauthorized(error: unknown): void {
  const { expireSession } = useAuth();
  const kind = error === undefined ? undefined : describeShiftError(error).kind;
  useEffect(() => { if (kind === 'unauthorized') expireSession(); }, [kind, expireSession]);
}
