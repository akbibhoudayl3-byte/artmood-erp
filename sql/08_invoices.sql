-- ============================================================================
-- 08_invoices.sql — Invoicing system
-- ============================================================================

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES public.quotes(id),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','issued','partial','paid','cancelled')),
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    issue_date DATE,
    due_date DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice lines (snapshot from quote lines or manual)
CREATE TABLE IF NOT EXISTS public.invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit TEXT DEFAULT 'unit',
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    sort_order INTEGER DEFAULT 0
);

-- Link payments to invoices (a payment can optionally reference an invoice)
-- Add invoice_id column to payments table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN invoice_id UUID REFERENCES public.invoices(id);
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id) WHERE invoice_id IS NOT NULL;

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage invoices"
    ON public.invoices FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage invoice lines"
    ON public.invoice_lines FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- Sequence for invoice numbering
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;
