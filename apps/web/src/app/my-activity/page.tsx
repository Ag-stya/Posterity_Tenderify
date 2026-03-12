'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, activityApi } from '../lib/api';
import Sidebar from '../components/Sidebar';

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  WORKFLOW_ENTERED: { icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z', color: '#06b6d4' },
  STAGE_CHANGED: { icon: 'M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z', color: '#818cf8' },
  STAGE_ASSIGNED: { icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', color: '#22d3ee' },
  STAGE_REASSIGNED: { icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: '#fb923c' },
  STAGE_STARTED: { icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z', color: '#facc15' },
  STAGE_COMPLETED: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#4ade80' },
  TENDER_REJECTED: { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#ef4444' },
  NOTE_ADDED: { icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', color: '#c084fc' },
};

export default function MyActivityPage() {
  const router = useRouter();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await activityApi.me();
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setPage(p);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadActivity(1);
  }, [router, loadActivity]);

  const totalPages = Math.ceil((data.total || 0) / 50);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Activity</h1>
          <p className="text-gray-500 text-sm mt-1">
            Full timeline of your actions across all tenders — {data.total || 0} total events
          </p>
        </div>

        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="space-y-4">
            {data.items?.map((a: any, idx: number) => {
              const actionInfo = ACTION_ICONS[a.actionType] || { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: '#666' };
              return (
                <div key={a.id} className="flex items-start gap-3 pb-4 border-b border-white/5 last:border-0">
                  <div className="mt-0.5 flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${actionInfo.color}15` }}>
                      <svg className="w-4 h-4" style={{ color: actionInfo.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={actionInfo.icon} />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">
                      <span className="font-medium" style={{ color: actionInfo.color }}>
                        {a.actionType.replace(/_/g, ' ')}
                      </span>
                      {a.stage && (
                        <span className="text-gray-400"> — {a.stage.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                    {a.tender?.title && (
                      <div
                        className="text-sm text-gray-400 hover:text-white cursor-pointer mt-1 truncate"
                        onClick={() => router.push(`/tenders/${a.tender.id}`)}
                      >
                        {a.tender.title}
                      </div>
                    )}
                    {a.fromValue && a.toValue && (
                      <div className="text-xs text-gray-600 mt-1">
                        {a.fromValue.replace(/_/g, ' ')} → {a.toValue.replace(/_/g, ' ')}
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-1">
                      {new Date(a.createdAt).toLocaleString('en-IN', {
                        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {data.items?.length === 0 && !loading && (
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-300 mb-2">No activity yet</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Your actions will appear here as you work with tenders — entering workflows,
                  moving stages, adding notes, completing assignments, and more.
                </p>
              </div>
            )}

            {loading && <div className="text-center py-8 text-gray-500 animate-pulse">Loading...</div>}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-white/5">
              <button onClick={() => loadActivity(page - 1)} disabled={page <= 1}
                className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30 hover:bg-white/10 transition">
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-400">Page {page} of {totalPages}</span>
              <button onClick={() => loadActivity(page + 1)} disabled={page >= totalPages}
                className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30 hover:bg-white/10 transition">
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}