import React from 'react';
import { cn } from '../../lib';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ 
  className, 
  variant = 'default', 
  size = 'default', 
  children, 
  ...props 
}, ref) => {
  const variants = {
    default: 'bg-warm-ivory text-deepblack hover:bg-offwhite',
    secondary: 'bg-offwhite text-deepblack hover:bg-warm-ivory',
    destructive: 'bg-restrained-red text-offwhite hover:bg-muted-red',
    outline: 'border-2 border-warm-ivory text-warm-ivory hover:bg-charcoal/50',
    ghost: 'text-warm-ivory hover:bg-charcoal/50',
  };

  const sizes = {
    default: 'py-2 px-4',
    sm: 'py-1 px-3',
    lg: 'py-3 px-6',
  };

  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        variants[variant],
        sizes[size],
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
