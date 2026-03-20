import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

@Injectable()
export class NprocureConnector implements IConnector {
  private readonly logger = new Logger(NprocureConnector.name);

  private readonly siteCookie = new Map<string, string>();

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  /**
   * Include keywords from Posterity target document
   */
  private readonly strongKeywords = [
    'manpower outsourcing', 'facility management', 'housekeeping', 'training',
    'mechanised cleaning', 'mechanized cleaning', 'skill development', 'skilling',
    'capacity building', 'vocational training', 'teachers', 'msme', 'ramp',
    'catering', 'sanitation', 'call centre', 'call center', 'education',
    'haulage', 'it projects', 'it services', 'consultancy', 'multimedia',
    'application development', 'agriculture', 'security services', 'professional services',
    'nursing', 'nurse', 'healthcare', 'staff deployment',
    'outsourcing', 'livelihoods', 'placement', 'software development',
    'portal development', 'smart classroom', 'lab setup', 'helpdesk',
    'handicrafts', 'textiles', 'tribal affairs', 'surveillance',
    'system integrator', 'project monitoring', 'hospital', 'operation and maintenance',
    'manpower', 'cleaning', 'staffing', 'human resource',
    'facility services', 'hr services',
  ];

  private readonly mediumKeywords = [
    'consulting', 'deployment', 'hiring', 'services', 'maintenance contract',
    'management', 'implementation', 'enhancement', 'development',
    'operation', 'monitoring', 'professional', 'web development',
  ];

  private readonly negativeKeywords = [
    'road construction', 'bridge construction', 'culvert', 'bituminous',
    'cc road', 'pcc road', 'earth filling', 'masonry', 'boundary wall',
    'drain construction', 'canal', 'embankment', 'footpath', 'park construction',
    'interlocking', 'building construction', 'civil work',
  ];

  private readonly targetLocations = [
    'uttar pradesh', 'jharkhand', 'delhi', 'madhya pradesh', 'chhattisgarh',
    'odisha', 'assam', 'rajasthan', 'punjab', 'himachal pradesh',
    'uttarakhand', 'gujarat', 'maharashtra', 'telangana', 'karnataka',
    'bihar', 'haryana', 'tamil nadu', 'sikkim',
    'greater noida', 'meerut', 'ghaziabad', 'noida', 'lucknow',
    'ahmedabad', 'gandhinagar', 'surat', 'vadodara', 'rajkot',
    'mumbai', 'pune', 'nagpur', 'nashik',
  ];

  /**
   * nProcure listing page paths to crawl.
   * nProcure hosts tenders from multiple states / PSUs, typically via
   * the NIC eProcure framework or their own portal.
   */
  private readonly listingPaths = [
    '/eprocure/app?page=FrontEndLatestActiveTenders&service=page',
    '/eprocure/app?page=FrontEndActiveOrganization&service=page',
  ];

  private siteKey(site: SourceSiteConfig): string {
    return site.key || site.id;
  }

  private buildHeaders(cookie?: string) {
    return {
      ...this.headers,
      ...(cookie ? { Cookie: cookie } : {}),
    };
  }

