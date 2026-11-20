/**
 * Central Sandbox Runtime Guard (SPEC.md Escenario 477 §2)
 * Prevents crons, IMAP/SMTP connectors, external GPS polling, GCP routing,
 * and outbound B2B emails from executing side-effects while running in Sandbox.
 */
export function isSandboxMode(): boolean {
  return (
    process.env.SANDBOX_MODE === 'true' ||
    process.env.NEXT_PUBLIC_SANDBOX_MODE === 'true'
  );
}

export function areSandboxExternalApisAllowed(): boolean {
  return process.env.ENABLE_SANDBOX_EXTERNAL_APIS === 'true';
}

export function isSandboxEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith('@sandbox.frufresco.co');
}
