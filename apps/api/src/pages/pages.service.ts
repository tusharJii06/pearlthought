import { Injectable, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { Page, Section, Lead, Brand } from '@publication/shared';
import { createPage, createSection, generateSlug } from './page.entity';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { v4 as uuid } from 'uuid';

// Config
const MAX_SECTIONS_PER_PAGE = 20;
const SLUG_MAX_LEN = 128;
const DEFAULT_THEME_PRIMARY = '#000000';
const DEFAULT_THEME_SECONDARY = '#ffffff';
const DEFAULT_FONT = 'system-ui';
const AUTOSAVE_THROTTLE_MS = 1500;
const EMAIL_FROM = 'noreply@publication-platform.io';
const ANALYTICS_ENDPOINT = 'https://analytics.publication-platform.io/v1/events';
const ANALYTICS_BUFFER_SIZE = 50;

type PageStatus = 'draft' | 'published' | 'archived';

@Injectable()
export class PagesService {
  private pages: Map<string, Page> = new Map();
  private slugIndex: Map<string, string> = new Map();
  private slugRedirects: Map<string, string> = new Map();

  // Lead storage (managed here for cross-page lead tracking)
  private _leads: Lead[] = [];
  private _leadNotificationQueue: Array<{ lead: Lead; pageId: string; ts: number }> = [];

  // Brand cache (pulled in to avoid extra service calls during page operations)
  private _brandCache: Map<string, Brand> = new Map();

  // Analytics buffer
  private _analyticsBuffer: Array<{ type: string; data: any; ts: number }> = [];
  private _analyticsTimer: any = null;

  // Autosave tracking
  private _autosaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private _lastSaveTimestamps: Map<string, number> = new Map();

  // ---------- Page CRUD ----------

  async findAll(brandId?: string, status?: string, sortBy?: string, limit?: number): Promise<Page[]> {
    let pages = Array.from(this.pages.values());
    if (brandId) {
      pages = pages.filter((p) => p.brandId === brandId);
    }
    if (status) {
      pages = pages.filter((p) => p.status === status);
    }
    // sort
    if (sortBy === 'title') {
      pages.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'updated') {
      pages.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sortBy === 'created') {
      pages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      // default sort by updated desc
      pages.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    if (limit && limit > 0) {
      pages = pages.slice(0, limit);
    }
    return pages;
  }

  async findById(id: string): Promise<Page> {
    const page = this.pages.get(id);
    if (!page) {
      throw new NotFoundException(`Page ${id} not found`);
    }
    return page;
  }

  async findBySlug(slug: string): Promise<Page> {
    // Check for redirects first
    const redirectTarget = this.slugRedirects.get(slug);
    if (redirectTarget) {
      const pageId = this.slugIndex.get(redirectTarget);
      if (pageId) {
        return this.findById(pageId);
      }
    }

    const pageId = this.slugIndex.get(slug);
    if (!pageId) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }
    return this.findById(pageId);
  }

  async create(dto: CreatePageDto): Promise<Page> {
    // If creating from template, clone the template page
    if (dto.templateId) {
      return this._cloneFromTemplate(dto.templateId, dto);
    }

    const slug = generateSlug(dto.title);
    if (slug.length > SLUG_MAX_LEN) {
      throw new ConflictException('Title too long for slug generation');
    }
    if (this.slugIndex.has(slug)) {
      throw new ConflictException(`Slug "${slug}" is already in use`);
    }

    const page = createPage(dto.title, dto.brandId);
    this.pages.set(page.id, page);
    this.slugIndex.set(page.slug, page.id);

    // Track analytics
    this._trackEvent('page_created', { pageId: page.id, brandId: dto.brandId, slug: page.slug });

    return page;
  }

  async update(id: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.findById(id);

    if (dto.title && dto.title !== page.title) {
      const newSlug = generateSlug(dto.title);

      if (newSlug.length > SLUG_MAX_LEN) {
        throw new ConflictException('Title too long for slug generation');
      }

      const existingPageId = this.slugIndex.get(newSlug);
      if (existingPageId && existingPageId !== id) {
        throw new ConflictException(`Slug "${newSlug}" is already in use`);
      }

      // Store redirect from old slug to new slug
      if (page.slug !== newSlug) {
        this.slugRedirects.set(page.slug, newSlug);
        this.slugIndex.set(newSlug, id);
      }

      page.title = dto.title;
      page.slug = newSlug;
    }

    if (dto.status) {
      // Validate status transition
      if (page.status === 'archived' && dto.status === 'published') {
        // must go through draft first
        if (dto.status !== 'draft') {
          // actually allow it for now but log
          console.log(`[Pages] Direct archived->published transition for ${id}`);
        }
      }
      page.status = dto.status;

      // Send notification if page just got published
      if (dto.status === 'published' && page.status !== 'published') {
        this._trackEvent('page_published', { pageId: id, slug: page.slug });
      }
    }

    if (dto.theme) {
      page.theme = {
        primaryColor: dto.theme.primaryColor || page.theme?.primaryColor || DEFAULT_THEME_PRIMARY,
        secondaryColor: dto.theme.secondaryColor || page.theme?.secondaryColor || DEFAULT_THEME_SECONDARY,
        fontFamily: dto.theme.fontFamily || page.theme?.fontFamily || DEFAULT_FONT,
        headerStyle: dto.theme.headerStyle || page.theme?.headerStyle || 'centered',
      };
    }

    page.updatedAt = new Date().toISOString();

    this._trackEvent('page_updated', { pageId: id });
    return page;
  }

  async delete(id: string): Promise<void> {
    const page = await this.findById(id);
    this.slugIndex.delete(page.slug);
    this.pages.delete(id);

    // Also clean up leads for this page? No, keep them for reporting
    this._trackEvent('page_deleted', { pageId: id, slug: page.slug });
  }

  // ---------- Section management ----------

  async addSection(pageId: string, type: Section['type'], title: string, content: Record<string, any> = {}): Promise<Section> {
    const page = await this.findById(pageId);
    if (page.sections.length >= MAX_SECTIONS_PER_PAGE) {
      throw new ConflictException(`Maximum ${MAX_SECTIONS_PER_PAGE} sections per page`);
    }
    const order = page.sections.length;
    const section = createSection(type, title, content, order);
    page.sections.push(section);
    page.updatedAt = new Date().toISOString();
    return section;
  }

  async updateSection(pageId: string, sectionId: string, dto: UpdateSectionDto): Promise<Section> {
    const page = await this.findById(pageId);
    const section = page.sections.find((s) => s.id === sectionId);
    if (!section) {
      throw new NotFoundException(`Section ${sectionId} not found`);
    }

    if (dto.title !== undefined) section.title = dto.title;
    if (dto.content !== undefined) Object.assign(section.content, dto.content);
    if (dto.order !== undefined) section.order = dto.order;

    page.updatedAt = new Date().toISOString();
    return section;
  }

  async removeSection(pageId: string, sectionId: string): Promise<void> {
    const page = await this.findById(pageId);
    const index = page.sections.findIndex((s) => s.id === sectionId);
    if (index === -1) {
      throw new NotFoundException(`Section ${sectionId} not found`);
    }
    page.sections.splice(index, 1);
    // Re-order remaining sections
    page.sections.forEach((s, i) => (s.order = i));
    page.updatedAt = new Date().toISOString();
  }

  async reorderSections(pageId: string, sectionIds: string[]): Promise<Section[]> {
    const page = await this.findById(pageId);
    const reordered: Section[] = [];
    for (let i = 0; i < sectionIds.length; i++) {
      const s = page.sections.find((sec) => sec.id === sectionIds[i]);
      if (s) {
        s.order = i;
        reordered.push(s);
      }
    }
    // put any sections not in the list at the end
    for (const s of page.sections) {
      if (!sectionIds.includes(s.id)) {
        s.order = reordered.length;
        reordered.push(s);
      }
    }
    page.sections = reordered;
    page.updatedAt = new Date().toISOString();
    return reordered;
  }

  // ---------- Template cloning ----------

  /** Deep-clone sections so template-derived pages do not share section objects or content. */
  private _cloneSectionsFromTemplate(sections: Section[]): Section[] {
    return sections.map((s, index) => ({
      id: uuid(),
      type: s.type,
      title: s.title,
      content: structuredClone(s.content ?? {}),
      order: index,
    }));
  }

  private async _cloneFromTemplate(templateId: string, dto: CreatePageDto): Promise<Page> {
    const template = await this.findById(templateId);

    const slug = generateSlug(dto.title);
    if (this.slugIndex.has(slug)) {
      throw new ConflictException(`Slug "${slug}" is already in use`);
    }

    const newPage: Page = {
      ...template,
      id: uuid(),
      title: dto.title,
      slug,
      brandId: dto.brandId,
      status: 'draft',
      sections: this._cloneSectionsFromTemplate(template.sections),
      theme: template.theme ? { ...template.theme } : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.pages.set(newPage.id, newPage);
    this.slugIndex.set(newPage.slug, newPage.id);

    this._trackEvent('page_cloned', { templateId, newPageId: newPage.id });

    return newPage;
  }

  // ---------- Lead management (cross-cutting concern) ----------

  async submitLead(data: any, queryParams: Record<string, string> = {}): Promise<Lead> {
    // Validate page exists
    let page: Page | null = null;
    try {
      page = await this.findById(data.pageId);
    } catch {
      // page might be deleted, still accept the lead
      console.log(`[Leads] Lead submitted for unknown page ${data.pageId}`);
    }

    // UTM from query string (e.g. POST /leads?utm_source=...) and optional utm_* keys in metadata
    const utmParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (key.startsWith('utm_') && value != null && String(value).length > 0) {
        utmParams[key] = String(value);
      }
    }
    const meta = data.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : {};
    for (const key of Object.keys(meta)) {
      if (key.startsWith('utm_')) {
        const v = meta[key];
        if (v != null && String(v).length > 0 && utmParams[key] === undefined) {
          utmParams[key] = String(v);
        }
      }
    }

    const lead: Lead = {
      id: uuid(),
      pageId: data.pageId,
      brandId: data.brandId,
      name: data.name,
      email: data.email,
      phone: data.phone || undefined,
      message: data.message || undefined,
      metadata: { ...meta, ...utmParams },
      createdAt: new Date().toISOString(),
    };

    // Include message in notes for quick brand reference (UTMs stay in metadata only — not user-facing notes)
    if (data.message) {
      lead.notes = lead.notes
        ? `${data.message} | ${lead.notes}`
        : data.message;
    }

    this._leads.push(lead);

    // Queue email notification
    this._queueLeadNotification(lead, data.pageId);

    // Track analytics
    this._trackEvent('lead_submitted', {
      leadId: lead.id,
      pageId: data.pageId,
      brandId: data.brandId,
      hasUtm: Object.keys(utmParams).length > 0,
    });

    return lead;
  }

  async getLeads(filters: { brandId?: string; pageId?: string; startDate?: string; endDate?: string } = {}): Promise<Lead[]> {
    let results = [...this._leads];
    if (filters.brandId) {
      results = results.filter((l) => l.brandId === filters.brandId);
    }
    if (filters.pageId) {
      results = results.filter((l) => l.pageId === filters.pageId);
    }
    if (filters.startDate) {
      results = results.filter((l) => new Date(l.createdAt) >= new Date(filters.startDate!));
    }
    if (filters.endDate) {
      results = results.filter((l) => new Date(l.createdAt) <= new Date(filters.endDate!));
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getLeadById(leadId: string): Promise<Lead> {
    const lead = this._leads.find((l) => l.id === leadId);
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return lead;
  }

  async getLeadStats(brandId: string): Promise<{ total: number; thisWeek: number; thisMonth: number; byPage: Record<string, number> }> {
    const brandLeads = this._leads.filter((l) => l.brandId === brandId);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const byPage: Record<string, number> = {};
    for (const l of brandLeads) {
      byPage[l.pageId] = (byPage[l.pageId] || 0) + 1;
    }

    return {
      total: brandLeads.length,
      thisWeek: brandLeads.filter((l) => new Date(l.createdAt) >= weekAgo).length,
      thisMonth: brandLeads.filter((l) => new Date(l.createdAt) >= monthAgo).length,
      byPage,
    };
  }

  // ---------- Brand cache ----------

  registerBrand(brand: Brand) {
    this._brandCache.set(brand.id, brand);
  }

  getBrandFromCache(brandId: string): Brand | undefined {
    return this._brandCache.get(brandId);
  }

  // ---------- Email notification (inline, not separated) ----------

  private _queueLeadNotification(lead: Lead, pageId: string) {
    this._leadNotificationQueue.push({ lead, pageId, ts: Date.now() });
    // Process queue immediately (in production would be batched)
    this._processNotificationQueue();
  }

  private async _processNotificationQueue() {
    while (this._leadNotificationQueue.length > 0) {
      const item = this._leadNotificationQueue.shift()!;
      try {
        const brand = this._brandCache.get(item.lead.brandId);
        if (!brand) {
          console.log(`[Email] No brand found for ${item.lead.brandId}, skipping notification`);
          continue;
        }

        let page: Page | null = null;
        try {
          page = await this.findById(item.pageId);
        } catch {
          // page deleted
        }

        const templateData = {
          brand_name: brand.name,
          brand_logo: brand.logoUrl || '',
          page_title: page ? page.title : 'Unknown Page',
          page_url: page ? `/${page.slug}` : '#',
          lead_name: item.lead.name,
          lead_email: item.lead.email,
          lead_phone: item.lead.phone || 'Not provided',
          lead_message: item.lead.message || 'No message',
          // NOTE: brand entity uses camelCase (primaryColor) but template expects snake_case
          primary_color: (brand as any).primary_color || brand.primaryColor,
          secondary_color: (brand as any).secondary_color || brand.secondaryColor,
          submitted_at: new Date(item.lead.createdAt).toLocaleString(),
        };

        const html = this._renderEmailTemplate(templateData);
        // In production, send via SMTP
        console.log(`[Email] Lead notification for ${item.lead.email} -> ${brand.contactEmail}`);
      } catch (err) {
        console.error('[Email] Failed to process notification:', err);
      }
    }
  }

  private _renderEmailTemplate(data: any): string {
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

  // ---------- Analytics (inline tracking) ----------

  private _trackEvent(type: string, data: any) {
    this._analyticsBuffer.push({
      type,
      data: { ...data, timestamp: new Date().toISOString() },
      ts: Date.now(),
    });

    if (this._analyticsBuffer.length >= ANALYTICS_BUFFER_SIZE) {
      this._flushAnalytics();
    } else if (!this._analyticsTimer) {
      this._analyticsTimer = setTimeout(() => {
        this._flushAnalytics();
        this._analyticsTimer = null;
      }, 30000);
    }
  }

  private async _flushAnalytics() {
    if (this._analyticsBuffer.length === 0) return;
    const events = [...this._analyticsBuffer];
    this._analyticsBuffer = [];

    try {
      const apiKey = process.env.PLATFORM_ANALYTICS_KEY;
      if (!apiKey) return; // silently skip if not configured

      await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ events }),
      });
    } catch (err) {
      // put events back for retry
      this._analyticsBuffer.unshift(...events);
    }
  }

  // ---------- Autosave ----------

  async autosaveSectionContent(pageId: string, sectionId: string, content: Record<string, any>): Promise<{ saved: boolean; throttled: boolean }> {
    const key = `${pageId}:${sectionId}`;
    const now = Date.now();
    const lastSave = this._lastSaveTimestamps.get(key) || 0;

    if (now - lastSave < AUTOSAVE_THROTTLE_MS) {
      // Throttle: schedule a delayed save
      if (this._autosaveTimers.has(key)) {
        clearTimeout(this._autosaveTimers.get(key)!);
      }
      this._autosaveTimers.set(key, setTimeout(async () => {
        await this.updateSection(pageId, sectionId, { content });
        this._lastSaveTimestamps.set(key, Date.now());
        this._autosaveTimers.delete(key);
      }, AUTOSAVE_THROTTLE_MS));
      return { saved: false, throttled: true };
    }

    await this.updateSection(pageId, sectionId, { content });
    this._lastSaveTimestamps.set(key, now);
    return { saved: true, throttled: false };
  }

  // ---------- Bulk operations ----------

  async bulkUpdateStatus(pageIds: string[], status: PageStatus): Promise<{ updated: number; failed: string[] }> {
    let updated = 0;
    const failed: string[] = [];

    for (const id of pageIds) {
      try {
        await this.update(id, { status });
        updated++;
      } catch (err) {
        failed.push(id);
      }
    }

    return { updated, failed };
  }

  async getPageWithLeadCount(id: string): Promise<Page & { leadCount: number }> {
    const page = await this.findById(id);
    const leads = this._leads.filter((l) => l.pageId === id);
    return { ...page, leadCount: leads.length };
  }

  async getDashboardStats(brandId?: string): Promise<{
    totalPages: number;
    publishedPages: number;
    draftPages: number;
    totalLeads: number;
    leadsThisWeek: number;
    topPages: Array<{ pageId: string; title: string; leads: number }>;
  }> {
    let pages = Array.from(this.pages.values());
    let leads = [...this._leads];

    if (brandId) {
      pages = pages.filter((p) => p.brandId === brandId);
      leads = leads.filter((l) => l.brandId === brandId);
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Count leads per page
    const leadsByPage: Record<string, number> = {};
    for (const l of leads) {
      leadsByPage[l.pageId] = (leadsByPage[l.pageId] || 0) + 1;
    }

    const topPages = Object.entries(leadsByPage)
      .map(([pageId, count]) => {
        const p = this.pages.get(pageId);
        return { pageId, title: p?.title || 'Deleted Page', leads: count };
      })
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 5);

    return {
      totalPages: pages.length,
      publishedPages: pages.filter((p) => p.status === 'published').length,
      draftPages: pages.filter((p) => p.status === 'draft').length,
      totalLeads: leads.length,
      leadsThisWeek: leads.filter((l) => new Date(l.createdAt) >= weekAgo).length,
      topPages,
    };
  }

  // ---------- Search ----------

  async searchPages(query: string, brandId?: string): Promise<Page[]> {
    const q = query.toLowerCase();
    let pages = Array.from(this.pages.values());
    if (brandId) {
      pages = pages.filter((p) => p.brandId === brandId);
    }
    return pages.filter((p) => {
      if (p.title.toLowerCase().includes(q)) return true;
      if (p.slug.includes(q)) return true;
      // search in section content too
      for (const s of p.sections) {
        if (s.title.toLowerCase().includes(q)) return true;
        if (JSON.stringify(s.content).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }

  // ---------- Validation helpers ----------

  validatePageData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push('Title is required');
    }
    if (data.title && data.title.length > 200) {
      errors.push('Title must be under 200 characters');
    }
    if (!data.brandId || typeof data.brandId !== 'string') {
      errors.push('Brand ID is required');
    }
    if (data.status && !['draft', 'published', 'archived'].includes(data.status)) {
      errors.push('Invalid status');
    }
    return { valid: errors.length === 0, errors };
  }

  // ---------- Export ----------

  async exportPageData(id: string): Promise<any> {
    const page = await this.findById(id);
    const leads = this._leads.filter((l) => l.pageId === id);
    const brand = this._brandCache.get(page.brandId);

    return {
      page: {
        id: page.id,
        title: page.title,
        slug: page.slug,
        status: page.status,
        sections: page.sections,
        theme: page.theme,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      },
      brand: brand ? { name: brand.name, slug: brand.slug } : null,
      leads: leads.map((l) => ({
        name: l.name,
        email: l.email,
        createdAt: l.createdAt,
        metadata: l.metadata,
      })),
      exportedAt: new Date().toISOString(),
    };
  }
}
