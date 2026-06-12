/** Thin fetch wrapper: JSON in/out, throws Error with a user-safe message. */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });

  if (res.status === 401 && !path.startsWith('/api/auth')) {
    window.dispatchEvent(new CustomEvent('ascend:unauthorized'));
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}
