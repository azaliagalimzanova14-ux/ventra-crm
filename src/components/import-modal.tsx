"use client";

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  Upload, X, FileText, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, AlertTriangle, Download,
  Users, FileSpreadsheet, Loader2, ArrowRight,
  Briefcase, ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IMPORT_FIELDS,
  DEAL_IMPORT_FIELDS,
  TASK_IMPORT_FIELDS,
  autoDetectMappings,
  autoDetectDealMappings,
  autoDetectTaskMappings,
  parseCSV,
  parseXLSX,
  analyzeRows,
  analyzeDealRows,
  analyzeTaskRows,
  executeImport,
  executeDealImport,
  executeTaskImport,
  downloadCSVTemplate,
  type ImportEntityType,
  type ImportField,
  type ParsedRow,
  type ImportResult,
} from "@/lib/import";
import { getClients, saveClients, getDeals, saveDeals, getTasks, saveTasks } from "@/lib/storage";
import { normalizeClient } from "@/lib/normalize";

// ── Entity meta ────────────────────────────────────────────────────────────────

const ENTITY_META: Record<ImportEntityType, {
  label:       string;
  icon:        React.ElementType;
  description: string;
  color:       string;
}> = {
  clients: {
    label:       "Clients",
    icon:        Users,
    description: "Contact name, company, email, phone",
    color:       "text-blue-600",
  },
  deals: {
    label:       "Deals",
    icon:        Briefcase,
    description: "Deal name, client, value, stage",
    color:       "text-purple-600",
  },
  tasks: {
    label:       "Tasks",
    icon:        ListTodo,
    description: "Task title, client, priority, due date",
    color:       "text-emerald-600",
  },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface ImportModalProps {
  open:          boolean;
  onClose:       () => void;
  onImported:    (type: ImportEntityType, result: ImportResult) => void;
  defaultType?:  ImportEntityType;
}

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEP_LABELS = ["Upload", "Map Columns", "Preview", "Complete"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 px-6 py-4 border-b border-[var(--color-border)]">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors",
                i < step    ? "bg-[var(--color-accent)] text-white"
                : i === step  ? "bg-[var(--color-accent)] text-white ring-4 ring-[var(--color-accent-subtle)]"
                : "bg-[var(--color-canvas)] border-2 border-[var(--color-border)] text-[var(--color-fg-faint)]",
              )}
            >
              {i < step ? <CheckCircle2 size={13} strokeWidth={2.5} /> : i + 1}
            </div>
            <span
              className={cn(
                "text-[12px] font-semibold hidden sm:inline",
                i === step ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]",
              )}
            >
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div
              className={cn(
                "mx-3 h-px w-8 md:w-12 flex-shrink-0 transition-colors",
                i < step ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Upload (with entity selector) ─────────────────────────────────────

interface UploadStepProps {
  entityType:    ImportEntityType;
  onEntityType:  (t: ImportEntityType) => void;
  fileName:      string;
  rowCount:      number;
  headers:       string[];
  parseError:    string | null;
  onFile:        (f: File) => void;
}

function UploadStep({ entityType, onEntityType, fileName, rowCount, headers, parseError, onFile }: UploadStepProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const hasFile = !!fileName;

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Entity selector */}
      <div>
        <p className="text-[11px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">
          What are you importing?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(ENTITY_META) as [ImportEntityType, typeof ENTITY_META.clients][]).map(([type, meta]) => {
            const Icon     = meta.icon;
            const selected = entityType === type;
            return (
              <button
                key={type}
                onClick={() => onEntityType(type)}
                className={cn(
                  "flex flex-col items-start gap-1.5 px-3.5 py-3 rounded-xl border text-left transition-all",
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] shadow-sm"
                    : "border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-accent-subtle)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon size={15} className={selected ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]"} />
                  <span className={cn("text-[13px] font-bold", selected ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]")}>
                    {meta.label}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--color-fg-faint)] leading-snug">{meta.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !hasFile && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all",
          hasFile ? "py-6" : "py-10 cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)]",
          dragging ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]" : "border-[var(--color-border)]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />

        {hasFile ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-emerald-500" />
            </div>
            <p className="text-[14px] font-semibold text-[var(--color-fg)]">{fileName}</p>
            <p className="text-[12px] text-[var(--color-fg-muted)]">
              {rowCount} row{rowCount !== 1 ? "s" : ""} detected
              {headers.length > 0 && ` · ${headers.length} columns`}
            </p>
            {headers.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center mt-1 max-w-[480px]">
                {headers.slice(0, 8).map((h) => (
                  <span key={h} className="text-[10px] bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-muted)] px-2 py-0.5 rounded-md font-medium">
                    {h}
                  </span>
                ))}
                {headers.length > 8 && (
                  <span className="text-[10px] text-[var(--color-fg-faint)] px-2 py-0.5">
                    +{headers.length - 8} more
                  </span>
                )}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-1 text-[11px] text-[var(--color-accent)] hover:underline font-medium"
            >
              Choose a different file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center">
              <Upload size={24} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-fg)]">
                Drop your file here, or <span className="text-[var(--color-accent)]">browse</span>
              </p>
              <p className="text-[12px] text-[var(--color-fg-muted)] mt-1">
                Supports CSV (.csv) and Excel (.xlsx)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-fg-faint)]">
              <div className="flex items-center gap-1.5"><FileText size={12} /><span>.csv</span></div>
              <span>·</span>
              <div className="flex items-center gap-1.5"><FileSpreadsheet size={12} /><span>.xlsx</span></div>
              <span>·</span>
              <span>Max 10 MB</span>
            </div>
          </div>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-700 leading-relaxed">{parseError}</p>
        </div>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[var(--color-fg)]">Not sure about the format?</p>
          <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            Download a sample CSV template for {ENTITY_META[entityType].label.toLowerCase()}
          </p>
        </div>
        <button
          onClick={() => downloadCSVTemplate(entityType)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] rounded-lg transition-colors flex-shrink-0 ml-3"
        >
          <Download size={12} />
          Template
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Map Columns ────────────────────────────────────────────────────────

