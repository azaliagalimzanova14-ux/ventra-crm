import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: LucideIcon;
  iconClassName?: string;
}

export function StatsCard({
  title,
  value,
  change,
  trend = "neutral",
  icon: Icon,
  iconClassName,
}: StatsCardProps) {
  return (
    <Card className="group transition-colors hover:border-zinc-700/80">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">{title}</p>
            <p className="text-2xl font-semibold tracking-tight text-zinc-50">{value}</p>
            {change && (
              <p
                className={cn(
                  "text-xs font-medium",
                  trend === "up" && "text-emerald-400",
                  trend === "down" && "text-red-400",
                  trend === "neutral" && "text-zinc-500",
                )}
              >
                {change}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/80",
              iconClassName,
            )}
          >
            <Icon className="h-5 w-5 text-zinc-400 group-hover:text-zinc-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
