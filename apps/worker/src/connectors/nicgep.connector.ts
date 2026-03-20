import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

type NicGepRelevance = {
  score: number;
  positives: string[];
  negatives: string[];
};

type NicGepListingRow = {
  detailUrl: string;
  title?: string;
  referenceNo?: string;
  closingDateRaw?: string;
  bidOpeningDateRaw?: string;
  relevance?: NicGepRelevance;
};

@Injectable()
export class NicGepConnector implements IConnector {
  private readonly logger = new Logger(NicGepConnector.name);

  private readonly siteCookie = new Map<string, string>();
  private readonly listingCache = new Map<string, NicGepListingRow>();

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  /**
   * Positive signals aligned to current business targets.
   * Weighting is slightly stronger than before so useful tenders rise more clearly.
   */
  private readonly positiveOrgKeywords = [
    'health',
    'medical',
    'hospital',
    'oncology',
    'labour',
    'employment',
    'skill',
    'skilling',
    'training',
    'education',
    'women and child',
    'child development',
    'tribal',
    'social justice',
    'msme',
    'jal nigam',
    'rural development',
    'panchayati raj',
    'urban development',
    'ayushman',
    'ayushman arogya',
    'policlinics',
    'police housing',
    'flying institute',
    'aviation',
    'it department',
    'information technology',
    'consultancy',
    'project monitoring unit',
    'pmu',
    'nsdc',
    'livelihood',
    'rims',
    'noida',
    'greater noida',
    'ghaziabad',
    'up jal nigam',
    'jharkhand police housing corporation',
    'medical education',
    'public health',
  ];

  private readonly positiveWorkKeywords = [
    'manpower',
    'outsourcing',
    'staffing',
    'facility management',
    'facility services',
    'housekeeping',
    'cleaning',
    'sanitation',
    'mechanized cleaning',
    'training',
    'skill development',
    'skilling',
    'capacity building',
    'vocational',
    'teachers',
    'healthcare',
    'hospital manpower',
    'staff nurses',
    'nursing',
    'consultancy',
    'consulting',
    'project implementation',
    'project monitoring unit',
    'pmu',
    'it services',
    'software development',
    'web development',
    'portal development',
    'application development',
    'system integrator',
    'lab setup',
    'smart classroom',
    'helpdesk',
    'call centre',
    'contact center',
    'security services',
    'surveillance',
    'operation and maintenance',
    'o&m',
    'livelihood',
    'placement',
    'human resource',
    'hr services',
    'deployment',
    'hiring',
    'professional services',
    'training institute',
    'aircraft maintenance',
    'ame',
    'medical equipment',
    'water cooler',
    'integration or',
    'biomedical',
    'diagnostic',
    'teaching',
    'academic',
    'maintenance contract',
  ];

  /**
   * Stronger noise vocabulary for obvious low-fit civil works.
   */
  private readonly negativeKeywords = [
    'bituminous concrete',
    'bc work on the road',
    'road renewal',
    'renewal with general repair',
    'general repair',
    'cc road',
    'pcc road',
    'road construction',
    'link road',
    'minor bridge',
    'major bridge',
    'culvert',
    'box culvert',
    'drain',
    'boundary wall',
    'railing',
    'footpath',
    'park',
    'masonry',
    'earth filling',
    'desilting',
    'uprooting of jungle',
    'canal',
    'distributary',
    'embankment',
    'riding quality',
    'damaged puliya',
    'puliya',
    'slab',
    'interlocking',
    'repair of road',
    'widening and strengthening',
    'bt road',
    'civil work',
    'building work',
  ];

  private siteKey(site: SourceSiteConfig): string {
    return site.key || site.id;
  }

  private cacheKey(site: SourceSiteConfig, url: string): string {
    return `${this.siteKey(site)}::${url}`;
  }

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

  private cleanText(value?: string | null): string | undefined {
    if (!value) return undefined;

    const cleaned = value
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[:\-–]+\s*/, '')
      .trim();

