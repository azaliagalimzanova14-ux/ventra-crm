import type { Client, ClientStatus, Deal, DealStage, Task, TaskPriority, TaskStatus } from "./types";

// ── Entity types ───────────────────────────────────────────────────────────────

export type ImportEntityType = "clients" | "deals" | "tasks";

// ── Shared field definition ────────────────────────────────────────────────────

export interface ImportField {
  key:         string;
  label:       string;
  required:    boolean;
  description: string;
}

// ── Client fields ──────────────────────────────────────────────────────────────

export type ImportFieldKey =
  | "name" | "company" | "email" | "phone"
  | "status" | "location" | "industry"
  | "totalValue" | "tags" | "lastContact" | "joinedAt";

export const IMPORT_FIELDS: ImportField[] = [
  { key: "name",        label: "Name",         required: true,  description: "Contact full name"              },
  { key: "company",     label: "Company",      required: true,  description: "Company or organization"       },
  { key: "email",       label: "Email",        required: false, description: "Email address"                 },
  { key: "phone",       label: "Phone",        required: false, description: "Phone or mobile number"        },
  { key: "status",      label: "Status",       required: false, description: "active · inactive · lead · churned" },
  { key: "location",    label: "Location",     required: false, description: "City, region, or country"      },
  { key: "industry",    label: "Industry",     required: false, description: "Business sector or vertical"   },
  { key: "totalValue",  label: "Total Value",  required: false, description: "Revenue or contract value ($)" },
  { key: "tags",        label: "Tags",         required: false, description: "Comma-separated labels"        },
  { key: "lastContact", label: "Last Contact", required: false, description: "Date of most recent contact"   },
  { key: "joinedAt",    label: "Date Added",   required: false, description: "When this client was added"    },
];

// ── Deal fields ────────────────────────────────────────────────────────────────

export type DealImportFieldKey =
  | "title" | "clientName" | "value" | "stage"
  | "probability" | "expectedClose" | "owner";

export const DEAL_IMPORT_FIELDS: ImportField[] = [
  { key: "title",         label: "Deal Name",    required: true,  description: "Deal or opportunity title"                },
  { key: "clientName",    label: "Client",       required: true,  description: "Client or company name"                  },
  { key: "value",         label: "Value ($)",    required: true,  description: "Deal value in dollars"                   },
  { key: "stage",         label: "Stage",        required: false, description: "lead · qualified · proposal · negotiation · closed_won · closed_lost" },
  { key: "probability",   label: "Probability",  required: false, description: "Win probability 0–100 (or e.g. 75%)"     },
  { key: "expectedClose", label: "Close Date",   required: false, description: "Expected closing date"                   },
  { key: "owner",         label: "Owner",        required: false, description: "Sales rep or account owner"              },
];

// ── Task fields ────────────────────────────────────────────────────────────────

export type TaskImportFieldKey =
  | "title" | "clientName" | "priority" | "dueDate"
  | "status" | "assignee" | "projectName" | "description" | "tags";

export const TASK_IMPORT_FIELDS: ImportField[] = [
  { key: "title",       label: "Task Title",  required: true,  description: "Task name or summary"                    },
  { key: "clientName",  label: "Client",      required: true,  description: "Linked client or company"               },
  { key: "priority",    label: "Priority",    required: false, description: "low · medium · high · urgent"           },
  { key: "dueDate",     label: "Due Date",    required: false, description: "Task deadline"                          },
  { key: "status",      label: "Status",      required: false, description: "todo · in_progress · done · cancelled"  },
  { key: "assignee",    label: "Assignee",    required: false, description: "Person responsible for this task"       },
  { key: "projectName", label: "Project",     required: false, description: "Associated project name"               },
  { key: "description", label: "Description", required: false, description: "Task details or notes"                  },
  { key: "tags",        label: "Tags",        required: false, description: "Comma-separated labels"                 },
];

