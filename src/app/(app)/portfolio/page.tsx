"use client";

/**
 * src/app/(app)/portfolio/page.tsx
 *
 * Portfolio Intelligence page — Sprint 3.2 Feature 4
 *
 * Workspace-level view: which relationships are improving, declining,
 * overdue, or recently active. Pure deterministic categorization — no AI.
 *
 * Data is fetched on-demand by the PortfolioIntelligence component.
 * No SSR, no polling, no caching.
 */

import { TopBar }                from "@/components/layout/top-bar";
import { PortfolioIntelligence } from "@/components/rie/PortfolioIntelligence";

export default function PortfolioPage() {
  return (
    <>
      <TopBar
        title="Portfolio"
        subtitle="Workspace-level relationship health"
      />
      <div className="flex-1 px-4 md:px-8 py-6 max-w-2xl mx-auto w-full">
        <PortfolioIntelligence />
      </div>
    </>
  );
}
