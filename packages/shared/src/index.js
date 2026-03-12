"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { createHash } = require('crypto');

const UserRole = { ADMIN: 'ADMIN', BD: 'BD' };
const SiteType = { NIC_GEP: 'NIC_GEP', CPPP: 'CPPP', NPROCURE: 'NPROCURE', IREPS: 'IREPS', CUSTOM_HTML: 'CUSTOM_HTML',GEM:'GEM' };
const TenderStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED', UNKNOWN: 'UNKNOWN' };
const CrawlStatus = { QUEUED: 'QUEUED', RUNNING: 'RUNNING', SUCCESS: 'SUCCESS', FAILED: 'FAILED' };

function buildSearchText(tender, siteName) {
  return [tender.title, tender.organization, tender.summary, tender.location, tender.estimatedValue, siteName]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeContentHash(tender) {
  const canonical = [
    tender.title || '', tender.organization || '', tender.summary || '',
    tender.location || '', tender.estimatedValue || '',
    tender.publishedAt ? tender.publishedAt.toISOString() : '',
    tender.deadlineAt ? tender.deadlineAt.toISOString() : '',
    tender.status || '',
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

exports.UserRole = UserRole;
exports.SiteType = SiteType;
exports.TenderStatus = TenderStatus;
exports.CrawlStatus = CrawlStatus;
exports.buildSearchText = buildSearchText;
exports.computeContentHash = computeContentHash;
exports.normalizeTitle = normalizeTitle;