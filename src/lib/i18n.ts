/**
 * i18n type exports.
 *
 * All translation strings live in /locales/en.json and /locales/ru.json.
 * TKey is derived from the English locale file so TypeScript catches
 * missing keys at compile time.
 *
 * To add a new language:
 *   1. Add a JSON file in /locales/<code>.json with all TKey values.
 *   2. Add the code to the Lang union below.
 *   3. Import and register the file in language-context.tsx.
 */

import enMessages from "../../locales/en.json";

export type Lang = "ru" | "en";
export type TKey = keyof typeof enMessages;
