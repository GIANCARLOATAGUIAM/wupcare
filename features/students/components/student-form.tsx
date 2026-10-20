"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { confirmationFor, type Confirmation } from "@/components/app/confirmation";
import { useActionRunner } from "@/components/app/use-action-runner";
import type { FormState } from "@/lib/forms";
import type { Tables } from "@/types/database";

import { AcademicFields } from "@/features/academics/academic-fields";

import { STATUS_OPTIONS } from "../schema";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function StudentForm({
  action,
  student,
  cancelHref,
}: {
  action: Action;
  student?: Tables<"students">;
  cancelHref: string;
}) {
  const { state, pending, run, isRunning, clear } = useActionRunner();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [request, setRequest] = useState<{ confirmation: Confirmation; data: FormData } | null>(null);
  const submit = (data: FormData) => run(() => action(state, data), () => setRequest(null));
  const e = state.fieldErrors ?? {};
  // After a failed submit, show what the user typed; otherwise the saved record.
  const v = (key: keyof Tables<"students">) =>
    state.values?.[key] ?? (student?.[key] == null ? "" : String(student[key]));

  return (
    <form noValidate className="grid max-w-4xl gap-6" onSubmit={(event) => {
      event.preventDefault();
      if (isRunning() || request) return;
      const data = new FormData(event.currentTarget);
      const confirmation = confirmationFor(student ? {
        title: "Archive Student Record?", message: "This changes the student's record status. Their profile and clinical history will be kept; nothing will be deleted.",
        confirmLabel: "Archive Record", cancelLabel: "Keep Status",
        whenChanged: { field: "status", from: student.status, to: ["inactive", "graduated"], label: "status", labels: { active: "Active", inactive: "Inactive", graduated: "Graduated" } },
      } : undefined, data);
      if (confirmation) { clear(); setRequest({ confirmation, data }); }
      else submit(data);
    }}>
      <FormAlert state={state} />
      <fieldset disabled={pending} className="contents">
      <Section title="Student">
        <TextField name="student_number" label="Student number" required maxLength={40} defaultValue={v("student_number")} error={e.student_number} />
        <SelectField name="status" label="Status" required defaultValue={v("status") || "active"} options={STATUS_OPTIONS} error={e.status} />
        <TextField name="last_name" label="Last name" required maxLength={80} autoComplete="off" defaultValue={v("last_name")} error={e.last_name} />
        <TextField name="first_name" label="First name" required maxLength={80} autoComplete="off" defaultValue={v("first_name")} error={e.first_name} />
        <TextField name="middle_name" label="Middle name" maxLength={80} autoComplete="off" defaultValue={v("middle_name")} error={e.middle_name} />
        <SelectField
          name="sex"
          label="Sex"
          defaultValue={v("sex")}
          placeholder="Not specified"
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
          error={e.sex}
        />
        <TextField name="birth_date" label="Birth date" type="date" defaultValue={v("birth_date")} error={e.birth_date} />
      </Section>

      <Section title="School">
        <AcademicFields
          key={`${v("college_id")}-${v("program_id")}-${v("year_level")}`}
          defaults={{ college_id: v("college_id"), program_id: v("program_id"), year_level: v("year_level") }}
          errors={e}
          legacy={{ college: student?.college_id ? null : student?.college, program: student?.program_id ? null : student?.program }}
          className="contents"
        />
      </Section>

      <Section title="Contact">
        <TextField name="contact_number" label="Mobile number" type="tel" inputMode="tel" placeholder="09XXXXXXXXX" defaultValue={v("contact_number")} error={e.contact_number} />
        <TextField name="email" label="Email" type="email" defaultValue={v("email")} error={e.email} />
        <TextAreaField name="address" label="Address" rows={2} maxLength={300} className="sm:col-span-2" defaultValue={v("address")} error={e.address} />
      </Section>

      <Section title="Parent or guardian">
        <TextField name="guardian_name" label="Name" maxLength={120} defaultValue={v("guardian_name")} error={e.guardian_name} />
        <TextField name="guardian_relationship" label="Relationship" maxLength={60} defaultValue={v("guardian_relationship")} error={e.guardian_relationship} />
        <TextField name="guardian_contact" label="Mobile number" type="tel" inputMode="tel" placeholder="09XXXXXXXXX" defaultValue={v("guardian_contact")} error={e.guardian_contact} />
      </Section>

      </fieldset>
      <FormActions cancelHref={cancelHref} submitLabel={student ? "Save changes" : "Add student"} pending={pending} submitRef={triggerRef} />
      {request ? <ConfirmationDialog
        confirmation={request.confirmation} pending={pending} state={state} returnFocusRef={triggerRef}
        onCancel={() => { if (!isRunning()) setRequest(null); }} onConfirm={() => submit(request.data)}
      /> : null}
    </form>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

export function FormActions({ cancelHref, submitLabel, pending, submitRef }: { cancelHref: string; submitLabel: string; pending?: boolean; submitRef?: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {pending === undefined ? <SubmitButton>{submitLabel}</SubmitButton> : <Button ref={submitRef} type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>}
      <Button variant="ghost" asChild>
        <Link href={cancelHref} aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined} onClick={(event) => { if (pending) event.preventDefault(); }}>Cancel</Link>
      </Button>
    </div>
  );
}
