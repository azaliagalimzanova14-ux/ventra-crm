"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Client, ClientStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

// Status maps defined locally — mock-data no longer exports these
const statusColors: Record<ClientStatus, string> = {
  active:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  lead:     "bg-blue-500/15 text-blue-400 border-blue-500/20",
  churned:  "bg-red-500/15 text-red-400 border-red-500/20",
};

const statusLabels: Record<ClientStatus, string> = {
  active:   "Active",
  inactive: "Inactive",
  lead:     "Lead",
  churned:  "Churned",
};

interface ClientTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
}

export function ClientTable({ clients, onEdit, onDelete }: ClientTableProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-zinc-400">No clients yet</p>
        <p className="mt-1 text-xs text-zinc-600">Add your first client to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <th className="px-6 py-3">Client</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Value</th>
            <th className="px-6 py-3">Last contact</th>
            <th className="px-6 py-3 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {clients.map((client) => (
            <tr
              key={client.id}
              className="group transition-colors hover:bg-zinc-800/20"
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={client.name} size="sm" />
                  <div>
                    <p className="font-medium text-zinc-200">{client.name}</p>
                    <p className="text-xs text-zinc-500">
                      {client.company} · {client.email}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <Badge className={statusColors[client.status]}>
                  {statusLabels[client.status]}
                </Badge>
              </td>
              <td className="px-6 py-4 font-medium text-zinc-300">
                {client.totalValue > 0 ? formatCurrency(client.totalValue) : "—"}
              </td>
              <td className="px-6 py-4 text-zinc-500">
                {formatDate(client.lastContact)}
              </td>
              <td className="relative px-6 py-4">
                <button
                  onClick={() =>
                    setMenuOpen(menuOpen === client.id ? null : client.id)
                  }
                  className="rounded-md p-1 text-zinc-500 opacity-0 transition-all hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen === client.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(null)}
                    />
                    <div className="absolute right-6 top-10 z-20 w-36 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                      <button
                        onClick={() => {
                          onEdit(client);
                          setMenuOpen(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          onDelete(client.id);
                          setMenuOpen(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
