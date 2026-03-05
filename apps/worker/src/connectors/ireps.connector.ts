import { Injectable, Logger } from '@nestjs/common';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

/**
 * IREPS (Indian Railways eProcurement) Connector — STUB
 * TODO: Implement IREPS scraping (ireps.gov.in)
 */
@Injectable()
export class IrepsConnector implements IConnector {
  private readonly logger = new Logger(IrepsConnector.name);

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    this.logger.warn(`IREPS connector not yet implemented for ${site.name}`);
    return [];
  }

  async fetchDetail(url: string): Promise<string> {
    return '';
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    return null;
  }
}
