"use client";

import { useActionState, useState } from "react";

import { SelectField, TextField } from "@/components/app/fields";
import { FormAlert } from "@/components/app/form-status";
import { FormActions } from "@/features/students/components/student-form";
import { initialFormState } from "@/lib/forms";

import { createUser } from "./actions";
import { TemporaryPasswordField } from "./temporary-password-field";

// `kind` limits the role choices: "personnel" offers Clinic Personnel and
// Administrator; "students" creates a Student account linked to a record.
// The createUser action and its validation are unchanged.
export function CreateUserForm({
  students,
  kind = "personnel",
}: {
  students: { id: string; student_number: string; full_name: string }[];
  kind?: "personnel" | "students";
}) {
  const [state, formAction] = useActionState(createUser, initialFormState);
  // React resets the form after a completed action. Remount the controlled
  // password field too, clearing its value, reveal state and copy feedback.
  const [passwordVersion, setPasswordVersion] = useState(0);
  const [role, setRole] = useState(state.values?.role ?? (kind === "students" ? "student" : "clinic_staff"));
  const roleOptions =
    kind === "students"
      ? [{ value: "student", label: "Student" }]
      : [
          { value: "clinic_staff", label: "Clinic Personnel" },
          { value: "admin", label: "Administrator" },
        ];
  const e = state.fieldErrors ?? {};
  const v = (k: string) => state.values?.[k] ?? "";

  return (
    <form action={formAction} noValidate className="grid max-w-2xl gap-5" onReset={() => setPasswordVersion((version) => version + 1)}>
      <FormAlert state={state} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <SelectField
          name="role"
          label="Role"
          required
          value={role}
          onChange={(ev) => setRole(ev.target.value)}
          options={roleOptions}
          error={e.role}
        />
        {role === "student" ? (
          <SelectField
            name="student_id"
            label="Student record"
            required
            defaultValue={v("student_id")}
            placeholder={students.length ? "Choose…" : "No students without an account"}
            options={students.map((s) => ({ value: s.id, label: `${s.student_number} · ${s.full_name}` }))}
            error={e.student_id}
            hint="Shows only student number and name, for students who have no account yet."
          />
        ) : (
          <div aria-hidden="true" className="hidden sm:block" />
        )}
        <TextField name="full_name" label="Full name" required maxLength={120} autoComplete="off" defaultValue={v("full_name")} error={e.full_name} />
        <TextField name="email" label="Email" type="email" required autoComplete="off" defaultValue={v("email")} error={e.email} />
        {kind === "personnel" ? (
          <TemporaryPasswordField key={passwordVersion} error={e.password} />
        ) : (
          <TextField
            name="password"
            label="Temporary password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            error={e.password}
            hint="At least 8 characters. Ask the user to change it after signing in."
          />
        )}
      </div>
      <FormActions cancelHref={kind === "students" ? "/admin/users/students" : "/admin/users/personnel"} submitLabel="Create account" />
    </form>
  );
}
