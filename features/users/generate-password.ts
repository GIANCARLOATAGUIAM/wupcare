const GROUPS = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "!@#$%^&*()-_=+[]{}:,.?",
] as const;
const ALPHABET = GROUPS.join("");
const LENGTH = 20;

// Uniformly sample the allowed alphabet, rejecting biased byte values and
// candidates missing a group. No fixed positions or non-cryptographic fallback.
export function generateStrongPassword(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const bytes = new Uint8Array(32);
  for (;;) {
    let password = "";
    while (password.length < LENGTH) {
      globalThis.crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (byte >= limit) continue;
        password += ALPHABET[byte % ALPHABET.length];
        if (password.length === LENGTH) break;
      }
    }
    if (GROUPS.every((group) => [...password].some((char) => group.includes(char)))) return password;
  }
}
