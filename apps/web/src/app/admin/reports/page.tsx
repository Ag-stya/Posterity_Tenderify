'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, reportingApi } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

export default function AdminReportsPage() {
  const router = useRouter();
  const user = getUser();
  const [runs, setRuns] = useState<any>({ items: [], total: 0 });
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState('DAILY');

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'ADMIN') { router.replace('/login'); return; }
    loadData();
  }, []); // eslint-disable-line

  const loadData = async () => {
    try {
      const [runsRes, subsRes] = await Promise.all([
        reportingApi.runs(),
        reportingApi.subscriptions(),
      ]);
      if (runsRes.ok) setRuns(await runsRes.json());
      if (subsRes.ok) setSubs(await subsRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const triggerReport = async (type: string) => {
    setRunning(type);
    try {
      await reportingApi.run(type);
      setTimeout(loadData, 2000);
    } catch (e) { console.error(e); }
    finally { setRunning(''); }
  };

  const addSub = async () => {
    if (!newEmail) return;
    await reportingApi.addSubscription(newType, newEmail);
    setNewEmail('');
    loadData();
  };

  const removeSub = async (id: string) => {
    await reportingApi.removeSubscription(id);
    loadData();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Generate and schedule automated reports for management</p>
        </div>

        {/* How it works */}
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">How Reports Work</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p><strong className="text-gray-300">Daily:</strong> Sent every night — summarizes the day&apos;s tender activity, stage movements, and user scores.</p>
            <p><strong className="text-gray-300">Weekly:</strong> Sent every Monday — includes user rankings, tender pipeline changes, and rejection breakdowns for the past week.</p>
            <p><strong className="text-gray-300">Monthly:</strong> Sent on the 1st — full month overview with productivity trends, stage bottlenecks, and completion patterns.</p>
            <p className="text-gray-500 mt-2">Reports are emailed to subscribers listed below. You can also manually trigger a report anytime using the buttons.</p>
          </div>
        </div>

        {/* Trigger reports */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
          <h3 className="font-semibold mb-2">Generate Report Now</h3>
          <p className="text-xs text-gray-500 mb-4">Manually trigger a report — it will be emailed to all active subscribers for that report type.</p>
          <div className="flex gap-3">
            {['DAILY', 'WEEKLY', 'MONTHLY'].map((t) => (
              <button key={t} onClick={() => triggerReport(t)} disabled={!!running}
                className="px-5 py-2.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition disabled:opacity-50">
                {running === t ? 'Running...' : `Run ${t}`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Report runs */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-1">Report History</h3>
            <p className="text-xs text-gray-500 mb-4">Past report runs and their delivery status</p>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {runs.items?.map((r: any) => (
                <div key={r.id} className="p-3 rounded-lg bg-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.reportType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.status === 'SUCCESS' ? 'bg-green-500/20 text-green-400' :
                      r.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(r.createdAt).toLocaleString('en-IN')}
                    {r.recipientCount > 0 && ` · Sent to ${r.recipientCount} recipients`}
                  </div>
                  {r.errorText && <div className="text-xs text-red-400 mt-1">{r.errorText}</div>}
                </div>
              ))}
              {runs.items?.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No reports generated yet</p>
                  <p className="text-gray-600 text-xs mt-1">Click a &quot;Run&quot; button above to generate your first report</p>
                </div>
              )}
            </div>
          </div>

          {/* Subscriptions */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-1">Email Subscriptions</h3>
            <p className="text-xs text-gray-500 mb-4">Add management emails to receive automated reports</p>

            <div className="flex gap-2 mb-4">
              <select value={newType} onChange={(e) => setNewType(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="manager@company.com"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && addSub()} />
              <button onClick={addSub} disabled={!newEmail}
                className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm disabled:opacity-50 hover:bg-cyan-500/30 transition">
                Add
              </button>
            </div>

            <div className="space-y-2">
              {subs.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div>
                    <span className="text-sm">{s.recipientEmail}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      s.reportType === 'DAILY' ? 'bg-cyan-500/20 text-cyan-400' :
                      s.reportType === 'WEEKLY' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>{s.reportType}</span>
                  </div>
                  <button onClick={() => removeSub(s.id)} className="text-red-400 text-xs hover:text-red-300 transition">
                    Remove
                  </button>
                </div>
              ))}
              {subs.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-gray-500 text-sm">No subscriptions yet</p>
                  <p className="text-gray-600 text-xs mt-1">Add an email above to start receiving reports</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}