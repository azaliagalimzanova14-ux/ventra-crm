/**
 * Shared UI constants.
 * Single source of truth — import from here, never re-define inline.
 */

/**
 * Avatar gradient pairs, cycled by index.
 * Usage: `AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]`
 */
export const AVATAR_GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-blue-500 to-cyan-600",
  "from-purple-500 to-fuchsia-600",
] as const;
