import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Generic data-fetching hook.
 *
 * IMPORTANT: Initial `data` state is `undefined` (not null) so that
 * destructuring defaults work correctly:
 *   const { data: groups = [] } = useApi('/groups');
 * groups will be [] while loading, not null.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi('/challenges');
 *   const { data, execute } = useApi('/simulations', { manual: true });
 *   const { data } = useApi(userId ? `/users/${userId}` : null); // skip if null endpoint
 */
export function useApi(endpoint, { manual = false, deps = [] } = {}) {
  const [data, setData] = useState(undefined);   // undefined, not null — allows destructuring defaults
  const [loading, setLoading] = useState(!manual && !!endpoint);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (overrideEndpoint) => {
    const target = overrideEndpoint || endpoint;
    if (!target) {
      // Null endpoint — clear loading state and return
      if (mountedRef.current) setLoading(false);
      return undefined;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await api.get(target, { signal: controller.signal });
      if (mountedRef.current) {
        setData(res.data);
        setError(null);
      }
      return res.data;
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return undefined;
      }
      const message = err.response?.data?.detail || err.message || 'Request failed';
      if (mountedRef.current) {
        setError(message);
      }
      return undefined;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    if (!manual) {
      execute();
    }
    return () => abortRef.current?.abort();
  }, [manual, execute, ...deps]);

  return { data, loading, error, refetch: execute };
}

/**
 * Mutation hook for POST / PUT / DELETE / PATCH operations.
 *
 * Usage:
 *   const { mutate, loading, error } = useMutation('post', '/simulations');
 *   const result = await mutate({ challenge_id: 'x' });
 *
 *   const { mutate: deleteItem } = useMutation('delete', '/items');
 *   await deleteItem(null, '/items/123'); // override endpoint
 */
export function useMutation(method, endpoint) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(async (body, overrideEndpoint) => {
    const target = overrideEndpoint || endpoint;
    setLoading(true);
    setError(null);
    try {
      const res = await api[method](target, body);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Request failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [method, endpoint]);

  return { mutate, loading, error };
}
