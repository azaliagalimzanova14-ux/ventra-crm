import {
  Bookmark, Star, Heart, Flag, Package, Globe, Layers, Database,
  FileText, Link2, Target, Wrench, Calendar, Code2, CreditCard,
  Hash, Inbox, Map, Tag, Zap,
} from "lucide-react";
import type { CustomModuleIconKey } from "./types";

export const CUSTOM_MODULE_ICON_MAP: Record<CustomModuleIconKey, React.ElementType> = {
  bookmark:      Bookmark,
  star:          Star,
  heart:         Heart,
  flag:          Flag,
  package:       Package,
  globe:         Globe,
  layers:        Layers,
  database:      Database,
  "file-text":   FileText,
  link:          Link2,
  target:        Target,
  wrench:        Wrench,
  calendar:      Calendar,
  code:          Code2,
  "credit-card": CreditCard,
  hash:          Hash,
  inbox:         Inbox,
  map:           Map,
  tag:           Tag,
  zap:           Zap,
};

export const CUSTOM_MODULE_ICON_KEYS: CustomModuleIconKey[] = [
  "bookmark", "star", "heart", "flag",
  "package", "globe", "layers", "database",
  "file-text", "link", "target", "wrench",
  "calendar", "code", "credit-card", "hash",
  "inbox", "map", "tag", "zap",
];

export function getCustomModuleIcon(key: CustomModuleIconKey): React.ElementType {
  return CUSTOM_MODULE_ICON_MAP[key] ?? Package;
}
