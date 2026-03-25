'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, apiFetch } from '../lib/api';
import Sidebar from '../components/Sidebar';

export default function ProfilePage() {
  const router = useRouter();
  const currentUser = getUser();

  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    loadProfile();
  }, []); // eslint-disable-line

  const loadProfile = async () => {
    try {
      const res = await apiFetch('/auth/profile/me');
      if (res.ok) {
        const data = await res.json();
        setFullName(data.fullName || '');
        setDesignation(data.designation || '');
        setTeamName(data.teamName || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch('/auth/profile/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, designation, teamName }),
      });

      if (res.ok) {
        setSuccess('Profile updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to update profile');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="max-w-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">My Profile</h1>
            <p className="text-gray-500 text-sm mt-1">Set your name, designation, and team</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
              {error}
              <button onClick={() => setError('')} className="text-red-300 ml-3">×</button>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-center justify-between">
              {success}
              <button onClick={() => setSuccess('')} className="text-green-300 ml-3">×</button>
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 animate-pulse">Loading profile...</div>
          ) : (
            <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-500">
                  {currentUser?.email}
                </div>
              </div>

              {/* Role (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
                <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-500">
                  {currentUser?.role === 'ADMIN' ? 'Admin' : 'BD (Business Development)'}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
                />
                <p className="text-xs text-gray-600 mt-1">This will appear in leaderboards, reports, and activity logs</p>
              </div>

              {/* Designation */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. BD Manager, Senior Associate"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
                />
              </div>

              {/* Team Name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Team</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Government BD, HR Solutions"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-cyan-500 text-gray-950 rounded-lg text-sm font-semibold hover:bg-cyan-400 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}