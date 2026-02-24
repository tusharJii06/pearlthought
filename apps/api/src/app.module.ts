import { Module } from '@nestjs/common';
import { PagesModule } from './pages/pages.module';
import { BrandsModule } from './brands/brands.module';
import { LeadsModule } from './leads/leads.module';

@Module({
  imports: [PagesModule, BrandsModule, LeadsModule],
})
export class AppModule {}
