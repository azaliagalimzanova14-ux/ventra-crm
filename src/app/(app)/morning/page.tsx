"use client";

/**
 * src/app/(app)/morning/page.tsx
 *
 * Morning Brief page — /morning
 *
 * Wrapper for the MorningBrief component inside the standard app shell.
 * Scannable in under 30 seconds. On-demand, no cron.
 */

import { TopBar }        from "@/components/layout/top-bar";
import { MorningBrief }  from "@/components/rie/MorningBrief";

export default function MorningPage() {
  return (
    <>
      <TopBar
        title="Morning Brief"
        subtitle="Your daily relationship snapshot"
      />
      <div className="flex-1 px-4 md:px-8 py-6 max-w-2xl mx-auto w-full">
        <MorningBrief />
      </div>
    </>
  );
}
