import { Injectable } from '@nestjs/common';
import { Lead, Page, Brand } from '@publication/shared';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private sentEmails: EmailPayload[] = [];

  async sendLeadNotification(lead: Lead, page: Page, brand: Brand): Promise<void> {
    const templateData = this.formatForTemplate(lead, page, brand);
    const html = this.renderLeadTemplate(templateData);

    const payload: EmailPayload = {
      to: brand.contactEmail,
      subject: `New lead from ${page.title}: ${lead.name}`,
      html,
    };

    // In production, this would send via SMTP/API
    this.sentEmails.push(payload);
    console.log(`[Email] Lead notification sent to ${brand.contactEmail}`);
  }

  private formatForTemplate(lead: Lead, page: Page, brand: Brand) {
    return {
      brand_name: brand.name,
      brand_logo: brand.logoUrl || '',
      page_title: page.title,
      page_url: `/${page.slug}`,
      lead_name: lead.name,
      lead_email: lead.email,
      lead_phone: lead.phone || 'Not provided',
      lead_message: lead.message || 'No message',
      primary_color: brand.primaryColor,
      secondary_color: brand.secondaryColor,
      submitted_at: new Date(lead.createdAt).toLocaleString(),
    };
  }

  private renderLeadTemplate(data: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${data.primary_color || '#1a1a2e'}; padding: 24px; text-align: center;">
          ${data.brand_logo ? `<img src="${data.brand_logo}" alt="${data.brand_name}" height="40" />` : ''}
          <h2 style="color: #fff; margin: 8px 0 0;">${data.brand_name}</h2>
        </div>
        <div style="padding: 24px; background: #fff;">
          <h3>New Lead from ${data.page_title}</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${data.lead_name}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${data.lead_email}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${data.lead_phone}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Message</td><td style="padding: 8px;">${data.lead_message}</td></tr>
          </table>
          <p style="color: #666; font-size: 0.85rem; margin-top: 16px;">Submitted: ${data.submitted_at}</p>
        </div>
        <div style="background: ${data.secondary_color || '#f5f5f5'}; padding: 16px; text-align: center; font-size: 0.85rem; color: #666;">
          <p>This lead was captured from <a href="${data.page_url}">${data.page_title}</a></p>
        </div>
      </div>
    `;
  }

  // For testing/debugging
  getSentEmails(): EmailPayload[] {
    return this.sentEmails;
  }
}
