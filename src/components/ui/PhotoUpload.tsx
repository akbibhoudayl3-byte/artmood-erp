'use client';

import { useState, useRef } from 'react';
import { Camera, X, Loader2, ImagePlus } from 'lucide-react';

interface UploadedPhoto {
  path: string;
  url: string;
  bucket: string;
}

interface PhotoUploadProps {
  bucket: string;
  pathPrefix: string;
  onUpload: (photo: UploadedPhoto) => void;
  existingPhotos?: { url: string; id?: string }[];
  onRemove?: (index: number) => void;
  maxPhotos?: number;
  label?: string;
  compact?: boolean;
}

export default function PhotoUpload({
  bucket,
  pathPrefix,
  onUpload,
  existingPhotos = [],
  onRemove,
  maxPhotos = 10,
  label = 'Add Photos',
  compact = false,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Only images and PDFs are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB)');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${pathPrefix}/${fileName}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('path', path);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      onUpload(data as UploadedPhoto);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      if (existingPhotos.length + i >= maxPhotos) break;
      handleFile(files[i]);
    }
    e.target.value = '';
  }

  const canAddMore = existingPhotos.length < maxPhotos;

  if (compact) {
    return (
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !canAddMore}
          className="w-full py-4 border-2 border-dashed border-[#E8E5E0] rounded-xl flex flex-col items-center gap-2 text-[#64648B] hover:border-[#C9956B] hover:text-[#C9956B] active:scale-[0.98] disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Camera size={24} />
          )}
          <span className="text-sm font-medium">{label}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInputChange} />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-[#1a1a2e]">{label}</label>}

      {/* Photo grid */}
      {existingPhotos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {existingPhotos.map((photo, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[#F0EDE8] group">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload buttons */}
      {canAddMore && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 py-3 border-2 border-dashed border-[#E8E5E0] rounded-xl flex items-center justify-center gap-2 text-[#64648B] hover:border-[#C9956B] hover:text-[#C9956B] active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            <span className="text-sm font-medium">Camera</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 py-3 border-2 border-dashed border-[#E8E5E0] rounded-xl flex items-center justify-center gap-2 text-[#64648B] hover:border-[#C9956B] hover:text-[#C9956B] active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-sm font-medium">Gallery</span>
          </button>
        </div>
      )}

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInputChange} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleInputChange} />

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
