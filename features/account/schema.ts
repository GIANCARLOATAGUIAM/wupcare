import { z } from "zod";

// Validate before normalization so tabs/newlines and invisible controls cannot
// disappear into an otherwise valid name. Unicode space separators are allowed.
export const fullNameSchema = z.string()
  .regex(/^[^\p{C}\p{Zl}\p{Zp}<>{}]*$/u, { error: "Use letters, numbers, spaces, and common punctuation only." })
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, { error: "Enter at least 2 characters." }).max(120, { error: "Use 120 characters or fewer." }));

export const displayNameSchema = z.object({ full_name: fullNameSchema });
