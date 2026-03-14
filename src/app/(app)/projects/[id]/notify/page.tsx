'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, MessageCircle, Send, Copy, Check, Phone, ExternalLink } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface Project {
  id: string;
  client_name: string;
  client_phone: string | null;
  reference_code: string;
  status: string;
  total_amount: number;
  paid_amount: number;
}

const MESSAGE_TEMPLATES: { key: string; label: string; stage: string; generate: (p: Project) => string }[] = [
  {
    key: 'design_ready',
    label: 'Design Ready for Review',
    stage: 'design',
    generate: (p) =>
      `Bonjour ${p.client_name},\n\nVotre design est prêt pour validation! Nous aimerions prendre rendez-vous pour vous le présenter.\n\nRéférence: ${p.reference_code}\n\nMerci de nous contacter pour fixer un créneau.\n\nCordialement,\nArtMood`,
  },
  {
    key: 'validation_reminder',
    label: 'Validation Reminder',
    stage: 'client_validation',
    generate: (p) =>
      `Bonjour ${p.client_name},\n\nNous attendons votre validation du design pour le projet ${p.reference_code}.\n\nUne fois validé, nous pourrons lancer la production.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nArtMood`,
  },
  {
    key: 'deposit_request',
    label: 'Deposit Payment Request',
    stage: 'client_validation',
    generate: (p) => {
      const deposit = Math.round(p.total_amount * 0.5);
      return `Bonjour ${p.client_name},\n\nPour lancer la production de votre projet ${p.reference_code}, nous vous prions de bien vouloir effectuer le versement de l'acompte de ${deposit.toLocaleString()} MAD (50%).\n\nMontant total: ${p.total_amount.toLocaleString()} MAD\nAcompte: ${deposit.toLocaleString()} MAD\n\nMerci de votre confiance.\n\nCordialement,\nArtMood`;
    },
  },
  {
    key: 'production_started',
    label: 'Production Started',
    stage: 'production',
    generate: (p) =>
      `Bonjour ${p.client_name},\n\nBonne nouvelle! La production de votre projet ${p.reference_code} a commencé.\n\nNous vous tiendrons informé de l'avancement.\n\nCordialement,\nArtMood`,
  },
  {
    key: 'production_complete',
    label: 'Production Complete - Pre-installation Payment',
    stage: 'production',
    generate: (p) => {
      const preInstall = Math.round(p.total_amount * 0.4);
      return `Bonjour ${p.client_name},\n\nVotre projet ${p.reference_code} est terminé en atelier! Nous sommes prêts à planifier l'installation.\n\nPour confirmer la date d'installation, merci de régler le 2ème versement de ${preInstall.toLocaleString()} MAD (40%).\n\nMontant total: ${p.total_amount.toLocaleString()} MAD\nDéjà payé: ${p.paid_amount.toLocaleString()} MAD\nÀ régler: ${preInstall.toLocaleString()} MAD\n\nCordialement,\nArtMood`;
    },
  },
  {
    key: 'installation_scheduled',
    label: 'Installation Date Confirmed',
    stage: 'installation',
    generate: (p) =>
      `Bonjour ${p.client_name},\n\nL'installation de votre projet ${p.reference_code} est confirmée.\n\nNotre équipe sera chez vous à la date convenue. Merci de vous assurer que l'espace est accessible.\n\nCordialement,\nArtMood`,
  },
  {
    key: 'installation_complete',
    label: 'Installation Complete - Final Payment',
    stage: 'delivered',
    generate: (p) => {
      const finalPayment = Math.round(p.total_amount * 0.1);
      const remaining = p.total_amount - p.paid_amount;
      return `Bonjour ${p.client_name},\n\nL'installation de votre projet ${p.reference_code} est terminée avec succès!\n\nNous espérons que tout vous convient. Le solde restant est de ${remaining > 0 ? remaining.toLocaleString() : finalPayment.toLocaleString()} MAD.\n\nMerci pour votre confiance!\n\nCordialement,\nArtMood`;
    },
  },
  {
    key: 'thank_you',
    label: 'Thank You + Review Request',
    stage: 'delivered',
    generate: (p) =>
      `Bonjour ${p.client_name},\n\nMerci d'avoir choisi ArtMood pour votre projet ${p.reference_code}!\n\nVotre satisfaction est notre priorité. Si vous êtes content du résultat, nous vous serions reconnaissants de laisser un avis sur notre page Instagram/Facebook.\n\nN'hésitez pas à nous recommander à vos proches!\n\nCordialement,\nL'équipe ArtMood`,
  },
];

