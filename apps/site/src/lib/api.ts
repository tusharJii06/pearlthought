const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

  submitLead: (data: any) =>
    request<any>('/leads', { method: 'POST', body: JSON.stringify(data) }),

  getPublishedPages: () =>
    request<any[]>('/pages').then((pages) =>
      pages.filter((p: any) => p.status === 'published')
    ),
};
