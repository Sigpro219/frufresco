'use client';

import { FlaskConical } from 'lucide-react';

/**
 * Permanent visual indicator rendered only when running against FruFrescoSandbox.
 * Uses fixed pointer-events-none positioning so header/sticky table offsets remain untouched.
 */
export default function SandboxModeBadge() {
  if (process.env.NEXT_PUBLIC_SANDBOX_MODE !== 'true') {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="print:hidden fixed top-0 left-0 right-0 h-[3px] bg-amber-500 z-[9999] pointer-events-none"
      />
      <div
        role="status"
        aria-label="Modo Sandbox con base de datos aislada"
        className="print:hidden fixed bottom-16 right-3 sm:top-1.5 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:right-auto z-[9999] pointer-events-none flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950 shadow-md ring-1 ring-amber-300"
      >
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span>SANDBOX • BD AISLADA</span>
      </div>
    </>
  );
}
