'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { createTicket, checkWarranty, getInstallers } from '@/lib/services/sav.service';
import { createClient } from '@/lib/supabase/client';
import type { SavIssueType, SavPriority, SavWarrantyStatus } from '@/types/sav';
import {
  ArrowLeft, ShieldCheck, ShieldOff, ShieldQuestion,
  AlertTriangle, Wrench, DoorOpen, RectangleHorizontal, Hammer, Settings,
} from 'lucide-react';

// ── Issue type options ────────────────────────────────────────────────────────

const ISSUE_TYPES: { key: SavIssueType; icon: React.ReactNode; label: string }[] = [
  { key: 'hinge_problem', icon: <Settings size={18} />, label: 'Hinge Problem' },
  { key: 'drawer_problem', icon: <RectangleHorizontal size={18} />, label: 'Drawer Problem' },
  { key: 'door_alignment', icon: <DoorOpen size={18} />, label: 'Door Alignment' },
  { key: 'damaged_panel', icon: <AlertTriangle size={18} />, label: 'Damaged Panel' },
  { key: 'installation_correction', icon: <Hammer size={18} />, label: 'Installation Fix' },
  { key: 'other', icon: <Wrench size={18} />, label: 'Other' },
];

// ── Priority options ─────────────────────────────────────────────────────────

const PRIORITIES: { key: SavPriority; label: string; color: string; activeColor: string }[] = [
  { key: 'low', label: 'Low', color: 'bg-gray-100 text-[#64648B]', activeColor: 'bg-gray-600 text-white ring-1 ring-gray-600' },
  { key: 'normal', label: 'Normal', color: 'bg-blue-50 text-blue-600', activeColor: 'bg-blue-600 text-white ring-1 ring-blue-600' },
  { key: 'urgent', label: 'Urgent', color: 'bg-red-50 text-red-600', activeColor: 'bg-red-600 text-white ring-1 ring-red-600' },
];

// ── Warranty banner ──────────────────────────────────────────────────────────

function WarrantyBanner({ status, expiryDate }: { status: SavWarrantyStatus; expiryDate: string | null }) {
  if (status === 'under_warranty') {
    return (
      <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
        <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-700">Under Warranty</p>
          {expiryDate && (
            <p className="text-xs text-emerald-600">
              Expires {new Date(expiryDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
        <ShieldOff size={20} className="text-red-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Warranty Expired</p>
          {expiryDate && (
            <p className="text-xs text-red-600">
              Expired {new Date(expiryDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
      <ShieldQuestion size={20} className="text-gray-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-600">Warranty Unknown</p>
        <p className="text-xs text-gray-500">No delivery date recorded for this project</p>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  reference_code: string;
  client_name: string;
}

export default function NewSavTicketPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { t } = useLocale();

  // Form state
  const [projectId, setProjectId] = useState('');
  const [issueType, setIssueType] = useState<SavIssueType | ''>('');
  const [priority, setPriority] = useState<SavPriority>('normal');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  // Data
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [installers, setInstallers] = useState<{ id: string; full_name: string }[]>([]);
  const [warranty, setWarranty] = useState<{ status: SavWarrantyStatus; expiry_date: string | null } | null>(null);

  // UI state
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [checkingWarranty, setCheckingWarranty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Load projects + installers ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingProjects(true);

    const supabase = createClient();
    const [projRes, instRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, reference_code, client_name')
        .in('status', ['delivered', 'installation', 'production'])
        .order('created_at', { ascending: false })
        .limit(200),
      getInstallers(),
    ]);

    if (projRes.data) {
      setProjects(projRes.data);
    }
    if (instRes.success && instRes.data) {
      setInstallers(instRes.data);
    }

    setLoadingProjects(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Warranty check on project change ────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      setWarranty(null);
      return;
    }

    let cancelled = false;
    setCheckingWarranty(true);

    checkWarranty(projectId).then((result) => {
      if (!cancelled) {
        setWarranty(result);
        setCheckingWarranty(false);
      }
    });

    return () => { cancelled = true; };
  }, [projectId]);

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setErrorMsg(null);

    if (!projectId) { setErrorMsg('Please select a project.'); return; }
    if (!issueType) { setErrorMsg('Please select an issue type.'); return; }
    if (!description.trim()) { setErrorMsg('Please describe the issue.'); return; }

    setSaving(true);

    const res = await createTicket({
      project_id: projectId,
      issue_type: issueType,
      issue_description: description.trim(),
      priority,
      assigned_to: assignedTo || null,
      created_by: profile?.id || '',
    });

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to create ticket');
      setSaving(false);
      return;
    }

    router.push(`/sav/${res.data!.id}`);
  }

  const canSubmit = projectId && issueType && description.trim() && !saving;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'installer', 'workshop_manager', 'operations_manager', 'owner_admin'] as any[]}>
      <div className="space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-[#F5F3F0] flex items-center justify-center hover:bg-[#EDE9E3] transition-colors"
          >
            <ArrowLeft size={18} className="text-[#1a1a2e]" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">New SAV Ticket</h1>
            <p className="text-sm text-[#64648B]">Report an after-sales issue</p>
          </div>
        </div>

        {/* Error Banner */}
        <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

        {/* Project Selector */}
        <div>
          <label className="block text-[13px] font-medium text-[#4A4A6A] mb-2">
            Project *
          </label>
          {loadingProjects ? (
            <div className="h-12 skeleton rounded-xl" />
          ) : (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-3 border border-[#E2E0DC] rounded-xl text-sm bg-white shadow-sm shadow-black/[0.02] focus:outline-none focus:ring-2 focus:ring-[#C9956B]/15 focus:border-[#C9956B]/60"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference_code} - {p.client_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Warranty Banner */}
        {projectId && !checkingWarranty && warranty && (
          <WarrantyBanner status={warranty.status} expiryDate={warranty.expiry_date} />
        )}
        {checkingWarranty && (
          <div className="h-16 skeleton rounded-xl" />
        )}

        {/* Issue Type */}
        <div>
          <label className="block text-[13px] font-medium text-[#4A4A6A] mb-2">
            Issue Type *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ISSUE_TYPES.map((it) => {
              const isActive = issueType === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setIssueType(it.key)}
                  className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all border ${
                    isActive
                      ? 'bg-[#C9956B]/10 border-[#C9956B]/40 text-[#9E7350] ring-1 ring-[#C9956B]/20'
                      : 'bg-white border-[#E8E5E0] text-[#64648B] hover:bg-[#FAFAF8] hover:border-[#D5D2CD]'
                  }`}
                >
                  <span className={isActive ? 'text-[#C9956B]' : 'text-[#B8B8C8]'}>{it.icon}</span>
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-[13px] font-medium text-[#4A4A6A] mb-2">
            Priority
          </label>
          <div className="flex gap-2">
            {PRIORITIES.map((p) => {
              const isActive = priority === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive ? p.activeColor : p.color
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <Textarea
          label="Description *"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the issue in detail... What happened? Where exactly?"
        />

        {/* Assign To */}
        <div>
          <label className="block text-[13px] font-medium text-[#4A4A6A] mb-2">
            Assign To
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full px-4 py-3 border border-[#E2E0DC] rounded-xl text-sm bg-white shadow-sm shadow-black/[0.02] focus:outline-none focus:ring-2 focus:ring-[#C9956B]/15 focus:border-[#C9956B]/60"
          >
            <option value="">Unassigned</option>
            {installers.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.full_name}</option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <div className="pt-2 pb-6">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={saving}
            fullWidth
            size="lg"
            variant="accent"
          >
            Create Ticket
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}
