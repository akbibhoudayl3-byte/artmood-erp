// ============================================================
// Kitchen Cost & Margin Engine — ArtMood ERP
// ============================================================

import { LABOUR_COSTS, MARGIN_RULES } from '@/lib/config/kitchen';
import { roundMoney, computeVAT } from '@/lib/utils/money';
import { computeBOMCost } from './kitchen-bom-engine';
import type {
  KitchenProject,
  KitchenModuleInstance,
  BOMResult,
  CostBreakdown,
  ClientType,
} from '@/types/kitchen';

export function computeKitchenCost(
  kitchen: KitchenProject,
  modules: KitchenModuleInstance[],
  bom: BOMResult
): CostBreakdown {
  // Material costs from BOM
  const bomCosts = computeBOMCost(bom, kitchen);

  // Labour
  const drawerCount = modules.filter(m => {
    // Check if module has drawer panels
    return bom.panels.some(p => p.module_instance_id === m.id && p.part_name === 'drawer_facade');
  }).length;
  const moduleCount = modules.length;

  const labour = roundMoney(
    moduleCount * LABOUR_COSTS.per_module +
    drawerCount * LABOUR_COSTS.per_drawer
  );

  const fixedCharges = LABOUR_COSTS.fixed_charges;
  const transport = LABOUR_COSTS.transport_base;
  const installation = roundMoney(moduleCount * LABOUR_COSTS.installation_per_module);

  const subtotal = roundMoney(
    bomCosts.materials +
    bomCosts.hardware +
    bomCosts.accessories +
    labour +
    fixedCharges +
    transport +
    installation
  );

  // Margin
  const marginPercent = MARGIN_RULES[kitchen.client_type as ClientType] ?? MARGIN_RULES.standard;
  const marginAmount = roundMoney(subtotal * (marginPercent / 100));
  const totalHT = roundMoney(subtotal + marginAmount);

  // VAT
  const { vatAmount, totalTTC } = computeVAT(totalHT, 20);

  return {
    materials: bomCosts.materials,
    hardware: bomCosts.hardware,
    accessories: bomCosts.accessories,
    labour,
    fixed_charges: fixedCharges,
    transport,
    installation,
    subtotal,
    margin_percent: marginPercent,
    margin_amount: marginAmount,
    total_ht: totalHT,
    vat_amount: vatAmount,
    total_ttc: totalTTC,
  };
}
