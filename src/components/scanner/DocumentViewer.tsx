'use client';

import { useState } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { X, Download, Tag, FileText, Eye } from 'lucide-react';
import type { ScannedDocument } from '@/types/database';

interface DocumentViewerProps {
  document: ScannedDocument;
  imageUrl: string;
  onClose: () => void;
  onUpdateTags?: (tags: string[]) => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice / Facture',
  delivery_note: 'Delivery Note / BL',
  purchase_order: 'Purchase Order',
  technical_drawing: 'Technical Drawing',
  photo: 'Photo',
  contract: 'Contract',
  other: 'Other',
};

export default function DocumentViewer({ document: doc, imageUrl, onClose, onUpdateTags }: DocumentViewerProps) {
  const [showOCR, setShowOCR] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !doc.tags.includes(tag) && onUpdateTags) {
      onUpdateTags([...doc.tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    if (onUpdateTags) {
      onUpdateTags(doc.tags.filter(t => t !== tag));
    }
  };

  const statusColor = {
    pending: 'yellow' as const,
    processing: 'blue' as const,
    completed: 'green' as const,
    failed: 'red' as const,
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{doc.title}</h2>
            <p className="text-sm text-gray-500">
              {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
              {doc.original_filename && ` • ${doc.original_filename}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={doc.status} />
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Image */}
          <div className="flex items-center justify-center bg-gray-100 rounded-lg p-2 min-h-[300px]">
            {doc.mime_type?.startsWith('image/') ? (
              <img src={imageUrl} alt={doc.title} className="max-w-full max-h-[60vh] object-contain rounded" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <FileText size={48} />
                <span>PDF Document</span>
                <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                  <Button><Eye className="w-4 h-4 mr-1" /> Open</Button>
                </a>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-4">
            {/* Metadata */}
            <Card>
              <CardHeader>Details</CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {doc.project && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Project</dt>
                      <dd className="font-medium">{doc.project.name}</dd>
                    </div>
                  )}
                  {doc.sheet && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Sheet</dt>
                      <dd className="font-medium">{doc.sheet.sheet_number}</dd>
                    </div>
                  )}
                  {doc.uploader && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Uploaded by</dt>
                      <dd className="font-medium">{doc.uploader.full_name}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Size</dt>
                    <dd className="font-medium">
                      {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Date</dt>
                    <dd className="font-medium">{new Date(doc.created_at).toLocaleDateString()}</dd>
                  </div>
                  {doc.ocr_confidence != null && doc.ocr_confidence > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">OCR Confidence</dt>
                      <dd className="font-medium">{(doc.ocr_confidence * 100).toFixed(0)}%</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>Tags</CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-2">
                  {doc.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      <Tag size={12} />
                      {tag}
                      {onUpdateTags && (
                        <button onClick={() => removeTag(tag)} className="hover:text-blue-600">
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {onUpdateTags && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTag()}
                      placeholder="Add tag..."
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                    />
                    <Button onClick={addTag}>Add</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* OCR Text */}
            {doc.ocr_text && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between w-full">
                    <span>OCR Text</span>
                    <button
                      onClick={() => setShowOCR(!showOCR)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {showOCR ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </CardHeader>
                {showOCR && (
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-lg max-h-[200px] overflow-auto">
                      {doc.ocr_text}
                    </pre>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Extracted Data */}
            {doc.extracted_data && Object.keys(doc.extracted_data).length > 0 && (
              <Card>
                <CardHeader>Extracted Data</CardHeader>
                <CardContent>
                  <dl className="space-y-1 text-sm">
                    {Object.entries(doc.extracted_data).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <dt className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                        <dd className="font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
