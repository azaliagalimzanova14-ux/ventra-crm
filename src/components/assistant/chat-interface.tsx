"use client";

import { useRef, useEffect, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const suggestions = [
  "Which clients need follow-up this week?",
  "Summarize my pipeline health",
  "Draft a follow-up email for Oakline Digital",
  "What tasks are overdue?",
];

function generateResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("follow-up") || q.includes("follow up")) {
    return `Based on your CRM data, I recommend following up with:

**Marcus Webb** (Oakline Digital) — In negotiation, last contact May 25. Send the Q3 proposal today.

**Tom Bradley** (Harbor Brew) — New lead with a discovery call yesterday. Schedule a product demo within 48 hours.

**Sarah Chen** (Brightpath Co) — Expressed interest in an annual plan upgrade. A quick check-in call could close an additional $4,800 in ARR.`;
  }
  if (q.includes("pipeline") || q.includes("summary")) {
    return `**Pipeline overview**

- **Total pipeline value:** $87,500 across 6 accounts
- **Active deals:** 2 ($55,200)
- **In negotiation:** 1 ($18,500)
- **New leads:** 2 ($13,800)
- **Churned:** 1

Your win rate this month is trending **12% above** last month. Focus on closing Oakline Digital — it's your highest-probability deal in negotiation.`;
  }
  if (q.includes("email") || q.includes("draft")) {
    return `Here's a draft follow-up for Marcus Webb at Oakline Digital:

---

**Subject:** Q3 proposal — Oakline Digital × Nexus

Hi Marcus,

Great speaking with you last week. As discussed, I've attached our Q3 proposal with flexible onboarding options tailored for your team size.

Happy to walk through any questions on a quick 20-minute call this week.

Best,
Alex

---

Want me to adjust the tone or add pricing details?`;
  }
  if (q.includes("task") || q.includes("overdue")) {
    return `You have **1 overdue task**:

- **Review churn feedback from Luminary** (due May 28) — marked complete ✓

**Upcoming high-priority tasks:**
1. Send proposal to Oakline Digital — due tomorrow
2. Prepare monthly pipeline report — due Jun 5

I'd prioritize the Oakline proposal — it's tied to your largest open deal.`;
  }
  return `I'm your Nexus AI assistant. I can help you with:

- Client follow-up recommendations
- Pipeline summaries and insights
- Drafting emails and outreach
- Task prioritization

Try asking about your pipeline, overdue tasks, or which clients need attention this week.`;
}

interface ChatInterfaceProps {
  initialMessages?: ChatMessage[];
}

export function ChatInterface({ initialMessages = [] }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    await new Promise((r) => setTimeout(r, 800));

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: generateResponse(text),
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, assistantMsg]);
    setLoading(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-600/30">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100">How can I help today?</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-500">
              Ask about your clients, pipeline, tasks, or let me draft outreach for you.
            </p>
            <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/20">
                    <Bot className="h-4 w-4 text-violet-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-violet-600 text-white"
                      : "border border-zinc-800 bg-zinc-900/80 text-zinc-300",
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
                  <Bot className="h-4 w-4 text-violet-400" />
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span className="text-sm text-zinc-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/80 px-8 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="mx-auto flex max-w-3xl gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your CRM..."
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <Button type="submit" disabled={!input.trim() || loading} size="lg">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
