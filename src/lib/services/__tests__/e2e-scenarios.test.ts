/**
 * E2E Test Scenarios — ArtMood ERP Full Workflow
 *
 * These tests verify the complete data chain:
 * BOM → Quote → Payment → Production → Cutting → Stock → Invoice
 *
 * Run with: npx tsx src/lib/services/__tests__/e2e-scenarios.test.ts
 */

// ── Test helpers ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ── 1. Money utilities ─────────────────────────────────────────────────────

import { roundMoney, computeVAT, computeDiscount, sumMoney } from '../../utils/money';

section('1. Financial Rounding (money.ts)');

assert(roundMoney(10.005) === 10.01, 'roundMoney(10.005) === 10.01');
assert(roundMoney(10.004) === 10, 'roundMoney(10.004) === 10');
assert(roundMoney(0.1 + 0.2) === 0.3, 'roundMoney(0.1 + 0.2) === 0.3 (float fix)');
assert(roundMoney(999999.999) === 1000000, 'roundMoney large number');

section('2. VAT Computation');

const vat20 = computeVAT(1000, 20);
assert(vat20.vatAmount === 200, 'VAT 20% on 1000 = 200');
assert(vat20.totalTTC === 1200, 'TTC = 1200');

const vat0 = computeVAT(5000, 0);
assert(vat0.vatAmount === 0, 'VAT 0% = 0');
assert(vat0.totalTTC === 5000, 'TTC = 5000 when no VAT');

const vatFractional = computeVAT(333.33, 20);
assert(vatFractional.vatAmount === 66.67, 'VAT on 333.33 = 66.67 (rounded)');
assert(vatFractional.totalTTC === 400, 'TTC = 400');

section('3. Discount Computation');

const disc10 = computeDiscount(1000, 10);
assert(disc10.discountAmount === 100, '10% discount on 1000 = 100');
assert(disc10.afterDiscount === 900, 'After discount = 900');

const disc0 = computeDiscount(5000, 0);
assert(disc0.discountAmount === 0, '0% discount = 0');
assert(disc0.afterDiscount === 5000, 'No discount applied');

section('4. Sum Money');

assert(sumMoney([0.1, 0.2, 0.3]) === 0.6, 'sumMoney avoids float errors');
assert(sumMoney([100.50, 200.75, 50.25]) === 351.5, 'sumMoney of prices');
assert(sumMoney([]) === 0, 'sumMoney of empty array = 0');

// ── 2. Stock matching ──────────────────────────────────────────────────────

import { findStockItem } from '../../utils/stock-match';

section('5. Stock Matching — Exact (material_type)');

const stockItems = [
  { id: '1', name: 'MDF Blanc 18mm', material_type: 'mdf_18', current_quantity: 50, reserved_quantity: 5, unit: 'panel' },
  { id: '2', name: 'MDF 16mm', material_type: 'mdf_16', current_quantity: 30, reserved_quantity: 0, unit: 'panel' },
  { id: '3', name: 'HDF 5mm', material_type: 'back_hdf_5', current_quantity: 100, reserved_quantity: 10, unit: 'panel' },
  { id: '4', name: 'Stratifié 18mm', material_type: 'stratifie_18', current_quantity: 20, reserved_quantity: 2, unit: 'panel' },
];

const match1 = findStockItem(stockItems, 'mdf_18');
assert(match1?.id === '1', 'Exact match mdf_18 → item 1');

const match2 = findStockItem(stockItems, 'back_hdf_5');
assert(match2?.id === '3', 'Exact match back_hdf_5 → item 3');

const match3 = findStockItem(stockItems, 'stratifie_18');
assert(match3?.id === '4', 'Exact match stratifie_18 → item 4');

const match4 = findStockItem(stockItems, 'MDF_18');
assert(match4?.id === '1', 'Case-insensitive exact match MDF_18 → item 1');

section('6. Stock Matching — Fuzzy Fallback (legacy)');

const legacyItems = [
  { id: '10', name: 'Panneau MDF standard', material_type: null, current_quantity: 10, reserved_quantity: 0, unit: 'panel' },
  { id: '11', name: 'HDF fin pour fond', material_type: null, current_quantity: 20, reserved_quantity: 0, unit: 'panel' },
  { id: '12', name: 'Stratifié HPL', material_type: null, current_quantity: 5, reserved_quantity: 0, unit: 'panel' },
];

