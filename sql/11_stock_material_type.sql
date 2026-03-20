-- ============================================================================
-- 11_stock_material_type.sql — Add material_type to stock_items for exact matching
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stock_items' AND column_name = 'material_type'
    ) THEN
        ALTER TABLE public.stock_items ADD COLUMN material_type TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stock_items' AND column_name = 'stock_tracking'
    ) THEN
        ALTER TABLE public.stock_items ADD COLUMN stock_tracking BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stock_items' AND column_name = 'reserved_quantity'
    ) THEN
        ALTER TABLE public.stock_items ADD COLUMN reserved_quantity DECIMAL(12,2) DEFAULT 0;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_items_material_type ON public.stock_items(material_type) WHERE material_type IS NOT NULL;

-- Backfill: infer material_type from name for existing items
UPDATE public.stock_items SET material_type = 'mdf_18' WHERE material_type IS NULL AND lower(name) LIKE '%mdf%18%' AND lower(name) NOT LIKE '%hdf%';
UPDATE public.stock_items SET material_type = 'mdf_16' WHERE material_type IS NULL AND lower(name) LIKE '%mdf%16%' AND lower(name) NOT LIKE '%hdf%';
UPDATE public.stock_items SET material_type = 'back_hdf_5' WHERE material_type IS NULL AND lower(name) LIKE '%hdf%';
UPDATE public.stock_items SET material_type = 'stratifie_18' WHERE material_type IS NULL AND lower(name) LIKE '%stratif%18%';
UPDATE public.stock_items SET material_type = 'stratifie_16' WHERE material_type IS NULL AND lower(name) LIKE '%stratif%16%';
