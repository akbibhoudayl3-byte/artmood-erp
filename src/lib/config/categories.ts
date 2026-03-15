export const EXPENSE_CATEGORIES = [
  { group: 'Recurring', items: [
    { key: 'rent', label: 'Rent' },
    { key: 'internet', label: 'Internet' },
    { key: 'phones', label: 'Phones' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'software', label: 'Software' },
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'utilities', label: 'Utilities' },
  ]},
  { group: 'Operational', items: [
    { key: 'fuel', label: 'Fuel' },
    { key: 'transport', label: 'Transport' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'tools', label: 'Tools' },
    { key: 'spare_parts', label: 'Spare Parts' },
    { key: 'consumables', label: 'Consumables' },
    { key: 'raw_materials', label: 'Raw Materials' },
  ]},
  { group: 'Other', items: [
    { key: 'salary', label: 'Salary' },
    { key: 'bonus', label: 'Bonus' },
    { key: 'tax', label: 'Tax' },
    { key: 'other', label: 'Other' },
  ]},
] as const;

// ============================================================
// Leave Types
// ============================================================
export const LEAVE_TYPES = [
  { key: 'vacation', label: 'Vacation', color: 'bg-blue-500' },
  { key: 'sick', label: 'Sick Leave', color: 'bg-red-500' },
  { key: 'personal', label: 'Personal', color: 'bg-purple-500' },
  { key: 'maternity', label: 'Maternity', color: 'bg-pink-500' },
  { key: 'unpaid', label: 'Unpaid', color: 'bg-gray-500' },
  { key: 'other', label: 'Other', color: 'bg-gray-400' },
] as const;

// ============================================================
// Employee Document Types
// ============================================================
export const EMPLOYEE_DOCUMENT_TYPES = [
  { key: 'contract', label: 'Employment Contract' },
  { key: 'cin', label: 'CIN (National ID)' },
  { key: 'cnss', label: 'CNSS Card' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'diploma', label: 'Diploma' },
  { key: 'work_permit', label: 'Work Permit' },
  { key: 'medical', label: 'Medical Certificate' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Production Issue Types
// ============================================================
export const PRODUCTION_ISSUE_TYPES = [
  { key: 'missing_material', label: 'Missing Material' },
  { key: 'wrong_dimension', label: 'Wrong Dimension' },
  { key: 'machine_problem', label: 'Machine Problem' },
  { key: 'client_change', label: 'Client Change' },
  { key: 'quality_defect', label: 'Quality Defect' },
  { key: 'other', label: 'Other' },
] as const;

export const ISSUE_SEVERITIES = [
  { key: 'low', label: 'Low', color: 'bg-blue-500' },
  { key: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { key: 'high', label: 'High', color: 'bg-orange-500' },
  { key: 'critical', label: 'Critical', color: 'bg-red-500' },
] as const;
