import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

type GemDoc = Record<string, any>;
type CookieJar = Record<string, string>;
type SearchWindow = { name: string; fromDays: number | null; toDays: number | null };

type RankedHit = {
  key: string;
  doc: GemDoc;
  score: number;
  matched: string[];
  query: string;
  window: string;
};

@Injectable()
export class GemConnector implements IConnector {
  private readonly logger = new Logger(GemConnector.name);

  private readonly pageUrl = 'https://bidplus.gem.gov.in/all-bids';
  private readonly apiUrl = 'https://bidplus.gem.gov.in/all-bids-data';

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-IN,en;q=0.9',
    Connection: 'keep-alive',
  };

  /**
   * Tunables
   */
  private readonly maxStoredPerCrawl = 300;
  private readonly minScoreToKeep = 5;
  private readonly maxQueriesPerRun = 28;

  /**
   * IMPORTANT:
   * D8-30 has been unstable and repeatedly returning 404 in runtime logs.
   * So we keep GeM stable by default with ALL only.
   *
   * If you want to test the old extra window later, set:
   * GEM_ENABLE_EXTRA_WINDOWS=true
   */
  private readonly windows: SearchWindow[] =
    process.env.GEM_ENABLE_EXTRA_WINDOWS === 'true'
      ? [
          { name: 'ALL', fromDays: null, toDays: null },
          { name: 'D8-30', fromDays: 8, toDays: 30 },
        ]
      : [{ name: 'ALL', fromDays: null, toDays: null }];

  /**
   * Strong business phrases
   */
  private readonly strongPhraseQueries = [
    'manpower outsourcing',
    'facility management',
    'housekeeping',
    'mechanized cleaning',
    'training',
    'skill development',
    'capacity building',
    'vocational training',
    'staffing',
    'outsourcing',
    'healthcare services',
    'hospital manpower',
    'staff nurses',
    'project monitoring unit',
    'PMU',
    'IT services',
    'software development',
    'portal development',
    'system integrator',
    'project implementation',
    'lab setup',
    'smart classroom',
    'railway catering',
    'rural development',
    'women and child development',
    'tribal affairs',
    'social justice',
    'handicrafts',
    'textiles',
    'water resources',
    'labour employment',
    'agriculture',
    'security services',
    'surveillance',
    'call center',
    'contact center',
    'helpdesk',
  ];

  /**
   * Target ministries / agencies / bodies
   */
  private readonly organizationQueries = [
    'Ministry of Skill Development and Entrepreneurship',
    'Ministry of Labour and Employment',
    'Ministry of Rural Development',
    'Ministry of Women and Child Development',
    'Ministry of Tribal Affairs',
    'Ministry of Social Justice and Empowerment',
    'National Skill Development Corporation',
    'National Informatics Centre',
    'Airports Authority of India',
    'NBCC',
    'IRCTC',
    'BECIL',
    'Invest Uttar Pradesh',
    'Uttar Pradesh Skill Development Mission',
    'Vocational Education and Skill Development Department Uttar Pradesh',
    'Department of Health Government of Jharkhand',
    'Jharkhand Skill Development Mission',
    'JUIDCO',
    'BELTRON',
    'Madhya Pradesh State Rural Livelihoods Mission',
    'Bihar Skill Development Mission',
    'Resident Commissioner Office Government of Sikkim',
    'Resident Commissioner Office Government of Chhattisgarh',
    'Himachal Pradesh Kaushal Vikas Nigam',
    'Northern Railway Delhi Division',
  ];

  /**
   * Target locations
   */
  private readonly targetLocations = [
    'Uttar Pradesh',
    'Jharkhand',
    'Delhi',
    'Madhya Pradesh',
    'Chhattisgarh',
    'Odisha',
    'Assam',
    'Rajasthan',
    'Punjab',
    'Himachal Pradesh',
    'Uttarakhand',
    'Gujarat',
    'Maharashtra',
    'Andhra Pradesh',
    'Telangana',
    'Karnataka',
    'Bihar',
    'Haryana',
    'Tamil Nadu',
    'Sikkim',
    'Greater Noida',
    'Meerut',
    'Ghaziabad',
    'Bharatpur',
  ];

  /**
   * Weighted match lists for local scoring
   */
  private readonly strongIncludeTerms = [
    'manpower outsourcing',
    'facility management',
    'housekeeping',
    'cleaning services',
    'sanitation services',
    'mechanized cleaning',
    'mechanised cleaning',
    'training',
    'skill development',
    'capacity building',
    'vocational training',
    'vocational education',
    'staffing',
    'outsourcing',
    'healthcare services',
    'hospital manpower',
    'staff nurses',
    'nursing',
    'it services',
    'software development',
    'web development',
    'portal development',
    'application development',
    'system integrator',
    'project implementation',
    'project monitoring unit',
    'pmu',
    'lab setup',
    'smart classroom',
    'railway catering',
    'rural development',
    'women and child development',
    'tribal affairs',
    'social justice',
    'handicrafts',
    'textiles',
    'water resources',
    'labour',
    'employment',
    'agriculture',
    'security services',
    'surveillance',
    'call center',
    'contact center',
    'helpdesk',
  ];

  private readonly mediumIncludeTerms = [
    'manpower',
    'facility services',
    'housekeeping services',
    'cleaning',
    'sanitation',
    'teachers',
    'education services',
    'placement',
    'hiring',
    'deployment',
    'human resource',
    'hr services',
    'healthcare',
    'consulting',
    'consultancy',
    'professional services',
    'multimedia',
    'railway',
    'horticulture',
    'livelihood',
    'livelihoods',
    'catering',
  ];

  /**
   * These are too generic to trust alone.
   */
  private readonly weakStandaloneTerms = new Set([
    'development',
    'application',
    'professional',
    'consultancy',
    'consulting',
    'multimedia',
    'security',
  ]);

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    const { cookieJar, csrf } = await this.bootstrapSession(site.baseUrl || this.pageUrl);

    const queryPlan = this.buildQueryPlan();
    const ranked = new Map<string, RankedHit>();

    let requestCount = 0;

    for (const query of queryPlan) {
      for (const window of this.windows) {
        requestCount++;

        try {
          const { docs, numFound } = await this.postSearch({
            baseUrl: site.baseUrl || this.pageUrl,
            cookieJar,
            csrf,
            query,
            window,
          });

          let keptForThisRequest = 0;

          for (const doc of docs) {
            const key = this.getStableDocKey(doc);
            if (!key) continue;

            const { score, matched } = this.scoreDoc(doc, query);
            if (score < this.minScoreToKeep) continue;

            keptForThisRequest++;

            const current = ranked.get(key);
            if (!current || score > current.score) {
              ranked.set(key, {
                key,
                doc,
                score,
                matched,
                query,
                window: window.name,
              });
            }
          }

          this.logger.log(
            `[GEM] query="${query}" window=${window.name} docs=${docs.length} kept=${keptForThisRequest} numFound=${numFound ?? 'n/a'}`,
          );
        } catch (err: any) {
          this.logger.warn(
            `[GEM] query="${query}" window=${window.name} failed: ${err.message}`,
          );
        }
      }
    }

    const selected = Array.from(ranked.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const aDeadline =
          this.parseDate(this.pick0(a.doc.final_end_date_sort))?.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const bDeadline =
          this.parseDate(this.pick0(b.doc.final_end_date_sort))?.getTime() ??
          Number.MAX_SAFE_INTEGER;

        return aDeadline - bDeadline;
      })
      .slice(0, this.maxStoredPerCrawl);

    this.logger.log(
      `[GEM] requests=${requestCount} shortlisted=${selected.length} uniqueRanked=${ranked.size}`,
    );

    return selected.map((hit) => this.toSyntheticUrl(hit));
  }

  async fetchDetail(url: string): Promise<string> {
    if (url.startsWith('gemdoc:')) {
      const b64 = url.slice('gemdoc:'.length);
      return Buffer.from(b64, 'base64').toString('utf8');
    }

    const res = await axios.get(url, {
      headers: this.headers,
      timeout: 30000,
      validateStatus: () => true,
    });

    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }

  parseDetail(raw: string, _url: string, site: SourceSiteConfig): NormalizedTender | null {
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }

    const doc: GemDoc = payload?.doc ?? payload;
    if (!doc || typeof doc !== 'object') return null;

    const raNo = this.pick0(doc.b_bid_number);
    const bidNo = this.pick0(doc.b_bid_number_parent) || raNo;
    if (!bidNo) return null;

    const title =
      this.pick0(doc.bid_title) ||
      this.pick0(doc.item_name) ||
      this.pick0(doc.bid_item_name) ||
      this.pick0(doc.b_category_name) ||
      this.pick0(doc.bd_category_name) ||
      'GeM Bid';

    const minName =
      this.pick0(doc.ba_official_details_minName) ||
      this.pick0(doc.ministry_name);

    const deptName =
      this.pick0(doc.ba_official_details_deptName) ||
      this.pick0(doc.department_name);

    const organization = [minName, deptName].filter(Boolean).join(' / ') || site.name;

    const publishedAt = this.parseDate(this.pick0(doc.final_start_date_sort));
    const deadlineAt = this.parseDate(this.pick0(doc.final_end_date_sort));

    const sourceUrl =
      `https://bidplus.gem.gov.in/bidlists?bid_no=${encodeURIComponent(bidNo)}` +
      (raNo ? `&ra_no=${encodeURIComponent(raNo)}` : '');

    const sourceTenderId = raNo ? `${bidNo} | ${raNo}` : bidNo;

    return {
      sourceUrl,
      sourceTenderId,
      title: String(title).slice(0, 500),
      organization: organization.slice(0, 500),
      summary: undefined,
      location: undefined,
      estimatedValue: undefined,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
      deadlineAt: deadlineAt && !isNaN(deadlineAt.getTime()) ? deadlineAt : undefined,
      status: deadlineAt ? (deadlineAt > new Date() ? 'OPEN' : 'CLOSED') : 'UNKNOWN',
      searchText: `${title} ${organization} ${sourceTenderId}`.trim(),
      contentHash: '',
    } as any;
  }

  // ---------------------------------------------------------------------------
  // Session / request helpers
  // ---------------------------------------------------------------------------

  private async bootstrapSession(baseUrl: string): Promise<{ cookieJar: CookieJar; csrf: string }> {
    const res = await axios.get(baseUrl, {
      headers: {
        ...this.headers,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const cookieJar = this.buildCookieJar((res.headers['set-cookie'] || []) as string[]);

    const csrf =
      cookieJar['csrf_gem_cookie'] ||
      html.match(/csrf_bd_gem_nk["']?\s*[:=]\s*["']([a-z0-9_-]+)["']/i)?.[1] ||
      html.match(/name=["']csrf_bd_gem_nk["']\s+value=["']([^"']+)["']/i)?.[1] ||
      '';

    if (!csrf) {
      throw new Error('GeM CSRF token not found after bootstrap.');
    }

    return { cookieJar, csrf };
  }

  private async postSearch(args: {
    baseUrl: string;
    cookieJar: CookieJar;
    csrf: string;
    query: string;
    window: SearchWindow;
  }): Promise<{ docs: GemDoc[]; numFound: number | null }> {
    const { baseUrl, cookieJar, csrf, query, window } = args;

    const filter: Record<string, any> = {
      bidStatusType: 'ongoing_bids',
      byType: 'all',
      highBidValue: '',
      sort: 'Bid-End-Date-Oldest',
    };

    /**
     * Only include byEndDate when the window actually needs it.
     * Keeping it omitted for ALL is the safest shape.
     */
    if (window.fromDays != null && window.toDays != null) {
      filter.byEndDate = {
        from: this.formatGemDateDdMmYyyyIST(window.fromDays),
        to: this.formatGemDateDdMmYyyyIST(window.toDays),
      };
    } else {
      filter.byEndDate = { from: '', to: '' };
    }

    const payloadObj = {
      param: {
        searchBid: query,
        searchType: 'fullText',
      },
      filter,
    };

    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(payloadObj));
    form.set('csrf_bd_gem_nk', csrf);

    const res = await axios.post(this.apiUrl, form.toString(), {
      headers: {
        ...this.headers,
        Cookie: this.cookieHeader(cookieJar),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: baseUrl,
        Origin: 'https://bidplus.gem.gov.in',
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    this.absorbSetCookies(cookieJar, (res.headers['set-cookie'] || []) as string[]);

    if (res.status !== 200) {
      throw new Error(`GeM all-bids-data returned status=${res.status}`);
    }

    const rr = res.data?.response?.response;
    const docs: GemDoc[] = Array.isArray(rr?.docs) ? rr.docs : [];
    const numFound =
      typeof rr?.numFound === 'number'
        ? rr.numFound
        : typeof rr?.num_found === 'number'
          ? rr.num_found
          : null;

    return { docs, numFound };
  }

  // ---------------------------------------------------------------------------
  // Query planning
  // ---------------------------------------------------------------------------

  private buildQueryPlan(): string[] {
    const queries: string[] = [];

    queries.push(...this.strongPhraseQueries);
    queries.push(...this.organizationQueries);

    const comboLocations = [
      'Jharkhand',
      'Uttar Pradesh',
      'Delhi',
      'Ghaziabad',
      'Greater Noida',
      'Meerut',
      'Bihar',
      'Himachal Pradesh',
    ];

    const comboServices = [
      'training',
      'manpower',
      'skill development',
      'facility management',
      'healthcare',
      'IT services',
    ];

    for (const loc of comboLocations) {
      for (const svc of comboServices) {
        queries.push(`${loc} ${svc}`);
      }
    }

    const deduped = Array.from(
      new Set(
        queries
          .map((q) => q.replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      ),
    );

    return deduped.slice(0, this.maxQueriesPerRun);
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  private scoreDoc(doc: GemDoc, query: string): { score: number; matched: string[] } {
    const title =
      this.pick0(doc.bid_title) ||
      this.pick0(doc.item_name) ||
      this.pick0(doc.bid_item_name) ||
      this.pick0(doc.b_category_name) ||
      this.pick0(doc.bd_category_name) ||
      '';

    const org = [
      this.pick0(doc.ba_official_details_minName),
      this.pick0(doc.ba_official_details_deptName),
      this.pick0(doc.ministry_name),
      this.pick0(doc.department_name),
    ]
      .filter(Boolean)
      .join(' ');

    const rawText = this.normalizeText(`${title} ${org} ${JSON.stringify(doc)}`);
    const matched: string[] = [];
    let score = 0;

    const normalizedQuery = this.normalizeText(query);
    if (normalizedQuery && rawText.includes(normalizedQuery)) {
      score += 2;
      matched.push(`query:${query}`);
    }

    for (const term of this.strongIncludeTerms) {
      if (this.includesTerm(rawText, term)) {
        score += 4;
        matched.push(`strong:${term}`);
      }
    }

    for (const term of this.mediumIncludeTerms) {
      if (this.includesTerm(rawText, term)) {
        score += 2;
        matched.push(`medium:${term}`);
      }
    }

    for (const orgTerm of this.organizationQueries) {
      if (this.includesTerm(rawText, orgTerm)) {
        score += 5;
        matched.push(`org:${orgTerm}`);
      }
    }

    for (const location of this.targetLocations) {
      if (this.includesTerm(rawText, location)) {
        score += 3;
        matched.push(`loc:${location}`);
      }
    }

    const matchedTokens = matched
      .map((m) => m.split(':').slice(1).join(':').trim().toLowerCase())
      .filter(Boolean);

    const hasStrongContext = matchedTokens.some(
      (t) =>
        !this.weakStandaloneTerms.has(t) &&
        (this.organizationQueries.some((x) => x.toLowerCase() === t) ||
          this.targetLocations.some((x) => x.toLowerCase() === t) ||
          this.strongIncludeTerms.some((x) => x.toLowerCase() === t)),
    );

    if (!hasStrongContext && matchedTokens.every((t) => this.weakStandaloneTerms.has(t))) {
      return { score: 0, matched: [] };
    }

    return { score, matched };
  }

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  private getStableDocKey(doc: GemDoc): string | null {
    const raNo = this.pick0(doc?.b_bid_number);
    const bidNo = this.pick0(doc?.b_bid_number_parent) || raNo;
    if (!bidNo) return null;
    return `${bidNo}::${raNo || ''}`;
  }

  private pick0(v: any): string | undefined {
    return Array.isArray(v)
      ? v[0]
      : typeof v === 'string'
        ? v
        : typeof v === 'number'
          ? String(v)
          : undefined;
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s/&-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private includesTerm(haystack: string, term: string): boolean {
    const needle = this.normalizeText(term);
    if (!needle) return false;
    return haystack.includes(needle);
  }

  private formatGemDateDdMmYyyyIST(daysFromToday: number): string {
    const now = new Date();
    const istMs = now.getTime() + 330 * 60 * 1000;
    const base = new Date(istMs);
    const target = new Date(base.getTime() + daysFromToday * 24 * 60 * 60 * 1000);

    const dd = String(target.getUTCDate()).padStart(2, '0');
    const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(target.getUTCFullYear());

    return `${dd}/${mm}/${yyyy}`;
  }

  private buildCookieJar(setCookies: string[]): CookieJar {
    const jar: CookieJar = {};
    for (const cookie of setCookies || []) {
      const first = cookie.split(';')[0];
      const idx = first.indexOf('=');
      if (idx > 0) {
        const k = first.slice(0, idx).trim();
        const v = first.slice(idx + 1).trim();
        jar[k] = v;
      }
    }
    return jar;
  }

  private absorbSetCookies(jar: CookieJar, setCookies: string[]): void {
    for (const cookie of setCookies || []) {
      const first = cookie.split(';')[0];
      const idx = first.indexOf('=');
      if (idx > 0) {
        const k = first.slice(0, idx).trim();
        const v = first.slice(idx + 1).trim();
        jar[k] = v;
      }
    }
  }

  private cookieHeader(jar: CookieJar): string {
    return Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private toSyntheticUrl(hit: RankedHit): string {
    return `gemdoc:${Buffer.from(JSON.stringify(hit), 'utf8').toString('base64')}`;
  }
}