// ── ParsedRow — shared shape for all entity types ──────────────────────────────

export interface ParsedRow {
  index:        number;
  raw:          Record<string, string>;
  mapped:       Partial<Record<string, string>>;
  errors:       string[];
  duplicate:    boolean;
  duplicateOf?: string;
}

export interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   number;
}

// ── Column auto-detection ──────────────────────────────────────────────────────

const CLIENT_ALIASES: Record<ImportFieldKey, string[]> = {
  name:        ["name", "full name", "fullname", "contact", "contact name", "client name", "person", "first name", "client"],
  company:     ["company", "organization", "org", "account", "firm", "business", "employer", "company name", "account name"],
  email:       ["email", "email address", "e-mail", "mail", "e mail"],
  phone:       ["phone", "phone number", "mobile", "cell", "telephone", "tel", "mobile number", "cell phone"],
  status:      ["status", "client status", "account type", "stage", "type"],
  location:    ["location", "city", "address", "region", "country", "state", "area"],
  industry:    ["industry", "sector", "vertical", "niche", "business type", "market"],
  totalValue:  ["value", "total value", "revenue", "ltv", "lifetime value", "arr", "mrr", "amount", "contract value", "deal value"],
  tags:        ["tags", "labels", "categories", "category", "keywords", "segments", "tag"],
  lastContact: ["last contact", "last contacted", "last activity", "last seen", "last touch", "recent contact"],
  joinedAt:    ["joined", "joined at", "date added", "created at", "created", "start date", "since", "customer since", "join date"],
};

const DEAL_ALIASES: Record<DealImportFieldKey, string[]> = {
  title:         ["deal name", "deal title", "title", "name", "opportunity", "opportunity name", "deal"],
  clientName:    ["client", "client name", "company", "account", "organization", "customer"],
  value:         ["value", "deal value", "amount", "revenue", "price", "arr", "mrr", "contract value", "total"],
  stage:         ["stage", "deal stage", "pipeline stage", "phase", "step"],
  probability:   ["probability", "win probability", "win rate", "chance", "likelihood", "%", "prob", "close rate"],
  expectedClose: ["close date", "expected close", "expected close date", "closing date", "close", "target date", "deadline", "due date"],
  owner:         ["owner", "assigned to", "rep", "sales rep", "account owner", "ae", "salesperson", "responsible"],
};

const TASK_ALIASES: Record<TaskImportFieldKey, string[]> = {
  title:       ["title", "task", "task name", "task title", "name", "summary", "subject"],
  clientName:  ["client", "client name", "company", "account", "organization", "customer"],
  priority:    ["priority", "task priority", "importance", "urgency", "level"],
  dueDate:     ["due date", "due", "deadline", "target date", "complete by", "finish by", "due by"],
  status:      ["status", "task status", "state", "progress", "completion"],
  assignee:    ["assignee", "assigned to", "owner", "person", "responsible", "handled by", "assigned"],
  projectName: ["project", "project name", "epic", "initiative", "category"],
  description: ["description", "notes", "details", "body", "note", "comment", "comments"],
  tags:        ["tags", "labels", "categories", "category", "keywords", "tag"],
};

function buildAutoDetect<K extends string>(
  aliases: Record<K, string[]>,
): (headers: string[]) => Record<string, K | null> {
  return (headers) => {
    const result: Record<string, K | null> = {};
    const used = new Set<K>();

    for (const header of headers) {
      const normalized = header.toLowerCase().replace(/[_\-.]/g, " ").trim();
      let matched: K | null = null;

      for (const [field, aliasList] of Object.entries(aliases) as [K, string[]][]) {
        if (!used.has(field) && aliasList.includes(normalized)) {
          matched = field;
          used.add(field);
          break;
        }
      }
      result[header] = matched;
    }
    return result;
  };
}

export const autoDetectMappings      = buildAutoDetect(CLIENT_ALIASES);
export const autoDetectDealMappings  = buildAutoDetect(DEAL_ALIASES);
export const autoDetectTaskMappings  = buildAutoDetect(TASK_ALIASES);

