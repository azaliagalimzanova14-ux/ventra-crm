import Link from "next/link";
import { Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">

      {/* Left panel — brand */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[560px] flex-shrink-0 flex-col justify-between bg-[var(--color-fg)] p-12 overflow-hidden">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h1v40H0zm40 0h-1v40h1zm0 0v1H0V0zm0 40v-1H0v1z' fill='%23fff'/%3E%3C/svg%3E")`,
          }}
        />
        {/* Accent glow */}
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }} />

        <Link href="/" className="relative flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center shadow-lg">
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[16px] font-semibold text-white tracking-tight">Ventra CRM</span>
        </Link>

        <div className="relative">
          <blockquote className="text-[24px] font-semibold leading-snug tracking-tight text-white/90 mb-4">
            &ldquo;The CRM that feels like it was built for how we actually sell.&rdquo;
          </blockquote>
          <p className="text-[14px] text-white/50 leading-relaxed max-w-sm">
            AI-powered insights, clean pipeline views, and zero clutter — designed
            for small teams who move fast.
          </p>
          <div className="flex items-center gap-3 mt-6">
            <div className="flex -space-x-2">
              {["SC", "MR", "PN"].map((initials, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[var(--color-fg)] flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: ["#6366f1","#10b981","#f59e0b"][i] }}>
                  {initials}
                </div>
              ))}
            </div>
            <p className="text-[13px] text-white/50">Trusted by 2,400+ small businesses</p>
          </div>
        </div>

        <p className="relative text-[12px] text-white/30">
          © {new Date().getFullYear()} Ventra CRM. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[16px] font-semibold text-[var(--color-fg)]">Ventra CRM</span>
        </div>
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </div>
  );
}
