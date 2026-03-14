interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`
        bg-white dark:bg-[#1a1a2e] rounded-2xl border border-[#E8E5E0]/60 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300
        ${onClick ? 'cursor-pointer hover:border-[#C9956B]/20 hover:shadow-[0_8px_30px_rgba(201,149,107,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 border-b border-[#F0EDE8]/80 dark:border-white/5 bg-gradient-to-r from-[#FAFAF8] to-white dark:from-white/[0.03] dark:to-transparent ${className}`}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