const fuzzy1 = findStockItem(legacyItems, 'mdf_18');
assert(fuzzy1?.id === '10', 'Fuzzy fallback: mdf → "Panneau MDF standard"');

const fuzzy2 = findStockItem(legacyItems, 'back_hdf_5');
assert(fuzzy2?.id === '11', 'Fuzzy fallback: hdf → "HDF fin pour fond"');

const fuzzy3 = findStockItem(legacyItems, 'stratifie_18');
assert(fuzzy3?.id === '12', 'Fuzzy fallback: stratif → "Stratifié HPL"');

section('7. Stock Matching — No Match');

const noMatch = findStockItem(legacyItems, 'plywood_birch_12');
assert(noMatch === undefined, 'Unknown material returns undefined');

// ── 3. Cutting engine ──────────────────────────────────────────────────────

import { nestParts } from '../../services/cutting-engine';

section('8. Cutting Engine — Basic Placement');

const basicResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 500, height_mm: 300, quantity: 1, grain_direction: 'none', label: 'Shelf' },
]);
assert(basicResult.validation.all_parts_placed, 'Single part placed');
assert(basicResult.validation.total_placed_parts === 1, '1 part placed');
assert(basicResult.validation.unplaced_count === 0, '0 unplaced');
assert(basicResult.sheets.length === 1, '1 sheet used');
assert(basicResult.placements[0].position_x >= 0, 'x >= 0');
assert(basicResult.placements[0].position_y >= 0, 'y >= 0');

section('9. Cutting Engine — Multi-Part with Kerf');

const multiResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 600, height_mm: 400, quantity: 2, grain_direction: 'none', label: 'Side' },
  { part_id: 'p2', material_type: 'mdf_18', width_mm: 300, height_mm: 200, quantity: 3, grain_direction: 'none', label: 'Shelf' },
]);
assert(multiResult.validation.all_parts_placed, 'All 5 parts placed');
assert(multiResult.validation.total_placed_parts === 5, '5 total (2+3 expanded)');

// Check kerf gap: no two placements overlap (on same sheet)
const placements = multiResult.placements.filter(p => p.sheet_index === 1);
for (let i = 0; i < placements.length; i++) {
  for (let j = i + 1; j < placements.length; j++) {
    const a = placements[i];
    const b = placements[j];
    const overlapX = a.position_x < b.position_x + b.placed_width && a.position_x + a.placed_width > b.position_x;
    const overlapY = a.position_y < b.position_y + b.placed_height && a.position_y + a.placed_height > b.position_y;
    assert(!(overlapX && overlapY), `No overlap between placement ${i} and ${j}`);
  }
}

section('10. Cutting Engine — Grain Direction');

// 800×500 with horizontal grain — fits in 1220×2800 sheet without rotation
const grainResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 800, height_mm: 500, quantity: 1, grain_direction: 'horizontal', label: 'Grain piece' },
]);
assert(grainResult.validation.all_parts_placed, 'Grain-constrained part placed');
const gPlacement = grainResult.placements[0];
assert(!gPlacement.rotated, 'Horizontal grain part not rotated');

section('11. Cutting Engine — Oversized Rejection');

const oversizedResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 5000, height_mm: 5000, quantity: 1, grain_direction: 'none', label: 'Huge' },
]);
assert(!oversizedResult.validation.all_parts_placed, 'Oversized part rejected');
assert(oversizedResult.validation.unplaced_count === 1, '1 unplaced');
assert(oversizedResult.validation.unplaced_parts.length === 1, 'Unplaced list has 1 entry');

section('12. Cutting Engine — Mixed Materials');

const mixedResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 500, height_mm: 300, quantity: 2, grain_direction: 'none', label: 'MDF part' },
  { part_id: 'p2', material_type: 'back_hdf_5', width_mm: 400, height_mm: 200, quantity: 1, grain_direction: 'none', label: 'HDF back' },
]);
assert(mixedResult.validation.all_parts_placed, 'Mixed materials all placed');
assert(mixedResult.sheets.length === 2, '2 sheets (one per material)');
const mdfSheetM = mixedResult.sheets.find(s => s.material_type === 'mdf_18');
const hdfSheetM = mixedResult.sheets.find(s => s.material_type === 'back_hdf_5');
assert(mdfSheetM !== undefined, 'MDF sheet exists');
assert(hdfSheetM !== undefined, 'HDF sheet exists');
assert(mdfSheetM!.parts_count === 2, 'MDF sheet has 2 parts');
assert(hdfSheetM!.parts_count === 1, 'HDF sheet has 1 part');

section('13. Cutting Engine — Waste Calculation');

const wasteResult = nestParts([
  { part_id: 'p1', material_type: 'mdf_18', width_mm: 1200, height_mm: 2800, quantity: 1, grain_direction: 'none', label: 'Full panel' },
]);
const wasteSheet = wasteResult.sheets[0];
assert(wasteSheet.waste_percent < 5, `Near-full panel waste < 5% (got ${wasteSheet.waste_percent.toFixed(1)}%)`);

// ── 4. Workflow chain simulation ────────────────────────────────────────────

section('14. Full Workflow Chain Validation');

// Simulate: BOM parts → Cutting → Stock deduction → Invoice → Payment → Refund
// This validates the data types and computations flow correctly

// Step 1: BOM generates parts
const bomParts = [
  { part_id: 'side_L', material_type: 'mdf_18', width_mm: 600, height_mm: 2000, quantity: 2, grain_direction: 'vertical' as const, label: 'Côté gauche' },
  { part_id: 'shelf', material_type: 'mdf_18', width_mm: 800, height_mm: 400, quantity: 4, grain_direction: 'none' as const, label: 'Étagère' },
  { part_id: 'back', material_type: 'back_hdf_5', width_mm: 800, height_mm: 2000, quantity: 1, grain_direction: 'none' as const, label: 'Fond' },
];

// Step 2: Cutting generates nesting
const cuttingResult = nestParts(bomParts);
assert(cuttingResult.validation.all_parts_placed, 'All BOM parts placed in cutting');
assert(cuttingResult.validation.total_placed_parts === cuttingResult.validation.total_input_parts, 'All input parts placed');

const mdfSheets = cuttingResult.sheets.filter(s => s.material_type === 'mdf_18');
const hdfSheets = cuttingResult.sheets.filter(s => s.material_type === 'back_hdf_5');
assert(mdfSheets.length > 0, 'MDF sheets allocated');
assert(hdfSheets.length > 0, 'HDF sheets allocated');

// Step 3: Simulate invoice with VAT
const quoteSubtotal = 15000; // from BOM cost calculation
const { discountAmount, afterDiscount } = computeDiscount(quoteSubtotal, 5);
assert(discountAmount === 750, '5% discount on 15000 = 750');
assert(afterDiscount === 14250, 'After discount = 14250');

const { vatAmount, totalTTC } = computeVAT(afterDiscount, 20);
assert(vatAmount === 2850, 'VAT on 14250 = 2850');
assert(totalTTC === 17100, 'TTC = 17100');

// Step 4: Simulate payments
const payment1 = roundMoney(totalTTC * 0.5); // 50% deposit
assert(payment1 === 8550, '50% deposit = 8550');

const remaining1 = roundMoney(totalTTC - payment1);
assert(remaining1 === 8550, 'Remaining after deposit = 8550');

const payment2 = roundMoney(totalTTC * 0.4); // 40% pre-installation
assert(payment2 === 6840, '40% pre-install = 6840');

const remaining2 = roundMoney(remaining1 - payment2);
assert(remaining2 === 1710, 'Remaining after pre-install = 1710');

const payment3 = remaining2; // final payment
const remaining3 = roundMoney(totalTTC - payment1 - payment2 - payment3);
assert(remaining3 === 0, 'Fully paid, remaining = 0');

// Step 5: Simulate refund
const refundAmount = 1000;
const afterRefund = roundMoney(payment1 + payment2 + payment3 - refundAmount);
const remainingAfterRefund = roundMoney(totalTTC - afterRefund);
assert(remainingAfterRefund === 1000, 'After refund 1000, remaining = 1000');

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
