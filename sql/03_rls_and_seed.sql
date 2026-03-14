-- ============================================================
-- PART 3: RLS POLICIES + SEED DATA
-- Run this AFTER Part 2 succeeds
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_review_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_close ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: get current user role
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES
-- CEO and service_role can do everything
-- ============================================================

-- PROFILES: everyone can read active profiles, only update own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT WITH CHECK (
    public.get_user_role() = 'ceo' OR auth.uid() = id
);

-- LEADS: ceo/commercial/cm can see all, cm only own created
CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager','community_manager')
);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (
    public.get_user_role() IN ('ceo','commercial_manager')
    OR created_by = auth.uid()
);

-- LEAD PHOTOS & ACTIVITIES: follow lead access
CREATE POLICY "lead_photos_all" ON public.lead_photos FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leads WHERE id = lead_id AND (
        public.get_user_role() IN ('ceo','commercial_manager') OR created_by = auth.uid() OR assigned_to = auth.uid()
    ))
);
CREATE POLICY "lead_activities_all" ON public.lead_activities FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leads WHERE id = lead_id AND (
        public.get_user_role() IN ('ceo','commercial_manager') OR created_by = auth.uid() OR assigned_to = auth.uid()
    ))
);

-- PROJECTS: role-based access
CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager','workshop_manager')
    OR designer_id = auth.uid()
    OR created_by = auth.uid()
);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager')
);
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
    public.get_user_role() IN ('ceo','commercial_manager','workshop_manager')
    OR designer_id = auth.uid()
);

-- PROJECT EVENTS, FILES: follow project access
CREATE POLICY "project_events_all" ON public.project_events FOR ALL USING (true);
CREATE POLICY "project_files_all" ON public.project_files FOR ALL USING (true);

-- QUOTES
CREATE POLICY "quotes_select" ON public.quotes FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager','designer')
);
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager','designer')
);
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE USING (
    public.get_user_role() IN ('ceo','commercial_manager','designer')
);
CREATE POLICY "quote_lines_all" ON public.quote_lines FOR ALL USING (true);

-- PAYMENTS: ceo and commercial only
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager')
);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager')
);

-- PRODUCTION: workshop roles + ceo
CREATE POLICY "prod_orders_select" ON public.production_orders FOR SELECT USING (
    public.get_user_role() IN ('ceo','workshop_manager','workshop_worker','commercial_manager')
);
CREATE POLICY "prod_orders_modify" ON public.production_orders FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);
CREATE POLICY "prod_parts_select" ON public.production_parts FOR SELECT USING (
    public.get_user_role() IN ('ceo','workshop_manager','workshop_worker')
);
CREATE POLICY "prod_parts_modify" ON public.production_parts FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);
CREATE POLICY "prod_scans_all" ON public.production_scans FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager','workshop_worker')
);
CREATE POLICY "prod_photos_all" ON public.production_photos FOR ALL USING (true);

-- INSTALLATIONS
CREATE POLICY "install_select" ON public.installations FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager','installer','workshop_manager')
);
CREATE POLICY "install_modify" ON public.installations FOR ALL USING (
    public.get_user_role() IN ('ceo','commercial_manager','installer')
);
CREATE POLICY "install_team_all" ON public.installation_team FOR ALL USING (true);
CREATE POLICY "install_photos_all" ON public.installation_photos FOR ALL USING (true);
CREATE POLICY "install_checklist_all" ON public.installation_checklist FOR ALL USING (true);
CREATE POLICY "install_issues_all" ON public.installation_issues FOR ALL USING (true);

-- FINANCIAL: ceo only (workers must not see)
CREATE POLICY "ledger_select" ON public.ledger FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager')
);
CREATE POLICY "ledger_insert" ON public.ledger FOR INSERT WITH CHECK (true);

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (
    public.get_user_role() IN ('ceo','hr_manager')
);
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager','hr_manager')
);

CREATE POLICY "recurring_expenses_all" ON public.recurring_expenses FOR ALL USING (
    public.get_user_role() = 'ceo'
);

CREATE POLICY "cheques_select" ON public.cheques FOR SELECT USING (
    public.get_user_role() IN ('ceo','commercial_manager')
);
CREATE POLICY "cheques_insert" ON public.cheques FOR INSERT WITH CHECK (
    public.get_user_role() IN ('ceo','commercial_manager')
);
CREATE POLICY "cheques_update" ON public.cheques FOR UPDATE USING (
    public.get_user_role() = 'ceo'
);

-- SUPPLIERS & STOCK
CREATE POLICY "suppliers_all" ON public.suppliers FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);
CREATE POLICY "po_all" ON public.purchase_orders FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);
CREATE POLICY "po_lines_all" ON public.purchase_order_lines FOR ALL USING (true);
CREATE POLICY "stock_items_select" ON public.stock_items FOR SELECT USING (
    public.get_user_role() IN ('ceo','workshop_manager','workshop_worker')
);
CREATE POLICY "stock_items_modify" ON public.stock_items FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);
CREATE POLICY "stock_movements_all" ON public.stock_movements FOR ALL USING (
    public.get_user_role() IN ('ceo','workshop_manager')
);

-- CALENDAR: everyone sees own assigned events
CREATE POLICY "calendar_select" ON public.calendar_events FOR SELECT USING (
    public.get_user_role() = 'ceo'
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
);
CREATE POLICY "calendar_insert" ON public.calendar_events FOR INSERT WITH CHECK (true);
CREATE POLICY "calendar_update" ON public.calendar_events FOR UPDATE USING (true);

-- NOTIFICATIONS: only own
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- ATTENDANCE
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT USING (
    public.get_user_role() IN ('ceo','hr_manager') OR user_id = auth.uid()
);
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT WITH CHECK (true);

-- PAYROLL: ceo/hr only
CREATE POLICY "payroll_all" ON public.payroll FOR ALL USING (
    public.get_user_role() IN ('ceo','hr_manager')
);

-- MARKETING
CREATE POLICY "marketing_all" ON public.marketing_posts FOR ALL USING (
    public.get_user_role() IN ('ceo','community_manager')
);

-- MESSAGING
CREATE POLICY "messaging_all" ON public.messaging_logs FOR ALL USING (
    public.get_user_role() IN ('ceo','commercial_manager')
);

-- AUDIT LOG: ceo read only
CREATE POLICY "audit_select" ON public.audit_log FOR SELECT USING (
    public.get_user_role() = 'ceo'
);
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT WITH CHECK (true);

-- AI
CREATE POLICY "ai_conversations_own" ON public.ai_conversations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ai_review_all" ON public.ai_review_inbox FOR ALL USING (
    public.get_user_role() = 'ceo'
);

-- DAILY CLOSE
CREATE POLICY "daily_close_all" ON public.daily_close FOR ALL USING (
    public.get_user_role() = 'ceo'
);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'workshop_worker')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