  private extractCookie(res: AxiosResponse, existing?: string): string {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie || !Array.isArray(setCookie) || setCookie.length === 0) return existing || '';
    const fresh = setCookie.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
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
    return `${base}/eprocure/app?service=restart`;
  }

  private async getWithSession(url: string, site: SourceSiteConfig): Promise<string> {
    const key = this.siteKey(site);
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
      this.logger.warn(`[nProcure] Stale session for ${site.name}, restarting`);
      const restartRes = await axios.get(this.restartUrl(site), {
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

  private cleanText(value?: string | null): string | undefined {
    if (!value) return undefined;
    const cleaned = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/^\s*[:\-–]+\s*/, '').trim();
    if (!cleaned) return undefined;
    const low = cleaned.toLowerCase();
    if (low.includes('function popup(') || low.includes('window.open(') || low.includes('<script')) return undefined;
    return cleaned;
  }

  private normalizeForMatch(text: string): string {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private scoreText(text: string): { score: number; matched: string[] } {
    const hay = this.normalizeForMatch(text);
    let score = 0;
    const matched: string[] = [];

    for (const kw of this.strongKeywords) {
      if (hay.includes(this.normalizeForMatch(kw))) {
        score += 4;
        matched.push(`strong:${kw}`);
      }
    }

    for (const kw of this.mediumKeywords) {
      if (hay.includes(this.normalizeForMatch(kw))) {
        score += 2;
        matched.push(`medium:${kw}`);
      }
    }

    for (const loc of this.targetLocations) {
      if (hay.includes(this.normalizeForMatch(loc))) {
        score += 3;
        matched.push(`loc:${loc}`);
      }
    }

    for (const neg of this.negativeKeywords) {
      if (hay.includes(this.normalizeForMatch(neg))) {
        score -= 5;
        matched.push(`neg:${neg}`);
      }
    }

    return { score, matched };
  }

  private parseDate(str?: string): Date | undefined {
    const cleaned = this.cleanText(str);
    if (!cleaned) return undefined;

    const m = cleaned.match(
      /^(\d{1,2})[-\/ ]([A-Za-z]{3}|\d{1,2})[-\/ ](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i,
    );

    if (m) {
      const day = Number(m[1]);
      const monthRaw = m[2];
      const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      const monthMap: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      let month = /^\d+$/.test(monthRaw) ? Number(monthRaw) - 1 : monthMap[monthRaw.toLowerCase().slice(0, 3)];
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

  private abs(href: string, site: SourceSiteConfig): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    try { return new URL(href, site.baseUrl).toString(); } catch { return ''; }
  }

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    const allUrls = new Set<string>();

    // Try each listing path
    for (const path of this.listingPaths) {
      try {
        const url = site.baseUrl.replace(/\/+$/, '') + path;
        this.logger.debug(`[nProcure] Fetching listing: ${url}`);

        const body = await this.getWithSession(url, site);
        if (this.isStaleSession(body)) {
          this.logger.warn(`[nProcure] Still stale for ${url}`);
          continue;
        }

        const $ = cheerio.load(body);
        $('script, style, noscript').remove();

        const addUrl = (raw?: string) => {
          if (!raw) return;
          const href = raw.trim();
          if (!href) return;
          try {
            const absolute = href.startsWith('http') ? href : new URL(href, site.baseUrl).toString();
            const low = absolute.toLowerCase();
            if (
              low.includes('directlink') ||
              low.includes('frontendtenderdetails') ||
              low.includes('tenderdetail') ||
              low.includes('tenderid=') ||
              low.includes('nitid=') ||
              low.includes('bidno=') ||
              low.includes('tenderstatus')
            ) {
              allUrls.add(absolute);
            }
          } catch {}
        };

        // Normal hrefs
        $('a').each((_, el) => addUrl($(el).attr('href')));

        // onclick-based links
        $('[onclick]').each((_, el) => {
          const onclick = ($(el).attr('onclick') || '').trim();
          const matches = [
            onclick.match(/window\.open\(['"]([^'"]+)['"]/i)?.[1],
            onclick.match(/open\(['"]([^'"]+)['"]/i)?.[1],
            onclick.match(/location\.href=['"]([^'"]+)['"]/i)?.[1],
          ].filter(Boolean) as string[];
          for (const m of matches) addUrl(m);
        });

        // Raw HTML regex fallback
        const rawMatches = body.match(/(?:href|window\.open|open)\s*[:=(]\s*['"]([^'"]+)['"]/gi) || [];
        for (const chunk of rawMatches) {
          const m = chunk.match(/['"]([^'"]+)['"]/);
          if (m?.[1]) addUrl(m[1]);
        }

        // Table row parsing (NIC GEP pattern)
        $('table#activeTenders tr, table.list_table tr, table.table_list tr').each((_, tr) => {
          const anchor = $(tr).find('a').first();
          const href = anchor.attr('href');
          if (href) addUrl(href);
        });

        this.logger.log(`[nProcure] Found ${allUrls.size} URLs from ${path}`);
      } catch (err: any) {
        this.logger.warn(`[nProcure] Failed listing ${path}: ${err.message}`);
      }
    }

    // Also try the main homepage
    try {
      const homeBody = await this.getWithSession(site.baseUrl, site);
      if (!this.isStaleSession(homeBody)) {
        const $ = cheerio.load(homeBody);
        $('a').each((_, el) => {
          const href = $(el).attr('href')?.trim();
          if (href) {
            const absolute = this.abs(href, site);
            const low = absolute.toLowerCase();
            if (low.includes('directlink') || low.includes('tenderdetail') || low.includes('tenderid=') || low.includes('nitid=')) {
              allUrls.add(absolute);
            }
          }
        });
      }
    } catch {}

    const out = Array.from(allUrls).slice(0, 150);
    this.logger.log(`[nProcure] Total ${out.length} unique tender URLs for ${site.name}`);
    return out;
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
        this.getField(fieldMap, ['Tender Title', 'Title', 'Work Description', 'Name of Work', 'Item/Category', 'Subject', 'NIT/RFP No']) ||
        this.cleanText($('h1, h2, h3').first().text());

      if (!title) {
        const pageTitle = this.cleanText($('title').text());
        if (pageTitle && !pageTitle.toLowerCase().includes('eprocurement') && !pageTitle.toLowerCase().includes('stale session')) {
          title = pageTitle;
        }
      }

      if (!title || title.length < 4) return null;

      const organization =
        this.getField(fieldMap, ['Organisation Chain', 'Organisation', 'Organization', 'Department', 'Ministry', 'Office']) || site.name;

      const location = this.getField(fieldMap, ['Location', 'Place of Work', 'Place', 'City', 'State']);
      const estimatedValue = this.getField(fieldMap, ['Tender Value', 'Estimated Cost', 'Contract Value', 'Value']);
      const summary = this.getField(fieldMap, ['Work Description', 'Brief Description', 'Description', 'Item Category', 'Name of Work', 'Scope']);

      const publishedAt = this.parseDate(
        this.getField(fieldMap, ['Published Date', 'Publish Date', 'Tender Publish Date', 'Start Date']),
      );

      const deadlineAt = this.parseDate(
        this.getField(fieldMap, ['Bid Submission End Date', 'Bid End Date/Time', 'Closing Date', 'Last Date', 'Submission End Date', 'End Date']),
      );

      const tenderIdStr = this.getField(fieldMap, ['Tender ID', 'Tender Reference Number', 'Tender Ref', 'NIT No', 'Reference No']);

      // Score for relevance
      const fullText = [title, organization, summary, location].filter(Boolean).join(' ');
      const { score, matched } = this.scoreText(fullText);

      if (score <= -5 && matched.filter(m => m.startsWith('strong:') || m.startsWith('loc:')).length === 0) {
        this.logger.debug(`[nProcure] Filtered: score=${score} title="${title.substring(0, 100)}"`);
        return null;
      }

      let status: 'OPEN' | 'CLOSED' | 'UNKNOWN' = 'UNKNOWN';
      if (deadlineAt) status = deadlineAt > new Date() ? 'OPEN' : 'CLOSED';

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
      this.logger.error(`[nProcure] Failed parse: ${url} - ${err.message}`);
      return null;
    }
  }

  private buildFieldMap($: cheerio.CheerioAPI): Map<string, string> {
    const map = new Map<string, string>();
    $('tr').each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length < 2) return;
      for (let i = 0; i < cells.length - 1; i++) {
        const rawLabel = this.cleanText($(cells[i]).text());
        const rawValue = this.cleanText($(cells[i + 1]).text());
        if (!rawLabel || !rawValue || rawLabel.length > 120) continue;
        const label = rawLabel.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!map.has(label)) map.set(label, rawValue);
      }
    });
    return map;
  }

  private getField(map: Map<string, string>, labels: string[]): string | undefined {
    for (const label of labels) {
      const wanted = label.toLowerCase();
      for (const [k, v] of map.entries()) {
        if (k === wanted || k.includes(wanted)) return v;
      }
    }
    return undefined;
  }
}