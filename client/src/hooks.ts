import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import type { Settings, User } from './types';

/** Fetch helper with loading/error state and manual reload. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Bucket and initiative labels from AppSetting — never hardcoded. */
export function useLabels() {
  const { data } = useFetch<Settings>('/api/settings');
  const parse = (json?: string): string[] => {
    try {
      const v = JSON.parse(json || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return { buckets: parse(data?.buckets), initiatives: parse(data?.initiatives) };
}

/** Active users for assignment dropdowns. */
export function useUsers(includeInactive = false) {
  const { data, reload } = useFetch<User[]>('/api/users');
  const users = (data || []).filter((u) => includeInactive || u.isActive);
  return { users, allUsers: data || [], reload };
}
