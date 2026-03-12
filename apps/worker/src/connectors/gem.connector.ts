import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IConnector, SourceSiteConfig } from './connector.interface';
import { NormalizedTender } from '@tenderwatch/shared';

type GemDoc = Record<string, any>;

@Injectable()
export class GemConnector implements IConnector {
  private readonly logger = new Logger(GemConnector.name);

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
  };

  async fetchListing(site: SourceSiteConfig): Promise<string[]> {
    const baseUrl = site.baseUrl; // https://bidplus.gem.gov.in/all-bids
    const apiUrl = 'https://bidplus.gem.gov.in/all-bids-data';

    // 1) GET listing page once for csrf/cookies
    const pageRes = await axios.get(baseUrl, {
      headers: this.headers,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const html = typeof pageRes.data === 'string' ? pageRes.data : '';
    const setCookie: string[] = (pageRes.headers['set-cookie'] || []) as any;
    const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');

    const csrf =
      cookieHeader.match(/csrf_bd_gem_nk=([^;]+)/)?.[1] ||
      html.match(/csrf_bd_gem_nk["']?\s*[:=]\s*["']([a-f0-9]+)["']/i)?.[1] ||
      html.match(/name=["']csrf_bd_gem_nk["']\s+value=["']([^"']+)["']/i)?.[1];

    if (!csrf) {
      this.logger.warn('[GEM] csrf_bd_gem_nk not found; cannot call all-bids-data.');
      return [];
    }

    // Try to discover a valid "Latest" sort string from HTML (optional).
    // If none found, we still work by sampling multiple offsets.
    const sortTokens = Array.from(new Set(html.match(/Bid-[A-Za-z-]+/g) || []));
    const latestSort =
      sortTokens.find((s) => /Bid-End-Date/i.test(s) && /Latest/i.test(s)) ||
      sortTokens.find((s) => /Bid-Start-Date/i.test(s) && /Latest/i.test(s)) ||
      undefined;

    const sortsToTry = latestSort ? [latestSort, 'Bid-End-Date-Oldest'] : ['Bid-End-Date-Oldest'];

    const postDocs = async (start: number, length: number, sort: string): Promise<GemDoc[]> => {
      const payloadObj = {
        param: { searchBid: '', searchType: 'fullText' },
        filter: { bidStatusType: 'ongoing_bids', bidType: 'all', highBidValue: '' },
        byEndDate: { from: '', to: '' },
        sort, // must be a valid backend token
        start,
        length,
      };

      const form = new URLSearchParams();
      form.set('payload', JSON.stringify(payloadObj));
      form.set('csrf_bd_gem_nk', csrf);

      const xhrRes = await axios.post(apiUrl, form.toString(), {
        headers: {
          ...this.headers,
          Cookie: cookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: baseUrl,
          Origin: 'https://bidplus.gem.gov.in',
        },
        timeout: 30000,
        validateStatus: () => true,
      });

      const docs: GemDoc[] = xhrRes.data?.response?.response?.docs;
      return Array.isArray(docs) ? docs : [];
    };

    const pick0 = (v: any): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    // Convert ISO end-date to an IST day key (because UI is IST-like)
    const istDayKey = (iso?: string): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const ist = new Date(d.getTime() + 330 * 60 * 1000); // +05:30
      const y = ist.getUTCFullYear();
      const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
      const day = String(ist.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // ✅ Main strategy: sample multiple offsets until we get multiple distinct deadline days.
    const offsets = [0, 2000, 8000, 20000, 35000]; // wide spread
    const pageSize = 50;
    const maxUrls = 60;
    const minDistinctDays = 5;

    const seenBidNos = new Set<string>();
    const distinctDays = new Set<string>();
    const chosenDocs: GemDoc[] = [];

    for (const sort of sortsToTry) {
      for (const start of offsets) {
        const docs = await postDocs(start, pageSize, sort);

        // update day spread + collect docs
        for (const d of docs) {
          const raNo = pick0(d?.b_bid_number);
          const bidNo = pick0(d?.b_bid_number_parent) || raNo;
          if (!bidNo || seenBidNos.has(bidNo)) continue;

          const endIso = pick0(d?.final_end_date_sort);
          const dayKey = istDayKey(endIso);
          if (dayKey) distinctDays.add(dayKey);

          seenBidNos.add(bidNo);
          chosenDocs.push(d);

          if (chosenDocs.length >= maxUrls) break;
        }

        this.logger.log(
          `[GEM] sort=${sort} start=${start} docs=${docs.length} picked=${chosenDocs.length} distinctDays=${distinctDays.size}`,
        );

        if (chosenDocs.length >= maxUrls && distinctDays.size >= minDistinctDays) break;
      }
      if (chosenDocs.length >= maxUrls && distinctDays.size >= minDistinctDays) break;
    }

    if (!chosenDocs.length) return [];

    const urls = chosenDocs.map((d) => this.toSyntheticUrl(d));
    this.logger.log(`[GEM] Generated ${urls.length} synthetic detail URLs (distinctDays=${distinctDays.size})`);
    return urls;
  }

  async fetchDetail(url: string): Promise<string> {
    // Synthetic URL contains encoded JSON doc; no HTTP needed.
    if (url.startsWith('gemdoc:')) {
      const b64 = url.slice('gemdoc:'.length);
      return Buffer.from(b64, 'base64').toString('utf8');
    }

    // Fallback
    const res = await axios.get(url, {
      headers: this.headers,
      timeout: 30000,
      validateStatus: () => true,
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }

  parseDetail(raw: string, _url: string, site: SourceSiteConfig): NormalizedTender | null {
    let doc: GemDoc;
    try {
      doc = JSON.parse(raw);
    } catch {
      return null;
    }

    const pick0 = (v: any): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const raNo = pick0(doc.b_bid_number);
    const bidNo = pick0(doc.b_bid_number_parent) || raNo;
    if (!bidNo) return null;

    const title = pick0(doc.bd_category_name) || pick0(doc.b_category_name) || 'GeM Bid';

    const minName = pick0(doc.ba_official_details_minName);
    const deptName = pick0(doc.ba_official_details_deptName);
    const organization = [minName, deptName].filter(Boolean).join(' / ') || site.name;

    const startIso = pick0(doc.final_start_date_sort);
    const endIso = pick0(doc.final_end_date_sort);

    const publishedAt = startIso ? new Date(startIso) : undefined;
    const deadlineAt = endIso ? new Date(endIso) : undefined;

    const sourceTenderId = [bidNo, raNo].filter(Boolean).join(' | ');
    const sourceUrl = `https://bidplus.gem.gov.in/all-bids?search=${encodeURIComponent(bidNo)}`;

    return {
      sourceUrl,
      sourceTenderId,
      title: String(title).slice(0, 500),
      organization: organization.slice(0, 500),
      summary: undefined,
      location: undefined, // GeM listing JSON doesn't provide it (needs detail endpoint later)
      estimatedValue: undefined, // same
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
      deadlineAt: deadlineAt && !isNaN(deadlineAt.getTime()) ? deadlineAt : undefined,
      status: deadlineAt ? (deadlineAt > new Date() ? 'OPEN' : 'CLOSED') : 'UNKNOWN',
      searchText: `${title} ${organization} ${sourceTenderId}`.trim(),
      contentHash: '',
    } as any;
  }

  private toSyntheticUrl(doc: GemDoc): string {
    return `gemdoc:${Buffer.from(JSON.stringify(doc), 'utf8').toString('base64')}`;
  }
}