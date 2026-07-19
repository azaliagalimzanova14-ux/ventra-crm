"use client";

/**
 * src/app/(app)/weekly/page.tsx
 *
 * Weekly Review page — Sprint 4
 */

import { TopBar }      from "@/components/layout/top-bar";
import { WeeklyReview } from "@/components/rie/WeeklyReview";

export default function WeeklyPage() {
  return (
    <>
      <TopBar
        title="Weekly Review"
        subtitle="7-day relationship and activity summary"
      />
      <div className="flex-1 px-4 md:px-8 py-6 max-w-2xl mx-auto w-full">
        <WeeklyReview />
      </div>
    </>
  );
}
