/**
 * Migration 20260316_003 — Payment Overpay Guard
 *
 * Adds a PostgreSQL trigger that prevents payments from exceeding the project total.
 * Rule: SUM(payments.amount) for a project must never exceed projects.total_amount.
 *
 * This is a database-level safety net backing the service-layer validation.
 */

exports.version = '20260316_003';
exports.name = 'payment_overpay_guard';

exports.up = async function (supabase) {
  const ddl = async (sql) => {
    const { error } = await supabase.rpc('run_migration_ddl', { sql_text: sql });
    if (error) throw new Error(error.message);
  };

  // Create the trigger function
  await ddl(`
    CREATE OR REPLACE FUNCTION check_payment_overpay()
    RETURNS TRIGGER AS $$
    DECLARE
      v_total_amount NUMERIC;
      v_total_paid   NUMERIC;
      v_payment_delta NUMERIC;
    BEGIN
      -- Get the project total
      SELECT total_amount INTO v_total_amount
      FROM projects
      WHERE id = NEW.project_id;

      -- If project has no total_amount set (NULL or 0), allow any payment
      IF v_total_amount IS NULL OR v_total_amount <= 0 THEN
        RETURN NEW;
      END IF;

      -- Calculate total already paid (excluding the current row for UPDATE)
      IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
        FROM payments
        WHERE project_id = NEW.project_id AND id != NEW.id;
      ELSE
        SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
        FROM payments
        WHERE project_id = NEW.project_id;
      END IF;

      -- Check if adding this payment would exceed the project total
      IF (v_total_paid + NEW.amount) > v_total_amount THEN
        RAISE EXCEPTION 'Payment rejected: total paid (% + %) = % would exceed project total (%). Remaining: %',
          v_total_paid, NEW.amount, v_total_paid + NEW.amount, v_total_amount, v_total_amount - v_total_paid;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach trigger on INSERT and UPDATE
  await ddl(`
    DROP TRIGGER IF EXISTS trg_payment_overpay_guard ON payments;
    CREATE TRIGGER trg_payment_overpay_guard
      BEFORE INSERT OR UPDATE OF amount, project_id ON payments
      FOR EACH ROW
      EXECUTE FUNCTION check_payment_overpay();
  `);

  console.log('    \u2713 Payment overpay guard trigger created');
};
