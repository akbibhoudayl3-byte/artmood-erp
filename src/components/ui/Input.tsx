import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-[#4A4A6A] dark:text-white/70 mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-4 py-3 border rounded-xl text-sm bg-white dark:bg-white/5 dark:text-white dark:border-white/10
            shadow-sm shadow-black/[0.02]
            placeholder:text-[#B8B8C8]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#C9956B]/15 focus:border-[#C9956B]/60
            ${error ? 'border-red-400 focus:ring-red-200/30 focus:border-red-400' : 'border-[#E2E0DC]'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-[#4A4A6A] dark:text-white/70 mb-2">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`
            w-full px-4 py-3 border rounded-xl text-sm bg-white dark:bg-white/5 dark:text-white dark:border-white/10
            shadow-sm shadow-black/[0.02]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#C9956B]/15 focus:border-[#C9956B]/60
            ${error ? 'border-red-400 focus:ring-red-200/30 focus:border-red-400' : 'border-[#E2E0DC]'}
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-[#4A4A6A] dark:text-white/70 mb-2">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-4 py-3 border rounded-xl text-sm bg-white dark:bg-white/5 dark:text-white dark:border-white/10
            shadow-sm shadow-black/[0.02]
            placeholder:text-[#B8B8C8]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#C9956B]/15 focus:border-[#C9956B]/60
            ${error ? 'border-red-400 focus:ring-red-200/30 focus:border-red-400' : 'border-[#E2E0DC]'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
