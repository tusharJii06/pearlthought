'use client';

import { useState } from 'react';
import { siteApi, getLeadSubmitUtmSearch } from '@/lib/api';

interface ContactFormProps {
  pageId: string;
  brandId: string;
  brandName?: string;
  accentColor?: string;
}

export function ContactForm({ pageId, brandId, brandName, accentColor = '#1a1a2e' }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [investmentRange, setInvestmentRange] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!name || !email) {
      setError('Name and email are required.');
      return;
    }

    setSubmitting(true);
    try {
      await siteApi.submitLead(
        {
          pageId,
          brandId,
          name,
          email,
          phone: phone || undefined,
          message: message || undefined,
          metadata: {
            investmentRange: investmentRange || undefined,
            source: 'contact-form',
            submittedAt: new Date().toISOString(),
          },
        },
        getLeadSubmitUtmSearch(),
      );
      setSubmitted(true);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '32px' }}>
        <h3 style={{ color: accentColor }}>Thank You!</h3>
        <p>Your inquiry has been submitted. A representative from {brandName || 'the brand'} will contact you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Get More Information About {brandName || 'This Opportunity'}</h3>
      <p style={{ color: '#666', marginBottom: '24px' }}>Fill out the form below and a brand representative will reach out to you.</p>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: '4px', marginBottom: '16px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <input
          placeholder="Your Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <input
          type="email"
          placeholder="Email Address *"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <input
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <select
          value={investmentRange}
          onChange={(e) => setInvestmentRange(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', color: investmentRange ? '#000' : '#9ca3af' }}
        >
          <option value="">Investment Range (Optional)</option>
          <option value="under-50k">Under $50,000</option>
          <option value="50k-100k">$50,000 - $100,000</option>
          <option value="100k-250k">$100,000 - $250,000</option>
          <option value="250k-500k">$250,000 - $500,000</option>
          <option value="500k-plus">$500,000+</option>
        </select>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <textarea
          placeholder="Tell us about yourself and why you're interested..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '12px',
          background: accentColor,
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Submitting...' : 'Request Information'}
      </button>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '12px', textAlign: 'center' }}>
        By submitting, you agree to receive communications about brand opportunities.
      </p>
    </form>
  );
}
