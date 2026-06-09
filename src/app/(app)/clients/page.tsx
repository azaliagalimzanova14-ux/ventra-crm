"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ClientModal } from "@/components/clients/client-modal";
import { getClients, saveClients } from "@/lib/storage";
import type { Client, ClientStatus } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
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

/** Guarantee every field used in the UI has a safe default. */
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

export default function ClientsPage() {
  const { t } = useLanguage();

  // ── State ──────────────────────────────────────────────────────────────────
  const [clientList, setClientList] = useState<Client[]>([]);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState<ClientStatus | "all">("all");
  const [sortBy,  setSortBy]        = useState<"name" | "value" | "lastContact">("value");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");
  const [modal,   setModal]         = useState<ModalState>({ open: false });
  const [toast,   setToast]         = useState<string | null>(null);

  // Load from localStorage on mount — normalize to guarantee safe field access
  useEffect(() => {
    setClientList(getClients().map(normalizeClient));
  }, []);

  // ── Toast helper ───────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function handleSave(client: Client) {
    const safe = normalizeClient(client);
    const isNew = !clientList.find((c) => c.id === safe.id);
    const updated = isNew
      ? [safe, ...clientList]
      : clientList.map((c) => (c.id === safe.id ? safe : c));
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

  // ── Derived data ───────────────────────────────────────────────────────────
  const FALLBACK_STATUS = { label: "—", class: "bg-[#1c1c35] text-[#5a5a8a] border-[#252545]" };
  const statusConfig: Record<string, { label: string; class: string }> = {
    active:   { label: t("status_active"),   class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    inactive: { label: t("status_inactive"), class: "bg-[#1c1c35] text-[#8080a8] border-[#252545]" },
    lead:     { label: t("status_lead"),     class: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    churned:  { label: t("status_churned"),  class: "bg-red-500/15 text-red-400 border-red-500/20" },
  };
  const getStatus = (status: string) => statusConfig[status] ?? FALLBACK_STATUS;

  const filtered = clientList
    .filter((c) => {
      const q = search.toLowerCase();
      return (
        (c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)) &&
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
      ? sortDir === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />
      : <ChevronDown size={13} className="opacity-0 group-hover:opacity-40" />;

  const totals = {
    active:     clientList.filter((c) => c.status === "active").length,
    leads:      clientList.filter((c) => c.status === "lead").length,
    totalValue: clientList.reduce((a, c) => a + c.totalValue, 0),
  };

  const summaryCards = [
    { label: t("clients_total_card"),  value: clientList.length, sub: t("clients_sub_alltime") },
    { label: t("clients_active_card"), value: totals.active,     sub: t("clients_sub_engaged") },
    { label: t("clients_leads_card"),  value: totals.leads,      sub: t("clients_sub_pending") },
    { label: t("clients_value_card"),  value: `$${(totals.totalValue / 1000).toFixed(0)}K`, sub: t("clients_sub_lifetime") },
  ];

  const filterOptions: (ClientStatus | "all")[] = ["all", "active", "lead", "inactive", "churned"];

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[#1c1c35] border border-indigo-500/30 text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* Modal */}
      <ClientModal
        open={modal.open}
        client={modal.open && modal.mode === "edit" ? modal.client : undefined}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <div className="flex flex-col flex-1">
        <TopBar
          title={t("clients_title")}
          subtitle={`${clientList.length} ${t("clients_subtitle")}`}
          action={{
            label: t("clients_add"),
            onClick: () => setModal({ open: true, mode: "create" }),
          }}
        />

        <div className="flex-1 p-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            {summaryCards.map((s) => (
              <div key={s.label} className="bg-[#111128] border border-[#1c1c35] rounded-xl p-4">
                <p className="text-[22px] font-bold text-white">{s.value}</p>
                <p className="text-[13px] text-[#e0e0f0] font-medium mt-0.5">{s.label}</p>
                <p className="text-[11px] text-[#5a5a8a]">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a5a8a]" />
              <input
                type="text"
                placeholder={t("clients_search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#111128] border border-[#1c1c35] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[#e0e0f0] placeholder-[#5a5a8a] focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#111128] border border-[#1c1c35] rounded-lg p-1">
              {filterOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                    filterStatus === s ? "bg-indigo-600 text-white" : "text-[#8080a8] hover:text-white"
                  )}
                >
                  {s === "all" ? t("all") : getStatus(s).label}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-[#111128] border border-[#1c1c35] rounded-lg text-[13px] text-[#8080a8] hover:text-white transition-colors">
              <Filter size={13} />{t("filter")}
            </button>
          </div>

          {/* Table */}
          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1c1c35]">
                  <th className="text-left px-5 py-3">
                    <button onClick={() => toggleSort("name")} className="flex items-center gap-1 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider group">
                      {t("clients_col_client")} <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider">{t("clients_col_status")}</th>
                  <th className="text-left px-5 py-3 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider">{t("clients_col_industry")}</th>
                  <th className="text-left px-5 py-3">
                    <button onClick={() => toggleSort("value")} className="flex items-center gap-1 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider group">
                      {t("clients_col_value")} <SortIcon col="value" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider">{t("clients_col_projects")}</th>
                  <th className="text-left px-5 py-3">
                    <button onClick={() => toggleSort("lastContact")} className="flex items-center gap-1 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider group">
                      {t("clients_col_contact")} <SortIcon col="lastContact" />
                    </button>
                  </th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c1c35]">
                {filtered.map((client, i) => (
                  <tr key={client.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-full bg-linear-to-br flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0", avatarGradients[i % avatarGradients.length])}>
                          {client.avatar}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-white">{client.name}</p>
                          <p className="text-[12px] text-[#5a5a8a]">{client.company}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[11px] font-medium px-2 py-1 rounded-md border", getStatus(client.status).class)}>
                        {getStatus(client.status).label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[#8080a8]">{client.industry}</td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-white">
                      {client.totalValue > 0 ? `$${client.totalValue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[#8080a8]">{client.projectCount}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#8080a8]">{client.lastContact}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal({ open: true, mode: "edit", client })}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-indigo-400 transition-colors"
                          title={t("btn_edit")}
                        >
                          <Pencil size={13} />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white"><Mail size={14} /></button>
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white"><Phone size={14} /></button>
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white"><ExternalLink size={14} /></button>
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white"><MoreHorizontal size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && clientList.length > 0 && (
              <EmptyState
                icon={Search}
                title={t("empty_clients_filtered")}
                subtitle={t("empty_clients_filtered_sub")}
              />
            )}
            {filtered.length === 0 && clientList.length === 0 && (
              <EmptyState
                icon={Users}
                title={t("empty_clients_title")}
                subtitle={t("empty_clients_sub")}
                action={{ label: t("empty_add_client"), onClick: () => setModal({ open: true, mode: "create" }) }}
              />
            )}
          </div>

          {/* Client cards */}
          <div className="grid grid-cols-3 gap-4">
            {filtered.slice(0, 3).map((client, i) => (
              <div
                key={client.id + "-card"}
                className="bg-[#111128] border border-[#1c1c35] rounded-xl p-5 hover:border-[#252545] transition-colors cursor-pointer relative group"
                onClick={() => setModal({ open: true, mode: "edit", client })}
              >
                {/* Edit badge on hover */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <Pencil size={9} />{t("btn_edit")}
                  </span>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div className={cn("w-11 h-11 rounded-xl bg-linear-to-br flex items-center justify-center text-[14px] font-bold text-white", avatarGradients[i % avatarGradients.length])}>
                    {client.avatar}
                  </div>
                  <span className={cn("text-[11px] font-medium px-2 py-1 rounded-md border", getStatus(client.status).class)}>
                    {getStatus(client.status).label}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-white">{client.name}</p>
                <p className="text-[12px] text-[#5a5a8a] mt-0.5">{client.company}</p>
                <div className="flex items-center gap-1 mt-2 text-[11px] text-[#5a5a8a]">
                  <MapPin size={11} />{client.location}
                </div>
                <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-[#1c1c35]">
                  <div className="flex-1">
                    <p className="text-[11px] text-[#5a5a8a]">{t("clients_card_value")}</p>
                    <p className="text-[14px] font-semibold text-white">${client.totalValue.toLocaleString()}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-[#5a5a8a]">{t("clients_card_projects")}</p>
                    <p className="text-[14px] font-semibold text-white">{client.projectCount}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {client.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] bg-[#1c1c35] text-[#8080a8] px-1.5 py-0.5 rounded-md">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
