import { cn } from '@/lib/utils';

interface PriorityDotProps {
  color: string | null;
  name: string;
  showLabel?: boolean;
  className?: string;
}

export function PriorityDot({ color, name, showLabel = false, className }: PriorityDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color ?? '#6b7280' }}
        title={name}
      />
      {showLabel && <span className="text-xs text-muted-foreground">{name}</span>}
    </span>
  );
}
