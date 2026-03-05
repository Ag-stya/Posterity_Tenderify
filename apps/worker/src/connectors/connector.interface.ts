import { NormalizedTender } from '@tenderwatch/shared';

export interface SourceSiteConfig {
  id: string;
  key: string;
  name: string;
  baseUrl: string;
  type: string;
  rateLimitPerMinute: number;
}

export interface IConnector {
  /** Returns list of tender detail page URLs */
  fetchListing(site: SourceSiteConfig): Promise<string[]>;

  /** Returns raw HTML/text of a detail page */
  fetchDetail(url: string): Promise<string>;

  /**
   * Optional site-aware detail fetch.
   * Needed for portals that require session/cookie continuity between listing and detail pages.
   */
  fetchDetailWithSite?(url: string, site: SourceSiteConfig): Promise<string>;

  /** Parses HTML into normalized tender, returns null if parse fails */
  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null;
}