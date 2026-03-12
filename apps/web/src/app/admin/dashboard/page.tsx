'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, dashboardApi } from '../../lib/api';
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

export default function AdminDashboardPage() {
  const router = useRouter();
  const user = getUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'ADMIN') { router.replace('/login'); return; }

    const load = async () => {
      try {
        const res = await dashboardApi.adminOverview();
        if (res.ok) setData(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [router, user?.role]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-cyan-400 animate-pulse">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tenders', value: data.totalTenders, color: '#06b6d4' },
            { label: 'In Workflow', value: data.activeInWorkflow, color: '#818cf8' },
            { label: 'Rejected', value: data.rejectedCount, color: '#ef4444' },
            { label: 'Week Score', value: data.weekProductivity?.weightedScore || 0, color: '#4ade80' },
          ].map((m) => (
            <div key={m.label} className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-xl p-5">
              <div className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</div>
              <div className="text-sm text-gray-400 mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Stage distribution */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Pipeline Distribution</h3>
            <div className="space-y-2">
              {(data.stageDistribution || []).map((s: any) => {
                const info = STAGE_LABELS[s.stage] || { label: s.stage, color: '#666' };
                const maxCount = Math.max(...(data.stageDistribution || []).map((x: any) => x.count), 1);
                return (
                  <div key={s.stage} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-400 truncate">{info.label}</div>
                    <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(s.count / maxCount) * 100}%`, background: info.color }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-medium">{s.count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User scores */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">User Performance (This Week)</h3>
            <div className="space-y-3">
              {(data.userScores || []).map((u: any, i: number) => (
                <div key={u.userId} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-gray-500'
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.fullName || u.email}</div>
                    <div className="text-xs text-gray-500">{u.totalActions} actions · {u.stagesCompleted} stages</div>
                  </div>
                  <div className="text-lg font-bold text-cyan-400">{u.weightedScore}</div>
                </div>
              ))}
              {(data.userScores || []).length === 0 && <p className="text-gray-500 text-sm">No data</p>}
            </div>
          </div>
        </div>

        {/* Upcoming deadlines & Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Upcoming Deadlines (7 days)</h3>
            <div className="space-y-2">
              {(data.upcomingDeadlines || []).map((t: any) => (
                <div key={t.id} onClick={() => router.push(`/tenders/${t.id}`)}
                  className="p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {t.deadlineAt && new Date(t.deadlineAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {t.workflow?.currentStage && ` · ${STAGE_LABELS[t.workflow.currentStage]?.label}`}
                  </div>
                </div>
              ))}
              {(data.upcomingDeadlines || []).length === 0 && <p className="text-gray-500 text-sm">None upcoming</p>}
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Recent Activity (All Users)</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(data.recentActivity || []).slice(0, 15).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                  <div>
                    <span className="text-gray-400">{a.user?.profile?.fullName || a.user?.email}</span>
                    <span className="text-gray-500"> {a.actionType.replace(/_/g, ' ').toLowerCase()}</span>
                    <div className="text-xs text-gray-600">
                      {new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
