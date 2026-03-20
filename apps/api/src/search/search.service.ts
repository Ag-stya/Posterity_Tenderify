import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmbeddingService } from './embedding.service';
import { Prisma } from '@prisma/client';

interface SearchParams {
  q?: string;
  sourceSiteIds?: string;
  publishedFrom?: string;
  publishedTo?: string;
  closingSoonDays?: number;
  location?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async search(params: SearchParams) {
    const { q, sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location, page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    // If no query, return newest tenders with filters
    if (!q || q.trim() === '') {
      return this.browseLatest(params);
    }

    // ── Hybrid search ──
    const queryEmbedding = await this.embedding.embed(q);

    // Build WHERE clause fragments for filters (uses actual DB column names)
    const filterClauses = this.buildFilterClauses({ sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location });

    let candidates: Array<{ id: string; semantic_score: number; fts_score: number; published_at: Date | null }> = [];

    if (queryEmbedding) {
      // Vector similarity search (top 200)
      const vectorStr = `[${queryEmbedding.join(',')}]`;
      const vectorResults: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT id, 1 - (embedding <=> $1::vector) as semantic_score, 0::float as fts_score, published_at
        FROM tenders
        WHERE embedding IS NOT NULL
        ${filterClauses.sql}
        ORDER BY embedding <=> $1::vector
        LIMIT 200
      `, vectorStr, ...filterClauses.params);

      // FTS search (top 200)
      const ftsQuery = q.split(/\s+/).filter(Boolean).join(' & ');
      let ftsResults: any[] = [];
      try {
        ftsResults = await this.prisma.$queryRawUnsafe(`
          SELECT id, 0::float as semantic_score, ts_rank(tsv, to_tsquery('english', $1)) as fts_score, published_at
          FROM tenders
          WHERE tsv @@ to_tsquery('english', $1)
          ${filterClauses.sql}
          ORDER BY fts_score DESC
          LIMIT 200
        `, ftsQuery, ...filterClauses.params);
      } catch (ftsErr: any) {
        this.logger.warn(`FTS query failed for "${q}": ${ftsErr.message}, using ILIKE fallback`);
        ftsResults = await this.prisma.$queryRawUnsafe(`
          SELECT id, 0::float as semantic_score, 1::float as fts_score, published_at
          FROM tenders
          WHERE search_text ILIKE $1
          ${filterClauses.sql}
          ORDER BY published_at DESC NULLS LAST
          LIMIT 200
        `, `%${q}%`, ...filterClauses.params);
      }

      // Merge unique IDs
      const scoreMap = new Map<string, { semantic: number; fts: number; publishedAt: Date | null }>();

      for (const r of vectorResults) {
        scoreMap.set(r.id, {
          semantic: Number(r.semantic_score) || 0,
          fts: 0,
          publishedAt: r.published_at,
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
          });
        }
      }

      // Normalize and compute final scores
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

        return { id, semantic_score: finalScore, fts_score: 0, published_at: scores.publishedAt };
      });

      candidates.sort((a, b) => b.semantic_score - a.semantic_score);
    } else {
      // Fallback: FTS only (embedding model not ready)
      const ftsQuery = q.split(/\s+/).filter(Boolean).join(' & ');
      try {
        candidates = await this.prisma.$queryRawUnsafe(`
          SELECT id, ts_rank(tsv, to_tsquery('english', $1)) as semantic_score, 0::float as fts_score, published_at
          FROM tenders
          WHERE tsv @@ to_tsquery('english', $1)
          ${filterClauses.sql}
          ORDER BY semantic_score DESC
          LIMIT 200
        `, ftsQuery, ...filterClauses.params);
      } catch {
        // If FTS fails (e.g. bad query syntax), fall back to ILIKE
        candidates = await this.prisma.$queryRawUnsafe(`
          SELECT id, 1::float as semantic_score, 0::float as fts_score, published_at
          FROM tenders
          WHERE search_text ILIKE $1
          ${filterClauses.sql}
          ORDER BY published_at DESC NULLS LAST
          LIMIT 200
        `, `%${q}%`, ...filterClauses.params);
      }
    }

    const total = candidates.length;
    const pageIds = candidates.slice(offset, offset + pageSize).map(c => c.id);
    const scoreById = new Map(candidates.map(c => [c.id, c.semantic_score]));

    if (pageIds.length === 0) {
      return { page, pageSize, total: 0, items: [] };
    }

    // Fetch full tender data with source site and duplicates
    const tenders = await this.prisma.tender.findMany({
      where: { id: { in: pageIds } },
      include: {
        sourceSite: { select: { id: true, name: true, key: true } },
        canonicalOf: {
          include: {
            duplicate: {
              include: {
                sourceSite: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    // Sort by score order
    const tenderMap = new Map(tenders.map(t => [t.id, t]));
    const items = pageIds.map(id => {
      const t = tenderMap.get(id);
      if (!t) return null;
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
        alsoSeenOn: t.canonicalOf.map(d => ({
          sourceSite: { name: d.duplicate.sourceSite.name },
          sourceUrl: d.duplicate.sourceUrl,
        })),
      };
    }).filter(Boolean);

    return { page, pageSize, total, items };
  }

  private async browseLatest(params: SearchParams) {
    const { sourceSiteIds, publishedFrom, publishedTo, closingSoonDays, location, page, pageSize } = params;

    const where: any = {};
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
      where.deadlineAt = { gte: new Date(), lte: future };
    }
    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    const [total, tenders] = await Promise.all([
      this.prisma.tender.count({ where }),
      this.prisma.tender.findMany({
        where,
        include: {
          sourceSite: { select: { id: true, name: true, key: true } },
          canonicalOf: {
            include: {
              duplicate: {
                include: { sourceSite: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = tenders.map(t => ({
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
      alsoSeenOn: t.canonicalOf.map(d => ({
        sourceSite: { name: d.duplicate.sourceSite.name },
        sourceUrl: d.duplicate.sourceUrl,
      })),
    }));

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
    let paramIndex = 2; // $1 is already used for query/vector

    if (filters.sourceSiteIds) {
      const ids = filters.sourceSiteIds.split(',').map(s => s.trim());
      parts.push(`AND source_site_id = ANY($${paramIndex}::uuid[])`);
      params.push(ids);
      paramIndex++;
    }
    if (filters.publishedFrom) {
      parts.push(`AND published_at >= $${paramIndex}::timestamp`);
      params.push(new Date(filters.publishedFrom));
      paramIndex++;
    }
    if (filters.publishedTo) {
      parts.push(`AND published_at <= $${paramIndex}::timestamp`);
      params.push(new Date(filters.publishedTo));
      paramIndex++;
    }
    if (filters.closingSoonDays) {
      const future = new Date();
      future.setDate(future.getDate() + filters.closingSoonDays);
      parts.push(`AND deadline_at >= NOW() AND deadline_at <= $${paramIndex}::timestamp`);
      params.push(future);
      paramIndex++;
    }
    if (filters.location) {
      parts.push(`AND location ILIKE $${paramIndex}`);
      params.push(`%${filters.location}%`);
      paramIndex++;
    }

    return { sql: parts.join(' '), params };
  }
}