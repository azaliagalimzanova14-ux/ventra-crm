import { ProtectedRoute } from "@/components/auth/protected-route";
import { Sidebar } from "@/components/layout/sidebar";
import { ModulesProvider } from "@/context/modules-context";
import { SidebarProvider } from "@/context/sidebar-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ModulesProvider>
        <SidebarProvider>
          <div className="flex min-h-screen bg-[#07070f]">
            <Sidebar />
            <main className="md:ml-60 flex flex-1 flex-col min-h-screen">{children}</main>
          </div>
        </SidebarProvider>
      </ModulesProvider>
    </ProtectedRoute>
  );
}
