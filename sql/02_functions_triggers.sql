-- ============================================================
-- PART 2: FUNCTIONS, TRIGGERS, AND VIEWS
-- Run this AFTER Part 1 succeeds
-- ============================================================

-- Auto-generate project reference code
CREATE OR REPLACE FUNCTION generate_project_reference()
RETURNS TRIGGER AS $$
DECLARE seq_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(reference_code FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO seq_num FROM public.projects
    WHERE reference_code LIKE 'ART-' || TO_CHAR(NOW(), 'YYYY') || '-%';
    NEW.reference_code := 'ART-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_reference
    BEFORE INSERT ON public.projects
    FOR EACH ROW WHEN (NEW.reference_code IS NULL)
    EXECUTE FUNCTION generate_project_reference();

-- Auto-log project status changes
CREATE OR REPLACE FUNCTION log_project_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.project_events (project_id, event_type, old_value, new_value, description)
        VALUES (NEW.id, 'status_change', OLD.status, NEW.status,
                'Project moved from ' || OLD.status || ' to ' || NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_status_log
    AFTER UPDATE ON public.projects FOR EACH ROW
    EXECUTE FUNCTION log_project_status_change();

-- Payment trigger: update project paid_amount + flags (50/40/10 rule)
CREATE OR REPLACE FUNCTION update_project_payment()
RETURNS TRIGGER AS $$
DECLARE total DECIMAL(12,2); project_total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO total FROM public.payments WHERE project_id = NEW.project_id;
    SELECT total_amount INTO project_total FROM public.projects WHERE id = NEW.project_id;
    UPDATE public.projects SET
        paid_amount = total,
        deposit_paid = (total >= project_total * 0.50),
        pre_install_paid = (total >= project_total * 0.90),
        final_paid = (total >= project_total),
        updated_at = now()
    WHERE id = NEW.project_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_update
    AFTER INSERT ON public.payments FOR EACH ROW
    EXECUTE FUNCTION update_project_payment();

-- Auto-generate QR part code
CREATE OR REPLACE FUNCTION generate_part_code()
RETURNS TRIGGER AS $$
BEGIN
    NEW.part_code := 'PRT-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_part_code
    BEFORE INSERT ON public.production_parts FOR EACH ROW
    WHEN (NEW.part_code IS NULL)
    EXECUTE FUNCTION generate_part_code();

-- Scan trigger: update part current station
CREATE OR REPLACE FUNCTION update_part_station()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.production_parts SET
        current_station = NEW.station,
        last_scan_time = NEW.scanned_at,
        assigned_worker = NEW.scanned_by,
        updated_at = now()
    WHERE id = NEW.part_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scan_update_station
    AFTER INSERT ON public.production_scans FOR EACH ROW
    EXECUTE FUNCTION update_part_station();

-- Check if all parts done -> mark order complete
CREATE OR REPLACE FUNCTION check_production_order_complete()
RETURNS TRIGGER AS $$
DECLARE total_parts INTEGER; packed_parts INTEGER; order_id UUID;
BEGIN
    order_id := (SELECT production_order_id FROM public.production_parts WHERE id = NEW.part_id);
    SELECT COUNT(*), COUNT(*) FILTER (WHERE current_station = 'packing')
    INTO total_parts, packed_parts FROM public.production_parts WHERE production_order_id = order_id;
    IF total_parts > 0 AND total_parts = packed_parts THEN
        UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE id = order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_order_complete
    AFTER UPDATE ON public.production_parts FOR EACH ROW
    WHEN (NEW.current_station = 'packing')
    EXECUTE FUNCTION check_production_order_complete();

-- Auto-create ledger entry for expenses
CREATE OR REPLACE FUNCTION create_expense_ledger_entry()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.ledger (date, type, category, amount, description, project_id, source_module, source_id, payment_method, created_by)
    VALUES (NEW.date, 'expense', NEW.category, NEW.amount, NEW.description, NEW.project_id, 'expense', NEW.id, NEW.payment_method, NEW.created_by);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_ledger
    AFTER INSERT ON public.expenses FOR EACH ROW
    EXECUTE FUNCTION create_expense_ledger_entry();

-- Auto-create ledger entry for payments (income)
CREATE OR REPLACE FUNCTION create_payment_ledger_entry()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.ledger (date, type, category, amount, description, project_id, source_module, source_id, payment_method, created_by)
    VALUES (NEW.received_at::DATE, 'income', NEW.payment_type, NEW.amount, 'Payment for project', NEW.project_id, 'payment', NEW.id, NEW.payment_method, NEW.received_by);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_ledger
    AFTER INSERT ON public.payments FOR EACH ROW
    EXECUTE FUNCTION create_payment_ledger_entry();

-- Update stock quantity on movement
CREATE OR REPLACE FUNCTION update_stock_quantity()
RETURNS TRIGGER AS $$
DECLARE new_qty DECIMAL(12,2);
BEGIN
    SELECT current_quantity + NEW.quantity INTO new_qty FROM public.stock_items WHERE id = NEW.stock_item_id;
    IF new_qty < 0 THEN
        RAISE EXCEPTION 'Stock cannot go negative. CEO override required.';
    END IF;
    UPDATE public.stock_items SET current_quantity = new_qty, updated_at = now() WHERE id = NEW.stock_item_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement
    AFTER INSERT ON public.stock_movements FOR EACH ROW
    EXECUTE FUNCTION update_stock_quantity();

-- Auto-create calendar event for cheques
CREATE OR REPLACE FUNCTION create_cheque_calendar_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.calendar_events (title, description, event_type, event_date, reference_type, reference_id, created_by)
    VALUES (
        CASE NEW.type WHEN 'received' THEN 'Cheque to deposit: ' || NEW.amount || ' MAD' WHEN 'issued' THEN 'Cheque due: ' || NEW.amount || ' MAD' END,
        'Cheque #' || COALESCE(NEW.cheque_number, 'N/A') || ' - ' || COALESCE(NEW.client_name, NEW.supplier_name, 'Unknown'),
        'cheque_due', NEW.due_date, 'cheque', NEW.id, NEW.created_by
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cheque_calendar
    AFTER INSERT ON public.cheques FOR EACH ROW
    EXECUTE FUNCTION create_cheque_calendar_event();

-- Prevent audit log modification
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update
    BEFORE UPDATE OR DELETE ON public.audit_log FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.v_monthly_cashflow AS
SELECT
    DATE_TRUNC('month', date)::DATE AS month,
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expenses,
    SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net_cashflow
FROM public.ledger
GROUP BY DATE_TRUNC('month', date)
ORDER BY month DESC;

CREATE OR REPLACE VIEW public.v_business_health AS
SELECT
    (SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) FROM public.ledger WHERE date >= CURRENT_DATE - 30) AS cashflow_30d,
    (SELECT COUNT(*) FROM public.projects WHERE status IN ('in_production','installation') AND paid_amount < total_amount * 0.5) AS overdue_deposits,
    (SELECT COUNT(*) FROM public.stock_items WHERE current_quantity <= minimum_quantity AND is_active) AS critical_stock_items,
    (SELECT COUNT(*) FROM public.production_orders WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '14 days') AS delayed_production,
    (SELECT COUNT(*) FROM public.cheques WHERE status = 'pending' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS cheques_due_7d;

CREATE OR REPLACE VIEW public.v_station_workload AS
SELECT
    current_station AS station,
    COUNT(*) AS part_count,
    COUNT(DISTINCT production_order_id) AS order_count
FROM public.production_parts
WHERE current_station NOT IN ('pending', 'packing')
GROUP BY current_station;
