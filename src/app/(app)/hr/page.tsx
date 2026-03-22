'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Attendance, Profile, EmployeeDocument } from '@/types/database';
import { ROLE_LABELS } from '@/lib/constants';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  UserCheck, Clock, AlertCircle, ChevronRight,
  LogIn, LogOut, AlertTriangle, Users, Calendar, TrendingUp,
  Search, Download, CheckCheck, CalendarOff, Timer
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  loadAttendance as loadAttendanceSvc,
  loadAttendanceRange,
  loadEmployees as loadEmployeesSvc,
  checkIn as checkInSvc,
  bulkCheckIn as bulkCheckInSvc,
  loadExpiringDocuments,
} from '@/lib/services/hr.service';

type Tab = 'today' | 'weekly' | 'monthly';

export default function HRPage() {
  const router = useRouter();
  const { profile: currentUser } = useAuth();
  const { t } = useLocale();

  const [attendance, setAttendance] = useState<(Attendance & { user?: Profile })[]>([]);
  const [weeklyAttendance, setWeeklyAttendance] = useState<Attendance[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<(EmployeeDocument & { user?: { full_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('today');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  // Banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Confirm dialog for bulk check-in
  const confirm = useConfirmDialog();

  const today = new Date().toISOString().split('T')[0];
  const canManageHR = ['ceo', 'hr_manager'].includes(currentUser?.role || '');

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  }, []);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  }, []);

  const loadData = useCallback(async () => {
    const [attRes, empRes, weekRes, monthRes, docsRes] = await Promise.all([
      loadAttendanceSvc(today),
      loadEmployeesSvc(),
      loadAttendanceRange(weekStart, today),
      loadAttendanceRange(monthStart, today),
      loadExpiringDocuments(),
    ]);

    if (attRes.success) setAttendance((attRes.data as typeof attendance) || []);
    else setErrorMsg(attRes.error || 'Failed to load attendance');

    if (empRes.success) setEmployees(empRes.data || []);
    if (weekRes.success) setWeeklyAttendance(weekRes.data || []);
    if (monthRes.success) setMonthlyAttendance(monthRes.data || []);
    if (docsRes.success) setExpiringDocs((docsRes.data as typeof expiringDocs) || []);

    setLoading(false);
  }, [today, weekStart, monthStart]);

  useEffect(() => { loadData(); }, [loadData]);

  // Check in / check out
  async function handleCheckIn(userId: string) {
    setCheckingIn(userId);
    const existing = attendance.find(a => a.user_id === userId);
    const res = await checkInSvc(userId, existing || null);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to check in/out');
    }

    await loadData();
    setCheckingIn(null);
  }

  // Bulk check-in all employees
  function handleBulkCheckInClick() {
    confirm.open({
      title: 'Bulk Check-In',
      message: "Check in all employees who haven't checked in yet?",
      onConfirm: async () => {
        setCheckingIn('bulk');
        const unchecked = filteredEmployees.filter(e => !attendance.find(a => a.user_id === e.id));

        if (unchecked.length === 0) {
          setCheckingIn(null);
          return;
        }

        const res = await bulkCheckInSvc(unchecked.map(e => e.id));
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to bulk check in');
        } else {
          setSuccessMsg(`${unchecked.length} employees checked in.`);
        }

        await loadData();
        setCheckingIn(null);
      },
    });
  }

  // Export monthly attendance to CSV
  function exportCSV() {
    const headers = ['Employee', 'Role', 'Days Present', 'Days Late', 'Total Hours', 'Avg Hours/Day', 'Overtime Hours'];
    const rows = filteredEmployees.map(emp => {
      const stats = getMonthlyStats(emp.id);
      const avgHours = stats.present > 0 ? stats.totalHours / stats.present : 0;
      const overtime = Math.max(0, stats.totalHours - (stats.present * 8));
      return [
        emp.full_name,
        ROLE_LABELS[emp.role] || emp.role,
        stats.present,
        stats.late,
        stats.totalHours.toFixed(1),
        avgHours.toFixed(1),
        overtime.toFixed(1),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit' })}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Compute stats
  const workforceEmployees = employees.filter(e =>
    ['workshop_worker', 'installer', 'workshop_manager', 'designer'].includes(e.role)
  );
  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const absentCount = workforceEmployees.length - presentCount;
  const lateCount = attendance.filter(a => a.status === 'late').length;

  const totalHoursToday = attendance.reduce((sum, a) => {
    if (a.check_in && a.check_out) {
      const diff = new Date(a.check_out).getTime() - new Date(a.check_in).getTime();
      return sum + diff / 3600000;
    }
    if (a.check_in) {
      const diff = Date.now() - new Date(a.check_in).getTime();
      return sum + diff / 3600000;
    }
    return sum;
  }, 0);

  const filteredEmployees = employees.filter(e => {
    if (search && !e.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    return true;
  });

  function getMonthlyStats(userId: string) {
    const records = monthlyAttendance.filter(a => a.user_id === userId);
    const present = records.filter(a => a.status === 'present' || a.status === 'late').length;
    const late = records.filter(a => a.status === 'late').length;
    const totalHours = records.reduce((sum, a) => {
      if (a.check_in && a.check_out) {
        return sum + (new Date(a.check_out).getTime() - new Date(a.check_in).getTime()) / 3600000;
      }
      return sum;
    }, 0);
    const overtime = Math.max(0, totalHours - (present * 8));
    return { present, late, totalHours, overtime };
  }

  const weekDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  function getWeeklyDayStats(date: string) {
    const records = weeklyAttendance.filter(a => a.date === date);
    return {
      present: records.filter(a => a.status === 'present' || a.status === 'late').length,
      late: records.filter(a => a.status === 'late').length,
      absent: workforceEmployees.length - records.filter(a => a.status === 'present' || a.status === 'late').length,
    };
  }

  const uniqueRoles = [...new Set(employees.map(e => e.role))];

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'hr_manager'] as any[]}>
    <div className="space-y-4">
      {/* Banners */}
      <ErrorBanner message={successMsg} type="success" onDismiss={() => setSuccessMsg(null)} autoDismiss={3000} />
      <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('hr.title')}</h1>
          <p className="text-sm text-[#64648B]">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => router.push('/hr/leaves')}>
            <CalendarOff size={14} /> {t('hr.leaves_title')}
          </Button>
        </div>
      </div>

      {/* Expiring Documents Alert */}
      {expiringDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {expiringDocs.length} document{expiringDocs.length > 1 ? 's' : ''} expiring soon
            </p>
            <div className="mt-1 space-y-0.5">
              {expiringDocs.slice(0, 3).map(doc => (
                <p key={doc.id} className="text-xs text-amber-700">
                  {(doc.user as { full_name: string } | undefined)?.full_name} — {doc.document_name}
                  {doc.expiry_date && (
                    <span className="ml-1 font-medium">
                      ({new Date(doc.expiry_date) < new Date() ? 'Expired' : `Expires ${new Date(doc.expiry_date).toLocaleDateString('fr-FR')}`})
                    </span>
                  )}
                </p>
              ))}
              {expiringDocs.length > 3 && (
                <p className="text-xs text-amber-600 font-medium">+{expiringDocs.length - 3} more</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
            <UserCheck size={20} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-[#1a1a2e]">{presentCount}</p>
          <p className="text-[11px] text-[#64648B] font-medium">{t('hr.present')}</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
            <AlertCircle size={20} className="text-red-500" />
          </div>
          <p className="text-2xl font-bold text-[#1a1a2e]">{absentCount < 0 ? 0 : absentCount}</p>
          <p className="text-[11px] text-[#64648B] font-medium">{t('hr.absent')}</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2">
            <Clock size={20} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-[#1a1a2e]">{lateCount}</p>
          <p className="text-[11px] text-[#64648B] font-medium">{t('hr.late')}</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
            <TrendingUp size={20} className="text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-[#1a1a2e]">{totalHoursToday.toFixed(1)}</p>
          <p className="text-[11px] text-[#64648B] font-medium">Hours Today</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F5F3F0] p-1 rounded-xl">
        {([
          { key: 'today', label: 'Today', icon: Users },
          { key: 'weekly', label: 'Weekly', icon: Calendar },
          { key: 'monthly', label: 'Monthly', icon: TrendingUp },
        ] as const).map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === tabItem.key
                ? 'bg-white text-[#1a1a2e] shadow-sm'
                : 'text-[#64648B] hover:text-[#1a1a2e]'
            }`}
          >
            <tabItem.icon size={14} />
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64648B]" />
          <input
            type="text"
            placeholder={`${t('common.search')} ${t('hr.employees').toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E8E5E0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm text-[#1a1a2e] focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30"
        >
          <option value="all">All Roles</option>
          {uniqueRoles.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r] || r.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* TODAY TAB */}
      {tab === 'today' && (
        <>
          {canManageHR && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                onClick={handleBulkCheckInClick}
                loading={checkingIn === 'bulk'}
                disabled={!filteredEmployees.some(e => !attendance.find(a => a.user_id === e.id))}
              >
                <CheckCheck size={14} /> {t('hr.check_in')} {t('common.all')}
              </Button>
            </div>
          )}

          {/* Desktop table */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EDE8]">
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.employees')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.position')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.check_in')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.check_out')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.days')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.status')}</th>
                    {canManageHR && (
                      <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8]">
                  {filteredEmployees.map((emp) => {
                    const att = attendance.find(a => a.user_id === emp.id);
                    const hours = att?.check_in
                      ? ((att.check_out ? new Date(att.check_out).getTime() : Date.now()) - new Date(att.check_in).getTime()) / 3600000
                      : 0;
                    const isCheckedIn = !!att?.check_in && !att?.check_out;

                    return (
                      <tr key={emp.id} className="hover:bg-[#FAFAF8]">
                        <td
                          className="px-5 py-3.5 font-medium text-[#1a1a2e] cursor-pointer"
                          onClick={() => router.push(`/hr/${emp.id}`)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center text-white text-xs font-bold">
                              {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            {emp.full_name}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[#64648B] text-xs">
                          {ROLE_LABELS[emp.role] || emp.role.replace(/_/g, ' ')}
                        </td>
                        <td className="px-5 py-3.5 text-[#64648B]">
                          {att?.check_in ? new Date(att.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="px-5 py-3.5 text-[#64648B]">
                          {att?.check_out ? new Date(att.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="px-5 py-3.5 text-[#64648B] font-medium">
                          {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={att?.status || 'absent'} />
                        </td>
                        {canManageHR && (
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => handleCheckIn(emp.id)}
                              disabled={checkingIn === emp.id}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                isCheckedIn
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                  : att?.check_out
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {isCheckedIn ? (
                                <><LogOut size={12} /> {t('hr.check_out')}</>
                              ) : att?.check_out ? (
                                <>Done</>
                              ) : (
                                <><LogIn size={12} /> {t('hr.check_in')}</>
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {filteredEmployees.map((emp) => {
              const att = attendance.find(a => a.user_id === emp.id);
              const status = att?.status || 'absent';
              const isCheckedIn = !!att?.check_in && !att?.check_out;
              const hours = att?.check_in
                ? ((att.check_out ? new Date(att.check_out).getTime() : Date.now()) - new Date(att.check_in).getTime()) / 3600000
                : 0;

              return (
                <Card key={emp.id} className="p-4">
                  <div className="flex items-center justify-between mb-3" onClick={() => router.push(`/hr/${emp.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${
                        status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                        status === 'late' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a2e]">{emp.full_name}</p>
                        <p className="text-[11px] text-[#64648B]">{ROLE_LABELS[emp.role] || emp.role.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <StatusBadge status={status} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-[11px] text-[#64648B]">
                      {att?.check_in && (
                        <span>In: {new Date(att.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                      {att?.check_out && (
                        <span>Out: {new Date(att.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                      {hours > 0 && <span className="font-medium">{hours.toFixed(1)}h</span>}
                    </div>

                    {canManageHR && (
                      <button
                        onClick={() => handleCheckIn(emp.id)}
                        disabled={checkingIn === emp.id || !!att?.check_out}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                          isCheckedIn
                            ? 'bg-red-50 text-red-700'
                            : att?.check_out
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isCheckedIn ? (
                          <><LogOut size={12} /> Out</>
                        ) : att?.check_out ? (
                          'Done'
                        ) : (
                          <><LogIn size={12} /> In</>
                        )}
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* WEEKLY TAB */}
      {tab === 'weekly' && (
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">Last 7 Days Overview</h3>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(date => {
                const stats = getWeeklyDayStats(date);
                const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = new Date(date + 'T12:00:00').getDate();
                const isToday = date === today;

                return (
                  <div
                    key={date}
                    className={`text-center p-2 rounded-xl ${isToday ? 'bg-[#C9956B]/10 ring-1 ring-[#C9956B]/30' : 'bg-[#F5F3F0]'}`}
                  >
                    <p className={`text-[10px] font-medium ${isToday ? 'text-[#C9956B]' : 'text-[#64648B]'}`}>{dayName}</p>
                    <p className={`text-sm font-bold ${isToday ? 'text-[#C9956B]' : 'text-[#1a1a2e]'}`}>{dayNum}</p>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex items-center justify-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-medium text-emerald-700">{stats.present}</span>
                      </div>
                      {stats.late > 0 && (
                        <div className="flex items-center justify-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span className="text-[10px] font-medium text-amber-700">{stats.late}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly per-employee breakdown */}
          <div className="border-t border-[#F0EDE8]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EDE8]">
                    <th className="text-left px-4 py-3 font-semibold text-[#64648B] text-xs">{t('hr.employees')}</th>
                    {weekDays.map(date => (
                      <th key={date} className="text-center px-2 py-3 font-semibold text-[#64648B] text-[10px]">
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8]">
                  {filteredEmployees.slice(0, 20).map(emp => (
                    <tr key={emp.id} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-2.5 text-xs font-medium text-[#1a1a2e] whitespace-nowrap">
                        {emp.full_name}
                      </td>
                      {weekDays.map(date => {
                        const rec = weeklyAttendance.find(a => a.user_id === emp.id && a.date === date);
                        return (
                          <td key={date} className="text-center px-2 py-2.5">
                            {rec ? (
                              <span className={`inline-block w-5 h-5 rounded-full text-[9px] font-bold leading-5 ${
                                rec.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                rec.status === 'late' ? 'bg-amber-100 text-amber-700' :
                                rec.status === 'half_day' ? 'bg-blue-100 text-blue-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {rec.status === 'present' ? 'P' : rec.status === 'late' ? 'L' : rec.status === 'half_day' ? 'H' : 'A'}
                              </span>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-[9px] font-bold leading-5">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* MONTHLY TAB */}
      {tab === 'monthly' && (
        <div className="space-y-2.5">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#1a1a2e] mb-1">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Summary
                </h3>
                <p className="text-xs text-[#64648B]">
                  Working days so far: {new Set(monthlyAttendance.map(a => a.date)).size}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={exportCSV}>
                <Download size={14} /> {t('common.export')} CSV
              </Button>
            </div>
          </Card>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EDE8]">
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.employees')}</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.position')}</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.present')}</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('hr.late')}</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.total')}</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Avg/Day</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Overtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8]">
                  {filteredEmployees.map(emp => {
                    const stats = getMonthlyStats(emp.id);
                    const avgHours = stats.present > 0 ? stats.totalHours / stats.present : 0;
                    return (
                      <tr key={emp.id} className="hover:bg-[#FAFAF8] cursor-pointer" onClick={() => router.push(`/hr/${emp.id}`)}>
                        <td className="px-5 py-3.5 font-medium text-[#1a1a2e]">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center text-white text-xs font-bold">
                              {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            {emp.full_name}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[#64648B] text-xs">{ROLE_LABELS[emp.role] || emp.role.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">
                            {stats.present}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {stats.late > 0 ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">
                              {stats.late}
                            </span>
                          ) : (
                            <span className="text-[#64648B]">0</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center font-medium text-[#1a1a2e]">
                          {stats.totalHours.toFixed(1)}h
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`font-medium ${avgHours >= 8 ? 'text-emerald-600' : avgHours >= 6 ? 'text-amber-600' : 'text-red-600'}`}>
                            {avgHours.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {stats.overtime > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold">
                              <Timer size={10} /> +{stats.overtime.toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-[#64648B]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile monthly cards */}
          <div className="md:hidden space-y-2.5">
            {filteredEmployees.map(emp => {
              const stats = getMonthlyStats(emp.id);
              const avgHours = stats.present > 0 ? stats.totalHours / stats.present : 0;
              return (
                <Card key={emp.id} className="p-4" onClick={() => router.push(`/hr/${emp.id}`)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center text-white text-xs font-bold">
                        {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a2e]">{emp.full_name}</p>
                        <p className="text-[11px] text-[#64648B]">{ROLE_LABELS[emp.role] || emp.role.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[#64648B]" />
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    <div className="text-center bg-emerald-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-emerald-700">{stats.present}</p>
                      <p className="text-[9px] text-emerald-600">Days</p>
                    </div>
                    <div className="text-center bg-amber-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-amber-700">{stats.late}</p>
                      <p className="text-[9px] text-amber-600">Late</p>
                    </div>
                    <div className="text-center bg-blue-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-blue-700">{stats.totalHours.toFixed(0)}</p>
                      <p className="text-[9px] text-blue-600">Hours</p>
                    </div>
                    <div className={`text-center rounded-lg py-1.5 ${avgHours >= 8 ? 'bg-emerald-50' : avgHours >= 6 ? 'bg-amber-50' : 'bg-red-50'}`}>
                      <p className={`text-sm font-bold ${avgHours >= 8 ? 'text-emerald-700' : avgHours >= 6 ? 'text-amber-700' : 'text-red-700'}`}>
                        {avgHours.toFixed(1)}
                      </p>
                      <p className="text-[9px] text-[#64648B]">Avg/Day</p>
                    </div>
                    <div className="text-center bg-orange-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-orange-700">{stats.overtime > 0 ? `+${stats.overtime.toFixed(0)}` : '0'}</p>
                      <p className="text-[9px] text-orange-600">OT</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredEmployees.length === 0 && (
        <EmptyState
          icon={<Users size={48} />}
          title={t('common.no_results') || 'No employees found'}
        />
      )}
    </div>

    {/* Confirm Dialog for bulk check-in */}
    <ConfirmDialog
      isOpen={confirm.isOpen}
      onClose={confirm.close}
      onConfirm={confirm.confirm}
      title={confirm.title}
      message={confirm.message}
      variant="warning"
      loading={confirm.loading}
    />
    </RoleGuard>
  );
}