interface MapStepProps {
  fields:   ImportField[];
  headers:  string[];
  rawRows:  Record<string, string>[];
  mapping:  Record<string, string | null>;
  onChange: (field: string, column: string | null) => void;
}

function MapStep({ fields, headers, rawRows, mapping, onChange }: MapStepProps) {
  // Invert mapping: field key → column currently mapped to it
  const fieldToCol = useMemo<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field) m[field] = col;
    }
    return m;
  }, [mapping]);

  const sample = rawRows[0] ?? {};
  const requiredFields = fields.filter((f) => f.required);

  return (
    <div className="flex flex-col p-6 gap-4">
      <div className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
        Match your file&apos;s columns to Ventra fields. Required fields are marked with ★.
        Unmapped columns are ignored.
      </div>

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-2">
          {["CRM Field", "Your Column", "Sample Value"].map((h) => (
            <span key={h} className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {fields.map((field, i) => {
          const selectedCol = fieldToCol[field.key] ?? null;
          const sampleVal   = selectedCol ? (sample[selectedCol] ?? "") : "";

          return (
            <div
              key={field.key}
              className={cn(
                "grid grid-cols-[1fr_1fr_1fr] px-4 py-3 border-b last:border-0 border-[var(--color-border)] transition-colors",
                i % 2 === 0 ? "bg-[var(--color-surface)]" : "bg-[var(--color-canvas)]",
              )}
            >
              <div className="flex items-center gap-1.5 pr-3">
                <span className="text-[12px] font-semibold text-[var(--color-fg)] leading-none">
                  {field.label}
                </span>
                {field.required && (
                  <span className="text-amber-500 text-[13px] leading-none">★</span>
                )}
              </div>

              <div className="pr-3">
                <select
                  value={selectedCol ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value || null)}
                  className="w-full h-7 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg px-2 text-[11px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
                >
                  <option value="">— skip field —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                {sampleVal ? (
                  <span className="text-[11px] text-[var(--color-fg-muted)] truncate max-w-[160px]" title={sampleVal}>
                    {sampleVal}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--color-fg-faint)] italic">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Missing required warning */}
      {(() => {
        const missing = requiredFields.filter((f) => !fieldToCol[f.key]).map((f) => f.label);
        if (missing.length === 0) return null;
        return (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-800">
              Required {missing.length === 1 ? "field" : "fields"} not mapped:{" "}
              <strong>{missing.join(", ")}</strong>. Map these to continue.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Step 3: Preview ────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 100;

interface PreviewStepProps {
  entityType:       ImportEntityType;
  analyzed:         ParsedRow[];
  skipDups:         boolean;
  onSkipDupsChange: (v: boolean) => void;
}

const PREVIEW_COLUMNS: Record<ImportEntityType, { key: string; label: string }[]> = {
  clients: [
    { key: "name",    label: "Name"    },
    { key: "company", label: "Company" },
    { key: "email",   label: "Email"   },
    { key: "status",  label: "Status"  },
  ],
  deals: [
    { key: "title",         label: "Deal Name" },
    { key: "clientName",    label: "Client"    },
    { key: "value",         label: "Value"     },
    { key: "stage",         label: "Stage"     },
  ],
  tasks: [
    { key: "title",      label: "Title"    },
    { key: "clientName", label: "Client"   },
    { key: "priority",   label: "Priority" },
    { key: "status",     label: "Status"   },
  ],
};

const ENTITY_LABELS: Record<ImportEntityType, string> = {
  clients: "client",
  deals:   "deal",
  tasks:   "task",
};

function PreviewStep({ entityType, analyzed, skipDups, onSkipDupsChange }: PreviewStepProps) {
  const totalRows  = analyzed.length;
  const errorRows  = analyzed.filter((r) => r.errors.length > 0).length;
  const dupRows    = analyzed.filter((r) => r.duplicate && r.errors.length === 0).length;
  const cleanRows  = totalRows - errorRows - dupRows;
  const willImport = skipDups ? cleanRows : cleanRows + dupRows;

  const preview = analyzed.slice(0, PREVIEW_LIMIT);
  const cols    = PREVIEW_COLUMNS[entityType];

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total rows",      value: totalRows,  color: "text-[var(--color-fg)]" },
          { label: "Ready to import", value: willImport, color: "text-emerald-600" },
          { label: "Duplicates",      value: dupRows,    color: "text-amber-600" },
          { label: "Errors",          value: errorRows,  color: errorRows > 0 ? "text-red-600" : "text-[var(--color-fg-faint)]" },
        ].map(({ label: lbl, value, color }) => (
          <div key={lbl} className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3 text-center">
            <p className={cn("text-[20px] font-bold leading-none tabular-nums", color)}>{value}</p>
            <p className="text-[10px] text-[var(--color-fg-faint)] mt-1 font-medium leading-tight">{lbl}</p>
          </div>
        ))}
      </div>

      {/* Duplicate toggle */}
      {dupRows > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div>
            <p className="text-[12px] font-semibold text-amber-800">
              {dupRows} duplicate{dupRows !== 1 ? "s" : ""} detected
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Entries that already exist (matched by title + client name)
            </p>
          </div>
          <div className="flex items-center gap-1 bg-white border border-amber-200 rounded-lg p-0.5 ml-3 flex-shrink-0">
            {([{ label: "Skip", value: true }, { label: "Import", value: false }] as const).map(({ label: lbl, value }) => (
              <button
                key={lbl}
                onClick={() => onSkipDupsChange(value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  skipDups === value ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-50",
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div
          className="grid border-b border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 gap-0"
          style={{ gridTemplateColumns: `32px repeat(${cols.length}, 1fr) 80px` }}
        >
          <span className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider">#</span>
          {cols.map(({ label: lbl }) => (
            <span key={lbl} className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider truncate">{lbl}</span>
          ))}
          <span className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider">Status</span>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          {preview.map((row) => {
            const hasError = row.errors.length > 0;
            const isDup    = !hasError && row.duplicate;

            return (
              <div
                key={row.index}
                className={cn(
                  "grid px-3 py-2.5 border-b last:border-0 border-[var(--color-border)] text-[12px] gap-0",
                  `grid-cols-[32px_repeat(${cols.length},1fr)_80px]`,
                  hasError ? "bg-red-50" : isDup ? "bg-amber-50" : "bg-[var(--color-surface)]",
                )}
                style={{ gridTemplateColumns: `32px repeat(${cols.length}, 1fr) 80px` }}
              >
                <span className="text-[10px] text-[var(--color-fg-faint)] tabular-nums mt-0.5">
                  {row.index + 1}
                </span>
                {cols.map(({ key }) => {
                  const val = row.mapped[key];
                  const requiredMissing = (key === "name" || key === "title") && !val;
                  return (
                    <span
                      key={key}
                      className={cn(
                        "truncate pr-2",
                        requiredMissing ? "text-red-400 italic" : "text-[var(--color-fg-muted)]",
                        key === cols[0].key && "font-medium text-[var(--color-fg)]",
                      )}
                      title={val ?? ""}
                    >
                      {val || (requiredMissing ? "missing" : "—")}
                    </span>
                  );
                })}

                <div className="flex items-center gap-1">
                  {hasError ? (
                    <div className="flex items-center gap-1 text-red-600" title={row.errors.join("; ")}>
                      <AlertCircle size={11} />
                      <span className="text-[10px] font-semibold">Error</span>
                    </div>
                  ) : isDup ? (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle size={11} />
                      <span className="text-[10px] font-semibold">Dup</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 size={11} />
                      <span className="text-[10px] font-semibold">OK</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {analyzed.length > PREVIEW_LIMIT && (
        <p className="text-[11px] text-[var(--color-fg-faint)] text-center">
          Showing first {PREVIEW_LIMIT} rows of {analyzed.length} total
        </p>
      )}

      {errorRows > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 leading-relaxed">
            {errorRows} row{errorRows !== 1 ? "s" : ""} with errors will be skipped — missing required fields.
          </p>
        </div>
      )}

    </div>
  );
}

// ── Step 4: Complete ───────────────────────────────────────────────────────────

function CompleteStep({
  entityType,
  result,
  onView,
  onImportAnother,
}: {
  entityType:      ImportEntityType;
  result:          ImportResult;
  onView:          () => void;
  onImportAnother: () => void;
}) {
  const meta  = ENTITY_META[entityType];
  const Icon  = meta.icon;
  const label = meta.label.toLowerCase();

  return (
    <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-emerald-500" />
      </div>

      <div>
        <h3 className="text-[18px] font-bold text-[var(--color-fg)]">Import complete</h3>
        <p className="text-[13px] text-[var(--color-fg-muted)] mt-1">
          Your {label} have been added to Ventra
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {[
          { lbl: "Imported", value: result.imported, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
          { lbl: "Skipped",  value: result.skipped,  color: "text-amber-600",   bg: "bg-amber-50 border-amber-200"    },
          { lbl: "Errors",   value: result.errors,   color: "text-red-500",     bg: "bg-red-50 border-red-200"        },
        ].map(({ lbl, value, color, bg }) => (
          <div key={lbl} className={cn("border rounded-xl p-4", bg)}>
            <p className={cn("text-[24px] font-bold leading-none tabular-nums", color)}>{value}</p>
            <p className="text-[11px] text-[var(--color-fg-muted)] mt-1.5 font-medium">{lbl}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 w-full max-w-sm">
        <button
          onClick={onView}
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-semibold rounded-xl transition-colors"
        >
          <Icon size={14} />
          View {label}
          <ArrowRight size={13} />
        </button>
        <button
          onClick={onImportAnother}
          className="w-full py-2.5 border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] rounded-xl transition-colors"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function ImportModal({ open, onClose, onImported, defaultType = "clients" }: ImportModalProps) {
  const [step,       setStep]       = useState(0);
  const [entityType, setEntityType] = useState<ImportEntityType>(defaultType);
  const [fileName,   setFileName]   = useState("");
  const [headers,    setHeaders]    = useState<string[]>([]);
  const [rawRows,    setRawRows]    = useState<Record<string, string>[]>([]);
  const [mapping,    setMapping]    = useState<Record<string, string | null>>({});
  const [analyzed,   setAnalyzed]   = useState<ParsedRow[]>([]);
  const [skipDups,   setSkipDups]   = useState(true);
  const [result,     setResult]     = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing,  setImporting]  = useState(false);

  // Sync defaultType when modal opens
  useEffect(() => {
    if (open) setEntityType(defaultType);
  }, [open, defaultType]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(0); setFileName(""); setHeaders([]); setRawRows([]);
        setMapping({}); setAnalyzed([]); setSkipDups(true);
        setResult(null); setParseError(null); setImporting(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // When entity type changes, re-run auto-detect on existing headers
  const handleEntityType = useCallback((t: ImportEntityType) => {
    setEntityType(t);
    if (headers.length > 0) {
      const detect = t === "deals" ? autoDetectDealMappings
                   : t === "tasks" ? autoDetectTaskMappings
                   : autoDetectMappings;
      setMapping(detect(headers));
    }
  }, [headers]);

  // ── File handler ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setParseError("Unsupported file type. Please upload a .csv or .xlsx file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setParseError("File is too large. Maximum size is 10 MB.");
      return;
    }
    if (ext === "xls") {
      setParseError("Old .xls format is not supported. Please save as .xlsx and try again.");
      return;
    }

    try {
      let parsed: { headers: string[]; rows: Record<string, string>[] };
      if (ext === "csv") {
        parsed = parseCSV(await file.text());
      } else {
        parsed = await parseXLSX(await file.arrayBuffer());
      }

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError("File appears to be empty or has no readable data.");
        return;
      }

      const detect = entityType === "deals" ? autoDetectDealMappings
                   : entityType === "tasks" ? autoDetectTaskMappings
                   : autoDetectMappings;

      setFileName(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(detect(parsed.headers));
    } catch (err) {
      setParseError(
        `Could not read file: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [entityType]);

  // ── Mapping change ────────────────────────────────────────────────────────

  const handleMappingChange = useCallback(
    (field: string, column: string | null) => {
      setMapping((prev) => {
        const next: Record<string, string | null> = { ...prev };
        for (const col of Object.keys(next)) {
          if (next[col] === field) next[col] = null;
        }
        if (column) next[column] = field;
        return next;
      });
    },
    [],
  );

  // ── Fields for current entity ─────────────────────────────────────────────

  const fields = entityType === "deals" ? DEAL_IMPORT_FIELDS
               : entityType === "tasks" ? TASK_IMPORT_FIELDS
               : IMPORT_FIELDS;

  // ── Required fields check ─────────────────────────────────────────────────

  function requiredMapped(): boolean {
    const fieldToCol: Record<string, string | null> = {};
    for (const [col, f] of Object.entries(mapping)) { if (f) fieldToCol[f] = col; }
    return fields.filter((f) => f.required).every((f) => !!fieldToCol[f.key]);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function canAdvance(): boolean {
    if (step === 0) return !!fileName && !parseError;
    if (step === 1) return requiredMapped();
    if (step === 2) return true;
    return false;
  }

  function handleNext() {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      // Analyze rows for selected entity
      let rows: ParsedRow[];
      if (entityType === "deals") {
        rows = analyzeDealRows(rawRows, mapping, getDeals());
      } else if (entityType === "tasks") {
        rows = analyzeTaskRows(rawRows, mapping, getTasks());
      } else {
        rows = analyzeRows(rawRows, mapping, getClients());
      }
      setAnalyzed(rows);
      setStep(2);
    } else if (step === 2) {
      setImporting(true);
      setTimeout(() => {
        let res: ImportResult;

        if (entityType === "clients") {
          const { newClients, result: r } = executeImport(analyzed, skipDups);
          if (newClients.length > 0) {
            const existing = getClients().map(normalizeClient);
            saveClients([...newClients.map(normalizeClient), ...existing]);
          }
          res = r;
        } else if (entityType === "deals") {
          const { newDeals, result: r } = executeDealImport(analyzed, skipDups);
          if (newDeals.length > 0) {
            const existing = getDeals();
            saveDeals([...newDeals, ...existing]);
          }
          res = r;
        } else {
          const { newTasks, result: r } = executeTaskImport(analyzed, skipDups);
          if (newTasks.length > 0) {
            const existing = getTasks();
            saveTasks([...newTasks, ...existing]);
          }
          res = r;
        }

        setResult(res);
        onImported(entityType, res);
        setImporting(false);
        setStep(3);
      }, 100);
    }
  }

  function handleBack() {
    if (step > 0 && step < 3) setStep((s) => s - 1);
  }

  function handleReset() {
    setStep(0); setFileName(""); setHeaders([]); setRawRows([]);
    setMapping({}); setAnalyzed([]); setSkipDups(true);
    setResult(null); setParseError(null);
  }

  const willImport = useMemo(() => {
    if (analyzed.length === 0) return 0;
    return analyzed.filter((r) => r.errors.length === 0 && (!r.duplicate || !skipDups)).length;
  }, [analyzed, skipDups]);

  const entityLabel = ENTITY_LABELS[entityType];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 2 && !importing) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center">
              <Upload size={15} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--color-fg)]">Import Data</h2>
              <p className="text-[11px] text-[var(--color-fg-faint)]">
                {step < 3 ? "CSV or Excel · up to 10 MB" : `${ENTITY_META[entityType].label} imported successfully`}
              </p>
            </div>
          </div>
          {step < 3 && (
            <button
              onClick={onClose}
              disabled={importing}
              className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors disabled:opacity-40"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Step indicator */}
        <StepBar step={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 0 && (
            <UploadStep
              entityType={entityType}
              onEntityType={handleEntityType}
              fileName={fileName}
              rowCount={rawRows.length}
              headers={headers}
              parseError={parseError}
              onFile={handleFile}
            />
          )}

          {step === 1 && (
            <MapStep
              fields={fields}
              headers={headers}
              rawRows={rawRows}
              mapping={mapping}
              onChange={handleMappingChange}
            />
          )}

          {step === 2 && (
            <PreviewStep
              entityType={entityType}
              analyzed={analyzed}
              skipDups={skipDups}
              onSkipDupsChange={setSkipDups}
            />
          )}

          {step === 3 && result && (
            <CompleteStep
              entityType={entityType}
              result={result}
              onView={onClose}
              onImportAnother={handleReset}
            />
          )}
        </div>

        {/* Footer nav */}
        {step < 3 && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0 bg-[var(--color-canvas)]">
            {step > 0 ? (
              <button
                onClick={handleBack}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleNext}
              disabled={!canAdvance() || importing}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                step === 2
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white",
              )}
            >
              {importing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Importing…
                </>
              ) : step === 2 ? (
                <>
                  Import {willImport} {entityLabel}{willImport !== 1 ? "s" : ""}
                  <ChevronRight size={14} />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