/** Return the auto-detect function for an entity type */
export function getAutoDetect(type: ImportEntityType) {
  if (type === "deals") return autoDetectDealMappings;
  if (type === "tasks") return autoDetectTaskMappings;
  return autoDetectMappings;
}

/** Return the field definitions for an entity type */
export function getImportFields(type: ImportEntityType): ImportField[] {
  if (type === "deals") return DEAL_IMPORT_FIELDS;
  if (type === "tasks") return TASK_IMPORT_FIELDS;
  return IMPORT_FIELDS;
}

// ── CSV parser ─────────────────────────────────────────────────────────────────

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^﻿/, "");

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let inQ   = false;

    for (let i = 0; i < line.length; i++) {
      const ch   = line[i];
      const next = line[i + 1];
      if (ch === '"') {
        if (inQ && next === '"') { field += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  const lines: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < src.length; i++) {
    const ch   = src[i];
    const next = src[i + 1];
    if (ch === '"') {
      if (inQ && next === '"') { cur += '""'; i++; }
      else { inQ = !inQ; cur += ch; }
    } else if ((ch === "\n" || (ch === "\r" && next === "\n")) && !inQ) {
      if (ch === "\r") i++;
      lines.push(cur);
      cur = "";
    } else if (ch === "\r" && !inQ) {
      lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) lines.push(cur);

  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(nonEmpty[0]).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = nonEmpty
    .slice(1)
    .map((line) => {
      const fields = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (fields[i] ?? "").replace(/^"|"$/g, "").trim(); });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));

  return { headers, rows };
}

// ── Self-contained XLSX parser (no npm deps) ───────────────────────────────────

function u32le(b: Uint8Array, o: number): number {
  return (b[o] + b[o + 1] * 256 + b[o + 2] * 65536 + b[o + 3] * 16777216) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o] + b[o + 1] * 256;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds     = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total  = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

