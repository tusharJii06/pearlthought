export class CreateLeadDto {
  pageId!: string;
  brandId!: string;
  name!: string;
  email!: string;
  phone?: string;
  message?: string;
  metadata?: Record<string, any>;
}
