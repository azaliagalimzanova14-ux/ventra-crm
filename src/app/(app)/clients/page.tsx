"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ClientModal } from "@/components/clients/client-modal";
import { getClients, saveClients } from "@/lib/storage";
import type { Client, ClientStatus } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import {
  Search, Filter, MoreHorizontal, Mail, Phone, ExternalLink,
  ChevronUp, ChevronDown, MapPin, Pencil, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

const avatarGradients = [
  "from-indigo-500 to-violet-600", "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",  "from-pink-500 to-rose-600",
  "from-blue-500 to-cyan-600",     "from-purple-500 to-fuchsia-600",
];

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; client: Client };

function normalizeClient(c: Client): Client {
  return {
    ...c,
    avatar:       c.avatar       || (c.name ?? "?").trim().slice(0, 2).toUpperCase(),
    totalValue:   typeof c.totalValue   === "number" ? c.totalValue   : 0,
    projectCount: typeof c.projectCount === "number" ? c.projectCount : 0,
    tags:         Array.isArray(c.tags) ? c.tags : [],
    location:     c.location     ?? "",
    lastContact:  c.lastContact  ?? "",
    joinedAt:     c.joinedAt     ?? "",
    phone:        c.phone        ?? "",
    industry:     c.industry     ?? "",
  };
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active:   { label: "Active",   className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  inactive: { label: "Inactive", className: "bg-gray-100 text-gray-600 border border-gray-200" },
  lead:     { label: "Lead",     className: "bg-blue-50 text-blue-700 border border-blue-200" },
  churned:  { label: "Churned",  className: "bg-red-50 text-red-600 border border-red-200" },
};

export default function ClientsPage() {
  const { t } = useLanguage();
  const { sw } = useTheme();

  const [clientList, setClientList] = useState<Client[]>([]);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState<ClientStatus | "all">("all");
  const [sortBy,  setSortBy]        = useState<"name" | "value" | "lastContact">("value");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");
  const [modal,   setModal]         = useState<ModalState>({ open: false });
  const [toast,   setToast]         = useState<string | null>(null);

  useEffect(() => {
    setClientList(getClients().map(normalizeClient));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleSave(client: Client) {
    const safe = normalizeClient(client);
    const isNew = !clientList.find((c) => c.id === safe.id);
    const updated = isNew ? [safe, ...clientList] : clientList.map((c) => (c.id === safe.id ? safe : c));
    saveClients(updated);
    setClientList(updated);
    setModal({ open: false });
    showToast(isNew ? t("client_created") : t("client_saved"));
  }

  function handleDelete(id: string) {
    const updated = clientList.filter((c) => c.id !== id);
    saveClients(updated);
    setClientList(updated);
    setModal({ open: false });
    showToast(t("client_deleted"));
  }

  const filtered = clientList
    .filter((c) => {
      const q = search.toLowerCase();
      return (
        (c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) &&
        (filterStatus === "all" || c.status === filterStatus)
      );
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "name")  return dir * a.name.localeCompare(b.name);
      if (sortBy === "value") return dir * (a.totalValue - b.totalValue);
      return dir * (new Date(a.lastContact).getTime() - new Date(b.lastContact).getTime());
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
      : <ChevronDown size={12} className="opacity-0 group-hover:opacity-30" />;

  const totals = {
    active:     clientList.filter((c) => c.status === "active").length,
    leads:      clientList.filter((c) => c.status === "lead").length,
    totalValue: clientList.reduce((a, c) => a + c.totalValue, 0),
  };

  const filterOptions: (ClientStatus | "all")[] = ["all", "active", "lead", "inactive", "churned"];
  const getStatus = (s: string) => statusConfig[s] ?? { label: s, className: "bg-gray-100 text-gray-600 border border-gray-200" };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[var(--color-fg)] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      <ClientModal
        open={modal.open}
        client={modal.open && modal.mode === "edit" ? modal.client : undefined}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <div className="flex flex-col flex-1 bg-[var(--color-canvas)]">
        <TopBar
          title={t("clients_title")}
          subtitle={`${clientList.length} ${t("clients_subtitle")}`}
          action={{ label: t("clients_add"), onClick: () => setModal({ open: true, mode: "create" }) }}
        />

        <div className="flex-1 p-4 md:p-6 space-y-5">

          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total clients",  value: clientList.length,              badge: null },
              { label: "Active",         value: totals.active,                  badge: "emerald" },
              { label: "Leads",          value: totals.leads,                   badge: "blue" },
              { label: "Lifetime value", value: `$${(totals.totalValue / 1000).toFixed(0)}K`, badge: null },
            ].map((s) => (
              <div key={s.label}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-card hover:shadow-card-hover transition-shadow">
                <p className="text-[24px] font-bold text-[var(--color-fg)] leading-none">{s.value}</p>
                <p className="text-[12px] text-[var(--color-fg-muted)] mt-1.5 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)]" strokeWidth={sw} />
              <input
                type="text"
                placeholder={t("clients_search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-9 pr-4 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-shadow"
              />
            </div>
            {/* Status tabs */}
            <div className="flex items-center gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1">
              {filterOptions.map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[12px] font-medium transition-colors",
                    filterStatus === s
                      ? "bg-[var(--color-accent)] text-white shadow-sm"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  )}>
                  {s === "all" ? "All" : getStatus(s).label}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent)] transition-colors">
              <Filter size={13} strokeWidth={sw} />{t("filter")}
            </button>
          </div>

          {/* Table */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                  {[
                    { key: "name" as const,        label: t("clients_col_client"),   sortable: true  },
                    { key: null,                    label: t("clients_col_status"),   sortable: false },
                    { key: null,                    label: t("clients_col_industry"), sortable: false },
                    { key: "value" as const,        label: t("clients_col_value"),    sortable: true  },
                    { key: null,                    label: t("clients_col_projects"), sortable: false },
                    { key: "lastContact" as const,  label: t("clients_col_contact"),  sortable: true  },
                    { key: null,                    label: "",                         sortable: false },
                  ].map((col, idx) => (
                    <th key={idx} className="text-left px-5 py-3">
                      {col.sortable && col.key ? (
                        <button onClick={() => toggleSort(col.key!)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider group hover:text-[var(--color-fg-muted)]">
                          {col.label} <SortIcon col={col.key} />
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((client, i) => (
                  <tr key={client.id} className="hover:bg-[var(--color-canvas)] transition-colors group cursor-pointer" onClick={() => setModal({ open: true, mode: "edit", client })}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-full bg-linear-to-br flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0", avatarGradients[i % avatarGradients.length])}>
                          {client.avatar}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[var(--color-fg)]">{client.name}</p>
                          <p className="text-[12px] text-[var(--color-fg-faint)]">{client.company}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", getStatus(client.status).className)}>
                        {getStatus(client.status).label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[var(--color-fg-muted)]">{client.industry || "—"}</td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-[var(--color-fg)]">
                      {client.totalValue > 0 ? `$${client.totalValue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[var(--color-fg-muted)]">{client.projectCount || "—"}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[var(--color-fg-muted)]">
                      {client.lastContact
                        ? <span className="flex items-center gap-1"><MapPin size={10} strokeWidth={sw} />{client.lastContact}</span>
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setModal({ open: true, mode: "edit", client })}
                          className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-colors">
                          <Pencil size={13} strokeWidth={sw} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors">
                          <Mail size={13} strokeWidth={sw} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors">
                          <Phone size={13} strokeWidth={sw} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors">
                          <ExternalLink size={13} strokeWidth={sw} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors">
                          <MoreHorizontal size={13} strokeWidth={sw} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && clientList.length > 0 && (
              <EmptyState icon={Search} title={t("empty_clients_filtered")} subtitle={t("empty_clients_filtered_sub")} />
            )}
            {filtered.length === 0 && clientList.length === 0 && (
              <EmptyState icon={Users} title={t("empty_clients_title")} subtitle={t("empty_clients_sub")}
                action={{ label: t("empty_add_client"), onClick: () => setModal({ open: true, mode: "create" }) }} />
            )}
          </div>

          {/* Client cards — first 3 */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filtered.slice(0, 3).map((client, i) => (
                <div key={client.id + "-card"}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer shadow-card"
                  onClick={() => setModal({ open: true, mode: "edit", client })}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn("w-11 h-11 rounded-xl bg-linear-to-br flex items-center justify-center text-[14px] font-bold text-white", avatarGradients[i % avatarGradients.length])}>
                      {client.avatar}
                    </div>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", getStatus(client.status).className)}>
                      {getStatus(client.status).label}
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold text-[var(--color-fg)]">{client.name}</p>
                  <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5">{client.company}</p>
                  {client.location && (
                    <p className="flex items-center gap-1 mt-1.5 text-[11px] text-[var(--color-fg-faint)]">
                      <MapPin size={10} strokeWidth={sw} />{client.location}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
                    <div className="flex-1">
                      <p className="text-[10px] text-[var(--color-fg-faint)] uppercase tracking-wider font-semibold">Value</p>
                      <p className="text-[15px] font-bold text-[var(--color-fg)]">${client.totalValue.toLocaleString()}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-[var(--color-fg-faint)] uppercase tracking-wider font-semibold">Projects</p>
                      <p className="text-[15px] font-bold text-[var(--color-fg)]">{client.projectCount}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {client.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] bg-[var(--color-canvas)] text-[var(--color-fg-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-md">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
