import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Plain native <select> styled to match the design system (custom chevron,
// appearance-none). A native element is sufficient for the simple pickers
// here and avoids pulling in a full Select primitive before it's needed.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, style, ...props }, ref) => {
    return (
      <select
        ref={ref}
        style={{
          backgroundImage: CHEVRON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.65rem center',
          ...style,
        }}
        className={cn(
          'h-10 appearance-none rounded-lg border border-slate-300 bg-white py-0 pl-3 pr-9 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
Select.displayName = 'Select';
