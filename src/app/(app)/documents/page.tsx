'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import DocumentViewer from '@/components/scanner/DocumentViewer';
import type { ScannedDocument } from '@/types/database';
import {
  Plus, Search, Filter, FileText, Image, File, Camera, Eye, Trash2, Tag
} from 'lucide-react';

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: '🧾',
  delivery_note: '📦',
  purchase_order: '📋',
  technical_drawing: '📐',
  photo: '📷',
  contract: '📄',
  other: '📎',
};

const STATUS_COLORS: Record<string, 'yellow' | 'blue' | 'green' | 'red'> = {
  pending: 'yellow',
  processing: 'blue',
  completed: 'green',
  failed: 'red',
};

export default function DocumentsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState<ScannedDocument | null>(null);
  const [selectedDocUrl, setSelectedDocUrl] = useState('');

  useEffect(() => {
    loadDocuments();
  }, [typeFilter]);

  async function loadDocuments() {
    setLoading(true);
    let query = supabase
      .from('scanned_documents')
      .select(`
        *,
        project:projects(name),
        sheet:production_sheets(sheet_number),
        uploader:profiles!uploaded_by(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (typeFilter !== 'all') {
      query = query.eq('document_type', typeFilter);
    }

    const { data } = await query;
    setDocuments((data as any[]) || []);
    setLoading(false);
  }

  const filtered = documents.filter(doc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      doc.title.toLowerCase().includes(s) ||
      doc.original_filename?.toLowerCase().includes(s) ||
      doc.tags.some(tag => tag.toLowerCase().includes(s)) ||
      doc.ocr_text?.toLowerCase().includes(s)
    );
  });

  const openDocument = async (doc: ScannedDocument) => {
    const { data } = supabase.storage
      .from('scanned-documents')
      .getPublicUrl(doc.storage_path);
    setSelectedDocUrl(data.publicUrl);
    setSelectedDoc(doc);
  };

  const updateTags = async (docId: string, tags: string[]) => {
    await supabase
      .from('scanned_documents')
      .update({ tags })
      .eq('id', docId);

    setDocuments(docs => docs.map(d => d.id === docId ? { ...d, tags } : d));
    if (selectedDoc?.id === docId) {
      setSelectedDoc(prev => prev ? { ...prev, tags } : null);
    }
  };

  const deleteDocument = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    if (!confirm('Delete this document? This action cannot be undone.')) return;

    // Delete from storage
    await supabase.storage.from('scanned-documents').remove([doc.storage_path]);
    if (doc.thumbnail_path) {
      await supabase.storage.from('scanned-documents').remove([doc.thumbnail_path]);
    }

    // Delete from DB
    await supabase.from('scanned_documents').delete().eq('id', docId);
    setDocuments(docs => docs.filter(d => d.id !== docId));
    if (selectedDoc?.id === docId) setSelectedDoc(null);
  };

  // Stats
  const stats = {
    total: documents.length,
    invoices: documents.filter(d => d.document_type === 'invoice').length,
    delivery: documents.filter(d => d.document_type === 'delivery_note').length,
    photos: documents.filter(d => d.document_type === 'photo').length,
  };

  return (
    <RoleGuard allowedRoles={['ceo','commercial_manager','designer','workshop_manager','workshop_worker','installer'] as any[]}>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('documents.title') || 'Documents'}</h1>
            <p className="text-sm text-gray-500">{t('documents.subtitle') || 'Scanned documents and files'}</p>
          </div>
          <Button onClick={() => router.push('/documents/scanner')}>
            <Camera className="w-4 h-4 mr-2" />
            {t('scanner.scan_new') || 'Scan / Upload'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-2xl font-bold">{stats.invoices}</p>
                <p className="text-xs text-gray-500">🧾 Invoices</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-2xl font-bold">{stats.delivery}</p>
                <p className="text-xs text-gray-500">📦 Delivery Notes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-2xl font-bold">{stats.photos}</p>
                <p className="text-xs text-gray-500">📷 Photos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('documents.search') || 'Search documents, tags, text...'}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2.5 border rounded-lg"
          >
            <option value="all">All Types</option>
            <option value="invoice">🧾 Invoices</option>
            <option value="delivery_note">📦 Delivery Notes</option>
            <option value="purchase_order">📋 Purchase Orders</option>
            <option value="technical_drawing">📐 Drawings</option>
            <option value="photo">📷 Photos</option>
            <option value="contract">📄 Contracts</option>
            <option value="other">📎 Other</option>
          </select>
        </div>

        {/* Document Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <FileText size={48} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">{t('documents.empty') || 'No documents found'}</p>
                <p className="text-sm mt-1">Scan or upload your first document</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(doc => (
              <Card key={doc.id}>
                <CardContent>
                  <div className="flex items-start gap-3 py-2">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                      {DOC_TYPE_ICONS[doc.document_type] || '📎'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{doc.title}</h3>
                      <p className="text-xs text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString()}
                        {doc.file_size_bytes && ` • ${(doc.file_size_bytes / 1024).toFixed(0)} KB`}
                      </p>
                      {doc.project && (
                        <p className="text-xs text-blue-600 mt-0.5">📁 {doc.project.name}</p>
                      )}
                      {doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doc.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                          {doc.tags.length > 3 && (
                            <span className="text-xs text-gray-400">+{doc.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => openDocument(doc)}
                        className="p-1.5 hover:bg-gray-100 rounded"
                        title="View"
                      >
                        <Eye size={16} className="text-gray-500" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Document Viewer Modal */}
        {selectedDoc && (
          <DocumentViewer
            document={selectedDoc}
            imageUrl={selectedDocUrl}
            onClose={() => setSelectedDoc(null)}
            onUpdateTags={tags => updateTags(selectedDoc.id, tags)}
          />
        )}
      </div>
    </RoleGuard>
  );
}
