'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { ROLE_LABELS } from '@/lib/constants';
import type { Profile, UserRole } from '@/types/database';
import { ArrowLeft, Plus, X, UserCog, Shield, KeyRound, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

type ModalMode = 'create' | 'edit' | 'password' | null;

export default function UsersPage() {
  const { isCeo } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'workshop_worker' as UserRole,
    password: '',
  });

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    setUsers(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditingUser(null);
    setForm({ full_name: '', email: '', phone: '', role: 'workshop_worker', password: '' });
    setError('');
    setModalMode('create');
  }

  function openEdit(user: Profile) {
    setEditingUser(user);
    setForm({ full_name: user.full_name, email: user.email || '', phone: user.phone || '', role: user.role, password: '' });
    setError('');
    setModalMode('edit');
  }

  function openPasswordReset(user: Profile) {
    setEditingUser(user);
    setForm({ ...form, password: '' });
    setError('');
    setModalMode('password');
  }

  function closeModal() {
    setModalMode(null);
    setEditingUser(null);
    setError('');
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone,
        role: form.role,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to create user');
      return;
    }

    closeModal();
    showSuccess(`${form.full_name} created successfully`);
    loadUsers();
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);

    await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone || null,
      role: form.role,
      updated_at: new Date().toISOString(),
    }).eq('id', editingUser.id);

    setSaving(false);
    closeModal();
    showSuccess('Profile updated');
    loadUsers();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setError('');
    setSaving(true);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reset_password',
        userId: editingUser.id,
        newPassword: form.password,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to reset password');
      return;
    }

    closeModal();
    showSuccess(`Password reset for ${editingUser.full_name}`);
  }

  async function toggleActive(user: Profile) {
    const action = user.is_active ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${user.full_name}?`)) return;
    await supabase.from('profiles').update({
      is_active: !user.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    loadUsers();
  }

  if (!isCeo) {
    return (
      <div className="text-center py-12">
        <Shield size={48} className="text-[#E8E5E0] mx-auto mb-3" />
        <p className="text-[#64648B]">Only CEO can manage users</p>
      </div>
    );
  }

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'] as any[]}>
    <div className="space-y-4">
      {/* Success toast */}
      {success && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto bg-emerald-600 text-white px-4 py-3 rounded-xl flex items-center gap-2 shadow-lg z-50 animate-fade-scale">
          <Check size={18} /> {success}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="p-2 hover:bg-[#F5F3F0] rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight flex-1">{t('users.title')}</h1>
        <Button onClick={openCreate}><Plus size={16} /> <span className="hidden sm:inline">{t('users.add_user')}</span><span className="sm:hidden">{t('common.add')}</span></Button>
      </div>

      <p className="text-sm text-[#64648B]">
        {users.length} {t('users.title')} - {users.filter(u => u.is_active).length} {t('users.active')}
      </p>

      {/* Users list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {users.map(user => (
            <Card key={user.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                  user.is_active ? 'bg-gradient-to-br from-[#1B2A4A] to-[#2A3F6A]' : 'bg-gray-300'
                }`}>
                  {user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold truncate ${user.is_active ? 'text-[#1a1a2e]' : 'text-[#64648B]'}`}>
                      {user.full_name}
                    </p>
                    {!user.is_active && (
                      <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-lg font-semibold flex-shrink-0">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-[#64648B] truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="hidden sm:block">
                    <StatusBadge status={user.role} />
                  </div>
                  <button
                    onClick={() => openPasswordReset(user)}
                    className="p-2 hover:bg-[#F5F3F0] rounded-xl"
                    title="Reset password"
                  >
                    <KeyRound size={15} className="text-[#64648B]" />
                  </button>
                  <button
                    onClick={() => openEdit(user)}
                    className="p-2 hover:bg-[#F5F3F0] rounded-xl"
                    title="Edit user"
                  >
                    <UserCog size={15} className="text-[#64648B]" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-fade-scale">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1a2e]">{t('users.add_user')}</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-[#F5F3F0] rounded-xl"><X size={20} /></button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3">
              <Input label="Full Name *" required value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })} />

              <Input label="Email *" type="email" required placeholder="user@artmood.ma" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />

              <Input label="Password *" type="password" required placeholder="Min 6 characters" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />

              <Input label="Phone" placeholder="06 XX XX XX XX" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })} />

              <Select label="Role *" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                options={roleOptions} />

              <Button type="submit" fullWidth loading={saving} size="lg" className="mt-2">{t('users.add_user')}</Button>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {modalMode === 'edit' && editingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-fade-scale">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1a2e]">{t('common.edit')}</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-[#F5F3F0] rounded-xl"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditUser} className="space-y-3">
              <Input label="Full Name *" required value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })} />

              <Input label="Email" disabled value={form.email} onChange={() => {}} />

              <Input label="Phone" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })} />

              <Select label="Role *" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                options={roleOptions} />

              <div className="flex gap-2 pt-2">
                <Button type="submit" fullWidth loading={saving} size="lg">{t('common.save')}</Button>
                <Button
                  type="button"
                  variant={editingUser.is_active ? 'danger' : 'success'}
                  size="lg"
                  onClick={() => { toggleActive(editingUser); closeModal(); }}
                >
                  {editingUser.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {modalMode === 'password' && editingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-fade-scale">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1a2e]">{t('users.reset_password')}</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-[#F5F3F0] rounded-xl"><X size={20} /></button>
            </div>

            <div className="mb-4 p-3 bg-[#F5F3F0] rounded-xl">
              <p className="text-sm font-semibold text-[#1a1a2e]">{editingUser.full_name}</p>
              <p className="text-xs text-[#64648B]">{editingUser.email}</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <Input
                label="New Password *"
                type="password"
                required
                placeholder="Min 6 characters"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />

              <p className="text-xs text-[#64648B]">
                The user will need to log in with this new password. They will not receive an email notification.
              </p>

              <Button type="submit" fullWidth loading={saving} size="lg" className="mt-2">{t('users.reset_password')}</Button>
            </form>
          </div>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
