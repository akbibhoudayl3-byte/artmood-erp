-- ============================================================
-- PART 1: ALL TABLES
-- Run this first in Supabase SQL Editor
-- ============================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN (
        'ceo','commercial_manager','designer','workshop_manager',
        'workshop_worker','installer','hr_manager','community_manager'
    )),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT,
    address TEXT,
    source TEXT CHECK (source IN ('instagram','facebook','google','architect','referral','walk_in','website','other')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','visit_scheduled','quote_sent','won','lost')),
    notes TEXT,
    lost_reason TEXT,
    next_follow_up TIMESTAMPTZ,
    assigned_to UUID REFERENCES public.profiles(id),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lead_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    activity_type TEXT CHECK (activity_type IN ('call','whatsapp','visit','email','note','status_change')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code TEXT UNIQUE,
    lead_id UUID REFERENCES public.leads(id),
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_email TEXT,
    client_address TEXT,
    client_city TEXT,
    project_type TEXT NOT NULL CHECK (project_type IN ('kitchen','dressing','furniture','other')),
    status TEXT NOT NULL DEFAULT 'measurements_confirmed' CHECK (status IN ('measurements_confirmed','design_validated','bom_generated','ready_for_production','in_production','installation','delivered','cancelled')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    measurement_notes TEXT,
    measurement_date TIMESTAMPTZ,
    measured_by UUID REFERENCES public.profiles(id),
    designer_id UUID REFERENCES public.profiles(id),
    design_validated BOOLEAN DEFAULT false,
    design_validated_at TIMESTAMPTZ,
    total_amount DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    deposit_paid BOOLEAN DEFAULT false,
    pre_install_paid BOOLEAN DEFAULT false,
    final_paid BOOLEAN DEFAULT false,
    estimated_production_start DATE,
    estimated_production_end DATE,
    estimated_installation_date DATE,
    actual_delivery_date DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.project_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    event_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT CHECK (file_type IN ('measurement','design','teowin_export','quote_pdf','photo','client_document','other')),
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','revised')),
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    valid_until DATE,
    pdf_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.quote_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit TEXT DEFAULT 'unit',
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit','pre_installation','final','other')),
    payment_method TEXT CHECK (payment_method IN ('cash','cheque','bank_transfer','card','other')),
    reference_number TEXT,
    notes TEXT,
    received_by UUID REFERENCES public.profiles(id),
    received_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','on_hold')),
    notes TEXT,
    assigned_to UUID REFERENCES public.profiles(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.production_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    part_code TEXT,
    current_station TEXT NOT NULL DEFAULT 'pending' CHECK (current_station IN ('pending','saw','cnc','edge','assembly','qc','packing')),
    assigned_worker UUID REFERENCES public.profiles(id),
    last_scan_time TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.production_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID NOT NULL REFERENCES public.production_parts(id) ON DELETE CASCADE,
    station TEXT NOT NULL,
    scanned_by UUID REFERENCES public.profiles(id),
    scanned_at TIMESTAMPTZ DEFAULT now(),
    is_offline_sync BOOLEAN DEFAULT false
);

CREATE TABLE public.production_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
    part_id UUID REFERENCES public.production_parts(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    station TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    estimated_duration_hours DECIMAL(4,1),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','issue_reported','rescheduled')),
    team_lead_id UUID REFERENCES public.profiles(id),
    client_address TEXT,
    client_phone TEXT,
    notes TEXT,
    checkin_at TIMESTAMPTZ,
    checkin_lat DECIMAL(10,7),
    checkin_lng DECIMAL(10,7),
    checkin_photo_url TEXT,
    checkout_at TIMESTAMPTZ,
    checkout_lat DECIMAL(10,7),
    checkout_lng DECIMAL(10,7),
    checkout_photo_url TEXT,
    completion_report TEXT,
    client_signature_url TEXT,
    client_satisfaction INTEGER CHECK (client_satisfaction BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.installation_team (
    installation_id UUID NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    PRIMARY KEY (installation_id, user_id)
);

CREATE TABLE public.installation_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
    photo_type TEXT CHECK (photo_type IN ('before','during','after','issue')),
    file_url TEXT NOT NULL,
    caption TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.installation_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
    item_text TEXT NOT NULL,
    is_checked BOOLEAN DEFAULT false,
    checked_by UUID REFERENCES public.profiles(id),
    checked_at TIMESTAMPTZ,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE public.installation_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('minor','major','critical')),
    photo_url TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    category TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    project_id UUID REFERENCES public.projects(id),
    source_module TEXT NOT NULL,
    source_id UUID,
    payment_method TEXT CHECK (payment_method IN ('cash','cheque','bank_transfer','card','other')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ledger_date ON public.ledger(date);
CREATE INDEX idx_ledger_type ON public.ledger(type);
CREATE INDEX idx_ledger_project ON public.ledger(project_id);

CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL CHECK (category IN ('rent','internet','phones','insurance','software','subscriptions','utilities','fuel','transport','maintenance','tools','spare_parts','consumables','raw_materials','salary','bonus','tax','other')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    payment_method TEXT CHECK (payment_method IN ('cash','cheque','bank_transfer','card','other')),
    is_recurring BOOLEAN DEFAULT false,
    recurring_day INTEGER CHECK (recurring_day BETWEEN 1 AND 31),
    project_id UUID REFERENCES public.projects(id),
    supplier_id UUID,
    receipt_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method TEXT,
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    is_active BOOLEAN DEFAULT true,
    last_generated DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.cheques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('received','issued')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deposited','cleared','bounced','cancelled')),
    cheque_number TEXT,
    bank_name TEXT,
    client_name TEXT,
    supplier_name TEXT,
    project_id UUID REFERENCES public.projects(id),
    photo_url TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    category TEXT,
    balance DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.expenses ADD CONSTRAINT fk_expense_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

CREATE TABLE public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','confirmed','received','cancelled')),
    total_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'unit',
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE public.stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('panels','edge_banding','hardware','consumables','other')),
    unit TEXT DEFAULT 'unit',
    current_quantity DECIMAL(12,2) DEFAULT 0,
    minimum_quantity DECIMAL(12,2) DEFAULT 0,
    location TEXT,
    cost_per_unit DECIMAL(12,2),
    supplier_id UUID REFERENCES public.suppliers(id),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID NOT NULL REFERENCES public.stock_items(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out','transfer','reserve','consume','adjust')),
    quantity DECIMAL(12,2) NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    project_id UUID REFERENCES public.projects(id),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('payment_due','cheque_due','rent_due','salary_due','utility_due','installation','measurement_visit','project_deadline','maintenance','recurring_expense','follow_up','other')),
    event_date DATE NOT NULL,
    event_time TIME,
    is_all_day BOOLEAN DEFAULT true,
    reference_type TEXT,
    reference_id UUID,
    assigned_to UUID REFERENCES public.profiles(id),
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_date ON public.calendar_events(event_date);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    type TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
    reference_type TEXT,
    reference_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);

CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status TEXT DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','holiday')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, date)
);

CREATE TABLE public.payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    base_salary DECIMAL(12,2) NOT NULL,
    overtime_hours DECIMAL(5,1) DEFAULT 0,
    overtime_amount DECIMAL(12,2) DEFAULT 0,
    bonus DECIMAL(12,2) DEFAULT 0,
    deductions DECIMAL(12,2) DEFAULT 0,
    net_salary DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, month, year)
);

CREATE TABLE public.marketing_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    platform TEXT CHECK (platform IN ('instagram','facebook','tiktok','other')),
    content_type TEXT CHECK (content_type IN ('post','reel','story','carousel')),
    caption TEXT,
    scheduled_date DATE,
    status TEXT DEFAULT 'idea' CHECK (status IN ('idea','planned','created','scheduled','published')),
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    reach INTEGER,
    media_urls TEXT[],
    project_id UUID REFERENCES public.projects(id),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.messaging_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id),
    project_id UUID REFERENCES public.projects(id),
    channel TEXT CHECK (channel IN ('whatsapp','sms','email','phone_call')),
    direction TEXT CHECK (direction IN ('inbound','outbound')),
    content TEXT,
    sent_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    reason TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    agent_type TEXT CHECK (agent_type IN ('sales','marketing','management','scanner')),
    context_type TEXT,
    context_id UUID,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    confidence DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ai_review_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_photo_url TEXT NOT NULL,
    extracted_data JSONB NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    expense_id UUID REFERENCES public.expenses(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.daily_close (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
    closed_by UUID REFERENCES public.profiles(id),
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    notes TEXT
);
