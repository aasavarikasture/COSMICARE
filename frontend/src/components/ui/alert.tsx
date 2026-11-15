import React from 'react';
import { cn } from '../../lib';

interface AlertProps extends React.ComponentPropsWithoutRef<'div'> {
  variant?: 'default' | 'destructive' | 'success' | 'info';
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ 
  className, 
  variant = 'default', 
  children, 
  ...props 
}, ref) => {
  const variants = {
    default: 'bg-background text-foreground rounded-md p-4',
    destructive: 'border border-restrained-red/20 text-restrained-red/80 rounded-md p-4',
    success: 'border border-muted-green/20 text-muted-green/80 rounded-md p-4',
    info: 'border border-celestial-blue/20 text-celestial-blue/80 rounded-md p-4',
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md p-4',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Alert.displayName = 'Alert';
