import { useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/** Малък helper за async зареждане с отмяна при размонтиране. */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    factory()
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error: Error) => {
        if (alive) setState({ data: null, error, loading: false });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
