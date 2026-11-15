import React from 'react';
import { cn } from '../../lib';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  variant?: 'default' | 'outline' | 'underlined';
}

export const Input = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(({ 
  className, 
  variant = 'default', 
  ...props 
}, ref) => {
  const baseClasses = 'rounded-md border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground shadow-sm transition-colors file:border-none file:bg-transparent file:text-sm';

  const variants = {
    default: 'placeholder:text-muted-foreground',
    outline: 'border-transparent placeholder:text-muted-foreground shadow-sm focus:ring-2 focus:ring-ring focus:ring-offset-2',
    underlined: 'border-b-2 border-b subtle placeholder:text-muted-foreground',
  };

  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      className={cn(
        'w-full rounded-md border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus:ring-ring focus:ring-offset-2',
        baseClasses,
        variants[variant],
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = 'Input';
