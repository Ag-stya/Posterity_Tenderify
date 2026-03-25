'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, isAuthenticated, getUser, logout, workflowApi } from '../lib/api';

interface SourceSite {
  id: string;
  name: string;
  key: string;
}

interface TenderResult {
  id: string;
  title: string;
  organization: string | null;
  publishedAt: string | null;
  deadlineAt: string | null;
  location: string | null;
  estimatedValue: string | null;
  sourceSite: SourceSite;
  sourceUrl: string;
  status: string;
  score?: number;
  isRejected?: boolean;
  rejectionInfo?: { rejectedBy: string; reason: string; failedAtStage: string } | null;
  alsoSeenOn: Array<{ sourceSite: { name: string }; sourceUrl: string }>;
}

interface StatusData {
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
  sites: Array<{
    id: string;
    name: string;
    key: string;
    enabled: boolean;
    lastSuccessAt: string | null;
    currentStatus: string;
  }>;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  TENDER_IDENTIFICATION: { label: 'Identification', color: '#06b6d4' },
  DUE_DILIGENCE: { label: 'Due Diligence', color: '#22d3ee' },
  PRE_BID_MEETING: { label: 'Pre-Bid Meeting', color: '#34d399' },
  TENDER_FILING: { label: 'Tender Filing', color: '#a3e635' },
  TECH_EVALUATION: { label: 'Tech Eval', color: '#facc15' },
  PRESENTATION_STAGE: { label: 'Presentation', color: '#fb923c' },
  FINANCIAL_EVALUATION: { label: 'Financial Eval', color: '#f87171' },
  CONTRACT_AWARD: { label: 'Contract Award', color: '#c084fc' },
  PROJECT_INITIATED: { label: 'Project Init', color: '#818cf8' },
  PROJECT_COMPLETED: { label: 'Completed', color: '#4ade80' },
  REJECTED: { label: 'Rejected', color: '#ef4444' },
};