export async function parseXLSX(
  buffer: ArrayBuffer,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const bytes = new Uint8Array(buffer);
  const dec   = new TextDecoder();

  const EOCD_SIG = 0x06054b50;
  let eocdOff = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32le(bytes, i) === EOCD_SIG) { eocdOff = i; break; }
  }
  if (eocdOff === -1) throw new Error("Not a valid ZIP / XLSX file");

  const cdCount  = u16le(bytes, eocdOff + 10);
  const cdOffset = u32le(bytes, eocdOff + 16);

  type ZipEntry = { localOffset: number; method: number; compSize: number };
  const files = new Map<string, ZipEntry>();
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (u32le(bytes, pos) !== 0x02014b50) break;
    const method   = u16le(bytes, pos + 10);
    const compSize = u32le(bytes, pos + 20);
    const nameLen  = u16le(bytes, pos + 28);
    const extraLen = u16le(bytes, pos + 30);
    const commLen  = u16le(bytes, pos + 32);
    const localOff = u32le(bytes, pos + 42);
    const name     = dec.decode(bytes.slice(pos + 46, pos + 46 + nameLen));
    files.set(name, { localOffset: localOff, method, compSize });
    pos += 46 + nameLen + extraLen + commLen;
  }

  async function readEntry(name: string): Promise<string | null> {
    const e = files.get(name);
    if (!e) return null;
    const lp        = e.localOffset;
    if (u32le(bytes, lp) !== 0x04034b50) return null;
    const lNameLen  = u16le(bytes, lp + 26);
    const lExtraLen = u16le(bytes, lp + 28);
    const dataStart = lp + 30 + lNameLen + lExtraLen;
    const raw       = bytes.slice(dataStart, dataStart + e.compSize);
    if (e.method === 0) return dec.decode(raw);
    if (e.method === 8) return dec.decode(await inflateRaw(raw));
    throw new Error(`Unsupported compression method: ${e.method}`);
  }

  const ssXML = await readEntry("xl/sharedStrings.xml");
  const ss: string[] = [];
  if (ssXML) {
    const doc = new DOMParser().parseFromString(ssXML, "application/xml");
    doc.querySelectorAll("si").forEach((si) => {
      const ts = si.querySelectorAll("t");
      ss.push(Array.from(ts).map((t) => t.textContent ?? "").join(""));
    });
  }

  let sheetFile = "xl/worksheets/sheet1.xml";
  const wbXML = await readEntry("xl/workbook.xml");
  if (wbXML) {
    const wbDoc = new DOMParser().parseFromString(wbXML, "application/xml");
    const sheets = wbDoc.querySelectorAll("sheet");
    if (sheets.length > 0) {
      const rId     = sheets[0].getAttribute("r:id") ?? "";
      const relsXML = await readEntry("xl/_rels/workbook.xml.rels");
      if (relsXML) {
        const rDoc = new DOMParser().parseFromString(relsXML, "application/xml");
        rDoc.querySelectorAll("Relationship").forEach((rel) => {
          if (rel.getAttribute("Id") === rId) {
            const target = rel.getAttribute("Target") ?? "";
            sheetFile = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
          }
        });
      }
    }
  }

  const sheetXML = await readEntry(sheetFile);
  if (!sheetXML) throw new Error("Worksheet not found in XLSX file");

  const shDoc = new DOMParser().parseFromString(sheetXML, "application/xml");

  function colIndex(ref: string): number {
    const letters = ref.replace(/\d/g, "");
    let idx = 0;
    for (let i = 0; i < letters.length; i++) idx = idx * 26 + (letters.charCodeAt(i) - 64);
    return idx - 1;
  }

  const grid: string[][] = [];
  shDoc.querySelectorAll("row").forEach((rowEl) => {
    const rowIdx = parseInt(rowEl.getAttribute("r") ?? "1", 10) - 1;
    const cells: Record<number, string> = {};
    let maxCol = 0;
    rowEl.querySelectorAll("c").forEach((c) => {
      const ref  = c.getAttribute("r") ?? "";
      const col  = colIndex(ref);
      const t    = c.getAttribute("t") ?? "";
      const v    = c.querySelector("v")?.textContent ?? "";
      const iStr = c.querySelector("is t")?.textContent;
      let value: string;
      if      (t === "s")         value = ss[parseInt(v, 10)] ?? "";
      else if (t === "str")       value = c.querySelector("v")?.textContent ?? "";
      else if (t === "inlineStr") value = iStr ?? v;
      else if (t === "b")         value = v === "1" ? "TRUE" : "FALSE";
      else                        value = v;
      cells[col] = value;
      maxCol = Math.max(maxCol, col);
    });
    const row: string[] = [];
    for (let i = 0; i <= maxCol; i++) row[i] = cells[i] ?? "";
    grid[rowIdx] = row;
  });

  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = (grid[0] ?? []).map((h) => String(h).trim());
  const rows = grid
    .slice(1)
    .filter(Boolean)
    .map((rowArr) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = String(rowArr[i] ?? "").trim(); });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));

  return { headers, rows };
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function applyMapping(
  raw:     Record<string, string>,
  mapping: Record<string, string | null>,
): Partial<Record<string, string>> {
  const mapped: Partial<Record<string, string>> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (field && raw[col] !== undefined) mapped[field] = raw[col];
  }
  return mapped;
}

function parseDate(s: string | undefined): string {
  const today = new Date().toISOString().split("T")[0];
  if (!s) return today;
  const d = new Date(s);
  return isNaN(d.getTime()) ? today : d.toISOString().split("T")[0];
}

function parseTags(s: string | undefined): string[] {
  return s ? s.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : [];
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
}

// ── Client analysis + import ───────────────────────────────────────────────────

