import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { DateInput, type DateInputType } from "./date-input";

// Labeled form controls with inline errors. Presentational only, so they
// work in both Server and Client Components. The element id defaults to the
// field name; pass `id` when two forms on one page share a field name.

type Common = {
  name: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
};

function FieldShell({
  name,
  label,
  error,
  hint,
  className,
  required,
  children,
}: Common & { required?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: React.ReactNode) {
  if (error) return `${name}-error`;
  if (hint) return `${name}-hint`;
  return undefined;
}

export function TextField({
  name,
  id,
  label,
  error,
  hint,
  className,
  ...props
}: Common & Omit<React.ComponentProps<"input">, "name">) {
  const fid = id ?? name;
  const shared = { id: fid, name, "aria-invalid": Boolean(error), "aria-describedby": describedBy(fid, error, hint) };
  // Date and time types use the shared picker; optional dates can be cleared.
  const dateType = props.type === "date" || props.type === "datetime-local" || props.type === "time" ? (props.type as DateInputType) : null;
  return (
    <FieldShell name={fid} label={label} error={error} hint={hint} className={className} required={props.required}>
      {dateType ? (
        <DateInput {...shared} {...props} type={dateType} clearable={!props.required} clearLabel={`Clear ${label.toLowerCase()}`} />
      ) : (
        <Input {...shared} {...props} />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  id,
  label,
  error,
  hint,
  className,
  ...props
}: Common & Omit<React.ComponentProps<"textarea">, "name">) {
  const fid = id ?? name;
  return (
    <FieldShell name={fid} label={label} error={error} hint={hint} className={className} required={props.required}>
      <Textarea
        id={fid}
        name={name}
        rows={3}
        maxLength={2000}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(fid, error, hint)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  className,
  options,
  placeholder,
  ...props
}: Common &
  Omit<React.ComponentProps<"select">, "name"> & {
    options: { value: string; label: string }[];
    placeholder?: string;
  }) {
  return (
    <FieldShell name={name} label={label} error={error} hint={hint} className={className} required={props.required}>
      <NativeSelect
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(name, error, hint)}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

// Read-only label/value pair for detail pages.
export function DetailItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children || "—"}</dd>
    </div>
  );
}