export default function SearchPage() {
  const router = useRouter();
  const user = getUser();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenderResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searching, setSearching] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<string>('relevance');

  const [workflowMap, setWorkflowMap] = useState<Record<string, { currentStage: string; isRejected: boolean }>>({});

  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [publishedFrom, setPublishedFrom] = useState('');
  const [publishedTo, setPublishedTo] = useState('');
  const [closingSoonDays, setClosingSoonDays] = useState('');
  const [location, setLocation] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [status, setStatus] = useState<StatusData | null>(null);
  const [availableSites, setAvailableSites] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); }
  }, [router]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setAvailableSites(data.sites.filter((s: any) => s.enabled).map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const fetchWorkflowOverlay = useCallback(async (tenderIds: string[]) => {
    const map: Record<string, { currentStage: string; isRejected: boolean }> = {};
    await Promise.all(
      tenderIds.map(async (id) => {
        try {
          const res = await apiFetch(`/workflow/tenders/${id}`);
          if (res.ok) {
            const data = await res.json();
            map[id] = { currentStage: data.currentStage, isRejected: data.isRejected };
          }
        } catch {}
      })
    );
    setWorkflowMap(map);
  }, []);

  const doSearch = useCallback(async (p: number = 1) => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (selectedSites.length > 0) params.set('sourceSiteIds', selectedSites.join(','));
      if (publishedFrom) params.set('publishedFrom', publishedFrom);
      if (publishedTo) params.set('publishedTo', publishedTo);
      if (closingSoonDays) params.set('closingSoonDays', closingSoonDays);
      if (location.trim()) params.set('location', location.trim());
      if (sortBy !== 'relevance') params.set('sort', sortBy);
      params.set('page', String(p));
      params.set('pageSize', String(pageSize));

      const res = await apiFetch(`/tenders/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items);
        setTotal(data.total);
        setPage(p);
        if (data.items.length > 0) {
          fetchWorkflowOverlay(data.items.map((t: any) => t.id));
        } else {
          setWorkflowMap({});
        }
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
      setInitialLoad(false);
    }
  }, [query, selectedSites, publishedFrom, publishedTo, closingSoonDays, location, sortBy, pageSize, fetchWorkflowOverlay]);

  useEffect(() => { doSearch(1); }, []); // eslint-disable-line

  const handleSearch = (e: FormEvent) => { e.preventDefault(); doSearch(1); };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (selectedSites.length > 0) params.set('sourceSiteIds', selectedSites.join(','));
      if (publishedFrom) params.set('publishedFrom', publishedFrom);
      if (publishedTo) params.set('publishedTo', publishedTo);
      if (closingSoonDays) params.set('closingSoonDays', closingSoonDays);
      if (location.trim()) params.set('location', location.trim());
      if (sortBy !== 'relevance') params.set('sort', sortBy);
      params.set('page', '1');
      params.set('pageSize', '500');

      const res = await apiFetch(`/tenders/search?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: TenderResult[] = data.items;

      const headers = ['Title', 'Organization', 'Published', 'Deadline', 'Location', 'Est. Value', 'Source', 'Status', 'URL'];
      const rows = items.map(t => [
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.organization || '').replace(/"/g, '""')}"`,
        t.publishedAt ? new Date(t.publishedAt).toLocaleDateString('en-IN') : '',
        t.deadlineAt ? new Date(t.deadlineAt).toLocaleDateString('en-IN') : '',
        `"${(t.location || '').replace(/"/g, '""')}"`,
        `"${(t.estimatedValue || '').replace(/"/g, '""')}"`,
        t.sourceSite.name,
        t.status,
        t.sourceUrl,
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenderwatch-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => { logout(); router.replace('/login'); };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const timeAgo = (iso: string | null) => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getDeadlineBadge = (deadlineAt: string | null) => {
    if (!deadlineAt) return null;
    const daysLeft = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return <span className="text-xs text-red-400 font-medium">Expired</span>;
    if (daysLeft <= 3) return <span className="text-xs text-red-400 font-medium">{daysLeft}d left</span>;
    if (daysLeft <= 7) return <span className="text-xs text-amber-400 font-medium">{daysLeft}d left</span>;
    return <span className="text-xs text-gray-500">{daysLeft}d left</span>;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push('/dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white">TenderWatch</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {status?.isRefreshing && (
              <div className="flex items-center gap-1.5 text-cyan-400">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="font-medium">Refreshing…</span>
              </div>
            )}
            <span className="text-gray-500">Updated: {timeAgo(status?.lastUpdatedAt ?? null)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/tenders/add-external')} className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">+ Add Tender</button>
            {user?.role === 'ADMIN' && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">Admin</span>}
            <span className="text-sm text-gray-400">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder='Search tenders... (e.g. "defence", "IT infrastructure", "road construction")'
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition" />
            </div>
            <button type="submit" disabled={searching}
              className="px-6 py-3 bg-cyan-500 text-gray-950 rounded-lg font-semibold hover:bg-cyan-400 transition disabled:opacity-50">
              {searching ? 'Searching...' : 'Search'}
            </button>
            <button type="button" onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-3 rounded-lg border transition ${showFilters ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>
        </form>

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Source Sites</label>
                <select multiple value={selectedSites} onChange={(e) => setSelectedSites(Array.from(e.target.selectedOptions, o => o.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 h-24 text-sm text-white focus:border-cyan-500 focus:outline-none">
                  {availableSites.map(s => <option key={s.id} value={s.id} className="bg-gray-900 text-white">{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Published From</label>
                <input type="date" value={publishedFrom} onChange={e => setPublishedFrom(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none" />
                <label className="block text-xs font-medium text-gray-400 mb-1 mt-2">Published To</label>
                <input type="date" value={publishedTo} onChange={e => setPublishedTo(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Closing Soon</label>
                <select value={closingSoonDays} onChange={e => setClosingSoonDays(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none">
                  <option value="" className="bg-gray-900">Any deadline</option>
                  <option value="3" className="bg-gray-900">Within 3 days</option>
                  <option value="7" className="bg-gray-900">Within 7 days</option>
                  <option value="14" className="bg-gray-900">Within 14 days</option>
                  <option value="30" className="bg-gray-900">Within 30 days</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Jharkhand, Delhi"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => doSearch(1)} className="px-4 py-2 bg-cyan-500 text-gray-950 rounded-lg text-sm font-semibold hover:bg-cyan-400 transition">Apply Filters</button>
              <button onClick={() => { setSelectedSites([]); setPublishedFrom(''); setPublishedTo(''); setClosingSoonDays(''); setLocation(''); }}
                className="px-4 py-2 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:text-white hover:border-white/20 transition">Clear</button>
            </div>
          </div>
        )}

        {/* Results count + Sort + Export */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {initialLoad ? 'Loading...' : `${total} tenders found`}
            {query && <span className="text-gray-600"> for &quot;{query}&quot;</span>}
          </p>
          <div className="flex items-center gap-3">
            <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setTimeout(() => doSearch(1), 0); }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:border-cyan-500 focus:outline-none">
              <option value="relevance" className="bg-gray-900">Sort: Relevance</option>
              <option value="deadline" className="bg-gray-900">Sort: Deadline (soonest)</option>
              <option value="published" className="bg-gray-900">Sort: Published (newest)</option>
            </select>
            {total > 0 && (
              <button onClick={handleExportCSV} disabled={exporting}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Exporting...' : `Export CSV (${Math.min(total, 500)})`}
              </button>
            )}
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Org/Dept</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Published</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Deadline</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Est. Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Workflow</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((tender) => {
                  const wf = workflowMap[tender.id];
                  const stageInfo = wf ? STAGE_LABELS[wf.currentStage] : null;
                  const rejected = tender.isRejected || wf?.isRejected;

                  return (
                    <tr key={tender.id} className={`hover:bg-white/5 transition-colors ${rejected ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 max-w-xs">
                        <span onClick={() => router.push(`/tenders/${tender.id}`)}
                          className={`text-cyan-400 hover:text-cyan-300 font-medium hover:underline line-clamp-2 cursor-pointer ${rejected ? 'line-through decoration-red-500/50' : ''}`}>
                          {tender.title}
                        </span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${tender.status === 'OPEN' ? 'bg-green-500/20 text-green-400' : tender.status === 'CLOSED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>{tender.status}</span>
                        {rejected && (
                          <div className="mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                              Rejected{tender.rejectionInfo?.rejectedBy ? ` by ${tender.rejectionInfo.rejectedBy}` : ''}
                            </span>
                          </div>
                        )}
                        {tender.alsoSeenOn.length > 0 && (
                          <div className="mt-1 text-xs text-gray-600">Also on: {tender.alsoSeenOn.map((dup, i) => (
                            <span key={i}><a href={dup.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-cyan-400 underline">{dup.sourceSite.name}</a>{i < tender.alsoSeenOn.length - 1 && ', '}</span>
                          ))}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{tender.organization || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(tender.publishedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-gray-400">{formatDate(tender.deadlineAt)}</div>
                        {getDeadlineBadge(tender.deadlineAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{tender.location || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{tender.estimatedValue || '—'}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/5 text-gray-400 border border-white/10">{tender.sourceSite.name}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {rejected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Rejected
                          </span>
                        ) : wf ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:brightness-110 transition"
                            style={{ background: `${stageInfo?.color || '#666'}20`, color: stageInfo?.color || '#666' }}
                            onClick={() => router.push(`/tenders/${tender.id}`)} title="Click to view workflow">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageInfo?.color || '#666' }} />
                            {stageInfo?.label || wf.currentStage}
                          </span>
                        ) : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <a href={tender.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {results.length === 0 && !searching && !initialLoad && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    No tenders found. Try a different search or adjust filters.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} results)</p>
              <div className="flex gap-2">
                <button onClick={() => doSearch(page - 1)} disabled={page <= 1} className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:text-white transition disabled:opacity-30">Previous</button>
                <button onClick={() => doSearch(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:text-white transition disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}