import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

type ListingMeta = {
  id?: string;
  title: string;
  summary?: string;
  country?: string;
  publishedAt?: Date | null;
  estimatedValue?: string | null;
  organization?: string | null;
  detailUrl?: string | null;
  raw?: Record<string, any>;
};

@Injectable()
export class TendersOnTimeConnector implements IConnector {
  private readonly logger = new Logger(TendersOnTimeConnector.name);

  private readonly http: AxiosInstance = axios.create({
    timeout: parseInt(process.env.TENDERS_ON_TIME_REQUEST_TIMEOUT_MS || '30000', 10),
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  private readonly cookieHeaderBySiteId = new Map<string, string>();
  private readonly listingMetaBySiteId = new Map<string, Map<string, ListingMeta>>();
  private detailFetchCount = 0;
  private readonly RE_AUTH_EVERY = 8; // Re-authenticate proactively every N detail fetches

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    const email = process.env.TENDERS_ON_TIME_EMAIL;
    const password = process.env.TENDERS_ON_TIME_PASSWORD;

    if (!email || !password) {
      throw new Error('Missing TENDERS_ON_TIME_EMAIL or TENDERS_ON_TIME_PASSWORD');
    }

    const keywords = this.getKeywords();
    const perPage = parseInt(process.env.TENDERS_ON_TIME_PER_PAGE || '10', 10);
    const maxPages = parseInt(process.env.TENDERS_ON_TIME_MAX_PAGES_PER_KEYWORD || '3', 10);

    this.listingMetaBySiteId.set(site.id, new Map<string, ListingMeta>());
    this.detailFetchCount = 0;

    await this.login(site);

    const uniqueUrls = new Set<string>();

    for (const keyword of keywords) {
      try {
        await this.prepareSearchContext(site, keyword);
      } catch (err: any) {
        this.logger.warn(`Search context init failed for keyword "${keyword}": ${err.message}`);
      }

      for (let page = 1; page <= maxPages; page++) {
        try {
          const items = await this.searchKeywordPage(site, keyword, page, perPage);

          if (!items.length) break;

          for (const item of items) {
            const detailUrl = this.buildDetailUrl(site, item);
            if (!detailUrl) continue;

            uniqueUrls.add(detailUrl);

            const siteMeta = this.listingMetaBySiteId.get(site.id);
            siteMeta?.set(detailUrl, { ...item, detailUrl });
          }

          if (items.length < perPage) break;

          // Small delay between pages
          await this.delay(1000);
        } catch (err: any) {
          this.logger.warn(`Search page failed for "${keyword}" page ${page}: ${err.message}`);
          break;
        }
      }

      // Delay between keywords to avoid rate limiting
      await this.delay(2000);
    }

    const urls = Array.from(uniqueUrls);
    this.logger.log(`TendersOnTime listing complete: ${urls.length} detail URLs`);
    return urls;
  }

  async fetchDetail(url: string): Promise<string> {
    throw new Error('TendersOnTime requires fetchDetailWithSite() so authenticated session is preserved');
  }

  async fetchDetailWithSite(url: string, site: SourceSiteConfig): Promise<string> {
    this.detailFetchCount++;

    // Proactively re-authenticate every N requests to prevent session expiry
    if (this.detailFetchCount % this.RE_AUTH_EVERY === 0) {
      this.logger.debug(`[TendersOnTime] Proactive re-auth after ${this.detailFetchCount} detail fetches`);
      try {
        await this.login(site);
      } catch (err: any) {
        this.logger.warn(`[TendersOnTime] Proactive re-auth failed: ${err.message}`);
      }
    }

    // Add delay between detail fetches to avoid rate limiting
    await this.delay(1500);

    await this.ensureSession(site);
    let html = await this.getHtml(site, url);

    if (this.looksLikeLoginPage(html) || this.looksLikeGarbage(html)) {
      this.logger.warn(`Session expired for detail, re-authenticating: ${url}`);
      await this.delay(2000);
      await this.login(site);
      html = await this.getHtml(site, url);

      // If still garbage after re-auth, return empty to skip this tender
      if (this.looksLikeLoginPage(html) || this.looksLikeGarbage(html)) {
        this.logger.warn(`Still getting garbage after re-auth, skipping: ${url}`);
        return '';
      }
    }

    return html;
  }

  parseDetail(html: string, url: string, site: SourceSiteConfig): NormalizedTender | null {
    if (!html || html.length < 100) return null;

    // Reject garbage pages
    if (this.looksLikeLoginPage(html) || this.looksLikeGarbage(html)) {
      this.logger.debug(`[TendersOnTime] Rejected garbage page: ${url}`);
      return null;
    }

    const $ = cheerio.load(html);

    // Additional garbage checks after parsing
    const bodyText = this.cleanText($('body').text());
    if (!bodyText || bodyText.length < 50) return null;

    // Reject if page is mostly CSS/JS
    const scriptStyleLen = $('script, style, noscript').text().length;
    const totalLen = $('body').text().length;
    if (totalLen > 0 && scriptStyleLen / totalLen > 0.7) {
      this.logger.debug(`[TendersOnTime] Rejected page with >70% script/style: ${url}`);
      return null;
    }

    const siteMeta = this.listingMetaBySiteId.get(site.id)?.get(url);

    // Remove script/style before extracting content
    $('script, style, noscript').remove();

    const title =
      this.firstNonEmpty([
        this.cleanText($('h1').first().text()),
        this.cleanText($('h2').first().text()),
        siteMeta?.title,
      ]) || '';

    if (!title || title.length < 10) return null;

    // Reject titles that look like page chrome
    const titleLow = title.toLowerCase();
    if (
      titleLow.includes('sign in') || titleLow.includes('login') ||
      titleLow.includes('register') || titleLow.includes('forgot password') ||
      titleLow.includes('sample message') || titleLow.includes('tenders by')
    ) {
      return null;
    }

    const cleanBodyText = this.cleanText($('body').text());

    const introParagraph =
      this.firstNonEmpty([
        this.findParagraphContaining($, 'has issued'),
        this.findParagraphContaining($, 'Tender notice'),
        '',
      ]) || '';

    const organization =
      this.firstNonEmpty([
        this.extractOrganizationFromIntro(introParagraph),
        siteMeta?.organization || '',
      ]) || null;

    const country =
      this.firstNonEmpty([
        this.extractLabeledValue(cleanBodyText, ['Country'], [
          'Summary', 'Deadline', 'Posting Date', 'Notice Type',
          'TOT Ref.No', 'TOT Ref. No.', 'Document Ref. No.', 'Document Ref No.',
          'Financier', 'Purchaser Ownership', 'Tender Value', "Purchaser's Detail",
        ]),
        siteMeta?.country || '',
      ]) || null;

    const summary =
      this.firstNonEmpty([
        this.extractLabeledValue(cleanBodyText, ['Summary'], [
          'Deadline', 'Posting Date', 'Notice Type',
          'TOT Ref.No', 'TOT Ref. No.', 'Document Ref. No.', 'Document Ref No.',
          'Financier', 'Purchaser Ownership', 'Tender Value', "Purchaser's Detail",
        ]),
        siteMeta?.summary || '',
        introParagraph,
        title,
      ]) || null;

    const deadlineRaw =
      this.extractLabeledValue(cleanBodyText, ['Deadline'], [
        'Posting Date', 'Notice Type', 'TOT Ref.No', 'TOT Ref. No.',
        'Document Ref. No.', 'Document Ref No.', 'Financier',
        'Purchaser Ownership', 'Tender Value', "Purchaser's Detail",
      ]) || '';

    const postedRaw =
      this.extractLabeledValue(cleanBodyText, ['Posting Date'], [
        'Notice Type', 'TOT Ref.No', 'TOT Ref. No.',
        'Document Ref. No.', 'Document Ref No.', 'Financier',
        'Purchaser Ownership', 'Tender Value', "Purchaser's Detail",
      ]) || '';

    const tenderValue =
      this.firstNonEmpty([
        this.extractLabeledValue(cleanBodyText, ['Tender Value'], ["Purchaser's Detail"]),
        siteMeta?.estimatedValue || '',
      ]) || null;

    const totRefNo =
      this.firstNonEmpty([
        this.extractLabeledValue(cleanBodyText, ['TOT Ref.No', 'TOT Ref. No.'], [
          'Document Ref. No.', 'Document Ref No.', 'Financier',
          'Purchaser Ownership', 'Tender Value', "Purchaser's Detail",
        ]),
        siteMeta?.id || '',
      ]) || null;

    const publishedAt = this.parseDate(postedRaw) || siteMeta?.publishedAt || null;
    const deadlineAt = this.parseDate(deadlineRaw) || null;

    return {
      sourceUrl: url,
      sourceTenderId: totRefNo || undefined,
      title,
      organization: organization || undefined,
      summary: summary || undefined,
      location: country || undefined,
      estimatedValue: tenderValue || undefined,
      publishedAt: publishedAt || undefined,
      deadlineAt: deadlineAt || undefined,
      status: 'OPEN' as any,
    };
  }

  // ─── Session management ────────────────────────────────────

  private async login(site: SourceSiteConfig): Promise<void> {
    const email = process.env.TENDERS_ON_TIME_EMAIL!;
    const password = process.env.TENDERS_ON_TIME_PASSWORD!;

    // First get the homepage to establish initial cookies
    const homeRes = await this.http.get(site.baseUrl, {
      headers: {
        Accept: 'text/html',
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });
    this.captureCookies(site.id, homeRes.headers['set-cookie']);

    await this.delay(500);

    const form = new URLSearchParams({ username: email, password });

    const response = await this.http.post(`${site.baseUrl}/tenders/login`, form.toString(), {
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: site.baseUrl,
        Referer: `${site.baseUrl}/`,
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });

    this.captureCookies(site.id, response.headers['set-cookie']);

    const cookieHeader = this.cookieHeaderBySiteId.get(site.id) || '';
    if (!cookieHeader.includes('ci_session=')) {
      this.logger.error(`TendersOnTime login failed: no ci_session cookie. Status: ${response.status}`);
      throw new Error('TendersOnTime login failed: ci_session cookie not found');
    }

    this.logger.log(`[TendersOnTime] Login successful`);
  }

  private async ensureSession(site: SourceSiteConfig): Promise<void> {
    const cookieHeader = this.cookieHeaderBySiteId.get(site.id) || '';
    if (!cookieHeader.includes('ci_session=')) {
      await this.login(site);
    }
  }

  private async prepareSearchContext(site: SourceSiteConfig, keyword: string): Promise<void> {
    await this.ensureSession(site);

    const encoded = encodeURIComponent(keyword);
    const searchPageUrl = `${site.baseUrl}/tenders/advanceSearch?q=${encoded}/`;

    const pageResponse = await this.http.get(searchPageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${site.baseUrl}/`,
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });
    this.captureCookies(site.id, pageResponse.headers['set-cookie']);

    await this.delay(500);

    const bootstrapResponse = await this.http.post(`${site.baseUrl}/ApiTenders/getsearchdata`, '', {
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: site.baseUrl,
        Referer: searchPageUrl,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });
    this.captureCookies(site.id, bootstrapResponse.headers['set-cookie']);
  }

  private async searchKeywordPage(
    site: SourceSiteConfig,
    keyword: string,
    page: number,
    perPage: number,
  ): Promise<ListingMeta[]> {
    await this.ensureSession(site);

    const encoded = encodeURIComponent(keyword);
    const referer = `${site.baseUrl}/tenders/advanceSearch?q=${encoded}/`;

    const form = new URLSearchParams({
      searchType: '1',
      mainsearch: '',
      tendersaction: 'FilterTenders',
      totno: '',
      docrefno: '',
      region: '',
      state: '',
      city: '',
      status: '1',
      purchasername: '',
      competition: '',
      keyword,
      tender_value_cond: 'more_than',
      tender_value: '',
      blankCost: 'false',
      exactkeyword: 'false',
      postingfrom: '',
      postingto: '',
      deadlinefrom: '',
      deadlineto: '',
      startpage: String(page),
      per_page: String(perPage),
      order_by: 'Posting_Date DESC',
    });

    const response = await this.http.post(`${site.baseUrl}/ApiTenders/getfilterTender`, form.toString(), {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: site.baseUrl,
        Referer: referer,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });

    this.captureCookies(site.id, response.headers['set-cookie']);
    return this.parseSearchResponse(response.data);
  }

  // ─── Response parsing ──────────────────────────────────────

  private parseSearchResponse(raw: unknown): ListingMeta[] {
    const payload = this.coercePayload(raw);

    if (payload && Array.isArray(payload.searchdata)) {
      return payload.searchdata
        .map((item: any) => this.mapSearchItem(item))
        .filter((item: ListingMeta | null): item is ListingMeta => Boolean(item));
    }

    if (typeof raw === 'string') {
      return this.parseHtmlSearchResponse(raw);
    }

    return [];
  }

  private mapSearchItem(item: Record<string, any>): ListingMeta | null {
    const id = this.firstNonEmpty([
      this.cleanText(String(item.id || '')),
      this.cleanText(String(item.TOT_Ref_No || '')),
      this.cleanText(String(item.totno || '')),
    ]);

    const title = this.firstNonEmpty([
      this.htmlToText(String(item.Tender_Summery || '')),
      this.htmlToText(String(item.title || '')),
      this.htmlToText(String(item.Summary || '')),
    ]);

    if (!title) return null;

    const country = this.firstNonEmpty([
      this.cleanText(String(item.Country_Name_Known || '')),
      this.cleanText(String(item.country || '')),
      this.cleanText(String(item.Country_Name || '')),
    ]);

    const publishedAt = this.parseDate(String(item.Posting_Date || ''));

    const estimatedValue = this.firstNonEmpty([
      this.cleanText(String(item.Tender_Value || '')),
      this.cleanText(String(item.tender_value || '')),
    ]);

    const organization = this.firstNonEmpty([
      this.cleanText(String(item.Purchaser_Name || '')),
      this.cleanText(String(item.purchasername || '')),
      this.cleanText(String(item.Organization || '')),
      this.cleanText(String(item.Department || '')),
    ]);

    const detailUrl = this.firstNonEmpty([
      this.cleanText(String(item.detlink || '')),
      this.cleanText(String(item.detailUrl || '')),
      this.cleanText(String(item.url || '')),
      this.cleanText(String(item.detail_url || '')),
      this.cleanText(String(item.link || '')),
    ]);

    return {
      id: id || undefined,
      title,
      summary: title,
      country: country || undefined,
      publishedAt: publishedAt || undefined,
      estimatedValue: estimatedValue || undefined,
      organization: organization || undefined,
      detailUrl: detailUrl || undefined,
      raw: item,
    };
  }

  private parseHtmlSearchResponse(html: string): ListingMeta[] {
    const $ = cheerio.load(html);
    const results: ListingMeta[] = [];

    $('a[href*="/details/"], a[href*="/tenders-details/"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = this.cleanText($(el).text());
      if (!href || !text) return;

      const cardText = this.cleanText($(el).closest('div, article, li').text());
      const idMatch = cardText.match(/TOT\s*Reference\s*No\.?\s*:?\s*(\d+)/i);
      const countryMatch = cardText.match(/\b(India|Poland|Russia|USA|Uzbekistan|Morocco)\b/i);

      results.push({
        id: idMatch?.[1],
        title: text,
        summary: text,
        country: countryMatch?.[1],
        publishedAt: undefined,
        estimatedValue: undefined,
        detailUrl: href,
      });
    });

    return results;
  }

  // ─── URL building ──────────────────────────────────────────

  private buildDetailUrl(site: SourceSiteConfig, meta: ListingMeta): string | null {
    if (meta.detailUrl) {
      return new URL(meta.detailUrl, site.baseUrl).toString();
    }

    if (!meta.id || !meta.title) return null;

    const slug = this.slugify(meta.title);
    const hexId = this.toHexId(meta.id);
    if (!slug || !hexId) return null;

    const isIndia = (meta.country || '').trim().toLowerCase() === 'india';
    const path = isIndia ? '/india/details/' : '/tenders-details/';
    return `${site.baseUrl}${path}${slug}-${hexId}/`;
  }

  // ─── HTTP helpers ──────────────────────────────────────────

  private async getHtml(site: SourceSiteConfig, url: string): Promise<string> {
    const response = await this.http.get(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: site.baseUrl,
        Cookie: this.cookieHeaderBySiteId.get(site.id) || '',
      },
    });

    this.captureCookies(site.id, response.headers['set-cookie']);
    return typeof response.data === 'string' ? response.data : String(response.data || '');
  }

  private looksLikeLoginPage(html: string): boolean {
    const text = html.toLowerCase();
    return (text.includes('forgot password') && text.includes('email address')) ||
           (text.includes('sign in with google') && text.includes('register'));
  }

  /**
   * Detect garbage/CSS/JS pages that aren't real tender content
   */
  private looksLikeGarbage(html: string): boolean {
    if (!html || html.length < 200) return true;

    const low = html.toLowerCase();

    // If more than 40% is CSS-like content
    const cssMatches = html.match(/\{[^}]*:[^}]*\}/g);
    if (cssMatches && cssMatches.join('').length > html.length * 0.4) return true;

    // If it starts with CSS/JS
    if (low.trimStart().startsWith('.fab') || low.trimStart().startsWith('/*') || low.trimStart().startsWith('function')) return true;

    // No actual HTML structure
    if (!low.includes('<html') && !low.includes('<body') && !low.includes('<div') && !low.includes('<h1')) return true;

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Cookie management ─────────────────────────────────────

  private captureCookies(siteId: string, setCookieHeader?: string[] | string): void {
    if (!setCookieHeader) return;

    const existing = this.cookieHeaderBySiteId.get(siteId) || '';
    const cookieMap = new Map<string, string>();

    for (const part of existing.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      cookieMap.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }

    const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const cookie of setCookies) {
      const firstPart = cookie.split(';')[0]?.trim();
      if (!firstPart) continue;
      const eq = firstPart.indexOf('=');
      if (eq === -1) continue;
      cookieMap.set(firstPart.slice(0, eq), firstPart.slice(eq + 1));
    }

    this.cookieHeaderBySiteId.set(
      siteId,
      Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
    );
  }

  // ─── Keywords ──────────────────────────────────────────────

  private getKeywords(): string[] {
    const fromEnv = (process.env.TENDERS_ON_TIME_KEYWORDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (fromEnv.length) return fromEnv;

    return [
      'skilling', 'skill development', 'manpower', 'staffing', 'outsourcing',
      'facility management', 'housekeeping', 'cleaning', 'sanitation',
      'consulting', 'consultancy', 'professional services',
      'it services', 'software development', 'portal development',
      'application development', 'project management', 'capacity building',
      'vocational training', 'healthcare manpower', 'call center',
      'helpdesk', 'security services', 'operation and maintenance',
    ];
  }

  // ─── Date parsing ──────────────────────────────────────────

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const cleaned = this.cleanText(value);
    if (!cleaned) return null;

    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (!m) return null;

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const day = parseInt(m[1], 10);
    const month = months[m[2]];
    const year = parseInt(m[3], 10);
    if (month === undefined) return null;
    return new Date(Date.UTC(year, month, day));
  }

  // ─── Text extraction helpers ───────────────────────────────

  private extractOrganizationFromIntro(text: string): string | null {
    const cleaned = this.cleanText(text);
    if (!cleaned) return null;
    const match = cleaned.match(/^The\s+(.+?)\s+has issued/i);
    return match?.[1]?.trim() || null;
  }

  private extractLabeledValue(text: string, labels: string[], nextLabels: string[]): string | null {
    const labelPattern = labels.map((l) => this.escapeRegex(l)).join('|');
    const nextPattern = nextLabels.map((l) => this.escapeRegex(l)).join('|');
    const regex = new RegExp(`(?:${labelPattern})\\s*:?\\s*(.*?)\\s*(?=(?:${nextPattern})\\s*:|$)`, 'is');
    const match = text.match(regex);
    return match?.[1] ? this.cleanText(match[1]) : null;
  }

  private findParagraphContaining($: cheerio.CheerioAPI, needle: string): string {
    let found = '';
    $('p').each((_, el) => {
      if (found) return;
      const text = this.cleanText($(el).text());
      if (text.toLowerCase().includes(needle.toLowerCase())) found = text;
    });
    return found;
  }

  private htmlToText(input: string): string {
    if (!input) return '';
    const $ = cheerio.load(`<div>${input}</div>`);
    return this.cleanText($.text());
  }

  private slugify(input: string): string {
    return this.htmlToText(input)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').toLowerCase();
  }

  private toHexId(id: string): string | null {
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num.toString(16);
  }

  private cleanText(input?: string | null): string {
    return (input || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private firstNonEmpty(values: Array<string | null | undefined>): string | null {
    for (const value of values) {
      const cleaned = this.cleanText(value || '');
      if (cleaned) return cleaned;
    }
    return null;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private coercePayload(raw: unknown): any {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return null; }
    }
    return null;
  }
}