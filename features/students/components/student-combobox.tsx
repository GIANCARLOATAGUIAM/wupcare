"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";

import { DemoBadge, StudentStatusBadge } from "@/components/app/badges";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { suggestStudents, type StudentSuggestion } from "../actions";

export const SUGGEST_DEBOUNCE_MS = 300;

type Status = "idle" | "loading" | "done" | "error";

/**
 * Autocomplete for choosing an existing student record (ARIA combobox +
 * listbox). Typing waits 300 ms, then asks the server for up to 8 matches by
 * student number, name, college, or program. Arrow keys move, Enter or a
 * click/tap selects, Escape closes. Nothing is chosen automatically, and only
 * the selected record's ID is passed on (`onSelect`). Responses for older text
 * are ignored, so results never go stale.
 */
export function StudentCombobox({
  onSelect,
  initialQuery = "",
  label = "Student",
  search = suggestStudents,
}: {
  onSelect: (student: StudentSuggestion) => void;
  initialQuery?: string;
  label?: string;
  search?: (q: string) => Promise<StudentSuggestion[]>;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<StudentSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function lookup(text: string) {
    if (timer.current) clearTimeout(timer.current);
    const term = text.trim();
    const request = ++latest.current;
    setActive(-1);
    setResults([]); // matches for older text are never shown or selectable
    if (!term) {
      setResults([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    setStatus("loading");
    setOpen(true);
    timer.current = setTimeout(async () => {
      try {
        const found = await search(term);
        if (request !== latest.current) return; // newer text was typed
        setResults(found);
        setStatus("done");
      } catch {
        if (request !== latest.current) return;
        setResults([]);
        setStatus("error");
      }
    }, SUGGEST_DEBOUNCE_MS);
  }

  function choose(student: StudentSuggestion) {
    latest.current++; // drop any in-flight lookup
    setOpen(false);
    setActive(-1);
    setQuery(`${student.name} (${student.student_number})`);
    onSelect(student);
  }

  const showList = open && status !== "idle";

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Type a student ID or name…"
          className="pl-8"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            lookup(event.target.value);
          }}
          onFocus={() => {
            if (results.length || status === "done") setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (showList) event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!results.length) return;
              event.preventDefault();
              setOpen(true);
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + results.length) % results.length);
            } else if (event.key === "Enter") {
              // Never submit or pick on Enter unless a suggestion is highlighted.
              event.preventDefault();
              if (showList && active >= 0 && results[active]) choose(results[active]);
            }
          }}
        />
        {showList ? (
          <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-popover">
            <ul id={listId} role="listbox" aria-label="Matching students" className={cn("max-h-72 overflow-y-auto overscroll-contain p-1", !results.length && "hidden")}>
              {results.map((s, index) => (
                <li
                  key={s.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // Keep focus in the input so blur does not close the list first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(s)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "grid cursor-pointer gap-0.5 rounded-md px-2.5 py-2 text-sm pointer-coarse:py-3",
                    index === active && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="font-medium break-words">{s.name}</span>
                    {s.is_demo ? <DemoBadge /> : null}
                    {s.status !== "active" ? <StudentStatusBadge status={s.status} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span className="font-mono">{s.student_number}</span>
                    {s.college ? <span className="truncate">{s.college}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {status !== "done" || !results.length ? (
              <p className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground">
                {status === "loading" ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Searching…
                  </>
                ) : status === "error" ? (
                  "Could not search students. Try again."
                ) : (
                  "No students found."
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status === "done" ? (results.length ? `${results.length} student${results.length === 1 ? "" : "s"} found. Use the arrow keys to choose.` : "No students found.") : ""}
      </p>
    </div>
  );
}

// Picker step of "new visit / incident / appointment": choosing a student
// opens the same page with ?student=<id> (plus any kept params), where the
// server loads that record by ID (RLS) before the form is shown.
export function studentPickerHref(path: string, keep: Record<string, string | undefined>, studentId: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(keep)) if (value) params.set(key, value);
  params.set("student", studentId);
  return `${path}?${params.toString()}`;
}

export function StudentPickerField({ path, keep = {}, initialQuery }: { path: string; keep?: Record<string, string | undefined>; initialQuery?: string }) {
  const router = useRouter();
  return <StudentCombobox initialQuery={initialQuery} onSelect={(student) => router.push(studentPickerHref(path, keep, student.id))} />;
}