    return cleaned || undefined;
  }

  private normalizeForMatch(value?: string | null): string {
    return (value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private uniquePush(arr: string[], value: string): void {
    if (!arr.includes(value)) arr.push(value);
  }

  private scoreText(text: string): NicGepRelevance {
    const hay = this.normalizeForMatch(text);
    const positives: string[] = [];
    const negatives: string[] = [];
    let score = 0;

    if (!hay) {
      return { score, positives, negatives };
    }

    for (const kw of this.positiveOrgKeywords) {
      const needle = this.normalizeForMatch(kw);
      if (needle && hay.includes(needle)) {
        this.uniquePush(positives, `org:${kw}`);
        score += 4;
      }
    }

    for (const kw of this.positiveWorkKeywords) {
      const needle = this.normalizeForMatch(kw);
      if (needle && hay.includes(needle)) {
        this.uniquePush(positives, `work:${kw}`);
        score += 3;
      }
    }

    for (const kw of this.negativeKeywords) {
      const needle = this.normalizeForMatch(kw);
      if (needle && hay.includes(needle)) {
        this.uniquePush(negatives, `noise:${kw}`);
        score -= 4;
      }
    }

    return { score, positives, negatives };
  }

  private combineRelevance(...parts: NicGepRelevance[]): NicGepRelevance {
    const positives = new Set<string>();
    const negatives = new Set<string>();
    let score = 0;

    for (const part of parts) {
      score += part.score;
      for (const p of part.positives) positives.add(p);
      for (const n of part.negatives) negatives.add(n);
    }

    return {
      score,
      positives: Array.from(positives),
      negatives: Array.from(negatives),
    };
  }

  private formatRelevancePrefix(relevance?: NicGepRelevance): string {
    if (!relevance) return '';

    const pos = relevance.positives.slice(0, 6).join(', ');
    const neg = relevance.negatives.slice(0, 4).join(', ');

    const parts = [`relevance_score=${relevance.score}`];
    if (pos) parts.push(`positive=[${pos}]`);
    if (neg) parts.push(`negative=[${neg}]`);

    return `[NIC_GEP ${parts.join(' | ')}]`;
  }

  private shouldFilterOut(relevance: NicGepRelevance): boolean {
    return relevance.score <= -6 && relevance.positives.length === 0;
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

  private isStaleSession(body: string): boolean {
    const low = body.toLowerCase();
    return low.includes('<title>stale session</title>') || low.includes('your session has timed out');
  }

  private restartUrl(site: SourceSiteConfig): string {
    const base = site.baseUrl.replace(/\/+$/, '');
    return base.includes('?') ? `${base}&service=restart` : `${base}?service=restart`;
  }

  private extractRestartUrl(body: string, site: SourceSiteConfig): string {
    const $ = cheerio.load(body);
    const href =
      $('#restart').attr('href') ||
      $('a[href*="service=restart"]').attr('href') ||
      '';

    return this.abs(href, site) || this.restartUrl(site);
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
      this.logger.warn(`[NicGepConnector] Stale session detected for ${site.name}`);

      const restart = this.extractRestartUrl(body, site);
      this.logger.debug(`[NicGepConnector] Restarting session via: ${restart}`);

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

  private clearListingCache(site: SourceSiteConfig): void {
    const prefix = `${this.siteKey(site)}::`;

    for (const key of Array.from(this.listingCache.keys())) {
      if (key.startsWith(prefix)) {
        this.listingCache.delete(key);
      }
    }
  }

  private putListingRow(site: SourceSiteConfig, row: NicGepListingRow): void {
    this.listingCache.set(this.cacheKey(site, row.detailUrl), row);
  }

  private getListingRow(site: SourceSiteConfig, url: string): NicGepListingRow | undefined {
    return this.listingCache.get(this.cacheKey(site, url));
  }

  private scoreListingRow(row: NicGepListingRow, site: SourceSiteConfig): NicGepRelevance {
    const text = [site.name, row.title, row.referenceNo].filter(Boolean).join(' | ');
    return this.scoreText(text);
  }

  private scoreParsedTender(args: {
    site: SourceSiteConfig;
    title?: string;
    organization?: string;
    summary?: string;
    location?: string;
    estimatedValue?: string;
    listing?: NicGepListingRow;
  }): NicGepRelevance {
    const titleScore = this.scoreText(args.title || '');
    const orgScore = this.scoreText(args.organization || '');
    const summaryScore = this.scoreText(args.summary || '');
    const locationScore = this.scoreText(args.location || '');
    const listingScore =
      args.listing?.relevance ||
      this.scoreListingRow(args.listing || { detailUrl: '' }, args.site);

    return this.combineRelevance(titleScore, orgScore, summaryScore, locationScore, listingScore);
  }

  private parseLatestTenderRows(body: string, site: SourceSiteConfig): NicGepListingRow[] {
    const $ = cheerio.load(body);
    const rows: NicGepListingRow[] = [];

    $('table#activeTenders tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 4) return;

      const anchor = $(cells[0]).find('a').first();
      const href = (anchor.attr('href') || '').trim();
      const detailUrl = this.abs(href, site);

      const title = this.cleanText(anchor.text());
      const referenceNo = this.cleanText($(cells[1]).text());
      const closingDateRaw = this.cleanText($(cells[2]).text());
      const bidOpeningDateRaw = this.cleanText($(cells[3]).text());

      if (!detailUrl || !title) return;

      const row: NicGepListingRow = {
        detailUrl,
        title,
        referenceNo,
        closingDateRaw,
        bidOpeningDateRaw,
      };

      row.relevance = this.scoreListingRow(row, site);
      rows.push(row);
    });

    return rows;
  }

  private buildFieldMap($: cheerio.CheerioAPI): Map<string, string> {
    const map = new Map<string, string>();

    $('script, style, noscript').remove();

    $('tr').each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length < 2) return;

      for (let i = 0; i < cells.length - 1; i++) {
        const rawLabel = this.cleanText($(cells[i]).text());
        const rawValue = this.cleanText($(cells[i + 1]).text());

        if (!rawLabel || !rawValue) continue;
        if (rawLabel.length > 150) continue;

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

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    try {
      const homepageUrl = site.baseUrl.replace(/\/+$/, '');
      this.logger.debug(`[NicGepConnector] Fetching homepage: ${homepageUrl}`);

      const body = await this.getWithSession(homepageUrl, site);

      this.logger.debug(
        `[NicGepConnector] Homepage response len=${body.length} for ${site.name}`,
      );

      if (this.isStaleSession(body)) {
        this.logger.error(
          `[NicGepConnector] Still getting stale session page for ${site.name} after restart`,
        );
        return [];
      }

      const rows = this.parseLatestTenderRows(body, site);
      this.clearListingCache(site);

      for (const row of rows) {
        this.putListingRow(site, row);
      }

      const out = rows.map((r) => r.detailUrl);

      this.logger.log(
        `[NicGepConnector] Parsed ${rows.length} homepage tender rows for ${site.name}`,
      );

      if (rows.length) {
        const sample = rows
          .slice(0, 3)
          .map(
            (r) =>
              `score=${r.relevance?.score ?? 0} | ${r.referenceNo || 'n/a'} | ${r.title || 'n/a'}`,
          )
          .join(' || ');

        this.logger.debug(`[NicGepConnector] Sample rows for ${site.name}: ${sample}`);
      }

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
        headers: this.headers,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (err: any) {
      this.logger.error(`[NicGepConnector] Failed detail fetch for ${url}: ${err.message}`);
      return '';
    }
  }

  async fetchDetailWithSite(url: string, site: SourceSiteConfig): Promise<string> {
    try {
      return await this.getWithSession(url, site);
    } catch (err: any) {
      this.logger.error(
        `[NicGepConnector] Failed session-aware detail fetch for ${url}: ${err.message}`,
      );
      return '';
    }
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    if (!html) return null;
    if (this.isStaleSession(html)) return null;

    try {
      const $ = cheerio.load(html);
      $('script, style, noscript').remove();

      const listing = this.getListingRow(site, url);
      const fieldMap = this.buildFieldMap($);

      const title =
        this.getField(fieldMap, [
          'Title',
          'Tender Title',
          'Work Description',
          'Name of Work',
          'Subject',
        ]) ||
        listing?.title ||
        this.cleanText($('h1, h2, h3').first().text());

      if (!title || title.length < 4) return null;

      const organization =
        this.getField(fieldMap, [
          'Organisation Chain',
          'Organisation',
          'Organization',
          'Department',
          'Office',
          'Ministry',
        ]) || site.name;

      const sourceTenderId =
        this.getField(fieldMap, ['Tender ID']) ||
        this.getField(fieldMap, [
          'Tender Reference Number',
          'Reference No',
          'Tender Ref',
          'NIT No',
        ]) ||
        listing?.referenceNo;

      let summary =
        this.getField(fieldMap, [
          'Work Description',
          'Brief Description',
          'Description',
          'Scope',
          'Item Category',
        ]) || listing?.title;

      const location = this.getField(fieldMap, [
        'Location',
        'Location of Work',
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

      const publishedAt = this.parseDate(
        this.getField(fieldMap, [
          'Published Date',
          'Publish Date',
          'Tender Publish Date',
          'NIT Date',
        ]),
      );

      const deadlineAt =
        this.parseDate(
          this.getField(fieldMap, [
            'Bid Submission End Date',
            'Closing Date',
            'Bid End Date/Time',
            'Submission End Date',
            'End Date',
            'Last Date',
          ]),
        ) || this.parseDate(listing?.closingDateRaw);

      const relevance = this.scoreParsedTender({
        site,
        title,
        organization,
        summary,
        location,
        estimatedValue,
        listing,
      });

      if (this.shouldFilterOut(relevance)) {
        this.logger.debug(
          `[NicGepConnector] Filtered out for ${site.name}: score=${relevance.score} | title="${title.substring(
            0,
            160,
          )}" | negatives=${relevance.negatives.slice(0, 4).join(', ')}`,
        );
        return null;
      }

      const relevancePrefix = this.formatRelevancePrefix(relevance);
      summary = [relevancePrefix, summary].filter(Boolean).join('\n');

      if (relevance.score >= 4 || relevance.positives.length > 0 || relevance.negatives.length > 0) {
        this.logger.debug(
          `[NicGepConnector] Relevance for ${site.name}: score=${relevance.score} | title="${title.substring(
            0,
            160,
          )}" | positives=${relevance.positives.slice(0, 6).join(', ')} | negatives=${relevance.negatives
            .slice(0, 4)
            .join(', ')}`,
        );
      }

      const sourceUrl = url.startsWith('http') ? url : new URL(url, site.baseUrl).toString();

      let status: 'OPEN' | 'CLOSED' | 'UNKNOWN' = 'UNKNOWN';
      if (deadlineAt) {
        status = deadlineAt > new Date() ? 'OPEN' : 'CLOSED';
      }

      return {
        sourceUrl,
        sourceTenderId: sourceTenderId || undefined,
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
      this.logger.error(`[NicGepConnector] Failed to parse detail: ${url} - ${err.message}`);
      return null;
    }
  }
}