export function analyzeRows(
  rows:            Record<string, string>[],
  mapping:         Record<string, string | null>,
  existingClients: Client[],
): ParsedRow[] {
  const byEmail       = new Map<string, string>();
  const byNameCompany = new Map<string, string>();

  for (const c of existingClients) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    byNameCompany.set(`${c.name.toLowerCase()}|||${c.company.toLowerCase()}`, c.id);
  }

  return rows.map((raw, index) => {
    const mapped = applyMapping(raw, mapping);
    const errors: string[] = [];
    if (!mapped["name"]?.trim())    errors.push("Name is required");
    if (!mapped["company"]?.trim()) errors.push("Company is required");
    if (mapped["email"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped["email"].trim())) {
      errors.push("Invalid email format");
    }

    let duplicate   = false;
    let duplicateOf: string | undefined;
    const email = mapped["email"]?.trim().toLowerCase();
    if (email) {
      const id = byEmail.get(email);
      if (id) { duplicate = true; duplicateOf = id; }
    }
    if (!duplicate && mapped["name"] && mapped["company"]) {
      const key = `${mapped["name"].trim().toLowerCase()}|||${mapped["company"].trim().toLowerCase()}`;
      const id  = byNameCompany.get(key);
      if (id) { duplicate = true; duplicateOf = id; }
    }

    return { index, raw, mapped, errors, duplicate, duplicateOf };
  });
}

export function buildClient(row: ParsedRow): Client {
  const { mapped } = row;
  const name = (mapped["name"] ?? "").trim();

  let status: ClientStatus = "lead";
  const s = (mapped["status"] ?? "").toLowerCase().trim();
  if (s === "active" || s === "inactive" || s === "lead" || s === "churned") status = s;

  let totalValue = 0;
  const tv = mapped["totalValue"];
  if (tv) {
    const n = parseFloat(tv.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(n)) totalValue = n;
  }

  return {
    id:           `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    company:      (mapped["company"] ?? "").trim(),
    email:        (mapped["email"]   ?? "").trim(),
    phone:        (mapped["phone"]   ?? "").trim(),
    avatar:       initials(name),
    status,
    totalValue,
    projectCount: 0,
    location:     (mapped["location"] ?? "").trim(),
    industry:     (mapped["industry"] ?? "").trim(),
    joinedAt:     parseDate(mapped["joinedAt"]),
    lastContact:  parseDate(mapped["lastContact"]),
    tags:         parseTags(mapped["tags"]),
  };
}

export function executeImport(
  rows:     ParsedRow[],
  skipDups: boolean,
): { newClients: Client[]; result: ImportResult } {
  const newClients: Client[] = [];
  let imported = 0, skipped = 0, errors = 0;
  for (const row of rows) {
    if (row.errors.length > 0)     { errors++;  continue; }
    if (row.duplicate && skipDups) { skipped++; continue; }
    newClients.push(buildClient(row));
    imported++;
  }
  return { newClients, result: { imported, skipped, errors } };
}

// ── Deal analysis + import ─────────────────────────────────────────────────────

const STAGE_MAP: Record<string, DealStage> = {
  "lead":          "lead",  "new":            "lead",  "inquiry":      "lead",
  "qualified":     "qualified",               "qualifying":   "qualified",  "prospect": "qualified",
  "proposal":      "proposal",               "quote":         "proposal",  "offer":    "proposal",  "proposal sent": "proposal",
  "negotiation":   "negotiation",            "negotiating":   "negotiation", "contract": "negotiation", "in negotiation": "negotiation",
  "closed won":    "closed_won",             "won":           "closed_won",  "win":      "closed_won",  "closed_won":   "closed_won",
  "closed-won":    "closed_won",
  "closed lost":   "closed_lost",            "lost":          "closed_lost", "lose":     "closed_lost", "closed_lost":  "closed_lost",
  "closed-lost":   "closed_lost",            "disqualified":  "closed_lost",
};

function normalizeStage(raw: string | undefined): DealStage {
  if (!raw) return "lead";
  const norm = raw.toLowerCase().trim().replace(/_/g, " ");
  return STAGE_MAP[norm] ?? "lead";
}

function normalizeProbability(raw: string | undefined): number {
  if (!raw) return 50;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function analyzeDealRows(
  rows:          Record<string, string>[],
  mapping:       Record<string, string | null>,
  existingDeals: Deal[],
): ParsedRow[] {
  const byTitleClient = new Map<string, string>();
  for (const d of existingDeals) {
    byTitleClient.set(`${d.title.toLowerCase()}|||${d.clientName.toLowerCase()}`, d.id);
  }

  return rows.map((raw, index) => {
    const mapped = applyMapping(raw, mapping);
    const errors: string[] = [];
    if (!mapped["title"]?.trim())      errors.push("Deal Name is required");
    if (!mapped["clientName"]?.trim()) errors.push("Client is required");
    if (!mapped["value"]?.trim())      errors.push("Value is required");

    let duplicate   = false;
    let duplicateOf: string | undefined;
    if (mapped["title"] && mapped["clientName"]) {
      const key = `${mapped["title"].trim().toLowerCase()}|||${mapped["clientName"].trim().toLowerCase()}`;
      const id  = byTitleClient.get(key);
      if (id) { duplicate = true; duplicateOf = id; }
    }

    return { index, raw, mapped, errors, duplicate, duplicateOf };
  });
}

export function buildDeal(row: ParsedRow): Deal {
  const { mapped } = row;
  const title      = (mapped["title"]      ?? "").trim();
  const clientName = (mapped["clientName"] ?? "").trim();

  let value = 0;
  const v   = mapped["value"];
  if (v) {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(n)) value = n;
  }

  return {
    id:            `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    clientName,
    clientAvatar:  initials(clientName),
    stage:         normalizeStage(mapped["stage"]),
    value,
    probability:   normalizeProbability(mapped["probability"]),
    expectedClose: parseDate(mapped["expectedClose"]),
    owner:         (mapped["owner"] ?? "").trim(),
  };
}

