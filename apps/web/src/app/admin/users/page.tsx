'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, apiFetch, usersApi } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

interface UserItem {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  profile?: {
    fullName: string | null;
    designation: string | null;
    teamName: string | null;
  } | null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const currentUser = getUser();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'BD' | 'ADMIN'>('BD');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'ADMIN') {
      router.replace('/login');
      return;
    }
    loadUsers();
  }, []); // eslint-disable-line

  const loadUsers = async () => {
    try {
      const res = await apiFetch('/auth/admin/users');
      if (res.ok) {
        setUsers(await res.json());
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async () => {
    if (!newEmail || !newPassword) return;
    setCreating(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiFetch('/auth/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(`User ${data.email} created successfully`);
        setNewEmail('');
        setNewPassword('');
        setNewRole('BD');
        setShowForm(false);
        loadUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to create user');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const toggleUserActive = async (userId: string, email: string, currentlyActive: boolean) => {
    // Don't allow deactivating yourself
    if (userId === currentUser?.id) {
      setError('You cannot deactivate your own account');
      return;
    }

    const action = currentlyActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${email}? ${currentlyActive ? 'They will no longer be able to log in.' : 'They will be able to log in again.'}`)) {
      return;
    }

    setToggling(userId);
    setError('');
    setSuccess('');

    try {
      const res = await usersApi.toggleActive(userId);
      if (res.ok) {
        const data = await res.json();
        setSuccess(`${email} has been ${data.isActive ? 'activated' : 'deactivated'}`);
        loadUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || `Failed to ${action} user`);
      }
    } catch (e: any) {
      setError(e.message || `Failed to ${action} user`);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-gray-500 text-sm mt-1">Create and manage team members who can access TenderWatch</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 bg-cyan-500 text-gray-950 rounded-lg text-sm font-semibold hover:bg-cyan-400 transition"
          >
            {showForm ? 'Cancel' : '+ Add User'}
          </button>
        </div>

        {/* Status messages */}
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

        {/* Create User Form */}
        {showForm && (
          <div className="bg-gray-900/60 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold mb-4">Create New User</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'BD' | 'ADMIN')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="BD">BD (Team Member)</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={createUser}
                  disabled={!newEmail || !newPassword || creating}
                  className="w-full px-4 py-2.5 bg-cyan-500 text-gray-950 rounded-lg text-sm font-semibold hover:bg-cyan-400 transition disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-3">
              The user will be able to log in immediately with these credentials. BD users can search, enter workflows, and manage their stages. Admins have full access including reports and user management.
            </p>
          </div>
        )}

        {/* Info box */}
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">About User Roles</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p><strong className="text-gray-300">BD (Business Development):</strong> Can search tenders, enter them into workflow, move stages, add notes, view their dashboard and productivity scores.</p>
            <p><strong className="text-gray-300">Admin:</strong> Everything BD can do, plus manage users, view all user activity, access admin dashboard, run reports, and manage source sites.</p>
            <p className="text-gray-500 mt-2">Deactivated users cannot log in and are excluded from email reports and leaderboards.</p>
          </div>
        </div>

        {/* Users list */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold">Team Members</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 animate-pulse">Loading users...</div>
          ) : users.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">User</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className={`border-b border-white/5 hover:bg-white/5 transition ${!u.isActive ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            u.isActive
                              ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
                              : 'bg-gray-700'
                          }`}>
                            {u.email[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-white">{u.profile?.fullName || u.email}</div>
                            {u.profile?.fullName && <div className="text-xs text-gray-500">{u.email}</div>}
                            {u.profile?.designation && <div className="text-xs text-gray-600">{u.profile.designation}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isSelf && (
                          <button
                            onClick={() => toggleUserActive(u.id, u.email, u.isActive)}
                            disabled={toggling === u.id}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 ${
                              u.isActive
                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            }`}
                          >
                            {toggling === u.id ? '...' : u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {isSelf && (
                          <span className="text-xs text-gray-600">You</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">No users found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}