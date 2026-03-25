'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, dashboardApi, getUser, apiFetch } from '../lib/api';
import Sidebar from '../components/Sidebar';

const STAGE_LABELS: Record<string, { label: string; color: string; short: string }> = {
  TENDER_IDENTIFICATION: { label: 'Identification', color: '#06b6d4', short: 'ID' },
  DUE_DILIGENCE: { label: 'Due Diligence', color: '#22d3ee', short: 'DD' },
  PRE_BID_MEETING: { label: 'Pre-Bid Meeting', color: '#34d399', short: 'PBM' },
  TENDER_FILING: { label: 'Tender Filing', color: '#a3e635', short: 'TF' },
  TECH_EVALUATION: { label: 'Tech Evaluation', color: '#facc15', short: 'TE' },
  PRESENTATION_STAGE: { label: 'Presentation', color: '#fb923c', short: 'PS' },
  FINANCIAL_EVALUATION: { label: 'Financial Eval', color: '#f87171', short: 'FE' },
  CONTRACT_AWARD: { label: 'Contract Award', color: '#c084fc', short: 'CA' },
  PROJECT_INITIATED: { label: 'Project Init', color: '#818cf8', short: 'PI' },
  PROJECT_COMPLETED: { label: 'Completed', color: '#4ade80', short: 'PC' },
  REJECTED: { label: 'Rejected', color: '#ef4444', short: 'RJ' },
};

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;
    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number; color: string }> = [];
    const colors = ['#06b6d4', '#818cf8', '#c084fc', '#22d3ee', '#4ade80'];
    const resize = () => { canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); };
    resize(); window.addEventListener('resize', resize);
    for (let i = 0; i < 50; i++) {
      particles.push({ x: Math.random() * canvas.offsetWidth, y: Math.random() * canvas.offsetHeight, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.4 + 0.1, color: colors[Math.floor(Math.random() * colors.length)] });
    }
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1; if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.globalAlpha = p.opacity; ctx.fill(); }
      ctx.globalAlpha = 0.05; ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) { for (let j = i + 1; j < particles.length; j++) { const dx = particles[i].x - particles[j].x; const dy = particles[i].y - particles[j].y; if (Math.sqrt(dx * dx + dy * dy) < 100) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke(); } } }
      ctx.globalAlpha = 1; animationId = requestAnimationFrame(animate);
    };
    animate();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.5 }} />;
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) {
  return (
    <div className="relative bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden hover:border-white/20 transition-all">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 -translate-y-6 translate-x-6" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <svg className="w-4 h-4" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-xs text-gray-400">{label}</div>
        </div>
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-1 ml-12">{sub}</div>}
    </div>
  );
}

