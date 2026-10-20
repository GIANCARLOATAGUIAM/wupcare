import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed bg-card px-4 py-4 sm:gap-4 sm:px-5 sm:py-6",
        className
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <p className="text-sm font-medium">{title}</p>
        {children ? (
          <div className="max-w-prose text-sm text-muted-foreground">{children}</div>
        ) : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
