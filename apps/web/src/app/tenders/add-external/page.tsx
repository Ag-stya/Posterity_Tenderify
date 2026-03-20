'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, apiFetch } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

export default function AddExternalTenderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [summary, setSummary] = useState('');
  const [location, setLocation] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/workflow/tenders/external', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          organization: organization.trim() || undefined,
          summary: summary.trim() || undefined,
          location: location.trim() || undefined,
          estimatedValue: estimatedValue.trim() || undefined,
          deadlineAt: deadlineAt || undefined,
          publishedAt: publishedAt || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/tenders/${data.tender.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to create tender');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create tender');
    } finally {
      setLoading(false);
    }
  };

  if (typeof window !== 'undefined' && !isAuthenticated()) {
    router.replace('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Add External Tender</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manually add a tender that was found outside the scraped portals. It will automatically enter the workflow pipeline.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-300 ml-3">×</button>
          </div>
        )}

        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 max-w-3xl">
          <div className="space-y-5">
            {/* Title — required */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Tender Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Supply of IT Equipment for District Office"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>

            {/* Organization */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Organization / Department</label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Ministry of Electronics and IT"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. New Delhi"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Estimated Value</label>
                <input
                  type="text"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="e.g. 25,00,000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Published Date</label>
                <input
                  type="date"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Deadline</label>
                <input
                  type="date"
                  value={deadlineAt}
                  onChange={(e) => setDeadlineAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Summary / Description</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief description of the tender scope..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>

            {/* Source URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Source URL (if available)</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || loading}
                className="px-6 py-2.5 bg-cyan-500 text-gray-950 rounded-lg text-sm font-semibold hover:bg-cyan-400 transition disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create & Enter Workflow'}
              </button>
              <button
                onClick={() => router.back()}
                className="px-4 py-2.5 text-gray-400 text-sm hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5 max-w-3xl">
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">How External Tenders Work</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>When you add an external tender, it is immediately created in the system and <strong className="text-gray-300">automatically entered into the workflow</strong> at the Identification stage.</p>
            <p>From there, the same workflow applies — move stages, assign team members, add notes, and track progress just like any scraped tender.</p>
            <p>External tenders are tagged as &quot;Manual Entry&quot; in the source column so they&apos;re distinguishable from auto-crawled ones.</p>
          </div>
        </div>
      </main>
    </div>
  );
}