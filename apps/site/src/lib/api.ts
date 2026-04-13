const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** UTM query segment for POST /leads (browser only). */
export function getLeadSubmitUtmSearch(): string {
  if (typeof window === 'undefined') return '';
  const incoming = new URLSearchParams(window.location.search);
  const utm = new URLSearchParams();
  for (const [key, value] of incoming.entries()) {
    if (key.toLowerCase().startsWith('utm_') && value.length > 0) {
      utm.set(key, value);
    }
  }
  const q = utm.toString();
  return q ? `?${q}` : '';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export const siteApi = {
  getPageBySlug: (slug: string) =>
    request<any>(`/pages/slug/${slug}`),

  getBrand: (id: string) =>
    request<any>(`/brands/${id}`),

  submitLead: (data: any, utmSearch: string = '') =>
    request<any>(`/leads${utmSearch}`, { method: 'POST', body: JSON.stringify(data) }),

  getPublishedPages: () =>
    request<any[]>('/pages').then((pages) =>
      pages.filter((p: any) => p.status === 'published')
    ),
};
