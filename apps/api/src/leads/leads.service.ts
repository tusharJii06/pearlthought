import { Injectable, NotFoundException } from '@nestjs/common';
import { Lead } from '@publication/shared';
import { createLead } from './lead.entity';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  private leads: Lead[] = [];

  async findAll(brandId?: string, pageId?: string): Promise<Lead[]> {
    let results = this.leads;
    if (brandId) {
      results = results.filter((l) => l.brandId === brandId);
    }
    if (pageId) {
      results = results.filter((l) => l.pageId === pageId);
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findById(id: string): Promise<Lead> {
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return lead;
  }

  async create(dto: CreateLeadDto): Promise<Lead> {
    const lead = createLead(
      dto.pageId,
      dto.brandId,
      dto.name,
      dto.email,
      dto.phone,
      dto.message,
      dto.metadata,
    );

    this.leads.push(lead);
    return lead;
  }

  async getStats(brandId: string): Promise<{ total: number; thisWeek: number; thisMonth: number }> {
    const brandLeads = this.leads.filter((l) => l.brandId === brandId);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      total: brandLeads.length,
      thisWeek: brandLeads.filter((l) => new Date(l.createdAt) >= weekAgo).length,
      thisMonth: brandLeads.filter((l) => new Date(l.createdAt) >= monthAgo).length,
    };
  }
}
