const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? '';

export async function uploadSession(content: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: content,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `Upload failed (${res.status})`);
  }
  const { id } = await res.json() as { id: string };
  return id;
}

const SHARE_BASE_URL = import.meta.env.VITE_SHARE_BASE_URL ?? window.location.origin;

export function buildShareUrl(id: string): string {
  return `${SHARE_BASE_URL}/s/${id}`;
}
