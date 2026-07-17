interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-8 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-fg)]">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-fg-faint)]">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
