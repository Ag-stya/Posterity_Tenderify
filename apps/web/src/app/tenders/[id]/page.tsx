'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import {
  isAuthenticated, getUser,
  workflowApi, stageApi, notesApi, activityApi, apiFetch, usersApi,
} from '../../lib/api';
import Sidebar from '../../components/Sidebar';

const STAGES = [
  'TENDER_IDENTIFICATION', 'DUE_DILIGENCE', 'PRE_BID_MEETING', 'TENDER_FILING',
  'TECH_EVALUATION', 'PRESENTATION_STAGE', 'FINANCIAL_EVALUATION',
  'CONTRACT_AWARD', 'PROJECT_INITIATED', 'PROJECT_COMPLETED',
];

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

// ─── Custom Dropdown ──────────────────────────────────────────────────────────
// Uses createPortal to render the panel at document.body level, so it is never
// clipped by any parent overflow:hidden / z-index stacking context.

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  accentColor?: string;
}

function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  accentColor = '#06b6d4',
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the portal panel under the trigger on open
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const panelHeight = Math.min(224, options.length * 36 + 40); // approx

    if (spaceBelow >= panelHeight || spaceBelow >= 120) {
      // open downward
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    } else {
      // open upward
      setPanelStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
  }, [open, options.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelStyle(prev => ({ ...prev, top: rect.bottom + 4, left: rect.left, width: rect.width }));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  const panel = open ? (
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="max-h-56 overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false); }}
          className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-white/5 transition flex items-center gap-2"
        >
          <span className="w-3 flex-shrink-0" />
          {placeholder}
        </button>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onChange(opt.value); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition flex items-center gap-2"
          >
            <span className="w-3 flex-shrink-0">
              {opt.value === value && (
                <svg className="w-3 h-3" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-2 bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-left transition focus:outline-none"
        style={{ borderColor: open ? accentColor : undefined }}
      >
        <span className={selected ? 'text-white' : 'text-gray-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {typeof document !== 'undefined' && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

// ─── Stage Timeline ───────────────────────────────────────────────────────────

function StageTimeline({ tenderId }: { tenderId: string }) {
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await workflowApi.getTimeline(tenderId);
        if (res.ok) setTimeline(await res.json());
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [tenderId]);

  if (loading) return <div className="text-gray-500 text-sm animate-pulse p-4">Loading timeline...</div>;
  if (!timeline || !timeline.timeline?.length) return <p className="text-gray-500 text-sm p-4">No timeline data yet</p>;

  return (
    <div className="space-y-0">
      {timeline.timeline.map((event: any, i: number) => {
        const isLast = i === timeline.timeline.length - 1;
        const isRejection = event.actionType === 'TENDER_REJECTED';
        const stageInfo = STAGE_LABELS[event.toStage || event.stage] || { label: event.stage, color: '#666' };
        const color = isRejection ? '#ef4444' : stageInfo.color;
        let actionLabel = '';
        switch (event.actionType) {
          case 'WORKFLOW_ENTERED': actionLabel = 'Entered workflow'; break;
          case 'STAGE_CHANGED': actionLabel = `Moved to ${STAGE_LABELS[event.toStage]?.label || event.toStage}`; break;
          case 'STAGE_COMPLETED': actionLabel = `Completed ${STAGE_LABELS[event.stage]?.label || event.stage}`; break;
          case 'TENDER_REJECTED': actionLabel = `Rejected at ${STAGE_LABELS[event.stage]?.label || event.stage}`; break;
          case 'STAGE_ASSIGNED': actionLabel = `Assigned ${STAGE_LABELS[event.stage]?.label || event.stage}`; break;
          case 'NOTE_ADDED': actionLabel = 'Added a note'; break;
          default: actionLabel = event.actionType.replace(/_/g, ' ').toLowerCase();
        }
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1" style={{ borderColor: color, background: isLast ? color : 'transparent' }} />
              {!isLast && <div className="w-0.5 flex-1 min-h-[32px]" style={{ background: `${color}30` }} />}
            </div>
            <div className="pb-4">
              <div className="text-sm text-white font-medium">{actionLabel}</div>
              {event.fromStage && event.toStage && event.actionType === 'STAGE_CHANGED' && (
                <div className="text-xs text-gray-500">{STAGE_LABELS[event.fromStage]?.label || event.fromStage} → {STAGE_LABELS[event.toStage]?.label || event.toStage}</div>
              )}
              {isRejection && event.metadata?.rejectionReason && (
                <div className="text-xs text-red-400 mt-0.5">Reason: {event.metadata.rejectionReason}</div>
              )}
              <div className="text-xs text-gray-600 mt-0.5">
                {event.performedBy?.fullName || event.performedBy?.email || 'System'} · {new Date(event.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tenderId = params.id as string;
  const user = getUser();

  const [tender, setTender] = useState<any>(null);
  const [workflow, setWorkflow] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newNote, setNewNote] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectStage, setRejectStage] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [assignStage, setAssignStage] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const loadData = useCallback(async () => {
    try {
      const wfRes = await workflowApi.get(tenderId).catch(() => null);
      if (wfRes && wfRes.ok) {
        const wfData = await wfRes.json();
        setWorkflow(wfData);
        setTender(wfData.tender);
      } else {
        setWorkflow(null);
      }
      const [stagesRes, notesRes, actRes, usersRes] = await Promise.all([
        stageApi.getStages(tenderId).catch(() => null),
        notesApi.list(tenderId).catch(() => null),
        activityApi.tender(tenderId).catch(() => null),
        usersApi.list().catch(() => null),
      ]);
      if (stagesRes?.ok) setStages(await stagesRes.json());
      if (notesRes?.ok) { const d = await notesRes.json(); setNotes(d.items || []); }
      if (actRes?.ok) { const d = await actRes.json(); setActivity(d.items || []); }
      if (usersRes?.ok) setAllUsers(await usersRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    loadData();
  }, [router, loadData]);

  const enterWorkflow = async () => {
    setActionLoading(true);
    try {
      const res = await workflowApi.enter(tenderId);
      if (res.ok) await loadData();
      else { const e = await res.json().catch(() => ({})); setError(e.message || 'Failed'); }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const moveStage = async () => {
    if (!selectedStage) return;
    setActionLoading(true);
    try {
      const res = await workflowApi.updateStage(tenderId, selectedStage);
      if (res.ok) { setSelectedStage(''); await loadData(); }
      else { const e = await res.json(); setError(e.message || 'Failed'); }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const rejectTender = async () => {
    if (!rejectReason || !rejectStage) return;
    setActionLoading(true);
    try {
      const res = await workflowApi.reject(tenderId, rejectReason, rejectStage);
      if (res.ok) { setShowReject(false); await loadData(); }
      else { const e = await res.json(); setError(e.message || 'Failed'); }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setActionLoading(true);
    try {
      const res = await notesApi.add(tenderId, newNote.trim());
      if (res.ok) { setNewNote(''); await loadData(); }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleAssignStage = async () => {
    if (!assignStage || !assignUserId) return;
    setActionLoading(true);
    try {
      const res = await stageApi.assign(tenderId, assignStage, assignUserId);
      if (res.ok) { setAssignStage(''); setAssignUserId(''); await loadData(); }
      else { const e = await res.json(); setError(e.message || 'Failed'); }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-cyan-400 animate-pulse">Loading tender details...</div></div>;
  }

  const currentStage = workflow?.currentStage;
  const isRejected = workflow?.isRejected;
  const currentInfo = STAGE_LABELS[currentStage] || { label: currentStage, color: '#666' };

  const moveStageOptions = STAGES.filter(s => s !== currentStage).map(s => ({ value: s, label: STAGE_LABELS[s].label }));
  const allStageOptions = STAGES.map(s => ({ value: s, label: STAGE_LABELS[s].label }));
  const userOptions = allUsers.filter((u: any) => u.isActive).map((u: any) => ({ value: u.id, label: u.profile?.fullName || u.email }));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => router.back()} className="hover:text-white transition">← Back</button>
          <span>/</span><span className="text-gray-400">Tender Detail</span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}<button onClick={() => setError('')} className="ml-3 text-red-300">×</button>
          </div>
        )}

        {/* Tender Info Header */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2">{tender?.title || 'Tender'}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400 mt-2">
                {tender?.organization && <div><span className="text-gray-600">Org:</span> <span className="text-gray-300">{tender.organization}</span></div>}
                {tender?.sourceSite?.name && <div><span className="text-gray-600">Source:</span> <span className="text-gray-300">{tender.sourceSite.name}</span></div>}
                {tender?.deadlineAt && <div><span className="text-gray-600">Deadline:</span> <span className="text-gray-300">{new Date(tender.deadlineAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>}
                {tender?.publishedAt && <div><span className="text-gray-600">Published:</span> <span className="text-gray-300">{new Date(tender.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>}
                {tender?.location && <div><span className="text-gray-600">Location:</span> <span className="text-gray-300">{tender.location}</span></div>}
                {tender?.estimatedValue && <div><span className="text-gray-600">Est. Value:</span> <span className="text-gray-300">{tender.estimatedValue}</span></div>}
                {tender?.status && <span className={`text-xs px-2 py-0.5 rounded-full ${tender.status === 'OPEN' ? 'bg-green-500/20 text-green-400' : tender.status === 'CLOSED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>{tender.status}</span>}
              </div>
              {tender?.summary && <div className="mt-3 text-sm text-gray-500 leading-relaxed">{tender.summary}</div>}
              {tender?.sourceUrl && (
                <a href={tender.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition">
                  View on source portal <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>
            {workflow ? (
              <div className="px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0 ml-4" style={{ background: `${currentInfo.color}20`, color: currentInfo.color }}>
                {isRejected ? '❌ REJECTED' : currentInfo.label}
              </div>
            ) : (
              <button onClick={enterWorkflow} disabled={actionLoading} className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-semibold rounded-xl transition disabled:opacity-50 flex-shrink-0 ml-4">Enter Workflow</button>
            )}
          </div>

          {workflow && !isRejected && (
            <div className="mt-6 flex items-center gap-1">
              {STAGES.map((stage, i) => {
                const info = STAGE_LABELS[stage]; const isActive = stage === currentStage; const isPast = STAGES.indexOf(currentStage) > i;
                return (
                  <div key={stage} className="flex-1 relative group">
                    <div className={`h-2 rounded-full transition-all ${isActive ? 'scale-y-150' : ''}`} style={{ background: isPast || isActive ? info.color : 'rgba(255,255,255,0.1)', opacity: isPast ? 0.5 : 1 }} />
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">{info.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {isRejected && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-sm text-red-400"><strong>Reason:</strong> {workflow.rejectionReason}</div>
              <div className="text-sm text-red-400/70 mt-1">Failed at: {STAGE_LABELS[workflow.failedAtStage]?.label || workflow.failedAtStage}</div>
              {workflow.rejectedBy && (
                <div className="text-sm text-red-400/70 mt-1">
                  Rejected by: <strong>{workflow.rejectedBy.fullName || workflow.rejectedBy.email}</strong> on {new Date(workflow.rejectedBy.rejectedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions Panel */}
        {workflow && !isRejected && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

            {/* Move Stage */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Move Stage</h3>
              <div className="flex gap-2">
                <CustomDropdown
                  value={selectedStage}
                  onChange={setSelectedStage}
                  options={moveStageOptions}
                  placeholder="Select stage..."
                  className="flex-1"
                  accentColor="#06b6d4"
                />
                <button onClick={moveStage} disabled={!selectedStage || actionLoading} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-50 transition">Move</button>
              </div>
            </div>

            {/* Assign Stage */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Assign Stage</h3>
              <div className="space-y-2">
                <CustomDropdown
                  value={assignStage}
                  onChange={setAssignStage}
                  options={allStageOptions}
                  placeholder="Select stage..."
                  accentColor="#06b6d4"
                />
                <div className="flex gap-2">
                  <CustomDropdown
                    value={assignUserId}
                    onChange={setAssignUserId}
                    options={userOptions}
                    placeholder="Select user..."
                    className="flex-1"
                    accentColor="#06b6d4"
                  />
                  <button onClick={handleAssignStage} disabled={!assignStage || !assignUserId || actionLoading} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-50 transition">Assign</button>
                </div>
              </div>
            </div>

            {/* Reject Tender */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Reject Tender</h3>
              {!showReject ? (
                <button onClick={() => setShowReject(true)} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition">Reject...</button>
              ) : (
                <div className="space-y-2">
                  <CustomDropdown
                    value={rejectStage}
                    onChange={setRejectStage}
                    options={allStageOptions}
                    placeholder="Failed at stage..."
                    accentColor="#ef4444"
                  />
                  <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none resize-none h-16" />
                  <div className="flex gap-2">
                    <button onClick={rejectTender} disabled={!rejectReason || !rejectStage || actionLoading} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition">Confirm Reject</button>
                    <button onClick={() => setShowReject(false)} className="px-4 py-2 text-gray-400 text-sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Stage Timeline + Assignments + Notes + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
              Stage Timeline
            </h3>
            {workflow ? <StageTimeline tenderId={tenderId} /> : <p className="text-gray-500 text-sm">Enter workflow to see timeline</p>}
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4">Assignments</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(Array.isArray(stages) ? stages : []).map((a: any) => {
                const info = STAGE_LABELS[a.stage] || { label: a.stage, color: '#666' };
                return (
                  <div key={a.id} className="p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: info.color }} />
                      <span className="text-sm font-medium">{info.label}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${a.assignmentStatus === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : a.assignmentStatus === 'IN_PROGRESS' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-gray-400'}`}>{a.assignmentStatus}</span>
                    </div>
                    <div className="text-xs text-gray-500">Assigned to: {a.assignedTo?.profile?.fullName || a.assignedTo?.email || 'Unknown'}</div>
                    {a.assignedBy && <div className="text-xs text-gray-600">By: {a.assignedBy?.email}</div>}
                  </div>
                );
              })}
              {(Array.isArray(stages) ? stages : []).length === 0 && <div className="text-center py-4"><p className="text-gray-500 text-sm">No assignments yet</p></div>}
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4">Notes</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4">
              {notes.map((n: any) => (
                <div key={n.id} className="p-3 rounded-lg bg-white/5">
                  <div className="text-sm text-gray-300">{n.noteText}</div>
                  <div className="text-xs text-gray-600 mt-1">{n.user?.profile?.fullName || n.user?.email} · {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
              {notes.length === 0 && <p className="text-gray-500 text-sm">No notes yet</p>}
            </div>
            <div className="flex gap-2">
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none" onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button onClick={addNote} disabled={!newNote.trim() || actionLoading} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm disabled:opacity-50">Add</button>
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4">Activity Log</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {activity.map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${a.actionType === 'TENDER_REJECTED' ? 'bg-red-500' : 'bg-cyan-500'}`} />
                  <div>
                    <span className="text-gray-300">{a.actionType.replace(/_/g, ' ').toLowerCase()}</span>
                    {a.stage && <span className="text-gray-500 ml-1">({STAGE_LABELS[a.stage]?.label || a.stage})</span>}
                    {a.fromValue && a.toValue && <div className="text-xs text-gray-600">{String(a.fromValue).replace(/_/g, ' ')} → {String(a.toValue).replace(/_/g, ' ')}</div>}
                    <div className="text-xs text-gray-600 mt-0.5">{a.user?.profile?.fullName || a.user?.email} · {new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              {activity.length === 0 && <p className="text-gray-500 text-sm">No activity yet</p>}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}