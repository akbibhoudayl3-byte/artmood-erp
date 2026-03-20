/**
 * Exact stock item matching by material_type.
 *
 * Falls back to fuzzy name matching only for legacy items without material_type set.
 */

interface StockItem {
  id: string;
  name: string;
  material_type?: string | null;
  current_quantity: number;
  reserved_quantity: number;
  unit: string;
  [key: string]: any;
}

/**
 * Find a stock item matching the given material type.
 *
 * Priority:
 * 1. Exact match on stock_items.material_type (case-insensitive)
 * 2. Fuzzy fallback on name (legacy, will be removed once all items have material_type)
 */
export function findStockItem(stockItems: StockItem[], materialType: string): StockItem | undefined {
  const lower = materialType.toLowerCase();

  // 1. Exact match on material_type column
  const exactMatch = stockItems.find(
    s => s.material_type && s.material_type.toLowerCase() === lower,
  );
  if (exactMatch) return exactMatch;

  // 2. Legacy fuzzy fallback (to be removed when all stock items have material_type)
  return stockItems.find((s) => {
    const sn = s.name.toLowerCase();
    if (lower.includes('hdf')) return sn.includes('hdf');
    if (lower.includes('mdf')) return sn.includes('mdf') && !sn.includes('hdf');
    if (lower.includes('stratif')) return sn.includes('stratif');
    return sn.includes(lower);
  });
}
