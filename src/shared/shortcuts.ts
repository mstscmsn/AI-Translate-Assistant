export const SHORTCUTS_PAGE_URL = "chrome://extensions/shortcuts";
export const SELECTION_TRANSLATE_COMMAND_ID = "translate-selection";
export const DEFAULT_SELECTION_SHORTCUT = "Alt+Shift+T";

export const COMMAND_DEFINITIONS = [
  {
    id: SELECTION_TRANSLATE_COMMAND_ID,
    label: "Translate Selection",
    description: "Translate selected page text with a shortcut."
  },
  {
    id: "translate-full-page",
    label: "Translate Page",
    description: "Bilingually translate visible text on the current page."
  },
  {
    id: "restore-page",
    label: "Restore Page",
    description: "Remove translations and extension markers."
  }
] as const;

export type ShortcutCommandId = (typeof COMMAND_DEFINITIONS)[number]["id"];
