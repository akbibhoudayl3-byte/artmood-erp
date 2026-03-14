'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import { Building, Users, DollarSign, Rocket, ChevronRight, Check } from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  { key: 'welcome', icon: Rocket, title: 'Welcome to ArtMood Factory OS', subtitle: 'Let\'s set up your workspace in a few steps' },
  { key: 'company', icon: Building, title: 'Company Info', subtitle: 'Tell us about your business' },
  { key: 'team', icon: Users, title: 'Add Team Members', subtitle: 'Invite your first team members' },
  { key: 'expenses', icon: DollarSign, title: 'Recurring Expenses', subtitle: 'Set up monthly fixed costs' },
];

interface TeamMember {
  name: string;
  email: string;
  role: string;
}

interface RecurringExpense {
  category: string;
  amount: string;
  description: string;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { profile } = useAuth();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Company
  const [companyName, setCompanyName] = useState('ArtMood');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('Casablanca');

  // Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { name: '', email: '', role: 'workshop_worker' },
  ]);

  // Expenses
  const [expenses, setExpenses] = useState<RecurringExpense[]>([
    { category: 'rent', amount: '', description: 'Office/Workshop rent' },
    { category: 'internet', amount: '', description: 'Internet' },
    { category: 'utilities', amount: '', description: 'Water & Electricity' },
  ]);

  function addTeamMember() {
    setTeamMembers([...teamMembers, { name: '', email: '', role: 'workshop_worker' }]);
  }

  function updateTeamMember(index: number, field: string, value: string) {
    const updated = [...teamMembers];
    (updated[index] as any)[field] = value;
    setTeamMembers(updated);
  }

  function removeTeamMember(index: number) {
    setTeamMembers(teamMembers.filter((_, i) => i !== index));
  }

  function addExpense() {
    setExpenses([...expenses, { category: 'other', amount: '', description: '' }]);
  }

  function updateExpense(index: number, field: string, value: string) {
    const updated = [...expenses];
    (updated[index] as any)[field] = value;
    setExpenses(updated);
  }

  async function handleFinish() {
    setSaving(true);

    // Create team members via API
    for (const member of teamMembers) {
      if (!member.name || !member.email) continue;
      try {
        await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            email: member.email,
            password: 'artmood123',
            full_name: member.name,
            role: member.role,
          }),
        });
      } catch {}
    }

    // Create recurring expenses
    for (const exp of expenses) {
      if (!exp.amount || parseFloat(exp.amount) <= 0) continue;
      await supabase.from('expenses').insert({
        category: exp.category,
        amount: parseFloat(exp.amount),
        description: exp.description || null,
        payment_method: 'bank_transfer',
        recurring_day: 1,
        is_recurring: true,
        date: new Date().toISOString().split('T')[0],
        created_by: profile?.id,
      });
    }

    // Mark onboarding complete
    localStorage.setItem('onboarding_complete', 'true');

    setSaving(false);
    onComplete();
  }

  function nextStep() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function prevStep() {
    if (step > 0) setStep(step - 1);
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="fixed inset-0 z-[100] bg-[#F5F3F0] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-[#1B2A4A] text-white' : 'bg-[#E8E5E0] text-[#64648B]'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-[#E8E5E0]'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-[#E8E5E0] shadow-lg p-6 sm:p-8 animate-fade-scale">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B2A4A] to-[#2A3F6A] flex items-center justify-center">
              <StepIcon size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1a1a2e]">{STEPS[step].title}</h2>
              <p className="text-sm text-[#64648B]">{STEPS[step].subtitle}</p>
            </div>
          </div>

          {/* Welcome */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-[#64648B]">
                ArtMood Factory OS is your all-in-one management system for:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {['Lead Tracking', 'Project Management', 'Production Control', 'Financial Overview', 'Installation Scheduling', 'Team Management'].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-[#1a1a2e] bg-[#F5F3F0] p-3 rounded-xl">
                    <Check size={14} className="text-[#C9956B] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#64648B]">This setup takes about 2 minutes. You can always change these settings later.</p>
            </div>
          )}

          {/* Company */}
          {step === 1 && (
            <div className="space-y-3">
              <Input label="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              <Input label="Phone" placeholder="+212 5XX XX XX XX" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
              <Input label="Address" placeholder="Workshop/Office address" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
              <Input label="City" value={companyCity} onChange={e => setCompanyCity(e.target.value)} />
            </div>
          )}

          {/* Team */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-[#64648B]">Default password for all members: <code className="bg-[#F5F3F0] px-1.5 py-0.5 rounded">artmood123</code> (they should change it after first login)</p>
              {teamMembers.map((member, i) => (
                <div key={i} className="p-3 bg-[#F5F3F0] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#64648B]">Member {i + 1}</span>
                    {teamMembers.length > 1 && (
                      <button onClick={() => removeTeamMember(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <Input placeholder="Full Name" value={member.name} onChange={e => updateTeamMember(i, 'name', e.target.value)} />
                  <Input placeholder="Email" type="email" value={member.email} onChange={e => updateTeamMember(i, 'email', e.target.value)} />
                  <select
                    value={member.role}
                    onChange={e => updateTeamMember(i, 'role', e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white"
                  >
                    <option value="commercial_manager">Commercial Manager</option>
                    <option value="designer">Interior Designer</option>
                    <option value="workshop_manager">Workshop Manager</option>
                    <option value="workshop_worker">Workshop Worker</option>
                    <option value="installer">Installer</option>
                    <option value="hr_manager">HR Manager</option>
                    <option value="community_manager">Community Manager</option>
                  </select>
                </div>
              ))}
              <button onClick={addTeamMember} className="w-full py-2 text-sm font-medium text-[#C9956B] hover:text-[#B8845A] border border-dashed border-[#E8E5E0] rounded-xl hover:border-[#C9956B]">
                + Add another member
              </button>
              <p className="text-xs text-[#64648B]">You can skip this and add members later from Settings.</p>
            </div>
          )}

          {/* Expenses */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-[#64648B]">Set up your monthly fixed costs. These will be available for one-click recording each month.</p>
              {expenses.map((exp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={exp.category}
                    onChange={e => updateExpense(i, 'category', e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white"
                  >
                    <option value="rent">Rent</option>
                    <option value="internet">Internet</option>
                    <option value="phones">Phones</option>
                    <option value="utilities">Utilities</option>
                    <option value="insurance">Insurance</option>
                    <option value="salary">Salaries</option>
                    <option value="software">Software</option>
                    <option value="other">Other</option>
                  </select>
                  <Input
                    placeholder="Amount"
                    type="number"
                    value={exp.amount}
                    onChange={e => updateExpense(i, 'amount', e.target.value)}
                  />
                </div>
              ))}
              <button onClick={addExpense} className="w-full py-2 text-sm font-medium text-[#C9956B] border border-dashed border-[#E8E5E0] rounded-xl hover:border-[#C9956B]">
                + Add expense
              </button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button onClick={prevStep} className="text-sm font-medium text-[#64648B] hover:text-[#1a1a2e]">Back</button>
            ) : <div />}

            {step < STEPS.length - 1 ? (
              <Button onClick={nextStep} size="lg">
                {step === 0 ? 'Get Started' : 'Next'} <ChevronRight size={16} />
              </Button>
            ) : (
              <Button onClick={handleFinish} loading={saving} size="lg" variant="success">
                <Rocket size={16} /> Launch Factory OS
              </Button>
            )}
          </div>
        </div>

        {/* Skip */}
        {step > 0 && step < STEPS.length - 1 && (
          <button
            onClick={() => setStep(STEPS.length - 1)}
            className="block mx-auto mt-4 text-xs text-[#64648B] hover:text-[#1a1a2e]"
          >
            Skip to finish
          </button>
        )}
      </div>
    </div>
  );
}
