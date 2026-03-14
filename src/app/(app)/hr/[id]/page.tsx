'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { EMPLOYEE_DOCUMENT_TYPES } from '@/lib/constants';
import { useLocale } from '@/lib/hooks/useLocale';
import type { Profile, EmployeeDocument, EmployeeDocumentType } from '@/types/database';
import {
  ArrowLeft, User, Phone, Mail, FileText, Plus, Trash2,
  Calendar, AlertTriangle, ExternalLink, X
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile: currentUser } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [employee, setEmployee] = useState<Profile | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [docType, setDocType] = useState<EmployeeDocumentType>('contract');
  const [docName, setDocName] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [empRes, docsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('employee_documents')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setEmployee(empRes.data as Profile);
    setDocuments((docsRes.data as EmployeeDocument[]) || []);
    setLoading(false);
  }

  function resetForm() {
    setDocType('contract');
    setDocName('');
    setIssueDate('');
    setExpiryDate('');
    setDocNotes('');
    setUploadedUrl('');
    setShowUpload(false);
  }

  async function saveDocument() {
    if (!docName.trim() || !uploadedUrl) return;

    await supabase.from('employee_documents').insert({
      user_id: id,
      document_type: docType,
      document_name: docName.trim(),
      file_url: uploadedUrl,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      notes: docNotes || null,
      uploaded_by: currentUser?.id,
    });

    resetForm();
    loadData();
  }

  async function deleteDocument(docId: string) {
    if (!confirm('Delete this document?')) return;
    await supabase.from('employee_documents').delete().eq('id', docId);
    loadData();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!employee) return <div className="text-center py-12 text-gray-500">Employee not found</div>;

  // Check for expiring documents (within 30 days)
  const now = new Date();
  const expiringDocs = documents.filter(d => {
    if (!d.expiry_date) return false;
    const expiry = new Date(d.expiry_date);
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    return daysUntil <= 30 && daysUntil >= 0;
  });
  const expiredDocs = documents.filter(d => {
    if (!d.expiry_date) return false;
    return new Date(d.expiry_date) < now;
  });

  return (
    <RoleGuard allowedRoles={['ceo', 'hr_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/hr')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{employee.full_name}</h1>
          <p className="text-sm text-[#64648B]">{employee.role.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Employee Info */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center text-white text-xl font-bold">
              {employee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="space-y-1.5">
              {employee.phone && (
                <a href={`tel:${employee.phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                  <Phone size={14} className="text-gray-400" /> {employee.phone}
                </a>
              )}
              {employee.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail size={14} className="text-gray-400" /> {employee.email}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Calendar size={12} /> {t('hr.join_date')} {new Date(employee.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expiry Alerts */}
      {(expiredDocs.length > 0 || expiringDocs.length > 0) && (
        <div className="space-y-2">
          {expiredDocs.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {expiredDocs.length} document{expiredDocs.length > 1 ? 's' : ''} expired: {expiredDocs.map(d => d.document_name).join(', ')}
              </p>
            </div>
          )}
          {expiringDocs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">
                {expiringDocs.length} document{expiringDocs.length > 1 ? 's' : ''} expiring soon: {expiringDocs.map(d => d.document_name).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Documents Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#1a1a2e]">{t('hr.documents')} ({documents.length})</h2>
        {['ceo', 'hr_manager'].includes(currentUser?.role || '') && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Plus size={14} /> {t('common.upload')}
          </Button>
        )}
      </div>

      {/* Upload Form */}
      {showUpload && (
        <Card className="border-blue-200">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{t('common.upload')} {t('hr.documents')}</h3>
                <button onClick={resetForm}><X size={18} className="text-gray-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.type')}</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as EmployeeDocumentType)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm"
                  >
                    {EMPLOYEE_DOCUMENT_TYPES.map(t => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label={t('common.name')}
                  placeholder="e.g. CIN - Front"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('common.date')}
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
                <Input
                  label={t('hr.end_date')}
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>

              <Input
                label={t('common.notes')}
                placeholder="Optional notes..."
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
              />

              <PhotoUpload
                bucket="projects"
                pathPrefix={`employee-docs/${id}`}
                onUpload={(data) => setUploadedUrl(data.url)}
                existingPhotos={uploadedUrl ? [{ url: uploadedUrl }] : []}
                maxPhotos={1}
                label="Upload File"
              />

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={resetForm}>{t('common.cancel')}</Button>
                <Button
                  className="flex-1"
                  onClick={saveDocument}
                  disabled={!docName.trim() || !uploadedUrl}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document List */}
      <div className="space-y-2.5">
        {documents.map(doc => {
          const isExpired = doc.expiry_date && new Date(doc.expiry_date) < now;
          const isExpiring = doc.expiry_date && !isExpired && (() => {
            const daysUntil = Math.ceil((new Date(doc.expiry_date!).getTime() - now.getTime()) / 86400000);
            return daysUntil <= 30;
          })();

          return (
            <Card
              key={doc.id}
              className={`p-4 ${isExpired ? 'border-red-200 bg-red-50/30' : isExpiring ? 'border-amber-200 bg-amber-50/30' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isExpired ? 'bg-red-100' : 'bg-[#F5F3F0]'
                  }`}>
                    <FileText size={18} className={isExpired ? 'text-red-500' : 'text-[#64648B]'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1a1a2e]">{doc.document_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={doc.document_type} />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#64648B]">
                      {doc.issue_date && (
                        <span>Issued: {new Date(doc.issue_date).toLocaleDateString('fr-FR')}</span>
                      )}
                      {doc.expiry_date && (
                        <span className={isExpired ? 'text-red-600 font-medium' : isExpiring ? 'text-amber-600 font-medium' : ''}>
                          {isExpired ? 'Expired' : 'Expires'}: {new Date(doc.expiry_date).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    {doc.notes && <p className="text-xs text-[#64648B] mt-1">{doc.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                    title="View document"
                  >
                    <ExternalLink size={16} />
                  </a>
                  {['ceo', 'hr_manager'].includes(currentUser?.role || '') && (
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete document"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {documents.length === 0 && !showUpload && (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
          {['ceo', 'hr_manager'].includes(currentUser?.role || '') && (
            <Button variant="secondary" className="mt-3" onClick={() => setShowUpload(true)}>
              <Plus size={14} /> {t('common.upload')} {t('hr.documents')}
            </Button>
          )}
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
