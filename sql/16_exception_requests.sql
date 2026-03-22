-- ============================================================
-- Project Exceptions — Deposit Override Requests (MVP)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL,
    requested_stage TEXT NOT NULL DEFAULT 'in_production',
    current_deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    note TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_exceptions_project ON public.project_exceptions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_exceptions_status ON public.project_exceptions(status);

ALTER TABLE public.project_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_exceptions_select ON public.project_exceptions
    FOR SELECT USING (true);

CREATE POLICY project_exceptions_insert ON public.project_exceptions
    FOR INSERT WITH CHECK (auth.uid() = requested_by);

CREATE POLICY project_exceptions_update ON public.project_exceptions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ceo')
    );

COMMIT;
