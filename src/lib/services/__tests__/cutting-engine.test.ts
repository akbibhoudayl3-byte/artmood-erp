/**
 * Unit tests for the cutting engine.
 * Proves: real coordinates, zero part loss, correct waste, kerf accounting.
 */
import { nestParts, SAW_KERF_MM, type InputPart } from '../cutting-engine';

function makePart(overrides: Partial<InputPart> & { width_mm: number; height_mm: number }): InputPart {
  return {
    id: `part-${Math.random().toString(36).slice(2, 8)}`,
    part_code: 'TEST',
    part_name: 'Test Part',
    material_type: 'mdf_18',
    quantity: 1,
    edge_top: false,
    edge_bottom: false,
    edge_left: false,
    edge_right: false,
    grain_direction: 'none',
    ...overrides,
  };
}

describe('Cutting Engine — Guillotine BSSF', () => {

  test('single part is placed at (0,0) on sheet 1', () => {
    const result = nestParts([makePart({ width_mm: 600, height_mm: 400 })]);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.validation.total_input_parts).toBe(1);
    expect(result.validation.total_placed_parts).toBe(1);
    expect(result.placements[0].position_x).toBe(0);
    expect(result.placements[0].position_y).toBe(0);
    expect(result.placements[0].sheet_index).toBe(1);
  });

  test('two parts are placed with kerf gap between them', () => {
    const result = nestParts([
      makePart({ width_mm: 600, height_mm: 2800 }), // takes full height
      makePart({ width_mm: 500, height_mm: 2800 }), // should go to right with kerf gap
    ]);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.validation.total_placed_parts).toBe(2);

    const p1 = result.placements[0];
    const p2 = result.placements[1];

    // First part at origin
    expect(p1.position_x).toBe(0);
    expect(p1.position_y).toBe(0);

    // Second part should be at x = 600 + kerf
    expect(p2.position_x).toBe(600 + SAW_KERF_MM);
    expect(p2.position_y).toBe(0);

    // Both on same sheet
    expect(p1.sheet_index).toBe(1);
    expect(p2.sheet_index).toBe(1);
  });

  test('parts that fill the sheet spill to second sheet', () => {
    // MDF 18mm sheet = 1220 x 2800
    // 3 parts of 600x1400 each = need more than 1 sheet
    const parts = [
      makePart({ width_mm: 600, height_mm: 1400 }),
      makePart({ width_mm: 600, height_mm: 1400 }),
      makePart({ width_mm: 600, height_mm: 1400 }),
      makePart({ width_mm: 600, height_mm: 1400 }),
      makePart({ width_mm: 600, height_mm: 1400 }),
    ];

    const result = nestParts(parts);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.validation.total_placed_parts).toBe(5);
    expect(result.validation.sheets_used).toBeGreaterThanOrEqual(2);
  });

  test('oversized part returns unplaced error', () => {
    // MDF 18mm sheet = 1220 x 2800
    const result = nestParts([
      makePart({ width_mm: 3000, height_mm: 1500, grain_direction: 'horizontal' }),
    ]);

    expect(result.validation.all_parts_placed).toBe(false);
    expect(result.validation.unplaced_count).toBe(1);
    expect(result.validation.unplaced_parts[0].reason).toContain('exceeds sheet');
  });

  test('quantity expansion creates individual placements', () => {
    const result = nestParts([
      makePart({ width_mm: 400, height_mm: 300, quantity: 5 }),
    ]);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.validation.total_input_parts).toBe(5);
    expect(result.validation.total_placed_parts).toBe(5);

    // All 5 should have unique positions
    const positions = result.placements.map(p => `${p.sheet_index}-${p.position_x}-${p.position_y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(5);
  });

  test('grain direction prevents rotation', () => {
    // Part that would fit rotated but not normal
    // Sheet = 1220 x 2800
    // Part: 2500 x 1000 with horizontal grain — doesn't fit normal (2500 > 1220)
    // Rotated: 1000 x 2500 — fits (1000 <= 1220, 2500 <= 2800)
    // But with grain = 'horizontal', rotation is blocked
    const result = nestParts([
      makePart({ width_mm: 2500, height_mm: 1000, grain_direction: 'horizontal' }),
    ]);

    expect(result.validation.all_parts_placed).toBe(false);
    expect(result.validation.unplaced_count).toBe(1);
  });

  test('grain=none allows rotation', () => {
    const result = nestParts([
      makePart({ width_mm: 2500, height_mm: 1000, grain_direction: 'none' }),
    ]);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.placements[0].rotated).toBe(true);
    expect(result.placements[0].placed_width).toBe(1000);
    expect(result.placements[0].placed_height).toBe(2500);
  });

  test('waste percentage is calculated correctly', () => {
    // Single small part on a full sheet
    const result = nestParts([
      makePart({ width_mm: 100, height_mm: 100 }),
    ]);

    const sheet = result.sheets[0];
    expect(sheet.used_area_mm2).toBe(10000); // 100*100
    expect(sheet.total_area_mm2).toBe(1220 * 2800);
    expect(sheet.waste_percent).toBeGreaterThan(99); // almost all waste
    expect(sheet.waste_area_mm2).toBe(sheet.total_area_mm2 - sheet.used_area_mm2);
  });

  test('offcuts are tracked', () => {
    const result = nestParts([
      makePart({ width_mm: 600, height_mm: 1400 }),
    ]);

    const sheet = result.sheets[0];
    expect(sheet.offcuts.length).toBeGreaterThan(0);
    // At least one offcut should be usable (>= 100mm both dims)
    expect(sheet.offcuts.some(o => o.usable)).toBe(true);
  });

  test('no coordinates are at (0,0) for all parts in multi-part scenario', () => {
    const parts = Array.from({ length: 10 }, (_, i) =>
      makePart({ width_mm: 300 + i * 10, height_mm: 200 + i * 10 }),
    );

    const result = nestParts(parts);
    expect(result.validation.all_parts_placed).toBe(true);

    // First part should be at (0,0), but NOT all parts
    const allAtZero = result.placements.every(p => p.position_x === 0 && p.position_y === 0);
    expect(allAtZero).toBe(false);

    // Verify no overlaps on same sheet
    for (const sheet of result.sheets) {
      const sheetPlacements = result.placements.filter(p => p.sheet_index === sheet.sheet_index);
      for (let i = 0; i < sheetPlacements.length; i++) {
        for (let j = i + 1; j < sheetPlacements.length; j++) {
          const a = sheetPlacements[i];
          const b = sheetPlacements[j];
          const overlapX = a.position_x < b.position_x + b.placed_width && b.position_x < a.position_x + a.placed_width;
          const overlapY = a.position_y < b.position_y + b.placed_height && b.position_y < a.position_y + a.placed_height;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    }
  });

  test('mixed materials use separate sheets per material', () => {
    const result = nestParts([
      makePart({ width_mm: 400, height_mm: 300, material_type: 'mdf_18' }),
      makePart({ width_mm: 400, height_mm: 300, material_type: 'stratifie_18' }),
    ]);

    expect(result.validation.all_parts_placed).toBe(true);
    expect(result.validation.sheets_used).toBe(2);

    const matTypes = result.sheets.map(s => s.material_type);
    expect(matTypes).toContain('mdf_18');
    expect(matTypes).toContain('stratifie_18');
  });

  test('parts within sheet bounds', () => {
    const parts = Array.from({ length: 20 }, () =>
      makePart({ width_mm: 200 + Math.floor(Math.random() * 400), height_mm: 200 + Math.floor(Math.random() * 400) }),
    );

    const result = nestParts(parts);

    for (const p of result.placements) {
      const [sheetW, sheetH] = [1220, 2800]; // mdf_18
      expect(p.position_x + p.placed_width).toBeLessThanOrEqual(sheetW);
      expect(p.position_y + p.placed_height).toBeLessThanOrEqual(sheetH);
      expect(p.position_x).toBeGreaterThanOrEqual(0);
      expect(p.position_y).toBeGreaterThanOrEqual(0);
    }
  });
});
