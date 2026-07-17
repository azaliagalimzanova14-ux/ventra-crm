"use client";

import { useState, useEffect } from "react";
import { isFirstRunDone } from "@/lib/storage";
import { FirstRunWizard } from "./first-run-wizard";

/**
 * Wraps the entire app shell.
 * On mount, checks localStorage — if neither the new nor old onboarding key
 * is set, renders the FirstRunWizard as a full-screen overlay.
 * Existing users (ventra_onboarding_done = "1") never see this.
 */
export function FirstRunGuard({ children }: { children: React.ReactNode }) {
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (!isFirstRunDone()) {
      setShowWizard(true);
    }
  }, []);

  return (
    <>
      {children}
      {showWizard && (
        <FirstRunWizard onComplete={() => setShowWizard(false)} />
      )}
    </>
  );
}
