export interface HighlightColor {
  id: string;
  name: string;
  class: string;
  color: string;
  bg: string;
}

export interface RainbowHighlightSettings {
  enabledColorIds: string[];
  autoOpenPalette: boolean;
  popupDelay: number;
  hasSeenWelcome: boolean;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: "red", name: "Red", class: "hl-red", color: "#991b1b", bg: "#ef4444" },
  { id: "orange", name: "Orange", class: "hl-orange", color: "#9a3412", bg: "#fb923c" },
  { id: "yellow", name: "Yellow", class: "hl-yellow", color: "#946800", bg: "#facc15" },
  { id: "green", name: "Green", class: "hl-green", color: "#166534", bg: "#4ade80" },
  { id: "cyan", name: "Cyan", class: "hl-cyan", color: "#155e75", bg: "#22d3ee" },
  { id: "blue", name: "Blue", class: "hl-blue", color: "#1e40af", bg: "#60a5fa" },
  { id: "purple", name: "Purple", class: "hl-purple", color: "#5b21b6", bg: "#a78bfa" },
];

export const DEFAULT_SETTINGS: RainbowHighlightSettings = {
  enabledColorIds: HIGHLIGHT_COLORS.map((color) => color.id),
  autoOpenPalette: true,
  popupDelay: 40,
  hasSeenWelcome: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Normalize data from disk so upgrades and hand-edited settings cannot leave
 * the palette empty or put event scheduling outside a sensible range. */
export function normalizeSettings(raw: unknown): RainbowHighlightSettings {
  const data = isRecord(raw) ? raw : {};
  const validIds = new Set(HIGHLIGHT_COLORS.map((color) => color.id));
  const enabledColorIds = Array.isArray(data.enabledColorIds)
    ? Array.from(new Set(
        data.enabledColorIds.filter(
          (id): id is string => typeof id === "string" && validIds.has(id)
        )
      ))
    : [];
  const savedDelay = typeof data.popupDelay === "number" && Number.isFinite(data.popupDelay)
    ? Math.round(data.popupDelay)
    : DEFAULT_SETTINGS.popupDelay;

  return {
    enabledColorIds: enabledColorIds.length > 0
      ? enabledColorIds
      : [...DEFAULT_SETTINGS.enabledColorIds],
    autoOpenPalette: typeof data.autoOpenPalette === "boolean"
      ? data.autoOpenPalette
      : DEFAULT_SETTINGS.autoOpenPalette,
    popupDelay: Math.max(0, Math.min(200, savedDelay)),
    hasSeenWelcome: typeof data.hasSeenWelcome === "boolean"
      ? data.hasSeenWelcome
      : DEFAULT_SETTINGS.hasSeenWelcome,
  };
}

export function getEnabledHighlightColors(
  settings: RainbowHighlightSettings
): HighlightColor[] {
  const enabled = new Set(settings.enabledColorIds);
  return HIGHLIGHT_COLORS.filter((color) => enabled.has(color.id));
}
