import { v4 as uuid } from 'uuid';
import { Lead } from '@publication/shared';

export function createLead(
  pageId: string,
  brandId: string,
  name: string,
  email: string,
  phone?: string,
  message?: string,
  metadata: Record<string, any> = {},
): Lead {
  return {
    id: uuid(),
    pageId,
    brandId,
    name,
    email,
    phone,
    message,
    metadata,
    createdAt: new Date().toISOString(),
  };
}
