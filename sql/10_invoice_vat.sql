-- ============================================================================
-- 10_invoice_vat.sql — Add VAT support to invoices
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'vat_rate'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN vat_rate DECIMAL(5,2) DEFAULT 20.00;
        ALTER TABLE public.invoices ADD COLUMN vat_amount DECIMAL(12,2) DEFAULT 0;
        ALTER TABLE public.invoices ADD COLUMN total_ttc DECIMAL(12,2) DEFAULT 0;
    END IF;
END $$;

-- Backfill: set total_ttc = total_amount for existing invoices (assumed TTC)
UPDATE public.invoices
SET total_ttc = total_amount,
    vat_rate = 20.00,
    vat_amount = ROUND(total_amount - total_amount / 1.20, 2)
WHERE total_ttc = 0 OR total_ttc IS NULL;
