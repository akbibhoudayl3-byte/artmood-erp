-- ============================================================================
-- 09_invoice_number_function.sql — Atomic invoice number generation
-- ============================================================================
-- Replaces application-level sequence to prevent race conditions.
-- Uses pg_advisory_xact_lock to serialize concurrent calls within a transaction.

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  current_year INTEGER;
  next_seq INTEGER;
  invoice_num TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::INTEGER;

  -- Advisory lock keyed on year to serialize concurrent invoice creation
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number_' || current_year::TEXT));

  -- Find the max existing sequence for this year
  SELECT COALESCE(
    MAX(
      (regexp_match(invoice_number, 'FAC-' || current_year || '-(\d+)'))[1]::INTEGER
    ),
    0
  ) + 1
  INTO next_seq
  FROM public.invoices
  WHERE invoice_number LIKE 'FAC-' || current_year || '-%';

  invoice_num := 'FAC-' || current_year || '-' || lpad(next_seq::TEXT, 4, '0');

  RETURN invoice_num;
END;
$$;
