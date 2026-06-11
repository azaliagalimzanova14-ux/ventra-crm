import type { Metadata } from "next";
import { AuthProvider }     from "@/context/auth-context";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider }    from "@/context/theme-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ventra CRM — AI-powered CRM for small business",
  description:
    "Manage clients, projects, tasks, and deals with an AI assistant built for small teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>{children}</AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
