'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, X, Users, FolderKanban, Factory, FileText } from 'lucide-react';

interface SearchResult {
  type: 'lead' | 'project' | 'production' | 'quote';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  lead: Users,
  project: FolderKanban,
  production: Factory,
  quote: FileText,
};

const TYPE_LABELS: Record<string, string> = {
  lead: 'Lead',
  project: 'Project',
  production: 'Production',
  quote: 'Quote',
};

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => search(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function search(q: string) {
    setLoading(true);
    const searchTerm = `%${q}%`;

    const [leads, projects, quotes] = await Promise.all([
      supabase.from('leads').select('id, full_name, phone, city, status')
        .or(`full_name.ilike.${searchTerm},phone.ilike.${searchTerm},city.ilike.${searchTerm}`)
        .limit(5),
      supabase.from('projects').select('id, client_name, reference_code, status')
        .or(`client_name.ilike.${searchTerm},reference_code.ilike.${searchTerm}`)
        .limit(5),
      supabase.from('quotes').select('id, version, status, project:projects(client_name, reference_code)')
        .limit(5),
    ]);

    const r: SearchResult[] = [];

    (leads.data || []).forEach(l => {
      r.push({ type: 'lead', id: l.id, title: l.full_name, subtitle: `${l.city || ''} - ${l.status}`, href: `/leads/${l.id}` });
    });

    (projects.data || []).forEach(p => {
      r.push({ type: 'project', id: p.id, title: p.client_name, subtitle: `${p.reference_code || ''} - ${p.status}`, href: `/projects/${p.id}` });
    });

    // Filter quotes client-side since we can't easily do nested ilike
    (quotes.data || []).forEach((q: any) => {
      const name = q.project?.client_name || '';
      const ref = q.project?.reference_code || '';
      if (name.toLowerCase().includes(query.toLowerCase()) || ref.toLowerCase().includes(query.toLowerCase())) {
        r.push({ type: 'quote', id: q.id, title: `Quote v${q.version} - ${name}`, subtitle: `${ref} - ${q.status}`, href: `/quotes/${q.id}` });
      }
    });

    setResults(r);
    setSelectedIndex(0);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      router.push(results[selectedIndex].href);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl border border-[#E8E5E0] overflow-hidden animate-fade-scale"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[#E8E5E0]">
          <Search size={18} className="text-[#64648B] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, projects, quotes..."
            className="flex-1 py-4 text-sm bg-transparent outline-none placeholder:text-[#64648B]/60"
          />
          <button onClick={onClose} className="p-1.5 hover:bg-[#F5F3F0] rounded-lg">
            <X size={16} className="text-[#64648B]" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-sm text-[#64648B]">Searching...</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-8 text-center text-sm text-[#64648B]">No results found</div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {results.map((result, i) => {
                const Icon = TYPE_ICONS[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => { router.push(result.href); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F5F3F0] ${
                      i === selectedIndex ? 'bg-[#F5F3F0]' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#F5F3F0] flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-[#64648B]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a2e] truncate">{result.title}</p>
                      <p className="text-xs text-[#64648B] truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-[#64648B] bg-[#F0EDE8] px-2 py-0.5 rounded-lg uppercase">
                      {TYPE_LABELS[result.type]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!query && (
            <div className="p-6 text-center text-sm text-[#64648B]">
              <p className="font-medium">Quick Search</p>
              <p className="text-xs mt-1">Search across leads, projects, and quotes</p>
              <div className="flex justify-center gap-2 mt-3">
                <kbd className="px-2 py-0.5 text-[10px] bg-[#F0EDE8] rounded border border-[#E8E5E0] font-mono">↑↓</kbd>
                <span className="text-[10px]">navigate</span>
                <kbd className="px-2 py-0.5 text-[10px] bg-[#F0EDE8] rounded border border-[#E8E5E0] font-mono">↵</kbd>
                <span className="text-[10px]">select</span>
                <kbd className="px-2 py-0.5 text-[10px] bg-[#F0EDE8] rounded border border-[#E8E5E0] font-mono">esc</kbd>
                <span className="text-[10px]">close</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
