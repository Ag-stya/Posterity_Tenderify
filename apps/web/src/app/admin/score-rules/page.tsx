'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, productivityApi } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

const STAGE_LABELS: Record<string, string> = {
  TENDER_IDENTIFICATION: 'Identification',
  DUE_DILIGENCE: 'Due Diligence',
  PRE_BID_MEETING: 'Pre-Bid Meeting',
  TENDER_FILING: 'Tender Filing',
  TECH_EVALUATION: 'Tech Evaluation',
  PRESENTATION_STAGE: 'Presentation',
  FINANCIAL_EVALUATION: 'Financial Eval',
  CONTRACT_AWARD: 'Contract Award',
  PROJECT_INITIATED: 'Project Init',
  PROJECT_COMPLETED: 'Completed',
};

export default function AdminScoreRulesPage() {
  const router = useRouter();
  const user = getUser();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'ADMIN') { router.replace('/login'); return; }
    loadRules();
  }, []); // eslint-disable-line

  const loadRules = async () => {
    try {
      const res = await productivityApi.rules();
      if (res.ok) setRules(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateRule = async (id: string, scoreValue: number, isActive: boolean) => {
    setSaving(id);
    try {
      const res = await productivityApi.updateRule(id, scoreValue, isActive);
      if (res.ok) {
        setRules((prev) => prev.map((r) => r.id === id ? { ...r, scoreValue, isActive } : r));
        setSuccess('Rule updated');
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  };

  const handleScoreChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, scoreValue: num } : r));
  };

  // Group rules: stage-specific vs general
  const stageRules = rules.filter((r) => r.stage !== null);
  const generalRules = rules.filter((r) => r.stage === null);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Productivity Score Rules</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure how many points each action earns. Changes take effect immediately for new actions.
          </p>
        </div>

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
            {success}
          </div>
        )}

        {/* Info box */}
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">How Scoring Works</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>Every time a user performs an action (enters a tender, moves a stage, completes a stage, adds a note, etc.), they earn points based on these rules.</p>
            <p>Points are aggregated daily into the <strong className="text-gray-300">user_productivity_daily</strong> table and displayed on dashboards and leaderboards.</p>
            <p>You can <strong className="text-gray-300">disable</strong> rules (toggle off) or <strong className="text-gray-300">change point values</strong> — just click Save after editing.</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading rules...</div>
        ) : (
          <div className="space-y-6">
            {/* Stage Completion Rules */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="font-semibold mb-1">Stage Completion Scores</h3>
              <p className="text-xs text-gray-500 mb-4">Points awarded when a user completes a specific stage</p>
              <div className="space-y-2">
                {stageRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{STAGE_LABELS[rule.stage] || rule.stage}</div>
                      <div className="text-xs text-gray-600">{rule.actionType.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rule.scoreValue}
                        onChange={(e) => handleScoreChange(rule.id, e.target.value)}
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-center focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">pts</span>
                      <button
                        onClick={() => updateRule(rule.id, rule.scoreValue, !rule.isActive)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                          rule.isActive
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => updateRule(rule.id, rule.scoreValue, rule.isActive)}
                        disabled={saving === rule.id}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/30 disabled:opacity-50 transition"
                      >
                        {saving === rule.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* General Action Rules */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="font-semibold mb-1">General Action Scores</h3>
              <p className="text-xs text-gray-500 mb-4">Points for actions that aren&apos;t stage-specific</p>
              <div className="space-y-2">
                {generalRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{rule.actionType.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rule.scoreValue}
                        onChange={(e) => handleScoreChange(rule.id, e.target.value)}
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-center focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">pts</span>
                      <button
                        onClick={() => updateRule(rule.id, rule.scoreValue, !rule.isActive)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                          rule.isActive
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => updateRule(rule.id, rule.scoreValue, rule.isActive)}
                        disabled={saving === rule.id}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/30 disabled:opacity-50 transition"
                      >
                        {saving === rule.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}