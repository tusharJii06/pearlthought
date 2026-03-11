'use client';

import { Section } from '@publication/shared';

interface SectionRendererProps {
  section: Section;
  theme?: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
}

export function SectionRenderer({ section, theme }: SectionRendererProps) {
  const primaryColor = theme?.primaryColor || '#1a1a2e';
  const fontFamily = theme?.fontFamily || 'Georgia, serif';

  switch (section.type) {
    case 'hero':
      return (
        <div style={{
          background: primaryColor,
          color: '#fff',
          padding: '64px 32px',
          textAlign: 'center',
          fontFamily,
        }}>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 16px' }}>{section.title}</h1>
          {section.content.subtitle && (
            <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>{section.content.subtitle}</p>
          )}
          {section.content.ctaText && (
            <button style={{
              marginTop: '24px',
              padding: '12px 32px',
              background: '#fff',
              color: primaryColor,
              border: 'none',
              borderRadius: '4px',
              fontWeight: '600',
              cursor: 'pointer',
            }}>
              {section.content.ctaText}
            </button>
          )}
        </div>
      );

    case 'content':
      return (
        <div style={{ padding: '48px 32px', maxWidth: '800px', margin: '0 auto', fontFamily }}>
          <h2>{section.title}</h2>
          {section.content.body && (
            <div dangerouslySetInnerHTML={{ __html: section.content.body }} />
          )}
          {section.content.imageUrl && (
            <img
              src={section.content.imageUrl}
              alt={section.title}
              style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '16px' }}
            />
          )}
        </div>
      );

    case 'gallery':
      return (
        <div style={{ padding: '48px 32px', fontFamily }}>
          <h2 style={{ textAlign: 'center' }}>{section.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginTop: '24px' }}>
            {(section.content.images || []).map((img: any, i: number) => (
              <div key={i} style={{ borderRadius: '8px', overflow: 'hidden' }}>
                <img src={img.url} alt={img.alt || ''} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                {img.caption && <p style={{ padding: '8px', margin: 0, fontSize: '0.85rem', color: '#666' }}>{img.caption}</p>}
              </div>
            ))}
          </div>
        </div>
      );

    case 'testimonial':
      return (
        <div style={{ padding: '48px 32px', background: '#f8f9fa', textAlign: 'center', fontFamily }}>
          <h2>{section.title}</h2>
          {section.content.quote && (
            <blockquote style={{ fontSize: '1.25rem', fontStyle: 'italic', maxWidth: '600px', margin: '24px auto', lineHeight: 1.6 }}>
              "{section.content.quote}"
            </blockquote>
          )}
          {section.content.author && (
            <p style={{ fontWeight: '600', color: primaryColor }}>— {section.content.author}</p>
          )}
        </div>
      );

    case 'cta':
      return (
        <div style={{
          padding: '64px 32px',
          background: primaryColor,
          color: '#fff',
          textAlign: 'center',
          fontFamily,
        }}>
          <h2 style={{ margin: '0 0 16px' }}>{section.title}</h2>
          {section.content.description && (
            <p style={{ opacity: 0.9, maxWidth: '600px', margin: '0 auto 24px' }}>{section.content.description}</p>
          )}
          {section.content.buttonText && (
            <button style={{
              padding: '12px 32px',
              background: '#fff',
              color: primaryColor,
              border: 'none',
              borderRadius: '4px',
              fontWeight: '600',
              cursor: 'pointer',
            }}>
              {section.content.buttonText}
            </button>
          )}
        </div>
      );

    case 'form':
      return (
        <div style={{ padding: '48px 32px', fontFamily }}>
          <h2 style={{ textAlign: 'center' }}>{section.title}</h2>
          <p style={{ textAlign: 'center', color: '#666' }}>Form section — rendered by ContactForm component</p>
        </div>
      );

    default:
      return (
        <div style={{ padding: '24px', border: '1px dashed #ddd', margin: '16px 32px' }}>
          <p style={{ color: '#999' }}>Unknown section type: {section.type}</p>
        </div>
      );
  }
}
