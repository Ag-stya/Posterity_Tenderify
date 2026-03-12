'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, stageApi } from '../lib/api';
import Sidebar from '../components/Sidebar';

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
};

export default function MyStageWorkPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('ASSIGNED');
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadAssignments();
  }, [filter]); // eslint-disable-line

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const res = await stageApi.myAssignments({ status: filter, pageSize: '50' });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateStatus = async (tenderId: string, stage: string, status: string) => {
    const res = await stageApi.updateStatus(tenderId, stage, status);
    if (res.ok) loadAssignments();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Stage Work</h1>
          <p className="text-gray-500 text-sm mt-1">Stages assigned to you across all tenders in the workflow</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {data.items?.map((a: any) => {
            const info = STAGE_LABELS[a.stage] || { label: a.stage, color: '#666' };
            return (
              <div key={a.id} className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex items-center gap-4">
                <div className="w-1 h-12 rounded-full" style={{ background: info.color }} />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium text-white hover:text-cyan-400 cursor-pointer truncate"
                    onClick={() => router.push(`/tenders/${a.tenderId}`)}
                  >
                    {a.tender?.title || 'Tender'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Stage: {info.label} · Status: {a.assignmentStatus}
                    {a.tender?.deadlineAt && ` · Deadline: ${new Date(a.tender.deadlineAt).toLocaleDateString('en-IN')}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.assignmentStatus === 'ASSIGNED' && (
                    <button onClick={() => updateStatus(a.tenderId, a.stage, 'IN_PROGRESS')}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition">
                      Start
                    </button>
                  )}
                  {a.assignmentStatus === 'IN_PROGRESS' && (
                    <button onClick={() => updateStatus(a.tenderId, a.stage, 'COMPLETED')}
                      className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/30 transition">
                      Complete
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {data.items?.length === 0 && !loading && (
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">
                No {filter.toLowerCase().replace('_', ' ')} assignments
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                When an admin or team member assigns you to a specific stage of a tender,
                it will appear here. You can then <strong className="text-gray-400">Start</strong> work
                on it and mark it as <strong className="text-gray-400">Complete</strong> when done.
              </p>
              <div className="mt-4 text-xs text-gray-600">
                How it works: Search → Open Tender → Stage Assignments → Assign a user to a stage
              </div>
            </div>
          )}

          {loading && <div className="text-center py-12 text-gray-500 animate-pulse">Loading...</div>}
        </div>
      </main>
    </div>
  );
}