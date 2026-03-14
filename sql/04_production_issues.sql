-- Production Issues table for workshop issue reporting
CREATE TABLE IF NOT EXISTS public.production_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
    part_id UUID REFERENCES public.production_parts(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES public.profiles(id),
    issue_type TEXT NOT NULL CHECK (issue_type IN ('missing_material','wrong_dimension','machine_problem','client_change','quality_defect','other')),
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
    photo_url TEXT,
    station TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_production_issues_order ON public.production_issues(production_order_id);
CREATE INDEX idx_production_issues_resolved ON public.production_issues(resolved);

-- Cabinet Templates table for the template system
CREATE TABLE IF NOT EXISTS public.cabinet_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cabinet_type TEXT NOT NULL CHECK (cabinet_type IN ('base_cabinet','wall_cabinet','tall_cabinet','drawer_unit','wardrobe','shelf_unit','corner_cabinet','other')),
    description TEXT,
    default_width DECIMAL(8,2),
    default_height DECIMAL(8,2),
    default_depth DECIMAL(8,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cabinet specifications for a project
CREATE TABLE IF NOT EXISTS public.cabinet_specs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.cabinet_templates(id),
    cabinet_name TEXT NOT NULL,
    cabinet_type TEXT NOT NULL,
    width DECIMAL(8,2) NOT NULL,
    height DECIMAL(8,2) NOT NULL,
    depth DECIMAL(8,2) NOT NULL,
    material TEXT NOT NULL DEFAULT 'melamine_white',
    edge_band_type TEXT DEFAULT '2mm_pvc',
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Panel list generated from cabinet specs
CREATE TABLE IF NOT EXISTS public.panel_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_spec_id UUID NOT NULL REFERENCES public.cabinet_specs(id) ON DELETE CASCADE,
    panel_name TEXT NOT NULL,
    length DECIMAL(8,2) NOT NULL,
    width DECIMAL(8,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    material TEXT NOT NULL,
    edge_top BOOLEAN DEFAULT false,
    edge_bottom BOOLEAN DEFAULT false,
    edge_left BOOLEAN DEFAULT false,
    edge_right BOOLEAN DEFAULT false,
    grain_direction TEXT DEFAULT 'length' CHECK (grain_direction IN ('length','width','none')),
    notes TEXT,
    sort_order INTEGER DEFAULT 0
);

-- Accessories for cabinet specs
CREATE TABLE IF NOT EXISTS public.cabinet_accessories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_spec_id UUID NOT NULL REFERENCES public.cabinet_specs(id) ON DELETE CASCADE,
    accessory_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2),
    notes TEXT
);

-- Project cost tracking for profitability
CREATE TABLE IF NOT EXISTS public.project_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    cost_type TEXT NOT NULL CHECK (cost_type IN ('material','labor','transport','installation','subcontract','overhead','other')),
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(12,2),
    supplier_id UUID REFERENCES public.suppliers(id),
    stock_item_id UUID REFERENCES public.stock_items(id),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_project_costs_project ON public.project_costs(project_id);

-- Project profitability view
CREATE OR REPLACE VIEW public.v_project_profitability AS
SELECT
    p.id,
    p.reference_code,
    p.client_name,
    p.status,
    p.total_amount AS revenue,
    COALESCE(SUM(pc.amount), 0) AS total_cost,
    p.total_amount - COALESCE(SUM(pc.amount), 0) AS profit,
    CASE WHEN p.total_amount > 0
        THEN ROUND(((p.total_amount - COALESCE(SUM(pc.amount), 0)) / p.total_amount * 100)::numeric, 1)
        ELSE 0
    END AS margin_percent,
    p.paid_amount,
    p.deposit_paid,
    p.created_at,
    p.estimated_production_end,
    p.actual_delivery_date
FROM public.projects p
LEFT JOIN public.project_costs pc ON pc.project_id = p.id
GROUP BY p.id;

-- Per-project performance scoring view
CREATE OR REPLACE VIEW public.v_project_performance AS
SELECT
    p.id,
    p.reference_code,
    p.client_name,
    p.status,
    p.total_amount,
    p.paid_amount,
    COALESCE(SUM(pc.amount), 0) AS total_cost,
    -- Cost variance: green if under budget, yellow if 0-10% over, red if 10%+ over
    CASE
        WHEN p.total_amount = 0 THEN 'gray'
        WHEN COALESCE(SUM(pc.amount), 0) <= p.total_amount * 0.7 THEN 'green'
        WHEN COALESCE(SUM(pc.amount), 0) <= p.total_amount * 0.85 THEN 'yellow'
        ELSE 'red'
    END AS cost_status,
    -- Schedule variance: green if on time, yellow if <7d late, red if 7d+ late
    CASE
        WHEN p.status = 'delivered' THEN 'green'
        WHEN p.estimated_production_end IS NULL THEN 'gray'
        WHEN CURRENT_DATE <= p.estimated_production_end THEN 'green'
        WHEN CURRENT_DATE <= p.estimated_production_end + 7 THEN 'yellow'
        ELSE 'red'
    END AS schedule_status,
    -- Payment status
    CASE
        WHEN p.final_paid THEN 'green'
        WHEN p.deposit_paid THEN 'yellow'
        ELSE 'red'
    END AS payment_status,
    -- Overall health
    CASE
        WHEN p.status = 'delivered' AND p.final_paid AND COALESCE(SUM(pc.amount), 0) <= p.total_amount * 0.7 THEN 'green'
        WHEN p.status = 'cancelled' THEN 'gray'
        WHEN (CURRENT_DATE > COALESCE(p.estimated_production_end, CURRENT_DATE + 365) + 7)
            OR (COALESCE(SUM(pc.amount), 0) > p.total_amount * 0.85)
            OR (NOT p.deposit_paid AND p.status IN ('production','installation'))
        THEN 'red'
        ELSE 'yellow'
    END AS overall_health
FROM public.projects p
LEFT JOIN public.project_costs pc ON pc.project_id = p.id
GROUP BY p.id;
