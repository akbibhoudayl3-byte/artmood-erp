'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Plus, ChefHat, Clock, CheckCircle } from 'lucide-react';
import type { KitchenProject } from '@/types/kitchen';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  validated: 'bg-blue-100 text-blue-700',
  quoted: 'bg-amber-100 text-amber-700',
  production: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validé',
  quoted: 'Devis envoyé',
  production: 'Production',
  completed: 'Terminé',
};

export default function KitchenListPage() {
  const router = useRouter();
  const [kitchens, setKitchens] = useState<KitchenProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('kitchen_projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setKitchens((data ?? []) as KitchenProject[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1a1a2e]">Cuisines</h1>
            <p className="text-sm text-[#64648B]">{kitchens.length} projet(s)</p>
          </div>
        </div>
        <Button onClick={() => router.push('/kitchen/new')} size="lg">
          <Plus className="w-4 h-4" />
          Nouvelle Cuisine
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : kitchens.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <ChefHat className="w-12 h-12 mx-auto mb-4 text-[#C9956B] opacity-40" />
            <p className="text-[#64648B]">Aucun projet cuisine</p>
            <Button className="mt-4" onClick={() => router.push('/kitchen/new')}>
              <Plus className="w-4 h-4" /> Créer un projet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {kitchens.map((k) => (
            <Card key={k.id} onClick={() => router.push(`/kitchen/new?id=${k.id}`)}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-semibold text-[#1a1a2e]">{k.client_name}</p>
                  <p className="text-sm text-[#64648B]">
                    {k.layout_type} — {k.kitchen_type} — {k.opening_system}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[k.status]}`}>
                    {STATUS_LABELS[k.status] ?? k.status}
                  </span>
                  <span className="text-xs text-[#64648B]">
                    {new Date(k.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
