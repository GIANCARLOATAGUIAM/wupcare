export type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
};

export type ConfirmationRule = Confirmation & {
  whenChanged?: { field: string; from: string; to: string[]; label: string; labels: Record<string, string> };
};

export function confirmationFor(rule: ConfirmationRule | undefined, data: FormData): Confirmation | null {
  if (!rule) return null;
  const change = rule.whenChanged;
  if (!change) return rule;
  const next = String(data.get(change.field) ?? "");
  if (next === change.from || !change.to.includes(next)) return null;
  return {
    ...rule,
    message: `${rule.message} Current ${change.label}: ${change.labels[change.from] ?? change.from}. New ${change.label}: ${change.labels[next] ?? next}.`,
  };
}
