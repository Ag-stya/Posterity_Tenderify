import { Injectable, Logger } from '@nestjs/common';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

/**
 * CPPP (Central Public Procurement Portal) Connector — STUB
 *
 * TODO: Implement actual CPPP scraping.
 * CPPP (eprocure.gov.in) uses a complex Java-based web app with CAPTCHA.
 * May need headless browser (Puppeteer) for full support.
 *
 * For now, returns empty results. Enable only when implemented.
 */
@Injectable()
export class CpppConnector implements IConnector {
  private readonly logger = new Logger(CpppConnector.name);

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    this.logger.warn(`CPPP connector not yet implemented for ${site.name}`);
    return [];
  }

  async fetchDetail(url: string): Promise<string> {
    return '';
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    return null;
  }
}
