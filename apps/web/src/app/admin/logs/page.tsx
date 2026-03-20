'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, activityApi } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

const ACTION_COLORS: Record<string, string> = {
  WORKFLOW_ENTERED: '#06b6d4',
  STAGE_CHANGED: '#818cf8',
  STAGE_ASSIGNED: '#22d3ee',
  STAGE_REASSIGNED: '#fb923c',
  STAGE_STARTED: '#facc15',
  STAGE_COMPLETED: '#4ade80',
  TENDER_REJECTED: '#ef4444',
  NOTE_ADDED: '#c084fc',
  TENDER_VIEWED: '#94a3b8',
  SEARCH_PERFORMED: '#94a3b8',
  REPORT_GENERATED: '#34d399',
};

export default function AdminLogsPage() {
  const router = useRouter();
  const user = getUser();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await activityApi.all(p);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setPage(p);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'ADMIN') { router.replace('/login'); return; }
    loadLogs(1);
  }, [router, user?.role, loadLogs]);

  const filteredItems = filterAction
    ? (data.items || []).filter((a: any) => a.actionType === filterAction)
    : (data.items || []);

  const actionTypes: string[] = Array.from(
    new Set((data.items || []).map((a: any) => a.actionType as string))
  );
  const totalPages = Math.ceil((data.total || 0) / 50);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Activity Logs</h1>
          <p className="text-gray-500 text-sm mt-1">All user actions across the platform — {data.total || 0} total events</p>
        </div>

        {/* Filter by action type */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilterAction('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !filterAction ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {actionTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterAction(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filterAction === type ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Logs table */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">User</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Action</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Tender</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((a: any) => {
                const color = ACTION_COLORS[a.actionType] || '#666';
                return (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {(a.user?.email || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-300 truncate max-w-[140px]">
                          {a.user?.profile?.fullName || a.user?.email || 'System'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: `${color}15`, color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {a.actionType.replace(/_/g, ' ')}
                      </span>
                      {a.stage && (
                        <span className="text-xs text-gray-600 ml-1">
                          ({a.stage.replace(/_/g, ' ')})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.tender?.title ? (
                        <span
                          className="text-sm text-gray-400 hover:text-cyan-400 cursor-pointer truncate block max-w-[200px]"
                          onClick={() => router.push(`/tenders/${a.tender.id}`)}
                        >
                          {a.tender.title}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {a.fromValue && a.toValue && (
                        <span>{String(a.fromValue).replace(/_/g, ' ')} → {String(a.toValue).replace(/_/g, ' ')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading && <div className="p-8 text-center text-gray-500 animate-pulse">Loading...</div>}
          {!loading && filteredItems.length === 0 && (
            <div className="p-8 text-center text-gray-500">No activity logs found</div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-3 mt-6">
            <button onClick={() => loadLogs(page - 1)} disabled={page <= 1}
              className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30 hover:bg-white/10 transition">Previous</button>
            <span className="px-4 py-2 text-sm text-gray-400">Page {page} of {totalPages}</span>
            <button onClick={() => loadLogs(page + 1)} disabled={page >= totalPages}
              className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30 hover:bg-white/10 transition">Next</button>
          </div>
        )}
      </main>
    </div>
  );
}