function PipelineBar({ stages }: { stages: Array<{ stage: string; count: number }> }) {
  const total = stages.reduce((s, c) => s + c.count, 0) || 1;
  const sorted = Object.keys(STAGE_LABELS).filter(k => k !== 'REJECTED').map(key => {
    const found = stages.find(s => s.stage === key);
    return { stage: key, count: found?.count || 0, ...STAGE_LABELS[key] };
  });
  return (
    <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
      <h3 className="text-white font-semibold mb-3 text-sm">Pipeline Distribution</h3>
      <div className="flex rounded-xl overflow-hidden h-7 mb-3">
        {sorted.map(s => (
          <div key={s.stage} style={{ width: `${Math.max((s.count / total) * 100, s.count > 0 ? 3 : 0)}%`, background: s.color }}
            className="relative group cursor-pointer transition-all hover:brightness-110" title={`${s.label}: ${s.count}`}>
            {s.count > 0 && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">{s.count}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {sorted.map(s => (
          <div key={s.stage} className="flex items-center gap-1 text-[11px] text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="truncate">{s.short}</span>
            <span className="text-white font-medium ml-auto">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const [dashboard, setDashboard] = useState<any>(null);
  const [adminExtras, setAdminExtras] = useState<any>(null);
  const [activityScope, setActivityScope] = useState<'my' | 'all'>('my');
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [router]); // eslint-disable-line

  const loadAll = async () => {
    try {
      const dashRes = await dashboardApi.me();
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (isAdmin) {
        const extRes = await dashboardApi.adminExtras().catch(() => null);
        if (extRes?.ok) setAdminExtras(await extRes.json());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const res = await dashboardApi.activityFeed(activityScope, 15);
        if (res.ok) setActivityFeed(await res.json());
      } catch {}
    };
    if (!loading) loadActivity();
  }, [activityScope, loading]);

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-cyan-400 animate-pulse text-lg">Loading dashboard...</div></div>;
  }

  const g = dashboard?.globalStats || {};
  const pipeline = dashboard?.globalPipeline || { stages: [], rejectedCount: 0 };
  const leaderboard = dashboard?.globalLeaderboard || [];
  const scores = dashboard?.scores || { today: {}, week: {}, month: {} };
  const assignments = dashboard?.activeAssignments || [];
  const staleTenders = dashboard?.staleTenders || [];
  const filingAlerts = dashboard?.filingAlerts || [];
  const scrapingTrend = adminExtras?.scrapingTrend || [];
  const crawlHealth = adminExtras?.crawlHealth || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 min-h-screen relative">
        <div className="fixed inset-0 ml-64 pointer-events-none"><ParticleCanvas /></div>
        <div className="relative z-10 p-8">

          {/* Header */}
          <div className="mb-6">
            <div className="text-sm text-cyan-400 font-medium tracking-wider uppercase mb-1">Welcome back</div>
            <h1 className="text-3xl font-bold tracking-tight">{user?.email?.split('@')[0] || 'User'}&apos;s Dashboard</h1>
            <p className="text-gray-500 mt-1">Real-time workflow metrics and productivity</p>
          </div>

          {/* ── Global Stats Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total Tenders" value={g.totalTenders || 0} color="#06b6d4" icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            <StatCard label="In Workflow" value={g.activeInWorkflow || 0} sub={`${g.rejectedInWorkflow || 0} rejected`} color="#818cf8" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            <StatCard label="Open" value={g.openTenders || 0} color="#4ade80" icon="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            <StatCard label="Closing This Week" value={g.closingThisWeek || 0} color="#f87171" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            <StatCard label="Active Users" value={g.activeUsers || 0} color="#c084fc" icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            <StatCard label="My Score (Week)" value={scores.week?.weightedScore || 0} sub={`${scores.week?.stagesCompleted || 0} stages`} color="#facc15" icon="M13 10V3L4 14h7v7l9-11h-7z" />
          </div>

          {/* ── Personal Score Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Today's Score" value={scores.today?.weightedScore || 0} sub={`${scores.today?.totalActions || 0} actions`} color="#06b6d4" icon="M13 10V3L4 14h7v7l9-11h-7z" />
            <StatCard label="This Week" value={scores.week?.weightedScore || 0} sub={`${scores.week?.stagesCompleted || 0} stages completed`} color="#818cf8" icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            <StatCard label="This Month" value={scores.month?.weightedScore || 0} sub={`${scores.month?.totalActions || 0} total actions`} color="#c084fc" icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            <StatCard label="Active Assignments" value={assignments.length} sub={`${dashboard?.totalStagesCompleted || 0} lifetime completed`} color="#4ade80" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </div>

          {/* ── Pipeline + Leaderboard ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            <div className="lg:col-span-2"><PipelineBar stages={pipeline.stages} /></div>
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm">Weekly Leaderboard</h3>
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto">
                {leaderboard.slice(0, 8).map((r: any, i: number) => (
                  <div key={r.userId} className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-gray-500'}`}>{r.rank}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{r.fullName || r.email?.split('@')[0]}</div>
                      <div className="text-[10px] text-gray-500">{r.totalActions} actions</div>
                    </div>
                    <div className="text-base font-bold text-cyan-400">{r.weightedScore}</div>
                  </div>
                ))}
                {leaderboard.length === 0 && <p className="text-gray-500 text-sm">No data yet this week</p>}
              </div>
            </div>
          </div>

          {/* ── Filing Alerts + Stale Tenders ── */}
          {(filingAlerts.length > 0 || staleTenders.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {filingAlerts.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
                  <h3 className="text-red-400 font-semibold text-sm flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Filing Deadline ({filingAlerts.length} tenders need action)
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {filingAlerts.map((t: any) => (
                      <div key={t.tenderId} onClick={() => router.push(`/tenders/${t.tenderId}`)}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 cursor-pointer transition">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{t.title}</div>
                          <div className="text-xs text-gray-500">{STAGE_LABELS[t.currentStage]?.label || t.currentStage} · by {t.lastUpdatedBy}</div>
                        </div>
                        <div className="text-xs text-red-400 font-bold">{t.hoursLeft}h left</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {staleTenders.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                  <h3 className="text-amber-400 font-semibold text-sm flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Stale Tenders ({staleTenders.length} inactive &gt;7 days)
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {staleTenders.map((t: any) => (
                      <div key={t.tenderId} onClick={() => router.push(`/tenders/${t.tenderId}`)}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer transition">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{t.title}</div>
                          <div className="text-xs text-gray-500">{STAGE_LABELS[t.currentStage]?.label || t.currentStage} · last by {t.lastUpdatedBy}</div>
                        </div>
                        <div className="text-xs text-amber-400 font-bold">{t.daysSinceUpdate}d stale</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Assignments + Activity ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm">My Active Assignments</h3>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {assignments.slice(0, 10).map((a: any) => {
                  const si = STAGE_LABELS[a.stage] || { label: a.stage, color: '#666' };
                  return (
                    <div key={a.id} onClick={() => router.push(`/tenders/${a.tenderId}`)}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition">
                      <div className="w-1.5 h-7 rounded-full" style={{ background: si.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{a.tender?.title || 'Tender'}</div>
                        <div className="text-xs text-gray-500">{si.label} · {a.assignmentStatus}</div>
                      </div>
                      {a.tender?.deadlineAt && <div className="text-xs text-gray-500">{new Date(a.tender.deadlineAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>}
                    </div>
                  );
                })}
                {assignments.length === 0 && <p className="text-gray-500 text-sm">No active assignments</p>}
              </div>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Recent Activity</h3>
                <div className="flex bg-white/5 rounded-lg p-0.5">
                  <button onClick={() => setActivityScope('my')} className={`px-3 py-1 text-xs rounded-md transition ${activityScope === 'my' ? 'bg-cyan-500/20 text-cyan-400 font-medium' : 'text-gray-500 hover:text-white'}`}>Mine</button>
                  <button onClick={() => setActivityScope('all')} className={`px-3 py-1 text-xs rounded-md transition ${activityScope === 'all' ? 'bg-cyan-500/20 text-cyan-400 font-medium' : 'text-gray-500 hover:text-white'}`}>All</button>
                </div>
              </div>
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
                {activityFeed.slice(0, 15).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.actionType === 'TENDER_REJECTED' ? 'bg-red-400' : 'bg-cyan-400'}`} />
                    <div className="flex-1 min-w-0">
                      {activityScope === 'all' && a.user && <span className="text-cyan-400 text-xs font-medium">{a.user.profile?.fullName || a.user.email?.split('@')[0]} </span>}
                      <span className="text-gray-300 text-xs">{a.actionType.replace(/_/g, ' ').toLowerCase()}</span>
                      {a.tender?.title && <span className="text-gray-500 text-xs ml-1">on {a.tender.title.substring(0, 35)}...</span>}
                      <div className="text-[10px] text-gray-600 mt-0.5">{new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
                {activityFeed.length === 0 && <p className="text-gray-500 text-sm">No activity yet</p>}
              </div>
            </div>
          </div>

          {/* ── Deadline Alerts (from search API) ── */}
          <div className="mb-6">
            <DeadlineAlerts router={router} />
          </div>

          {/* ── Admin Section ── */}
          {isAdmin && adminExtras && (
            <div className="space-y-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Admin Insights</div>
              
              {/* Scraping Trend */}
              <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                <h3 className="text-white font-semibold text-sm mb-3">Tenders Scraped (7-Day Trend)</h3>
                <div className="flex items-end gap-2 h-24">
                  {scrapingTrend.map((d: any) => {
                    const maxCount = Math.max(...scrapingTrend.map((x: any) => x.count), 1);
                    const height = Math.max((d.count / maxCount) * 100, 4);
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[10px] text-gray-400 font-medium">{d.count}</div>
                        <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/60 to-cyan-400/30 transition-all" style={{ height: `${height}%` }} />
                        <div className="text-[9px] text-gray-600">{d.date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Crawl Health + User Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                  <h3 className="text-white font-semibold text-sm mb-3">Crawl Health</h3>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {crawlHealth.map((s: any) => (
                      <div key={s.key} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                        <div className="text-sm text-white">{s.name}</div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-500">{s.lastItemsNew} new</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${s.lastStatus === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : s.lastStatus === 'FAILED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>{s.lastStatus}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                  <h3 className="text-white font-semibold text-sm mb-3">User Stats</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-white/5">
                      <div className="text-xl font-bold text-white">{adminExtras.userStats?.totalUsers || 0}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-500/5">
                      <div className="text-xl font-bold text-green-400">{adminExtras.userStats?.activeUsers || 0}</div>
                      <div className="text-xs text-gray-500">Active</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-500/5">
                      <div className="text-xl font-bold text-red-400">{adminExtras.userStats?.inactiveUsers || 0}</div>
                      <div className="text-xs text-gray-500">Inactive</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Deadline Alerts (kept as sub-component) ── */
function DeadlineAlerts({ router }: { router: any }) {
  const [alerts, setAlerts] = useState<{ in24: any[]; in48: any[]; in72: any[] }>({ in24: [], in48: [], in72: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await apiFetch('/tenders/search?closingSoonDays=3&pageSize=50&page=1');
        if (!res.ok) return;
        const data = await res.json();
        const now = Date.now(); const h24 = 86400000; const h48 = h24 * 2; const h72 = h24 * 3;
        const in24: any[] = []; const in48: any[] = []; const in72: any[] = [];
        for (const item of data.items || []) {
          if (!item.deadlineAt) continue;
          const diff = new Date(item.deadlineAt).getTime() - now;
          if (diff <= 0) continue;
          if (diff <= h24) in24.push(item);
          else if (diff <= h48) in48.push(item);
          else if (diff <= h72) in72.push(item);
        }
        setAlerts({ in24, in48, in72 });
      } catch {} finally { setLoading(false); }
    };
    fetch_(); const i = setInterval(fetch_, 60000); return () => clearInterval(i);
  }, []);
  const total = alerts.in24.length + alerts.in48.length + alerts.in72.length;
  if (loading) return <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5"><div className="text-gray-500 text-sm animate-pulse">Loading deadline alerts...</div></div>;
  if (total === 0) return null;

  const renderGroup = (items: any[], label: string, color: string, bgClass: string) => items.length === 0 ? null : (
    <div>
      <div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full`} style={{ background: color }} /><span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label} ({items.length})</span></div>
      <div className="space-y-1.5">
        {items.slice(0, 5).map(t => (
          <div key={t.id} onClick={() => router.push(`/tenders/${t.id}`)} className={`flex items-center gap-3 p-2 rounded-lg ${bgClass} cursor-pointer transition`}>
            <div className="flex-1 min-w-0"><div className="text-sm text-white font-medium truncate">{t.title}</div><div className="text-xs text-gray-500">{t.organization || t.sourceSite?.name}</div></div>
            <div className="text-xs font-bold whitespace-nowrap" style={{ color }}>{Math.ceil((new Date(t.deadlineAt).getTime() - Date.now()) / 3600000)}h left</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Deadline Alerts
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">{total} closing soon</span>
      </div>
      <div className="space-y-3 max-h-[350px] overflow-y-auto">
        {renderGroup(alerts.in24, 'Within 24 hours', '#ef4444', 'bg-red-500/5 hover:bg-red-500/10')}
        {renderGroup(alerts.in48, '24–48 hours', '#f59e0b', 'bg-amber-500/5 hover:bg-amber-500/10')}
        {renderGroup(alerts.in72, '48–72 hours', '#eab308', 'bg-yellow-500/5 hover:bg-yellow-500/10')}
      </div>
    </div>
  );
}