export function executeDealImport(
  rows:     ParsedRow[],
  skipDups: boolean,
): { newDeals: Deal[]; result: ImportResult } {
  const newDeals: Deal[] = [];
  let imported = 0, skipped = 0, errors = 0;
  for (const row of rows) {
    if (row.errors.length > 0)     { errors++;  continue; }
    if (row.duplicate && skipDups) { skipped++; continue; }
    newDeals.push(buildDeal(row));
    imported++;
  }
  return { newDeals, result: { imported, skipped, errors } };
}

// ── Task analysis + import ─────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, TaskPriority> = {
  "low":          "low",  "minor":    "low",  "nice to have": "low",
  "medium":       "medium", "normal": "medium", "moderate": "medium", "med": "medium", "standard": "medium",
  "high":         "high", "important": "high", "major":   "high",   "hi": "high",
  "urgent":       "urgent", "critical": "urgent", "asap":  "urgent", "blocker": "urgent",
  "immediate":    "urgent", "p0":       "urgent", "p1":    "urgent",
};

const STATUS_MAP: Record<string, TaskStatus> = {
  "todo":         "todo",  "to do":      "todo",  "to-do":        "todo",
  "open":         "todo",  "not started":"todo",  "new":          "todo",
  "in_progress":  "in_progress", "in progress": "in_progress", "in-progress": "in_progress",
  "doing":        "in_progress", "active":      "in_progress", "working":     "in_progress", "started": "in_progress",
  "done":         "done",  "completed":  "done",  "complete":     "done",
  "finished":     "done",  "closed":     "done",  "resolved":     "done",
  "cancelled":    "cancelled", "canceled": "cancelled", "skipped": "cancelled", "won't do": "cancelled",
};

function normalizePriority(raw: string | undefined): TaskPriority {
  if (!raw) return "medium";
  return PRIORITY_MAP[raw.toLowerCase().trim()] ?? "medium";
}