export default function ProjectNotifyPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [logSaving, setLogSaving] = useState(false);

  useEffect(() => {
    supabase.from('projects')
      .select('id, client_name, client_phone, reference_code, status, total_amount, paid_amount')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        setProject(data as Project);
        setLoading(false);
      });
  }, [projectId]);

  function selectTemplate(key: string) {
    if (!project) return;
    const template = MESSAGE_TEMPLATES.find(t => t.key === key);
    if (template) {
      setSelectedTemplate(key);
      setMessage(template.generate(project));
    }
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openWhatsApp() {
    if (!project?.client_phone) return;
    const phone = project.client_phone.replace(/[^0-9+]/g, '');
    // Convert Moroccan format to international
    const intlPhone = phone.startsWith('0') ? `212${phone.slice(1)}` : phone.startsWith('+') ? phone.slice(1) : phone;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${intlPhone}?text=${encoded}`, '_blank');
  }

  async function logMessage(via: string) {
    if (!project) return;
    setLogSaving(true);
    await supabase.from('messaging_logs').insert({
      project_id: project.id,
      channel: via,
      recipient_name: project.client_name,
      recipient_phone: project.client_phone,
      message_text: message,
      sent_by: profile?.id,
      sent_at: new Date().toISOString(),
    });
    setLogSaving(false);
  }

  async function sendAndLog() {
    await logMessage('whatsapp');
    openWhatsApp();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!project) return <div className="text-center py-12 text-gray-500">Project not found</div>;

  // Suggest templates based on project status
  const suggestedTemplates = MESSAGE_TEMPLATES.filter(t => t.stage === project.status);
  const otherTemplates = MESSAGE_TEMPLATES.filter(t => t.stage !== project.status);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${projectId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{project.reference_code}</p>
          <h1 className="text-xl font-bold text-[#1a1a2e]">Notify Client</h1>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Client Info */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#1a1a2e]">{project.client_name}</p>
            {project.client_phone && (
              <div className="flex items-center gap-1.5 mt-1">
                <Phone size={12} className="text-[#64648B]" />
                <a href={`tel:${project.client_phone}`} className="text-sm text-blue-600">{project.client_phone}</a>
              </div>
            )}
          </div>
          {project.client_phone && (
            <Button variant="success" size="sm" onClick={openWhatsApp} disabled={!message.trim()}>
              <MessageCircle size={14} /> WhatsApp
            </Button>
          )}
        </div>
        {!project.client_phone && (
          <p className="text-xs text-red-500 mt-2">No phone number on file. Add it in the project details first.</p>
        )}
      </Card>

      {/* Suggested Templates */}
      {suggestedTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#64648B] mb-2 uppercase tracking-wider">Suggested for current stage</h3>
          <div className="space-y-1.5">
            {suggestedTemplates.map(t => (
              <button
                key={t.key}
                onClick={() => selectTemplate(t.key)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  selectedTemplate === t.key
                    ? 'bg-[#1E2F52] text-white'
                    : 'bg-[#F5F3F0] text-[#1a1a2e] hover:bg-[#EBE8E3]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageCircle size={14} />
                  {t.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Other Templates */}
      <div>
        <h3 className="text-xs font-semibold text-[#64648B] mb-2 uppercase tracking-wider">All templates</h3>
        <div className="space-y-1.5">
          {otherTemplates.map(t => (
            <button
              key={t.key}
              onClick={() => selectTemplate(t.key)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                selectedTemplate === t.key
                  ? 'bg-[#1E2F52] text-white'
                  : 'bg-white border border-[#E8E5E0] text-[#1a1a2e] hover:bg-[#F5F3F0]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle size={14} />
                  {t.label}
                </div>
                <span className="text-[10px] text-[#64648B] capitalize">{t.stage.replace(/_/g, ' ')}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message Editor */}
      {message && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">{t('common.description')}</h2>
              <button
                onClick={copyMessage}
                className="flex items-center gap-1 text-xs text-[#64648B] hover:text-[#1a1a2e]"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <div className="flex gap-2 mt-3">
              {project.client_phone && (
                <Button className="flex-1" onClick={sendAndLog} loading={logSaving}>
                  <Send size={14} /> Send via WhatsApp
                </Button>
              )}
              <Button variant="secondary" className="flex-1" onClick={copyMessage}>
                <Copy size={14} /> {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
            </div>
            <p className="text-[10px] text-[#64648B] mt-2 text-center">
              Clicking &quot;Send via WhatsApp&quot; opens WhatsApp with the message pre-filled and logs it to the system.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
