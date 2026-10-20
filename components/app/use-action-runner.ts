"use client";

import { unstable_rethrow } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { initialFormState, type FormState } from "@/lib/forms";

// UI state only. Existing server actions remain responsible for permissions,
// validation, writes, and revalidation. The ref blocks rapid duplicate events
// before React has rendered the pending state.
export function useActionRunner() {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function run(action: () => Promise<FormState>, onSuccess?: (result: FormState) => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState(initialFormState);
    startTransition(async () => {
      try {
        const result = await action();
        const successful = result.ok === true && !result.error && !Object.keys(result.fieldErrors ?? {}).length;
        setState(result.ok || result.error || Object.keys(result.fieldErrors ?? {}).length
          ? result : { ...result, error: "Could not complete the action. Please try again." });
        if (successful) onSuccess?.(result);
      } catch (error) {
        // Preserve Next.js redirect/notFound control flow from existing actions.
        unstable_rethrow(error);
        setState({ error: "Could not complete the action. Check your connection and try again." });
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { state, pending, run, isRunning: () => inFlight.current, clear: () => setState(initialFormState) };
}
