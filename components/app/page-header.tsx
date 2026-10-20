export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-4 sm:pb-5">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-lg font-semibold sm:text-xl tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
