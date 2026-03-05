import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

@Injectable()
export class NicGepConnector implements IConnector {
  private readonly logger = new Logger(NicGepConnector.name);

  private abs(href: string, site: SourceSiteConfig): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    try {
      return new URL(href, site.baseUrl).toString();
    } catch {
      return '';
    }
  }

  private buildHeaders(cookie?: string) {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...(cookie ? { Cookie: cookie } : {}),
    };
  }

  private extractCookie(res: AxiosResponse, existing?: string): string {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie || !Array.isArray(setCookie) || setCookie.length === 0) {
      return existing || '';
    }

    const fresh = setCookie
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    if (!existing) return fresh;
    if (!fresh) return existing;

    return `${existing}; ${fresh}`;
  }

  private isStaleSession(body: string): boolean {
    const low = body.toLowerCase();
    return low.includes('<title>stale session</title>') || low.includes('your session has timed out');
  }

  private extractRestartUrl(body: string, site: SourceSiteConfig): string {
    const $ = cheerio.load(body);
    const href = $('#restart').attr('href') || $('a[href*="service=restart"]').attr('href') || '';
    return this.abs(href, site);
  }

  private extractTenderUrlsFromBody(body: string, site: SourceSiteConfig): string[] {
    const urls = new Set<string>();

    const looksLikeTender = (u: string) => {
      const low = u.toLowerCase();
      return (
        low.includes('frontendtenderdetails') ||
        low.includes('tenderdetail') ||
        low.includes('tenderid=') ||
        low.includes('bidno=') ||
        low.includes('nitid=') ||
        low.includes('tnd_id=') ||
        low.includes('tenderno=')
      );
    };

    const absMatches = body.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const u of absMatches) {
      if (looksLikeTender(u)) urls.add(u);
    }

    const relMatches = body.match(/\/?nicgep\/app\?[^\s"'<>]+/gi) || [];
    for (const rel of relMatches) {
      const absolute = this.abs(rel.startsWith('/') ? rel : '/' + rel, site);
      if (absolute && looksLikeTender(absolute)) urls.add(absolute);
    }

    const $ = cheerio.load(body);
    $('a').each((_, el) => {
      const href = (($(el).attr('href') || '') as string).trim();
      const onclick = (($(el).attr('onclick') || '') as string).trim();

      const candidates: string[] = [];
      if (href) candidates.push(href);

      if (onclick) {
        const m1 = onclick.match(/window\.open\(['"]([^'"]+)['"]/i);
        if (m1?.[1]) candidates.push(m1[1]);

        const m2 = onclick.match(/open\(['"]([^'"]+)['"]/i);
        if (m2?.[1]) candidates.push(m2[1]);
      }

      for (const c of candidates) {
        const absolute = this.abs(c, site);
        if (absolute && looksLikeTender(absolute)) urls.add(absolute);
      }
    });

    return Array.from(urls).slice(0, 100);
  }

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    try {
      const listingUrl =
        `${site.baseUrl.replace(/\/+$/, '')}` +
        `?component=clear&page=FrontEndLatestActiveTenders&service=direct&session=T`;

      this.logger.debug(`[NicGepConnector] Fetching listing: ${listingUrl}`);

      let cookie = '';

      let res = await axios.get(listingUrl, {
        timeout: 30000,
        headers: this.buildHeaders(),
        maxRedirects: 5,
        validateStatus: () => true,
      });

      cookie = this.extractCookie(res, cookie);

      let body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

      this.logger.debug(
        `[NicGepConnector] Listing response: status=${res.status} len=${body.length}`
      );
      this.logger.debug(
        `[NicGepConnector] Listing body preview for ${site.name}: ${body.slice(0, 3000)}`
      );

      if (this.isStaleSession(body)) {
        const restartUrl = this.extractRestartUrl(body, site);
        this.logger.warn(`[NicGepConnector] Stale session detected for ${site.name}`);

        if (restartUrl) {
          this.logger.debug(`[NicGepConnector] Restarting session via: ${restartUrl}`);

          const restartRes = await axios.get(restartUrl, {
            timeout: 30000,
            headers: this.buildHeaders(cookie),
            maxRedirects: 5,
            validateStatus: () => true,
          });

          cookie = this.extractCookie(restartRes, cookie);

          const afterRestartBody =
            typeof restartRes.data === 'string' ? restartRes.data : JSON.stringify(restartRes.data);

          this.logger.debug(
            `[NicGepConnector] Restart response: status=${restartRes.status} len=${afterRestartBody.length}`
          );

          res = await axios.get(listingUrl, {
            timeout: 30000,
            headers: this.buildHeaders(cookie),
            maxRedirects: 5,
            validateStatus: () => true,
          });

          cookie = this.extractCookie(res, cookie);
          body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

          this.logger.debug(
            `[NicGepConnector] Listing retry response: status=${res.status} len=${body.length}`
          );
          this.logger.debug(
            `[NicGepConnector] Listing retry body preview for ${site.name}: ${body.slice(0, 3000)}`
          );
        }
      }

      if (this.isStaleSession(body)) {
        this.logger.error(
          `[NicGepConnector] Still getting stale session page for ${site.name} after restart`
        );
        return [];
      }

      const out = this.extractTenderUrlsFromBody(body, site);
      this.logger.log(`[NicGepConnector] Found ${out.length} tender URLs for ${site.name}`);
      return out;
    } catch (err: any) {
      this.logger.error(`[NicGepConnector] Failed listing for ${site.name}: ${err.message}`);
      return [];
    }
  }

  async fetchDetail(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
        validateStatus: () => true,
      });

      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (err: any) {
      this.logger.error(`Failed to fetch detail: ${url} - ${err.message}`);
      return '';
    }
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    if (!html) return null;

    try {
      const $ = cheerio.load(html);

      const getText = (labels: string[]): string | undefined => {
        for (const label of labels) {
          const td = $(`td:contains("${label}")`).next('td');
          if (td.length && td.text().trim()) return td.text().trim();
        }
        return undefined;
      };

      const title =
        getText(['Tender Title', 'Work Description', 'Title', 'Subject']) ||
        $('h2, h3, .tender-title').first().text().trim() ||
        $('title').text().trim();

      if (!title || title.length < 5) return null;

      const organization = getText(['Organisation', 'Organization', 'Department', 'Office']);
      const location = getText(['Location', 'City', 'State', 'Place']);
      const estimatedValue = getText(['Tender Value', 'Estimated Cost', 'Value']);
      const summary = getText(['Brief Description', 'Description', 'Summary']);

      const publishedStr = getText(['Published Date', 'Publish Date', 'NIT Date']);
      const deadlineStr = getText([
        'Closing Date',
        'Bid Closing',
        'Due Date',
        'End Date',
        'Last Date',
      ]);

      const parseDate = (str?: string): Date | undefined => {
        if (!str) return undefined;
        const d = new Date(str);
        return isNaN(d.getTime()) ? undefined : d;
      };

      const sourceUrl = url.startsWith('http') ? url : new URL(url, site.baseUrl).toString();

      const deadline = parseDate(deadlineStr);
      let status: 'OPEN' | 'CLOSED' | 'UNKNOWN' = 'UNKNOWN';
      if (deadline) status = deadline > new Date() ? 'OPEN' : 'CLOSED';

      return {
        sourceUrl,
        sourceTenderId: undefined,
        title,
        organization,
        summary,
        location,
        estimatedValue,
        publishedAt: parseDate(publishedStr),
        deadlineAt: deadline,
        status,
      };
    } catch (err: any) {
      this.logger.error(`Failed to parse detail: ${url} - ${err.message}`);
      return null;
    }
  }
}