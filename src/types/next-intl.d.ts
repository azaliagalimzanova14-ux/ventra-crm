/**
 * Type stubs for next-intl.
 * Run `npm install next-intl` to install the real package — these stubs
 * are only used so TypeScript compiles before the package is present.
 * After install the real types from node_modules override this file.
 */
declare module "next-intl" {
  import type { ReactNode, ComponentType } from "react";

  /** Returns a translator function scoped to the given namespace (or root if omitted). */
  export function useTranslations(
    namespace?: string,
  ): (key: string, values?: Record<string, unknown>) => string;

  /** Returns the current active locale string, e.g. "en" or "ru". */
  export function useLocale(): string;

  export interface NextIntlClientProviderProps {
    locale: string;
    messages: Record<string, unknown>;
    children?: ReactNode;
    timeZone?: string;
    now?: Date;
  }

  /** Provider that supplies locale + messages to all child useTranslations() calls. */
  export const NextIntlClientProvider: ComponentType<NextIntlClientProviderProps>;
}
