'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import type { CalendarEvent } from '@/types/database';
import { ChevronLeft, ChevronRight, Check, Plus, X, Trash2, Edit2 } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

type View = 'month' | 'week' | 'agenda';

const EVENT_TYPES = [
  { value: 'payment_due', label: 'Payment Due' },
  { value: 'cheque_due', label: 'Cheque Due' },
  { value: 'rent_due', label: 'Rent Due' },
  { value: 'salary_due', label: 'Salary Due' },
  { value: 'installation', label: 'Installation' },
  { value: 'measurement_visit', label: 'Measurement Visit' },
  { value: 'project_deadline', label: 'Project Deadline' },
  { value: 'recurring_expense', label: 'Recurring Expense' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'other', label: 'Other' },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  payment_due: 'border-l-emerald-500',
  cheque_due: 'border-l-blue-500',
  rent_due: 'border-l-red-500',
  salary_due: 'border-l-violet-500',
  installation: 'border-l-orange-500',
  measurement_visit: 'border-l-cyan-500',
  project_deadline: 'border-l-amber-500',
  recurring_expense: 'border-l-pink-500',
  follow_up: 'border-l-indigo-500',
  meeting: 'border-l-teal-500',
  reminder: 'border-l-gray-400',
  other: 'border-l-gray-300',
};

