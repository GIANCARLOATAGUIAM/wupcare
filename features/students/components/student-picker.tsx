import Link from "next/link";

import { StudentPickerField } from "./student-combobox";

// Step 1 of "new visit / incident / appointment": find the student. Suggestions
// appear as the user types (StudentCombobox); choosing one opens the form for
// that record's ID. No student records are created here.
export function StudentPicker({
  path,
  q,
  keep = {},
}: {
  path: string;
  q?: string;
  keep?: Record<string, string | undefined>;
}) {
  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">Find the student</h2>
      <div className="max-w-xl">
        <StudentPickerField path={path} keep={keep} initialQuery={q} />
      </div>
      <p className="text-xs text-muted-foreground">
        Not listed?{" "}
        <Link href="/students/new" className="text-primary hover:underline">
          Add the student first
        </Link>
        .
      </p>
    </section>
  );
}
