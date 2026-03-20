-- ============================================================================
-- 07_cutting_offcuts.sql — Cutting offcuts tracking
-- ============================================================================

-- Usable offcuts from SAW cutting (for future reuse / nesting)
CREATE TABLE IF NOT EXISTS public.cutting_offcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    material_type TEXT NOT NULL,
    sheet_index INTEGER NOT NULL,
    x DECIMAL(8,2) NOT NULL,
    y DECIMAL(8,2) NOT NULL,
    width_mm DECIMAL(8,2) NOT NULL,
    height_mm DECIMAL(8,2) NOT NULL,
    area_mm2 DECIMAL(12,2) NOT NULL,
    is_usable BOOLEAN DEFAULT true,
    is_consumed BOOLEAN DEFAULT false,
    consumed_by_project_id UUID REFERENCES public.projects(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying usable offcuts by material
CREATE INDEX IF NOT EXISTS idx_cutting_offcuts_material
    ON public.cutting_offcuts(material_type, is_usable)
    WHERE is_usable = true AND is_consumed = false;

-- Index for project lookup
CREATE INDEX IF NOT EXISTS idx_cutting_offcuts_project
    ON public.cutting_offcuts(project_id);

-- RLS
ALTER TABLE public.cutting_offcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cutting offcuts"
    ON public.cutting_offcuts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
