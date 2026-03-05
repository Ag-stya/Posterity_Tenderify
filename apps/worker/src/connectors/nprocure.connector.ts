import { Injectable, Logger } from '@nestjs/common';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

/**
 * nProcure Connector — STUB
 * TODO: Implement Gujarat nProcure scraping (nprocure.com)
 */
@Injectable()
export class NprocureConnector implements IConnector {
  private readonly logger = new Logger(NprocureConnector.name);

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    this.logger.warn(`nProcure connector not yet implemented for ${site.name}`);
    return [];
  }

  async fetchDetail(url: string): Promise<string> {
    return '';
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    return null;
  }
}
