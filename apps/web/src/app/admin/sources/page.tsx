'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, isAuthenticated, getUser, logout } from '../../lib/api';

interface SourceSite {
  id: string;
  key: string;
  name: string;
  baseUrl: string;
  type: string;
  enabled: boolean;
  crawlIntervalMinutes: number;
  rateLimitPerMinute: number;
}

export default function AdminSourcesPage() {
  const router = useRouter();
  const user = getUser();
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    if (user?.role !== 'ADMIN') {
      router.replace('/search');
      return;
    }
    fetchSites();
  }, [router, user?.role]);

  const fetchSites = async () => {
    try {
      const res = await apiFetch('/admin/source-sites');
      if (res.ok) {
        setSites(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSite = async (id: string, currentlyEnabled: boolean) => {
    setToggling(id);
    try {
      const action = currentlyEnabled ? 'disable' : 'enable';
      const res = await apiFetch(`/admin/source-sites/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        setSites(prev =>
          prev.map(s => s.id === id ? { ...s, enabled: !currentlyEnabled } : s)
        );
      }
    } catch (err) {
      console.error('Failed to toggle site:', err);
    } finally {
      setToggling(null);
    }
  };

  const enabledCount = sites.filter(s => s.enabled).length;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/search')} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">Source Sites Management</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{enabledCount} enabled / {sites.length} total</span>
            <button onClick={() => { logout(); router.replace('/login'); }} className="text-sm text-red-600">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading sites...</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Key</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">URL</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Interval</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sites.map((site) => (
                  <tr key={site.id} className={`${site.enabled ? 'bg-green-50/30' : ''} hover:bg-gray-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        site.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {site.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{site.key}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-50 text-brand-700">
                        {site.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[300px] truncate">
                      <a href={site.baseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 underline">
                        {site.baseUrl}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{site.crawlIntervalMinutes}m</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleSite(site.id, site.enabled)}
                        disabled={toggling === site.id}
                        className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
                          site.enabled
                            ? 'text-red-600 hover:bg-red-50 border border-red-200'
                            : 'text-green-600 hover:bg-green-50 border border-green-200'
                        } disabled:opacity-50`}
                      >
                        {toggling === site.id ? '...' : site.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Enabling a site will start crawling it every {sites[0]?.crawlIntervalMinutes || 10} minutes.
            Only enable sites whose connector is implemented (NIC_GEP sites are supported).
            CPPP, NPROCURE, and IREPS connectors are stubs — enabling them will result in empty crawl runs.
          </p>
        </div>
      </main>
    </div>
  );
}
