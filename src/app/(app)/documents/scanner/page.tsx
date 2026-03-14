'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import CameraCapture from '@/components/scanner/CameraCapture';
import {
  uploadDocument,
  detectDocumentType,
} from '@/lib/utils/document-processor';
import {
  ArrowLeft, Camera, Upload, FileText, Loader2, CheckCircle, AlertCircle
} from 'lucide-react';

type DocType = 'invoice' | 'delivery_note' | 'purchase_order' | 'technical_drawing' | 'photo' | 'contract' | 'other';

const DOC_TYPES: { value: DocType; label: string; icon: string }[] = [
  { value: 'invoice', label: 'Invoice / Facture', icon: '🧾' },
  { value: 'delivery_note', label: 'Bon de Livraison', icon: '📦' },
  { value: 'purchase_order', label: 'Purchase Order', icon: '📋' },
  { value: 'technical_drawing', label: 'Technical Drawing', icon: '📐' },
  { value: 'photo', label: 'Photo', icon: '📷' },
  { value: 'contract', label: 'Contract', icon: '📄' },
  { value: 'other', label: 'Other', icon: '📎' },
];

export default function DocumentScannerPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>('other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [sheets, setSheets] = useState<Array<{ id: string; sheet_number: string }>>([]);

  // Load projects and sheets on mount
  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('projects').select('id, client_name, reference_code').order('created_at', { ascending: false }).limit(50);
      if (p) setProjects(p.map(proj => ({ id: proj.id, name: `${proj.client_name} · ${proj.reference_code}` })));
      const { data: s } = await supabase.from('production_sheets').select('id, sheet_number').order('created_at', { ascending: false }).limit(50);
      if (s) setSheets(s);
    }
    load();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleCameraCapture = (file: File) => {
    setShowCamera(false);
    processFile(file);
  };

  const processFile = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    setSuccess(false);

    // Auto-detect doc type
    const detected = detectDocumentType(file.name);
    setDocType(detected as DocType);

    // Auto-set title
    if (!title) {
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(baseName);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !profile) return;

    setUploading(true);
    setError('');

    try {
      // 1. Upload to storage
      const { storagePath, thumbnailPath } = await uploadDocument(selectedFile, docType);

      // 2. Save to database
      const { error: dbError } = await supabase.from('scanned_documents').insert({
        uploaded_by: profile.id,
        document_type: docType,
        title: title || 'Untitled',
        description: description || null,
        original_filename: selectedFile.name,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        file_size_bytes: selectedFile.size,
        mime_type: selectedFile.type,
        project_id: projectId || null,
        production_sheet_id: sheetId || null,
        status: 'completed',
        tags: [],
      });

      if (dbError) throw dbError;

      setSuccess(true);
      setTimeout(() => {
        router.push('/documents');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setTitle('');
    setDescription('');
    setDocType('other');
    setProjectId('');
    setSheetId('');
    setSuccess(false);
    setError('');
  };

  return (
    <RoleGuard allowedRoles={['ceo','commercial_manager','designer','workshop_manager','workshop_worker','installer'] as any[]}>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{t('scanner.title') || 'Document Scanner'}</h1>
            <p className="text-sm text-gray-500">{t('scanner.subtitle') || 'Scan or upload documents'}</p>
          </div>
        </div>

        {/* Success */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle className="text-green-600" size={24} />
            <div>
              <p className="font-medium text-green-800">{t('scanner.upload_success') || 'Document uploaded successfully!'}</p>
              <p className="text-sm text-green-600">Redirecting to documents...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="text-red-600" size={24} />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!selectedFile ? (
          /* Capture Options */
          <div className="space-y-4">
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 py-4">
                  <button
                    onClick={() => setShowCamera(true)}
                    className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <Camera size={40} className="text-blue-600" />
                    <span className="font-medium">{t('scanner.take_photo') || 'Take Photo'}</span>
                    <span className="text-xs text-gray-500">Use camera</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <Upload size={40} className="text-blue-600" />
                    <span className="font-medium">{t('scanner.upload_file') || 'Upload File'}</span>
                    <span className="text-xs text-gray-500">JPG, PNG, PDF</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </CardContent>
            </Card>

            {/* Recent scans quick info */}
            <Card>
              <CardHeader>{t('scanner.tips') || 'Tips'}</CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Place document on a flat, well-lit surface
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Align document within the guide frame
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Avoid shadows and glare on the document
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Supported: invoices, delivery notes, drawings, photos
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Review and Upload Form */
          <div className="space-y-4">
            {/* Preview */}
            <Card>
              <CardContent>
                <div className="flex items-start gap-4 py-2">
                  {previewUrl && selectedFile?.type.startsWith('image/') ? (
                    <img src={previewUrl} alt="Preview" className="w-24 h-24 object-cover rounded-lg border" />
                  ) : (
                    <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                      <FileText size={32} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}
                    </p>
                    <button onClick={resetForm} className="text-sm text-red-600 hover:underline mt-1">
                      Change file
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Document Type */}
            <Card>
              <CardHeader>{t('scanner.doc_type') || 'Document Type'}</CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DOC_TYPES.map(dt => (
                    <button
                      key={dt.value}
                      onClick={() => setDocType(dt.value)}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left text-sm transition-colors ${
                        docType === dt.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span>{dt.icon}</span>
                      <span className="truncate">{dt.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader>{t('scanner.details') || 'Details'}</CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Document title..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description (optional)</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg resize-none"
                      placeholder="Notes about this document..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Link to Project (optional)</label>
                    <select
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">-- None --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Link to Production Sheet (optional)</label>
                    <select
                      value={sheetId}
                      onChange={e => setSheetId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">-- None --</option>
                      {sheets.map(s => (
                        <option key={s.id} value={s.id}>{s.sheet_number}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Button */}
            <div className="flex gap-3">
              <Button onClick={resetForm} className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300">
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="flex-1"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Upload Document</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Camera Overlay */}
        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
      </div>
    </RoleGuard>
  );
}
