'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, isAuthenticated, getUser, logout } from '../lib/api';

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

export default function SearchPage() {
  const router = useRouter();
  const user = getUser();

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenderResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searching, setSearching] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Filter state
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [publishedFrom, setPublishedFrom] = useState('');
  const [publishedTo, setPublishedTo] = useState('');
  const [closingSoonDays, setClosingSoonDays] = useState('');
  const [location, setLocation] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Status state
  const [status, setStatus] = useState<StatusData | null>(null);
  const [availableSites, setAvailableSites] = useState<Array<{ id: string; name: string }>>([]);

  // Auth check
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  // Fetch status every 10 seconds
  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setAvailableSites(
          data.sites
            .filter((s: any) => s.enabled)
            .map((s: any) => ({ id: s.id, name: s.name }))
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Search function
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
      params.set('page', String(p));
      params.set('pageSize', String(pageSize));

      const res = await apiFetch(`/tenders/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items);
        setTotal(data.total);
        setPage(p);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
      setInitialLoad(false);
    }
  }, [query, selectedSites, publishedFrom, publishedTo, closingSoonDays, location, pageSize]);

  // Load latest tenders on mount
  useEffect(() => {
    doSearch(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    doSearch(1);
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
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
    if (daysLeft < 0) return <span className="text-xs text-red-600 font-medium">Expired</span>;
    if (daysLeft <= 3) return <span className="text-xs text-red-600 font-medium">{daysLeft}d left</span>;
    if (daysLeft <= 7) return <span className="text-xs text-amber-600 font-medium">{daysLeft}d left</span>;
    return <span className="text-xs text-gray-500">{daysLeft}d left</span>;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">TenderWatch</h1>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 text-sm">
            {status?.isRefreshing && (
              <div className="flex items-center gap-1.5 text-brand-600">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="font-medium">Refreshing…</span>
              </div>
            )}
            <span className="text-gray-500">
              Updated: {timeAgo(status?.lastUpdatedAt ?? null)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => router.push('/admin/sources')}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Admin
              </button>
            )}
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-700">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search tenders... (e.g. "defence", "IT infrastructure", "road construction")'
                className="input-field pl-10 text-base"
              />
            </div>
            <button type="submit" disabled={searching} className="btn-primary px-6">
              {searching ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary ${showFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>
        </form>

        {/* Filters Panel */}
        {showFilters && (
          <div className="card p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Source sites multi-select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Sites</label>
                <select
                  multiple
                  value={selectedSites}
                  onChange={(e) => setSelectedSites(Array.from(e.target.selectedOptions, o => o.value))}
                  className="input-field h-24 text-sm"
                >
                  {availableSites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Published From</label>
                <input type="date" value={publishedFrom} onChange={e => setPublishedFrom(e.target.value)} className="input-field text-sm" />
                <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">Published To</label>
                <input type="date" value={publishedTo} onChange={e => setPublishedTo(e.target.value)} className="input-field text-sm" />
              </div>

              {/* Closing soon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Closing Soon</label>
                <select value={closingSoonDays} onChange={e => setClosingSoonDays(e.target.value)} className="input-field text-sm">
                  <option value="">Any deadline</option>
                  <option value="3">Within 3 days</option>
                  <option value="7">Within 7 days</option>
                  <option value="14">Within 14 days</option>
                  <option value="30">Within 30 days</option>
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Jharkhand, Delhi"
                  className="input-field text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => doSearch(1)} className="btn-primary text-sm">Apply Filters</button>
              <button
                onClick={() => {
                  setSelectedSites([]);
                  setPublishedFrom('');
                  setPublishedTo('');
                  setClosingSoonDays('');
                  setLocation('');
                }}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {initialLoad ? 'Loading...' : `${total} tenders found`}
            {query && <span className="text-gray-400"> for "{query}"</span>}
          </p>
        </div>

        {/* Results Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Org/Dept</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Published</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Deadline</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Est. Value</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Source</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((tender) => (
                  <tr key={tender.id} className="hover:bg-brand-50/30 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <a
                        href={tender.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 hover:text-brand-900 font-medium hover:underline line-clamp-2"
                      >
                        {tender.title}
                      </a>
                      {/* Status badge */}
                      <span className={`ml-2 ${
                        tender.status === 'OPEN' ? 'badge-open' :
                        tender.status === 'CLOSED' ? 'badge-closed' : 'badge-unknown'
                      }`}>
                        {tender.status}
                      </span>
                      {/* Also seen on */}
                      {tender.alsoSeenOn.length > 0 && (
                        <div className="mt-1 text-xs text-gray-400">
                          Also seen on:{' '}
                          {tender.alsoSeenOn.map((dup, i) => (
                            <span key={i}>
                              <a href={dup.sourceUrl} target="_blank" rel="noopener noreferrer"
                                className="text-gray-500 hover:text-brand-600 underline">
                                {dup.sourceSite.name}
                              </a>
                              {i < tender.alsoSeenOn.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{tender.organization || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(tender.publishedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>{formatDate(tender.deadlineAt)}</div>
                      {getDeadlineBadge(tender.deadlineAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{tender.location || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{tender.estimatedValue || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {tender.sourceSite.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={tender.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-800"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                ))}

                {results.length === 0 && !searching && !initialLoad && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      No tenders found. Try a different search or adjust filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} results)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => doSearch(page - 1)}
                  disabled={page <= 1}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => doSearch(page + 1)}
                  disabled={page >= totalPages}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