function normalizeTaskStatus(raw: string | undefined): TaskStatus {
  if (!raw) return "todo";
  return STATUS_MAP[raw.toLowerCase().trim()] ?? "todo";
}

export function analyzeTaskRows(
  rows:          Record<string, string>[],
  mapping:       Record<string, string | null>,
  existingTasks: Task[],
): ParsedRow[] {
  const byTitleClient = new Map<string, string>();
  for (const t of existingTasks) {
    byTitleClient.set(`${t.title.toLowerCase()}|||${t.clientName.toLowerCase()}`, t.id);
  }

  return rows.map((raw, index) => {
    const mapped = applyMapping(raw, mapping);
    const errors: string[] = [];
    if (!mapped["title"]?.trim())      errors.push("Task Title is required");
    if (!mapped["clientName"]?.trim()) errors.push("Client is required");

    let duplicate   = false;
    let duplicateOf: string | undefined;
    if (mapped["title"] && mapped["clientName"]) {
      const key = `${mapped["title"].trim().toLowerCase()}|||${mapped["clientName"].trim().toLowerCase()}`;
      const id  = byTitleClient.get(key);
      if (id) { duplicate = true; duplicateOf = id; }
    }

    return { index, raw, mapped, errors, duplicate, duplicateOf };
  });
}

export function buildTask(row: ParsedRow): Task {
  const { mapped } = row;
  const title      = (mapped["title"]      ?? "").trim();
  const clientName = (mapped["clientName"] ?? "").trim();
  const assignee   = (mapped["assignee"]   ?? "").trim();

  return {
    id:             `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    description:    (mapped["description"] ?? "").trim(),
    projectId:      "",
    projectName:    (mapped["projectName"] ?? "").trim(),
    clientName,
    assignee,
    assigneeAvatar: initials(assignee),
    status:         normalizeTaskStatus(mapped["status"]),
    priority:       normalizePriority(mapped["priority"]),
    dueDate:        parseDate(mapped["dueDate"]),
    createdAt:      new Date().toISOString().split("T")[0],
    tags:           parseTags(mapped["tags"]),
  };
}

export function executeTaskImport(
  rows:     ParsedRow[],
  skipDups: boolean,
): { newTasks: Task[]; result: ImportResult } {
  const newTasks: Task[] = [];
  let imported = 0, skipped = 0, errors = 0;
  for (const row of rows) {
    if (row.errors.length > 0)     { errors++;  continue; }
    if (row.duplicate && skipDups) { skipped++; continue; }
    newTasks.push(buildTask(row));
    imported++;
  }
  return { newTasks, result: { imported, skipped, errors } };
}

// ── CSV template download ──────────────────────────────────────────────────────

const TEMPLATES: Record<ImportEntityType, { fields: ImportField[]; example: string[] }> = {
  clients: {
    fields:  IMPORT_FIELDS,
    example: ["Sarah Chen","Apex Digital","sarah@apex.com","+1 555-0100","active","New York","Technology","12000","enterprise,vip","2026-06-15","2025-01-01"],
  },
  deals: {
    fields:  DEAL_IMPORT_FIELDS,
    example: ["Q3 Platform Expansion","Apex Digital","48000","proposal","70","2026-09-30","Jane Smith"],
  },
  tasks: {
    fields:  TASK_IMPORT_FIELDS,
    example: ["Send revised proposal","Apex Digital","urgent","2026-07-10","todo","Jane Smith","CRM Integration","Follow up on Q3 proposal feedback","proposal,follow-up"],
  },
};

export function downloadCSVTemplate(type: ImportEntityType = "clients"): void {
  const { fields, example } = TEMPLATES[type];
  const headers = fields.map((f) => f.label).join(",");
  const csv     = `${headers}\n${example.join(",")}\n`;
  const blob    = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `ventra-${type}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
