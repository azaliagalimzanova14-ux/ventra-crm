"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  type ModuleId,
  type ModuleVisibility,
  getModuleVisibility,
  saveModuleVisibility,
} from "@/lib/modules";
import type { CustomModule, CustomModuleIconKey } from "@/lib/types";
import { getCustomModules, saveCustomModules } from "@/lib/storage";

interface ModulesContextValue {
  // Built-in modules
  visibility: ModuleVisibility;
  isEnabled: (id: ModuleId) => boolean;
  toggle: (id: ModuleId, enabled: boolean) => void;

  // Custom modules
  customModules: CustomModule[];
  addCustomModule: (data: { name: string; description: string; icon: CustomModuleIconKey; enabled: boolean }) => void;
  updateCustomModule: (mod: CustomModule) => void;
  deleteCustomModule: (id: string) => void;
  toggleCustomModule: (id: string, enabled: boolean) => void;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const [visibility, setVisibility]         = useState<ModuleVisibility>(getModuleVisibility);
  const [customModules, setCustomModules]   = useState<CustomModule[]>([]);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setVisibility(getModuleVisibility());
    setCustomModules(getCustomModules());
  }, []);

  // ── Built-in modules ────────────────────────────────────────────────────────

  function toggle(id: ModuleId, enabled: boolean) {
    const next = { ...visibility, [id]: enabled };
    setVisibility(next);
    saveModuleVisibility(next);
  }

  function isEnabled(id: ModuleId): boolean {
    return visibility[id] ?? true;
  }

  // ── Custom modules ──────────────────────────────────────────────────────────

  function addCustomModule(data: { name: string; description: string; icon: CustomModuleIconKey; enabled: boolean }) {
    const mod: CustomModule = {
      id: `custom-${Date.now()}`,
      name: data.name.trim(),
      description: data.description.trim(),
      icon: data.icon,
      enabled: data.enabled,
      createdAt: new Date().toISOString().split("T")[0],
    };
    const next = [...customModules, mod];
    setCustomModules(next);
    saveCustomModules(next);
    return mod;
  }

  function updateCustomModule(mod: CustomModule) {
    const next = customModules.map((m) => (m.id === mod.id ? mod : m));
    setCustomModules(next);
    saveCustomModules(next);
  }

  function deleteCustomModule(id: string) {
    const next = customModules.filter((m) => m.id !== id);
    setCustomModules(next);
    saveCustomModules(next);
  }

  function toggleCustomModule(id: string, enabled: boolean) {
    const next = customModules.map((m) => (m.id === id ? { ...m, enabled } : m));
    setCustomModules(next);
    saveCustomModules(next);
  }

  return (
    <ModulesContext.Provider value={{
      visibility, isEnabled, toggle,
      customModules, addCustomModule, updateCustomModule, deleteCustomModule, toggleCustomModule,
    }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error("useModules must be used within ModulesProvider");
  return ctx;
}
