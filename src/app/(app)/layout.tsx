import { ProtectedRoute }     from "@/components/auth/protected-route";
import { Sidebar }            from "@/components/layout/sidebar";
import { ModulesProvider }    from "@/context/modules-context";
import { SidebarProvider }    from "@/context/sidebar-context";
import { WorkspaceProvider }  from "@/context/workspace-context";
import { PermissionProvider } from "@/context/permission-context";
import { TeamProvider }       from "@/context/team-context";
import { QuickActions }       from "@/components/ui/quick-actions";
import { FirstRunGuard }      from "@/components/onboarding/first-run-guard";
import { FeedbackButton }     from "@/components/feedback/feedback-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ModulesProvider>
        <SidebarProvider>
          <WorkspaceProvider>
            {/* PermissionProvider derives role/permissions from WorkspaceProvider */}
            <PermissionProvider>
              <TeamProvider>
                <FirstRunGuard>
                  <div className="flex min-h-screen bg-canvas">
                    <Sidebar />
                    <main className="md:ml-60 flex flex-1 flex-col min-h-screen">{children}</main>
                  </div>
                  <QuickActions />
                  <FeedbackButton />
                </FirstRunGuard>
              </TeamProvider>
            </PermissionProvider>
          </WorkspaceProvider>
        </SidebarProvider>
      </ModulesProvider>
    </ProtectedRoute>
  );
}
