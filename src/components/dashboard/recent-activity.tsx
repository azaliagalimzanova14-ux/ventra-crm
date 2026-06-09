import { UserPlus, FolderOpen, CheckSquare, TrendingUp, TrendingDown, MessageSquare, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Activity } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// Covers every value of Activity["type"]
const icons: Record<Activity["type"], React.ElementType> = {
  client_added:    UserPlus,
  project_created: FolderOpen,
  task_done:       CheckSquare,
  deal_won:        TrendingUp,
  deal_lost:       TrendingDown,
  message:         MessageSquare,
  invoice:         FileText,
};

interface RecentActivityProps {
  activities: Activity[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {activities.map((activity) => {
            const Icon = icons[activity.type];
            return (
              <li key={activity.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80">
                  <Icon className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">{activity.title}</p>
                  <p className="text-xs text-zinc-500">{activity.description}</p>
                </div>
                <time className="shrink-0 text-xs text-zinc-600">
                  {formatDate(activity.timestamp)}
                </time>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
