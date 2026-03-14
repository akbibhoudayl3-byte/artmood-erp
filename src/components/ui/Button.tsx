import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT_STYLES: Record<Variant, string> = {
  primary: 'bg-[#1B2A4A] text-white hover:bg-[#243660] shadow-sm shadow-[#1B2A4A]/15 hover:shadow-md hover:shadow-[#1B2A4A]/20',
  secondary: 'bg-[#F5F3F0] text-[#1a1a2e] hover:bg-[#EBE8E3] border border-[#E8E5E0] shadow-sm shadow-black/[0.02] active:bg-[#E0DDD8]',
  accent: 'bg-gradient-to-r from-[#C9956B] to-[#B8845A] text-white hover:from-[#D4A574] hover:to-[#C9956B] shadow-sm shadow-[#C9956B]/20 hover:shadow-md hover:shadow-[#C9956B]/25',
  danger: 'bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-sm shadow-red-500/20',
  ghost: 'bg-transparent text-[#64648B] hover:bg-[#F5F3F0] hover:text-[#1a1a2e] active:bg-[#EBE8E3]',
  success: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/20',
};

const SIZE_STYLES: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm',
  xl: 'px-6 py-4 text-base',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2 rounded-xl font-medium
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          active:scale-[0.98]
          ${VARIANT_STYLES[variant]}
          ${SIZE_STYLES[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
