'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, dashboardApi, productivityApi, getUser } from '../lib/api';
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

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      }

      // Draw connections
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string;
}) {
  return (
    <div className="relative bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 overflow-hidden group hover:border-white/20 transition-all">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-8 translate-x-8" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <svg className="w-5 h-5" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
      </div>
      <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function PipelineBar({ stages }: { stages: Array<{ stage: string; count: number }> }) {
  const total = stages.reduce((s, c) => s + c.count, 0) || 1;
  const sorted = Object.keys(STAGE_LABELS)
    .filter((k) => k !== 'REJECTED')
    .map((key) => {
      const found = stages.find((s) => s.stage === key);
      return { stage: key, count: found?.count || 0, ...STAGE_LABELS[key] };
    });

  return (
    <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <h3 className="text-white font-semibold mb-4">Pipeline Distribution</h3>
      <div className="flex rounded-xl overflow-hidden h-8 mb-4">
        {sorted.map((s) => (
          <div
            key={s.stage}
            style={{
              width: `${Math.max((s.count / total) * 100, s.count > 0 ? 3 : 0)}%`,
              background: s.color,
            }}
            className="relative group cursor-pointer transition-all hover:brightness-110"
            title={`${s.label}: ${s.count}`}
          >
            {s.count > 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                {s.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {sorted.map((s) => (
          <div key={s.stage} className="flex items-center gap-1.5 text-xs text-gray-400">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
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
  const [dashboard, setDashboard] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }

    const load = async () => {
      try {
        const [dashRes, lbRes] = await Promise.all([
          dashboardApi.me(),
          productivityApi.leaderboard(7),
        ]);
        if (dashRes.ok) setDashboard(await dashRes.json());
        if (lbRes.ok) setLeaderboard(await lbRes.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-cyan-400 animate-pulse text-lg">Loading dashboard...</div>
      </div>
    );
  }

  const scores = dashboard?.scores || { today: {}, week: {}, month: {} };
  const assignments = dashboard?.activeAssignments || [];
  const activity = dashboard?.recentActivity || [];
  const stageData = dashboard?.myTendersByStage || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 min-h-screen relative">
        {/* Particle background */}
        <div className="fixed inset-0 ml-64 pointer-events-none">
          <ParticleCanvas />
        </div>

        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="text-sm text-cyan-400 font-medium tracking-wider uppercase mb-1">
              Welcome back
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {user?.email?.split('@')[0] || 'User'}'s Dashboard
            </h1>
            <p className="text-gray-500 mt-1">Real-time workflow metrics and productivity</p>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              label="Today's Score"
              value={scores.today?.weightedScore || 0}
              sub={`${scores.today?.totalActions || 0} actions`}
              color="#06b6d4"
              icon="M13 10V3L4 14h7v7l9-11h-7z"
            />
            <MetricCard
              label="This Week"
              value={scores.week?.weightedScore || 0}
              sub={`${scores.week?.stagesCompleted || 0} stages completed`}
              color="#818cf8"
              icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
            <MetricCard
              label="This Month"
              value={scores.month?.weightedScore || 0}
              sub={`${scores.month?.totalActions || 0} total actions`}
              color="#c084fc"
              icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
            <MetricCard
              label="Active Assignments"
              value={assignments.length}
              sub={`${dashboard?.totalStagesCompleted || 0} lifetime completed`}
              color="#4ade80"
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pipeline distribution */}
            <div className="lg:col-span-2">
              <PipelineBar stages={stageData} />
            </div>

            {/* Leaderboard */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Weekly Leaderboard</h3>
              <div className="space-y-3">
                {(leaderboard?.rankings || []).slice(0, 8).map((r: any, i: number) => (
                  <div key={r.userId} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                      i === 1 ? 'bg-gray-400/20 text-gray-300' :
                      i === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-white/5 text-gray-500'
                    }`}>
                      {r.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {r.fullName || r.email?.split('@')[0]}
                      </div>
                      <div className="text-xs text-gray-500">{r.totalActions} actions</div>
                    </div>
                    <div className="text-lg font-bold text-cyan-400">{r.weightedScore}</div>
                  </div>
                ))}
                {(!leaderboard?.rankings || leaderboard.rankings.length === 0) && (
                  <p className="text-gray-500 text-sm">No data yet this week</p>
                )}
              </div>
            </div>
          </div>

          {/* Active Assignments & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Active Assignments */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">My Active Assignments</h3>
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {assignments.slice(0, 10).map((a: any) => {
                  const stageInfo = STAGE_LABELS[a.stage] || { label: a.stage, color: '#666' };
                  return (
                    <div
                      key={a.id}
                      onClick={() => router.push(`/tenders/${a.tenderId}`)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <div className="w-2 h-8 rounded-full" style={{ background: stageInfo.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {a.tender?.title || 'Tender'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {stageInfo.label} · {a.assignmentStatus}
                        </div>
                      </div>
                      {a.tender?.deadlineAt && (
                        <div className="text-xs text-gray-500">
                          {new Date(a.tender.deadlineAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {assignments.length === 0 && (
                  <p className="text-gray-500 text-sm">No active assignments</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {activity.slice(0, 10).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-300">
                        {a.actionType.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      {a.tender?.title && (
                        <span className="text-gray-500 ml-1">
                          on <span className="text-gray-400">{a.tender.title.substring(0, 40)}...</span>
                        </span>
                      )}
                      <div className="text-xs text-gray-600 mt-0.5">
                        {new Date(a.createdAt).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && (
                  <p className="text-gray-500 text-sm">No recent activity</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
