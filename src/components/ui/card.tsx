import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-foreground shadow-soft',
        className
      )}
    >
      {children}
    </div>
  );
}
