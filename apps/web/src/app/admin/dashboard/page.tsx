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

  const scrapingTrend = data.scrapingTrend || [];
  const crawlHealth = data.crawlHealth || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total Tenders', value: data.totalTenders || 0, color: '#06b6d4' },
            { label: 'In Workflow', value: data.activeInWorkflow || 0, color: '#818cf8' },
            { label: 'Rejected', value: data.rejectedCount || 0, color: '#ef4444' },
            { label: 'Closing This Week', value: data.closingThisWeek || 0, color: '#f87171' },
            { label: 'Week Score (Org)', value: data.weekProductivity?.weightedScore || 0, color: '#4ade80' },
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
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(s.count / maxCount) * 100}%`, background: info.color }} />
                    </div>
                    <div className="w-8 text-right text-sm font-medium">{s.count}</div>
                  </div>
                );
              })}
              {(data.stageDistribution || []).length === 0 && <p className="text-gray-500 text-sm">No tenders in workflow yet</p>}
            </div>
          </div>

          {/* User scores */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">User Performance (This Week)</h3>
            <div className="space-y-3">
              {(data.userScores || []).map((u: any, i: number) => (
                <div key={u.userId} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-gray-500'
                  }`}>{u.rank || i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.fullName || u.email}</div>
                    <div className="text-xs text-gray-500">{u.totalActions} actions · {u.stagesCompleted} stages</div>
                  </div>
                  <div className="text-lg font-bold text-cyan-400">{u.weightedScore}</div>
                </div>
              ))}
              {(data.userScores || []).length === 0 && (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm">No productivity data yet this week</p>
                  <p className="text-gray-600 text-xs mt-1">Scores populate as team members work on tenders — move stages, add notes, complete assignments</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scraping Trend */}
        {scrapingTrend.length > 0 && (
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold mb-4">Tenders Scraped (7-Day Trend)</h3>
            <div className="flex items-end gap-3 h-28">
              {scrapingTrend.map((d: any) => {
                const maxCount = Math.max(...scrapingTrend.map((x: any) => x.count), 1);
                const height = Math.max((d.count / maxCount) * 100, 4);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-gray-400 font-medium">{d.count}</div>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/60 to-cyan-400/30 transition-all" style={{ height: `${height}%` }} />
                    <div className="text-[10px] text-gray-600">{d.date.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming deadlines + Crawl Health + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Upcoming Deadlines (7 days)</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {(data.upcomingDeadlines || []).map((t: any) => {
                const hoursLeft = t.deadlineAt ? Math.ceil((new Date(t.deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60)) : null;
                return (
                  <div key={t.id} onClick={() => router.push(`/tenders/${t.id}`)}
                    className="p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-xs text-gray-500">
                        {t.workflow?.currentStage && `${STAGE_LABELS[t.workflow.currentStage]?.label || t.workflow.currentStage}`}
                      </div>
                      {hoursLeft !== null && (
                        <span className={`text-xs font-bold ${hoursLeft <= 24 ? 'text-red-400' : hoursLeft <= 48 ? 'text-amber-400' : 'text-gray-400'}`}>
                          {hoursLeft}h left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {(data.upcomingDeadlines || []).length === 0 && <p className="text-gray-500 text-sm">No upcoming deadlines in workflow</p>}
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Crawl Health</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {crawlHealth.map((s: any) => (
                <div key={s.key} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5">
                  <div>
                    <div className="text-sm text-white">{s.name}</div>
                    <div className="text-[10px] text-gray-600">{s.lastItemsNew} new · {s.lastItemsFound} found</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.lastStatus === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : 
                    s.lastStatus === 'FAILED' ? 'bg-red-500/20 text-red-400' : 
                    'bg-gray-500/20 text-gray-400'}`}>{s.lastStatus}</span>
                </div>
              ))}
              {crawlHealth.length === 0 && <p className="text-gray-500 text-sm">No sources configured</p>}
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Recent Activity (All Users)</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {(data.recentActivity || []).slice(0, 15).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${a.actionType === 'TENDER_REJECTED' ? 'bg-red-400' : 'bg-cyan-400'}`} />
                  <div>
                    <span className="text-cyan-400 text-xs font-medium">{a.user?.profile?.fullName || a.user?.email?.split('@')[0] || 'System'} </span>
                    <span className="text-gray-500 text-xs">{a.actionType.replace(/_/g, ' ').toLowerCase()}</span>
                    {a.tender?.title && <div className="text-xs text-gray-600 truncate max-w-[200px]">{a.tender.title}</div>}
                    <div className="text-[10px] text-gray-700">{new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              {(data.recentActivity || []).length === 0 && <p className="text-gray-500 text-sm">No activity yet</p>}
            </div>
          </div>
        </div>

        {/* User Stats */}
        {data.userStats && (
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">User Stats</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-white/5">
                <div className="text-2xl font-bold text-white">{data.userStats.totalUsers}</div>
                <div className="text-xs text-gray-500 mt-1">Total Users</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-500/5">
                <div className="text-2xl font-bold text-green-400">{data.userStats.activeUsers}</div>
                <div className="text-xs text-gray-500 mt-1">Active</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-red-500/5">
                <div className="text-2xl font-bold text-red-400">{data.userStats.inactiveUsers}</div>
                <div className="text-xs text-gray-500 mt-1">Inactive</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}