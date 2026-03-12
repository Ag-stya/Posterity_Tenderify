'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, workflowApi } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  TENDER_IDENTIFICATION: { label: 'Identification', color: '#06b6d4' },
  DUE_DILIGENCE: { label: 'Due Diligence', color: '#22d3ee' },
  PRE_BID_MEETING: { label: 'Pre-Bid Meeting', color: '#34d399' },
  TENDER_FILING: { label: 'Tender Filing', color: '#a3e635' },
  TECH_EVALUATION: { label: 'Tech Evaluation', color: '#facc15' },
  PRESENTATION_STAGE: { label: 'Presentation', color: '#fb923c' },
  FINANCIAL_EVALUATION: { label: 'Financial Eval', color: '#f87171' },
  CONTRACT_AWARD: { label: 'Contract Award', color: '#c084fc' },
  PROJECT_INITIATED: { label: 'Project Init', color: '#818cf8' },
  PROJECT_COMPLETED: { label: 'Completed', color: '#4ade80' },
  REJECTED: { label: 'Rejected', color: '#ef4444' },
};

export default function AdminTendersPage() {
  const router = useRouter();
  const user = getUser();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [stageFilter, setStageFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'ADMIN') { router.replace('/login'); return; }
    loadTenders();
  }, [stageFilter, page]); // eslint-disable-line

  const loadTenders = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: '20' };
      if (stageFilter) params.stage = stageFilter;
      const res = await workflowApi.list(params);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const stages = Object.keys(STAGE_LABELS);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">All Workflow Tenders</h1>
          <div className="text-sm text-gray-400">{data.total} total</div>
        </div>

        {/* Stage filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => { setStageFilter(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !stageFilter ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            All
          </button>
          {stages.map((s) => (
            <button key={s} onClick={() => { setStageFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                stageFilter === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {STAGE_LABELS[s].label}
            </button>
          ))}
        </div>

        {/* Tenders list */}
        <div className="space-y-2">
          {data.items?.map((wf: any) => {
            const info = STAGE_LABELS[wf.currentStage] || { label: wf.currentStage, color: '#666' };
            return (
              <div key={wf.id}
                onClick={() => router.push(`/tenders/${wf.tenderId}`)}
                className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:border-white/20 cursor-pointer transition">
                <div className="w-1 h-12 rounded-full" style={{ background: info.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{wf.tender?.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {wf.tender?.organization} · {wf.tender?.sourceSite?.name}
                  </div>
                </div>
                <div className="text-xs px-3 py-1 rounded-full font-medium"
                  style={{ background: `${info.color}20`, color: info.color }}>
                  {wf.isRejected ? 'REJECTED' : info.label}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(wf.lastUpdatedAt).toLocaleDateString('en-IN')}
                </div>
              </div>
            );
          })}
          {loading && <div className="text-center py-12 text-gray-500 animate-pulse">Loading...</div>}
          {!loading && data.items?.length === 0 && (
            <div className="text-center py-12 text-gray-500">No tenders in workflow</div>
          )}
        </div>

        {/* Pagination */}
        {data.total > 20 && (
          <div className="flex justify-center gap-3 mt-6">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30">Previous</button>
            <span className="px-4 py-2 text-sm text-gray-400">Page {page}</span>
            <button onClick={() => setPage(page + 1)} disabled={page * 20 >= data.total}
              className="px-4 py-2 bg-white/5 rounded-lg text-sm disabled:opacity-30">Next</button>
          </div>
        )}
      </main>
    </div>
  );
}
