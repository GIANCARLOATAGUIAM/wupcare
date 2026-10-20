"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/features/auth/password-field";

import { generateStrongPassword } from "./generate-password";

export function TemporaryPasswordField({ error }: { error?: string }) {
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [copying, setCopying] = useState(false);
  const revision = useRef(0);
  const { pending } = useFormStatus();

  function change(value: string) {
    revision.current++;
    setPassword(value);
    setFeedback("");
  }

  function generate() {
    try {
      change(generateStrongPassword());
    } catch {
      // Never include exceptions or credential values in feedback/logging.
      setFeedback("Could not generate a password. Enter one manually or try again.");
    }
  }

  async function copy() {
    if (!password || copying) return;
    const current = revision.current;
    setCopying(true);
    setFeedback("");
    try {
      await navigator.clipboard.writeText(password);
      if (revision.current === current) setFeedback("Password copied.");
    } catch {
      if (revision.current === current) setFeedback("Could not copy. Show the password and copy it manually.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor="password">Temporary password <span className="text-destructive" aria-hidden="true">*</span></Label>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <PasswordInput
            id="password"
            name="password"
            toggleLabel="temporary password"
            className="h-8 pointer-coarse:h-10"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(event) => change(event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "password-error password-hint" : "password-hint"}
          />
        </div>
        <Button type="button" variant="outline" onClick={generate} disabled={pending} aria-label="Generate strong password">
          <RefreshCw aria-hidden="true" />Generate
        </Button>
      </div>
      {error ? <p id="password-error" className="text-xs text-destructive">{error}</p> : null}
      <p id="password-hint" className="text-xs text-muted-foreground">
        At least 8 characters, or generate a strong password. Share credentials securely with the intended user. Password changes after sign-in are optional.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!password || pending || copying}>
          <Copy aria-hidden="true" />{copying ? "Copying…" : "Copy password"}
        </Button>
        <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 text-xs text-muted-foreground">{feedback}</p>
      </div>
    </div>
  );
}
