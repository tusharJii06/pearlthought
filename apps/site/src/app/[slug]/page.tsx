'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { siteApi } from '@/lib/api';
import { SectionRenderer } from '@/components/SectionRenderer';
import { ContactForm } from '@/components/ContactForm';
import { SEOHead } from '@/components/SEOHead';

export default function LandingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [page, setPage] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPage();
  }, [slug]);

  async function loadPage() {
    try {
      const pageData = await siteApi.getPageBySlug(slug);
      setPage(pageData);

      if (pageData.brandId) {
        const brandData = await siteApi.getBrand(pageData.brandId);
        setBrand(brandData);
      }
    } catch (err) {
      setError('Page not found');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: '48px', textAlign: 'center' }}>Loading...</div>;
  if (error) return <div style={{ padding: '48px', textAlign: 'center' }}><h1>404</h1><p>{error}</p></div>;
  if (!page) return null;

  const theme = page.theme || {
    primaryColor: brand?.primaryColor || '#1a1a2e',
    secondaryColor: brand?.secondaryColor || '#e2e2e2',
    fontFamily: 'Georgia, serif',
  };

  return (
    <>
      <SEOHead page={page} brand={brand} />

      <div>
        {page.sections
          .sort((a: any, b: any) => a.order - b.order)
          .map((section: any) => {
            if (section.type === 'form') {
              return (
                <div key={section.id} style={{ padding: '48px 32px', maxWidth: '600px', margin: '0 auto' }}>
                  <ContactForm
                    pageId={page.id}
                    brandId={page.brandId}
                    brandName={brand?.name}
                    accentColor={theme.primaryColor}
                  />
                </div>
              );
            }

            return (
              <SectionRenderer
                key={section.id}
                section={section}
                theme={theme}
              />
            );
          })}
      </div>

      {!page.sections.some((s: any) => s.type === 'form') && (
        <div style={{ padding: '48px 32px', maxWidth: '600px', margin: '0 auto', borderTop: '1px solid #eee' }}>
          <ContactForm
            pageId={page.id}
            brandId={page.brandId}
            brandName={brand?.name}
            accentColor={theme.primaryColor}
          />
        </div>
      )}
    </>
  );
}
