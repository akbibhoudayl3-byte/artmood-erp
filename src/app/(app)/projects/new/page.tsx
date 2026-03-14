'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Select, Textarea } from '@/components/ui/Input';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function NewProjectPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    address: '',
    city: '',
    project_type: 'kitchen',
    priority: 'normal',
    total_amount: '',
    notes: '',
  });

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name || !form.client_phone) return;
    setLoading(true);

    const { data, error } = await supabase.from('projects').insert({
      client_name: form.client_name,
      client_phone: form.client_phone,
      client_email: form.client_email || null,
      client_address: form.address || null,
      client_city: form.city || null,
      project_type: form.project_type,
      priority: form.priority,
      total_amount: form.total_amount ? parseFloat(form.total_amount) : 0,
      notes: form.notes || null,
      status: 'measurements',
      created_by: profile?.id,
    }).select('id').single();

    if (error) {
      setFormError('Failed to create project: ' + error.message);
      setLoading(false);
      return;
    }

    if (data) {
      router.push(`/projects/${data.id}`);
    } else {
      setLoading(false);
    }
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/projects')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{t('projects.new_project')}</h1>
      </div>

      {formError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {formError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><h2 className="font-semibold">{t('projects.client_name')}</h2></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input label={`${t('projects.client_name')} *`} value={form.client_name} onChange={(e) => update('client_name', e.target.value)} required />
              <Input label={`${t('common.phone')} *`} type="tel" value={form.client_phone} onChange={(e) => update('client_phone', e.target.value)} required />
              <Input label={t('common.email')} type="email" value={form.client_email} onChange={(e) => update('client_email', e.target.value)} />
              <Input label={t('common.address')} value={form.address} onChange={(e) => update('address', e.target.value)} />
              <Input label={t('common.city')} value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><h2 className="font-semibold">Project Details</h2></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Select label="Type" value={form.project_type} onChange={(e) => update('project_type', e.target.value)}
                options={[
                  { value: 'kitchen', label: 'Cuisine' },
                  { value: 'dressing', label: 'Dressing' },
                  { value: 'bathroom', label: 'Salle de bain' },
                  { value: 'living_room', label: 'Salon / Meuble TV' },
                  { value: 'office', label: 'Bureau' },
                  { value: 'commercial', label: 'Commercial' },
                  { value: 'furniture', label: 'Meubles divers' },
                  { value: 'other', label: 'Autre' },
                ]} />
              <Select label="Priority" value={form.priority} onChange={(e) => update('priority', e.target.value)}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]} />
              <Input label={`${t('common.total')} (MAD)`} type="number" value={form.total_amount} onChange={(e) => update('total_amount', e.target.value)} />
              <Textarea label={t('common.notes')} value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          <Button type="submit" size="lg" className="w-full" loading={loading}>{t('projects.new_project')}</Button>
        </div>
      </form>
    </div>
      </RoleGuard>
  );
}