export default function CalendarPage() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('agenda');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('reminder');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadEvents(); }, [currentDate]);

  async function loadEvents() {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('event_date', startOfMonth)
      .lte('event_date', endOfMonth)
      .order('event_date', { ascending: true });

    setEvents(data || []);
    setLoading(false);
  }

  async function toggleComplete(event: CalendarEvent) {
    await supabase.from('calendar_events').update({
      is_completed: !event.is_completed,
      completed_at: !event.is_completed ? new Date().toISOString() : null,
    }).eq('id', event.id);
    loadEvents();
  }

  function openNewEvent(date?: string) {
    setEditingEvent(null);
    setFormTitle('');
    setFormDesc('');
    setFormType('reminder');
    setFormDate(date || new Date().toISOString().split('T')[0]);
    setFormTime('');
    setShowForm(true);
  }

  function openEditEvent(event: CalendarEvent) {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDesc(event.description || '');
    setFormType(event.event_type);
    setFormDate(event.event_date);
    setFormTime(event.event_time || '');
    setShowForm(true);
  }

  async function saveEvent() {
    if (!formTitle.trim() || !formDate) return;
    setSaving(true);

    const payload = {
      title: formTitle.trim(),
      description: formDesc || null,
      event_type: formType,
      event_date: formDate,
      event_time: formTime || null,
      is_all_day: !formTime,
      created_by: profile?.id,
    };

    if (editingEvent) {
      await supabase.from('calendar_events').update(payload).eq('id', editingEvent.id);
    } else {
      await supabase.from('calendar_events').insert(payload);
    }

    setShowForm(false);
    setSaving(false);
    await loadEvents();
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Delete this event?')) return;
    await supabase.from('calendar_events').delete().eq('id', eventId);
    await loadEvents();
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const groupedByDate = events.reduce((acc, event) => {
    const date = event.event_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Week view helpers
  const getWeekDays = () => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return days;
  };

  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer', 'hr_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('calendar.title')}</h1>
          <Button size="sm" onClick={() => openNewEvent()}>
            <Plus size={14} /> {t('calendar.new_event')}
          </Button>
        </div>
        <div className="flex bg-[#F0EDE8] rounded-xl p-1">
          {(['agenda', 'week', 'month'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                view === v ? 'bg-white shadow-sm text-[#1a1a2e]' : 'text-[#64648B]'
              }`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={view === 'week' ? prevWeek : prevMonth} className="p-2.5 hover:bg-[#F0EDE8] rounded-xl active:scale-95">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-[#1a1a2e]">
          {view === 'week'
            ? `${getWeekDays()[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${getWeekDays()[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={view === 'week' ? nextWeek : nextMonth} className="p-2.5 hover:bg-[#F0EDE8] rounded-xl active:scale-95">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Event Form */}
      {showForm && (
        <Card className="border-blue-200">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editingEvent ? 'Edit Event' : 'New Event'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <Input label="Title *" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Event title..." />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm">
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <Input label="Date *" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <Input label="Time (optional)" type="time" value={formTime} onChange={e => setFormTime(e.target.value)} />
            <Textarea label="Description" value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2} placeholder="Optional details..." />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
              <Button className="flex-1" onClick={saveEvent} loading={saving} disabled={!formTitle.trim() || !formDate}>
                {editingEvent ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Agenda View */}
      {view === 'agenda' && (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, dayEvents]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[#1a1a2e]">
                  {new Date(date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  {date === todayStr && (
                    <span className="ml-2 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg font-semibold">{t('calendar.today')}</span>
                  )}
                </h3>
                <button onClick={() => openNewEvent(date)} className="text-[#64648B] hover:text-[#C9956B]">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-2">
                {dayEvents.map(event => (
                  <Card key={event.id}
                    className={`p-3.5 border-l-4 ${EVENT_TYPE_COLORS[event.event_type] || 'border-l-gray-300'} ${event.is_completed ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleComplete(event)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 active:scale-90 ${
                          event.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-[#E8E5E0] hover:border-emerald-400'
                        }`}>
                        {event.is_completed && <Check size={14} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${event.is_completed ? 'line-through text-[#64648B]' : 'text-[#1a1a2e]'}`}>
                          {event.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {event.event_time && <span className="text-[10px] text-[#64648B] font-medium">{event.event_time}</span>}
                          {event.description && <p className="text-xs text-[#64648B] truncate">{event.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="hidden sm:block">
                          <StatusBadge status={event.event_type.replace(/_/g, ' ')} />
                        </div>
                        <button onClick={() => openEditEvent(event)} className="p-1.5 text-[#64648B] hover:bg-gray-100 rounded-lg">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => deleteEvent(event.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-12 text-[#64648B]">
              <p>No events this month</p>
              <Button variant="secondary" className="mt-3" onClick={() => openNewEvent()}>
                <Plus size={14} /> Add Event
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Week View */}
      {view === 'week' && (
        <div className="space-y-2">
          {getWeekDays().map(day => {
            const dateStr = day.toISOString().split('T')[0];
            const dayEvents = groupedByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div key={dateStr} className={`rounded-xl ${isToday ? 'bg-[#C9956B]/5 ring-1 ring-[#C9956B]/20' : isWeekend ? 'bg-gray-50' : ''}`}>
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      isToday ? 'bg-[#C9956B] text-white' : 'text-[#1a1a2e]'
                    }`}>
                      {day.getDate()}
                    </span>
                    <span className={`text-xs font-medium ${isToday ? 'text-[#C9956B]' : 'text-[#64648B]'}`}>
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                  <button onClick={() => openNewEvent(dateStr)} className="p-1 text-[#64648B] hover:text-[#C9956B]">
                    <Plus size={14} />
                  </button>
                </div>
                {dayEvents.length > 0 && (
                  <div className="px-3 pb-2 space-y-1">
                    {dayEvents.map(event => (
                      <div key={event.id}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                          event.is_completed ? 'bg-gray-100 line-through text-[#64648B]' : 'bg-white border border-[#E8E5E0]'
                        }`}>
                        <button onClick={() => toggleComplete(event)}
                          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            event.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                          }`}>
                          {event.is_completed && <Check size={10} className="text-white" />}
                        </button>
                        <span className="flex-1 truncate font-medium">{event.title}</span>
                        {event.event_time && <span className="text-[#64648B]">{event.event_time}</span>}
                        <button onClick={() => openEditEvent(event)} className="text-[#64648B] hover:text-[#1a1a2e]">
                          <Edit2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Month View */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl border border-[#E8E5E0] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#F0EDE8]">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-semibold text-[#64648B] py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {generateMonthDays(currentDate).map((day, i) => {
              const dateStr = day?.toISOString().split('T')[0];
              const dayEvents = dateStr ? groupedByDate[dateStr] || [] : [];
              const isToday = dateStr === todayStr;
              return (
                <div key={i}
                  className={`min-h-[48px] sm:min-h-[60px] p-0.5 sm:p-1 border-b border-r border-[#F0EDE8] cursor-pointer hover:bg-[#FAFAF8] ${!day ? 'bg-[#FAFAF8]' : ''}`}
                  onClick={() => day && openNewEvent(dateStr!)}>
                  {day && (
                    <>
                      <p className={`text-[11px] w-6 h-6 flex items-center justify-center mx-auto ${isToday ? 'bg-[#1B2A4A] text-white rounded-full' : 'text-[#64648B]'}`}>
                        {day.getDate()}
                      </p>
                      {dayEvents.length > 0 && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {dayEvents.slice(0, 3).map((_, j) => (
                            <div key={j} className="w-1.5 h-1.5 bg-[#C9956B] rounded-full" />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}

function generateMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
