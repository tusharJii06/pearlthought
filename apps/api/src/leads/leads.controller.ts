import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll(@Query('brandId') brandId?: string, @Query('pageId') pageId?: string) {
    return this.leadsService.findAll(brandId, pageId);
  }

  @Get('stats/:brandId')
  getStats(@Param('brandId') brandId: string) {
    return this.leadsService.getStats(brandId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.leadsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }
}
