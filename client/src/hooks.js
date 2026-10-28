import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch data with a small loading/error state machine.
 * `deps` controls refetching; `reload(true)` refreshes silently.
 */
export function useAsync(loader, deps = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const tokenRef = useRef(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (silent = false) => {
    const token = ++tokenRef.current;
    if (!silent) setLoading(true);
    try {
      const result = await loaderRef.current();
      if (token === tokenRef.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      if (token === tokenRef.current) setError(err);
      throw err;
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData, setError };
}

/** Document title helper. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Trompeta Surveying` : 'Trompeta Surveying';
  }, [title]);
}

/** Fire a callback when a click lands outside a ref element. */
export function useOutsideClick(ref, handler) {
  useEffect(() => {
    function onDown(event) {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [ref, handler]);
}

/** Media query hook (used to switch calendar defaults on phones). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
