import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmbeddingService } from './embedding.service';

interface SearchParams {
  q?: string;
  sourceSiteIds?: string;
  publishedFrom?: string;
  publishedTo?: string;
  closingSoonDays?: number;
  location?: string;
  sort?: 'relevance' | 'deadline' | 'published';
  page: number;
  pageSize: number;
}

interface SearchCandidate {
  id: string;
  semantic_score: number;
  published_at: Date | null;
  deadline_at: Date | null;
  is_rejected: boolean;
  [key: string]: any;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async search(params: SearchParams) {
    const { q, sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location, sort, page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    if (!q || q.trim() === '') {
      return this.browseLatest(params);
    }

    const queryEmbedding = await this.embedding.embed(q);
    const filterClauses = this.buildFilterClauses({ sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location });

    let candidates: SearchCandidate[] = [];

    if (queryEmbedding) {
      const vectorStr = `[${queryEmbedding.join(',')}]`;
      const vectorResults: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT t.id, 1 - (t.embedding <=> $1::vector) as semantic_score,
               t.published_at, t.deadline_at,
               COALESCE(w.is_rejected, false) as is_rejected
        FROM tenders t
        LEFT JOIN tender_workflows w ON w.tender_id = t.id
        WHERE t.embedding IS NOT NULL
          AND t.status != 'CLOSED'
          AND (t.deadline_at IS NULL OR t.deadline_at > NOW())
        ${filterClauses.sql}
        ORDER BY t.embedding <=> $1::vector
        LIMIT 200
      `, vectorStr, ...filterClauses.params);

      const ftsQuery = q.split(/\s+/).filter(Boolean).join(' & ');
      let ftsResults: any[] = [];
      try {
        ftsResults = await this.prisma.$queryRawUnsafe(`
          SELECT t.id, ts_rank(t.tsv, to_tsquery('english', $1)) as fts_score,
                 t.published_at, t.deadline_at,
                 COALESCE(w.is_rejected, false) as is_rejected
          FROM tenders t
          LEFT JOIN tender_workflows w ON w.tender_id = t.id
          WHERE t.tsv @@ to_tsquery('english', $1)
            AND t.status != 'CLOSED'
            AND (t.deadline_at IS NULL OR t.deadline_at > NOW())
          ${filterClauses.sql}
          ORDER BY fts_score DESC
          LIMIT 200
        `, ftsQuery, ...filterClauses.params);
      } catch (ftsErr: any) {
        this.logger.warn(`FTS query failed for "${q}": ${ftsErr.message}, using ILIKE fallback`);
        ftsResults = await this.prisma.$queryRawUnsafe(`
          SELECT t.id, 1::float as fts_score,
                 t.published_at, t.deadline_at,
                 COALESCE(w.is_rejected, false) as is_rejected
          FROM tenders t
          LEFT JOIN tender_workflows w ON w.tender_id = t.id
          WHERE t.search_text ILIKE $1
            AND t.status != 'CLOSED'
            AND (t.deadline_at IS NULL OR t.deadline_at > NOW())
          ${filterClauses.sql}
          ORDER BY t.published_at DESC NULLS LAST
          LIMIT 200
        `, `%${q}%`, ...filterClauses.params);
      }

      const scoreMap = new Map<string, { semantic: number; fts: number; publishedAt: Date | null; deadlineAt: Date | null; isRejected: boolean }>();

      for (const r of vectorResults) {
        scoreMap.set(r.id, {
          semantic: Number(r.semantic_score) || 0,
          fts: 0,
          publishedAt: r.published_at,
          deadlineAt: r.deadline_at,
          isRejected: r.is_rejected === true || r.is_rejected === 't',
        });
      }

      for (const r of ftsResults) {
        const existing = scoreMap.get(r.id);
        if (existing) {
          existing.fts = Number(r.fts_score) || 0;
        } else {
          scoreMap.set(r.id, {
            semantic: 0,
            fts: Number(r.fts_score) || 0,
            publishedAt: r.published_at,
            deadlineAt: r.deadline_at,
            isRejected: r.is_rejected === true || r.is_rejected === 't',
          });
        }
      }

      const maxSemantic = Math.max(...Array.from(scoreMap.values()).map(v => v.semantic), 0.001);
      const maxFts = Math.max(...Array.from(scoreMap.values()).map(v => v.fts), 0.001);
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      candidates = Array.from(scoreMap.entries()).map(([id, scores]) => {
        const semNorm = scores.semantic / maxSemantic;
        const ftsNorm = scores.fts / maxFts;
        const recencyBoost = scores.publishedAt
          ? Math.max(0, 1 - (now - new Date(scores.publishedAt).getTime()) / thirtyDaysMs)
          : 0;
        const finalScore = 0.65 * semNorm + 0.25 * ftsNorm + 0.10 * recencyBoost;

        return {
          id,
          semantic_score: finalScore,
          published_at: scores.publishedAt,
          deadline_at: scores.deadlineAt,
          is_rejected: scores.isRejected,
        };
      });

      candidates = this.sortCandidates(candidates, sort || 'relevance');
    } else {
      const ftsQuery = q.split(/\s+/).filter(Boolean).join(' & ');
      try {
        const rawResults: any[] = await this.prisma.$queryRawUnsafe(`
          SELECT t.id, ts_rank(t.tsv, to_tsquery('english', $1)) as semantic_score,
                 t.published_at, t.deadline_at,
                 COALESCE(w.is_rejected, false) as is_rejected
          FROM tenders t
          LEFT JOIN tender_workflows w ON w.tender_id = t.id
          WHERE t.tsv @@ to_tsquery('english', $1)
            AND t.status != 'CLOSED'
            AND (t.deadline_at IS NULL OR t.deadline_at > NOW())
          ${filterClauses.sql}
          ORDER BY semantic_score DESC
          LIMIT 200
        `, ftsQuery, ...filterClauses.params);

        candidates = rawResults.map(c => ({
          ...c,
          semantic_score: Number(c.semantic_score) || 0,
          is_rejected: c.is_rejected === true || (c.is_rejected as any) === 't',
        }));
      } catch {
        const rawResults: any[] = await this.prisma.$queryRawUnsafe(`
          SELECT t.id, 1::float as semantic_score,
                 t.published_at, t.deadline_at,
                 COALESCE(w.is_rejected, false) as is_rejected
          FROM tenders t
          LEFT JOIN tender_workflows w ON w.tender_id = t.id
          WHERE t.search_text ILIKE $1
            AND t.status != 'CLOSED'
            AND (t.deadline_at IS NULL OR t.deadline_at > NOW())
          ${filterClauses.sql}
          ORDER BY t.published_at DESC NULLS LAST
          LIMIT 200
        `, `%${q}%`, ...filterClauses.params);

        candidates = rawResults.map(c => ({
          ...c,
          semantic_score: Number(c.semantic_score) || 0,
          is_rejected: c.is_rejected === true || (c.is_rejected as any) === 't',
        }));
      }

      candidates = this.sortCandidates(candidates, sort || 'relevance');
    }

    const total = candidates.length;
    const pageIds = candidates.slice(offset, offset + pageSize).map(c => c.id);
    const scoreById = new Map(candidates.map(c => [c.id, c.semantic_score]));

    if (pageIds.length === 0) {
      return { page, pageSize, total: 0, items: [] };
    }

    const tenders = await this.prisma.tender.findMany({
      where: { id: { in: pageIds } },
      include: {
        sourceSite: { select: { id: true, name: true, key: true } },
        workflow: {
          select: {
            currentStage: true,
            isRejected: true,
            rejectionReason: true,
            failedAtStage: true,
            lastUpdatedBy: {
              select: { email: true, profile: { select: { fullName: true } } },
            },
          },
        },
        canonicalOf: {
          include: {
            duplicate: {
              include: { sourceSite: { select: { name: true } } },
            },
          },
        },
      },
    });

    const tenderMap = new Map(tenders.map(t => [t.id, t]));
    const items = pageIds.map(id => {
      const t = tenderMap.get(id);
      if (!t) return null;

      let rejectionInfo: any = null;
      if (t.workflow?.isRejected) {
        rejectionInfo = {
          rejectedBy: t.workflow.lastUpdatedBy?.profile?.fullName || t.workflow.lastUpdatedBy?.email || 'Unknown',
          reason: t.workflow.rejectionReason,
          failedAtStage: t.workflow.failedAtStage,
        };
      }

      return {
        id: t.id,
        title: t.title,
        organization: t.organization,
        publishedAt: t.publishedAt?.toISOString() || null,
        deadlineAt: t.deadlineAt?.toISOString() || null,
        location: t.location,
        estimatedValue: t.estimatedValue,
        sourceSite: t.sourceSite,
        sourceUrl: t.sourceUrl,
        status: t.status,
        score: scoreById.get(t.id) || 0,
        isRejected: t.workflow?.isRejected || false,
        rejectionInfo,
        workflowStage: t.workflow?.currentStage || null,
        alsoSeenOn: t.canonicalOf.map(d => ({
          sourceSite: { name: d.duplicate.sourceSite.name },
          sourceUrl: d.duplicate.sourceUrl,
        })),
      };
    }).filter(Boolean);

    return { page, pageSize, total, items };
  }

  /**
   * Sort candidates: rejected always pushed to bottom, then by chosen sort
   */
  private sortCandidates(candidates: SearchCandidate[], sort: string): SearchCandidate[] {
    return candidates.sort((a, b) => {
      // Rejected always at bottom
      if (a.is_rejected && !b.is_rejected) return 1;
      if (!a.is_rejected && b.is_rejected) return -1;

      switch (sort) {
        case 'deadline': {
          const aDeadline = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity;
          const bDeadline = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity;
          return aDeadline - bDeadline;
        }
        case 'published': {
          const aPub = a.published_at ? new Date(a.published_at).getTime() : 0;
          const bPub = b.published_at ? new Date(b.published_at).getTime() : 0;
          return bPub - aPub;
        }
        case 'relevance':
        default:
          return b.semantic_score - a.semantic_score;
      }
    });
  }

  private async browseLatest(params: SearchParams) {
    const { sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location, sort, page, pageSize } = params;

    const where: any = {
      // Always exclude closed/expired tenders
      status: { not: 'CLOSED' },
      OR: [
        { deadlineAt: null },
        { deadlineAt: { gt: new Date() } },
      ],
    };

    if (sourceSiteIds) {
      where.sourceSiteId = { in: sourceSiteIds.split(',').map(s => s.trim()) };
    }
    if (publishedFrom || publishedTo) {
      where.publishedAt = {};
      if (publishedFrom) where.publishedAt.gte = new Date(publishedFrom);
      if (publishedTo) where.publishedAt.lte = new Date(publishedTo);
    }
    if (closingSoonDays) {
      const future = new Date();
      future.setDate(future.getDate() + closingSoonDays);
      // Override deadlineAt: must be upcoming AND within the window
      where.deadlineAt = { gte: new Date(), lte: future };
      delete where.OR; // deadlineAt is now explicitly set; OR is superseded
    }
    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    let orderBy: any[] = [{ status: 'asc' }, { publishedAt: 'desc' }];
    if (sort === 'deadline') {
      orderBy = [{ deadlineAt: 'asc' }];
    } else if (sort === 'published') {
      orderBy = [{ publishedAt: 'desc' }];
    }

    const [total, tenders] = await Promise.all([
      this.prisma.tender.count({ where }),
      this.prisma.tender.findMany({
        where,
        include: {
          sourceSite: { select: { id: true, name: true, key: true } },
          workflow: {
            select: {
              currentStage: true,
              isRejected: true,
              rejectionReason: true,
              failedAtStage: true,
              lastUpdatedBy: {
                select: { email: true, profile: { select: { fullName: true } } },
              },
            },
          },
          canonicalOf: {
            include: {
              duplicate: {
                include: { sourceSite: { select: { name: true } } },
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Separate rejected and non-rejected, push rejected to bottom
    const nonRejected = tenders.filter(t => !t.workflow?.isRejected);
    const rejected = tenders.filter(t => t.workflow?.isRejected);
    const sortedTenders = [...nonRejected, ...rejected];

    const items = sortedTenders.map(t => {
      let rejectionInfo: any = null;
      if (t.workflow?.isRejected) {
        rejectionInfo = {
          rejectedBy: t.workflow.lastUpdatedBy?.profile?.fullName || t.workflow.lastUpdatedBy?.email || 'Unknown',
          reason: t.workflow.rejectionReason,
          failedAtStage: t.workflow.failedAtStage,
        };
      }

      return {
        id: t.id,
        title: t.title,
        organization: t.organization,
        publishedAt: t.publishedAt?.toISOString() || null,
        deadlineAt: t.deadlineAt?.toISOString() || null,
        location: t.location,
        estimatedValue: t.estimatedValue,
        sourceSite: t.sourceSite,
        sourceUrl: t.sourceUrl,
        status: t.status,
        score: undefined,
        isRejected: t.workflow?.isRejected || false,
        rejectionInfo,
        workflowStage: t.workflow?.currentStage || null,
        alsoSeenOn: t.canonicalOf.map(d => ({
          sourceSite: { name: d.duplicate.sourceSite.name },
          sourceUrl: d.duplicate.sourceUrl,
        })),
      };
    });

    return { page, pageSize, total, items };
  }

  private buildFilterClauses(filters: {
    sourceSiteIds?: string;
    publishedFrom?: string;
    publishedTo?: string;
    closingSoonDays?: number;
    location?: string;
  }): { sql: string; params: any[] } {
    const parts: string[] = [];
    const params: any[] = [];
    let paramIndex = 2;

    if (filters.sourceSiteIds) {
      const ids = filters.sourceSiteIds.split(',').map(s => s.trim());
      parts.push(`AND t.source_site_id = ANY($${paramIndex}::uuid[])`);
      params.push(ids);
      paramIndex++;
    }
    if (filters.publishedFrom) {
      parts.push(`AND t.published_at >= $${paramIndex}::timestamp`);
      params.push(new Date(filters.publishedFrom));
      paramIndex++;
    }
    if (filters.publishedTo) {
      parts.push(`AND t.published_at <= $${paramIndex}::timestamp`);
      params.push(new Date(filters.publishedTo));
      paramIndex++;
    }
    if (filters.closingSoonDays) {
      const future = new Date();
      future.setDate(future.getDate() + filters.closingSoonDays);
      parts.push(`AND t.deadline_at >= NOW() AND t.deadline_at <= $${paramIndex}::timestamp`);
      params.push(future);
      paramIndex++;
    }
    if (filters.location) {
      parts.push(`AND t.location ILIKE $${paramIndex}`);
      params.push(`%${filters.location}%`);
      paramIndex++;
    }

    return { sql: parts.join(' '), params };
  }
}