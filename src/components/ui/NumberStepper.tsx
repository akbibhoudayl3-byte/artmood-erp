'use client';

import { Minus, Plus } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
}

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  label,
  unit,
  disabled = false,
}: NumberStepperProps) {
  const decrease = () => {
    const newVal = Math.max(min, value - step);
    onChange(newVal);
  };

  const increase = () => {
    const newVal = Math.min(max, value + step);
    onChange(newVal);
  };

  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={decrease}
          disabled={disabled || value <= min}
          className="w-12 h-12 flex items-center justify-center rounded-xl border border-[#E8E5E0] bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Minus size={18} />
        </button>
        <div className="flex-1 h-12 flex items-center justify-center rounded-xl border border-[#E8E5E0] bg-white text-center font-semibold text-lg">
          {value}{unit && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
        </div>
        <button
          type="button"
          onClick={increase}
          disabled={disabled || value >= max}
          className="w-12 h-12 flex items-center justify-center rounded-xl border border-[#E8E5E0] bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
