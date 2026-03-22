'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ArrowLeft, Code2, Download, FileText, Copy, CheckCircle,
} from 'lucide-react';
import { getGcodeFiles, downloadGcodeFile, downloadAllGcodeFiles } from '@/lib/services/gcode-engine.service';
import type { CncProgram } from '@/types/production';

/** Syntax highlight G-code lines */
function highlightGcode(content: string): string {
  return content
    .split('\n')
    .map(line => {
      // Comments
      if (line.trim().startsWith('(')) {
        return `<span style="color:#6b7280">${escHtml(line)}</span>`;
      }
      // M-commands
      if (/^M\d/i.test(line.trim())) {
        return `<span style="color:#059669">${escHtml(line)}</span>`;
      }
      // G-commands
      if (/^G\d/i.test(line.trim())) {
        return line.replace(
          /(G\d+)/g,
          '<span style="color:#2563eb;font-weight:600">$1</span>',
        ).replace(
          /([XYZFS])(-?[\d.]+)/g,
          '<span style="color:#7c3aed">$1</span><span style="color:#1a1a2e">$2</span>',
        );
      }
      return escHtml(line);
    })
    .join('\n');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function GcodeContent() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [programs, setPrograms] = useState<CncProgram[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getGcodeFiles(jobId);
    if (result.success && result.data) {
      setPrograms(result.data);
    } else {
      setError(result.error || 'Failed to load');
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const selected = programs[selectedIdx] || null;

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.file_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-[500px] bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-red-600">{error}</p>
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Retour
        </Button>
      </div>
    );
  }

  const lineCount = selected ? selected.file_content.split('\n').length : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/cutting/jobs/${jobId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Code2 size={20} className="text-[#C9956B]" />
            Programmes G-Code
          </h1>
          <p className="text-sm text-gray-500">{programs.length} fichier{programs.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {programs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Code2 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-semibold text-gray-500">Aucun programme G-Code</p>
          <p className="text-sm mt-1">Générez le G-Code depuis la page du travail de découpe.</p>
        </div>
      ) : (
        <>
          {/* File selector */}
          <div className="flex gap-2 flex-wrap">
            {programs.map((prog, idx) => (
              <button
                key={prog.id}
                onClick={() => { setSelectedIdx(idx); setCopied(false); }}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${
                  idx === selectedIdx
                    ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                <FileText size={12} className="inline mr-1" />
                {prog.file_name}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {selected && (
              <Button variant="primary" size="sm" onClick={() => downloadGcodeFile(selected)}>
                <Download size={14} /> Télécharger .nc
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => downloadAllGcodeFiles(programs)}>
              <Download size={14} /> Tout télécharger
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? <CheckCircle size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Copié!' : 'Copier'}
            </Button>
          </div>

          {/* File info */}
          {selected && (
            <div className="flex gap-4 text-xs text-gray-500">
              <span>{selected.file_name}</span>
              <span>{lineCount} lignes</span>
              <span>{(selected.file_content.length / 1024).toFixed(1)} KB</span>
              <span>{new Date(selected.created_at).toLocaleString('fr-FR')}</span>
            </div>
          )}

          {/* Code preview */}
          {selected && (
            <Card>
              <CardContent>
                <div className="max-h-[600px] overflow-auto bg-[#1e1e2e] rounded-xl p-4">
                  <pre
                    className="text-xs font-mono leading-relaxed text-gray-200"
                    style={{ tabSize: 4 }}
                    dangerouslySetInnerHTML={{ __html: highlightGcode(selected.file_content) }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function GcodePage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'] as any[]}>
      <GcodeContent />
    </RoleGuard>
  );
}
