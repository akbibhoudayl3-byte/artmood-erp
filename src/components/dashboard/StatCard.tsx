'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
}

export default function StatCard({ label, value, subtitle, icon, onClick }: StatCardProps) {
  return (
    <div
      className={`
        bg-white dark:bg-[#1a1a2e] rounded-2xl border border-[#E8E5E0]/60 dark:border-white/10 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border-t-2 border-t-[#C9956B]/20 overflow-hidden relative transition-all duration-300
        ${onClick ? 'cursor-pointer hover:border-t-[#C9956B]/50 hover:shadow-[0_8px_30px_rgba(201,149,107,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] uppercase tracking-wide font-semibold text-[#9CA3AF]">{label}</p>
          <p className="text-[28px] font-bold text-[#1a1a2e] dark:text-white mt-1.5 tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-[#64648B] mt-0.5">{subtitle}</p>}
        </div>
        {icon && (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F8F6F3] to-[#F0EDE8] shadow-inner flex items-center justify-center text-[#64648B] flex-shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
