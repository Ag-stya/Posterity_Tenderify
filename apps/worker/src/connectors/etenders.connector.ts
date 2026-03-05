import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

@Injectable()
export class EtendersConnector implements IConnector {
  private readonly logger = new Logger(EtendersConnector.name);

  private readonly siteCookie = new Map<string, string>();

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  private buildHeaders(cookie?: string) {
    return {
      ...this.headers,
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

  private restartUrl(site: SourceSiteConfig): string {
    const base = site.baseUrl.replace(/\/+$/, '');
    return base.includes('?') ? `${base}&service=restart` : `${base}?service=restart`;
  }

  private cleanText(value?: string | null): string | undefined {
    if (!value) return undefined;

    const cleaned = value
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[:\-–]+\s*/, '')
      .trim();

    if (!cleaned) return undefined;

    const low = cleaned.toLowerCase();

    // reject obvious garbage/script content
    if (
      low.includes('function popup(') ||
      low.includes('window.open(') ||
      low.includes('callprint(') ||
      low.includes('<script') ||
      low.includes('javascript:')
    ) {
      return undefined;
    }

    return cleaned;
  }

  private parseDate(str?: string): Date | undefined {
    const cleaned = this.cleanText(str);
    if (!cleaned) return undefined;

    // Handles: 05-Mar-2026 06:00 PM / 05-Mar-2026 / 05/03/2026 etc.
    const m = cleaned.match(
      /^(\d{1,2})[-\/ ]([A-Za-z]{3}|\d{1,2})[-\/ ](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i,
    );

    if (m) {
      const day = Number(m[1]);
      const monthRaw = m[2];
      const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);

      const monthMap: Record<string, number> = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };

      let month: number;
      if (/^\d+$/.test(monthRaw)) {
        month = Number(monthRaw) - 1;
      } else {
        month = monthMap[monthRaw.toLowerCase().slice(0, 3)];
      }

      let hours = m[4] ? Number(m[4]) : 0;
      const minutes = m[5] ? Number(m[5]) : 0;
      const ampm = m[6]?.toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      const d = new Date(year, month, day, hours, minutes, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }

    const fallback = new Date(cleaned);
    return isNaN(fallback.getTime()) ? undefined : fallback;
  }

  private buildFieldMap($: cheerio.CheerioAPI): Map<string, string> {
    const map = new Map<string, string>();

    $('script, style, noscript').remove();

    const rows = $('tr');
    rows.each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length < 2) return;

      for (let i = 0; i < cells.length - 1; i++) {
        const rawLabel = this.cleanText($(cells[i]).text());
        const rawValue = this.cleanText($(cells[i + 1]).text());

        if (!rawLabel || !rawValue) continue;
        if (rawLabel.length > 120) continue;

        const label = rawLabel.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!map.has(label)) {
          map.set(label, rawValue);
        }
      }
    });

    return map;
  }

  private getField(map: Map<string, string>, labels: string[]): string | undefined {
    for (const label of labels) {
      const wanted = label.toLowerCase();

      for (const [k, v] of map.entries()) {
        if (k === wanted || k.includes(wanted)) {
          return v;
        }
      }
    }
    return undefined;
  }

  private extractAbsoluteUrl(href: string, baseUrl: string): string {
    if (href.startsWith('http')) return href;
    return new URL(href, baseUrl).toString();
  }

  private async getWithSession(url: string, site: SourceSiteConfig): Promise<string> {
    const key = site.key || site.id;
    let cookie = this.siteCookie.get(key) || '';

    let res = await axios.get(url, {
      timeout: 30000,
      headers: this.buildHeaders(cookie),
      maxRedirects: 5,
      validateStatus: () => true,
    });

    cookie = this.extractCookie(res, cookie);
    this.siteCookie.set(key, cookie);

    let body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    if (this.isStaleSession(body)) {
      this.logger.warn(`[EtendersConnector] Stale session detected for ${site.name}`);
      const restart = this.restartUrl(site);
      this.logger.debug(`[EtendersConnector] Restarting session via: ${restart}`);

      const restartRes = await axios.get(restart, {
        timeout: 30000,
        headers: this.buildHeaders(cookie),
        maxRedirects: 5,
        validateStatus: () => true,
      });

      cookie = this.extractCookie(restartRes, cookie);
      this.siteCookie.set(key, cookie);

      res = await axios.get(url, {
        timeout: 30000,
        headers: this.buildHeaders(cookie),
        maxRedirects: 5,
        validateStatus: () => true,
      });

      cookie = this.extractCookie(res, cookie);
      this.siteCookie.set(key, cookie);

      body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }

    return body;
  }
  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    try {
      const homeUrl = site.baseUrl.replace(/\/+$/, '');
      this.logger.debug(`[EtendersConnector] Fetching homepage: ${homeUrl}`);

      const html = await this.getWithSession(homeUrl, site);
      this.logger.debug(`[EtendersConnector] Homepage len=${html.length}`);

      if (this.isStaleSession(html)) {
        this.logger.error(`[EtendersConnector] Still stale session after restart for ${site.name}`);
        return [];
      }

      const $ = cheerio.load(html);
      $('script, style, noscript').remove();

      const urls = new Set<string>();

      const addUrl = (raw?: string) => {
        if (!raw) return;
        const href = raw.trim();
        if (!href) return;

        try {
          const absolute = href.startsWith('http')
            ? href
            : new URL(href, homeUrl).toString();

          const low = absolute.toLowerCase();

          // broad match — because CPPP/NIC pages are inconsistent
          if (
            low.includes('directlink') ||
            low.includes('frontendtenderdetails') ||
            low.includes('tenderdetail') ||
            low.includes('tenderid=') ||
            low.includes('nitid=') ||
            low.includes('bidno=')
          ) {
            urls.add(absolute);
          }
        } catch {
          // ignore malformed links
        }
      };

      // 1) normal hrefs
      $('a').each((_, el) => {
        addUrl($(el).attr('href'));
      });

      // 2) onclick-based links
      $('[onclick]').each((_, el) => {
        const onclick = ($(el).attr('onclick') || '').trim();
        if (!onclick) return;

        const matches = [
          onclick.match(/window\.open\(['"]([^'"]+)['"]/i)?.[1],
          onclick.match(/open\(['"]([^'"]+)['"]/i)?.[1],
          onclick.match(/location\.href=['"]([^'"]+)['"]/i)?.[1],
          onclick.match(/document\.location=['"]([^'"]+)['"]/i)?.[1],
        ].filter(Boolean) as string[];

        for (const m of matches) addUrl(m);
      });

      // 3) raw html fallback
      const rawMatches = html.match(/(?:href|window\.open|open)\s*[:=(]\s*['"]([^'"]+)['"]/gi) || [];
      for (const chunk of rawMatches) {
        const m = chunk.match(/['"]([^'"]+)['"]/);
        if (m?.[1]) addUrl(m[1]);
      }

      const out = Array.from(urls).slice(0, 100);
      this.logger.log(`[EtendersConnector] Found ${out.length} tender URLs from ${site.name}`);
      return out;
    } catch (err: any) {
      this.logger.error(`[EtendersConnector] Failed to fetch listing for ${site.name}: ${err.message}`);
      return [];
    }
  }

  async fetchDetail(url: string): Promise<string> {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: this.headers,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }

  async fetchDetailWithSite(url: string, site: SourceSiteConfig): Promise<string> {
    return this.getWithSession(url, site);
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    if (!html) return null;
    if (this.isStaleSession(html)) return null;

    try {
      const $ = cheerio.load(html);
      $('script, style, noscript').remove();

      const fieldMap = this.buildFieldMap($);

      let title =
        this.getField(fieldMap, [
          'Tender Title',
          'Title',
          'Work Description',
          'Name of Work',
          'Item/Category',
          'Subject',
          'NIT/RFP No',
        ]) ||
        this.cleanText($('h1, h2, h3').first().text());

      if (!title) {
        const pageTitle = this.cleanText($('title').text());
        if (
          pageTitle &&
          !pageTitle.toLowerCase().includes('eprocurement system') &&
          !pageTitle.toLowerCase().includes('stale session')
        ) {
          title = pageTitle;
        }
      }

      if (!title || title.length < 4) return null;

      const organization =
        this.getField(fieldMap, [
          'Organisation Chain',
          'Organisation',
          'Organization',
          'Department',
          'Ministry',
          'Office',
        ]) || site.name;

      const location = this.getField(fieldMap, [
        'Location',
        'Place of Work',
        'Place',
        'City',
        'State',
      ]);

      const estimatedValue = this.getField(fieldMap, [
        'Tender Value',
        'Estimated Cost',
        'Contract Value',
        'Value',
      ]);

      const summary = this.getField(fieldMap, [
        'Work Description',
        'Brief Description',
        'Description',
        'Item Category',
        'Name of Work',
        'Scope',
      ]);

      const publishedStr = this.getField(fieldMap, [
        'Published Date',
        'Publish Date',
        'Tender Publish Date',
        'Bid Opening Date',
        'Start Date',
      ]);

      const deadlineStr = this.getField(fieldMap, [
        'Bid Submission End Date',
        'Bid End Date/Time',
        'Closing Date',
        'Last Date',
        'Submission End Date',
        'End Date',
      ]);

      const tenderIdStr = this.getField(fieldMap, [
        'Tender ID',
        'Tender Reference Number',
        'Tender Ref',
        'NIT No',
        'Reference No',
      ]);

      const publishedAt = this.parseDate(publishedStr);
      const deadlineAt = this.parseDate(deadlineStr);

      let status: 'OPEN' | 'CLOSED' | 'UNKNOWN' = 'UNKNOWN';
      if (deadlineAt) {
        status = deadlineAt > new Date() ? 'OPEN' : 'CLOSED';
      }

      return {
        sourceUrl: url,
        sourceTenderId: tenderIdStr || undefined,
        title: title.substring(0, 500),
        organization: organization?.substring(0, 500),
        summary: summary?.substring(0, 2000),
        location: location?.substring(0, 200),
        estimatedValue: estimatedValue?.substring(0, 200),
        publishedAt,
        deadlineAt,
        status,
      };
    } catch (err: any) {
      this.logger.error(`[EtendersConnector] Failed to parse detail: ${url} - ${err.message}`);
      return null;
    }
  }
}