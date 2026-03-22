-- ============================================================
-- Exception Requests — Deposit Override Workflow
--
-- Allows non-admin users to request a deposit rule bypass.
-- CEO/admin reviews and approves/rejects.
-- Approved exceptions unlock the production transition.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────
-- 1. Create exception_requests table
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exception_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id),
    requested_status TEXT NOT NULL,
    current_deposit_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exception_requests_project ON public.exception_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_exception_requests_status ON public.exception_requests(status);

-- ──────────────────────────────────────────────
-- 2. RLS policies
-- ──────────────────────────────────────────────
ALTER TABLE public.exception_requests ENABLE ROW LEVEL SECURITY;

-- Everyone can read (filtered by UI per role)
CREATE POLICY exception_requests_select ON public.exception_requests
    FOR SELECT USING (true);

-- Authenticated users can insert their own requests
CREATE POLICY exception_requests_insert ON public.exception_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Only CEO can update (approve/reject)
CREATE POLICY exception_requests_update ON public.exception_requests
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ceo')
    );

COMMIT;
