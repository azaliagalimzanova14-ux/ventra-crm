// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedbackType     = "general" | "bug" | "feature";
export type FeedbackStatus   = "new" | "reviewed" | "resolved";
export type BugSeverity      = "low" | "medium" | "high";
export type FeaturePriority  = "nice_to_have" | "important" | "critical";
export type WouldUseAnswer   = "yes" | "no" | "maybe";

export interface GeneralContent {
  rating:    number;           // 1–5
  liked:     string;
  confusing: string;
  wouldUse:  WouldUseAnswer | null;
}

export interface BugContent {
  page:           string;
  happened:       string;
  expected:       string;
  severity:       BugSeverity;
  screenshotNote: string;
}

export interface FeatureContent {
  idea:     string;
  problem:  string;
  priority: FeaturePriority;
}

export type FeedbackContent = GeneralContent | BugContent | FeatureContent;

export interface FeedbackItem {
  id:        string;
  type:      FeedbackType;
  createdAt: string;
  page:      string;    // pathname at time of submission
  status:    FeedbackStatus;
  content:   FeedbackContent;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ventra_feedback";

export function getFeedbackList(): FeedbackItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as FeedbackItem[]) : [];
}

function saveFeedbackList(items: FeedbackItem[]): void {
  if (typeof window !== "undefined")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function submitFeedback(
  type:    FeedbackType,
  page:    string,
  content: FeedbackContent,
): FeedbackItem {
  const item: FeedbackItem = {
    id:        `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    createdAt: new Date().toISOString(),
    page,
    status:    "new",
    content,
  };
  saveFeedbackList([item, ...getFeedbackList()]);
  return item;
}

export function updateFeedbackStatus(id: string, status: FeedbackStatus): void {
  saveFeedbackList(
    getFeedbackList().map((f) => (f.id === id ? { ...f, status } : f))
  );
}

export function deleteFeedbackItem(id: string): void {
  saveFeedbackList(getFeedbackList().filter((f) => f.id !== id));
}

export function getFeedbackCount(): number {
  return getFeedbackList().filter((f) => f.status === "new").length;
}
