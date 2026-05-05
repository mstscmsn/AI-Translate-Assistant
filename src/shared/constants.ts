import type { PresetTranslationStyle } from "./types";

export const STORAGE_KEYS = {
  settings: "aiTranslate.settings",
  favorites: "aiTranslate.favorites",
  translationCache: "aiTranslate.translationCache"
} as const;

export const COMMON_LANGUAGES = [
  "中文",
  "English",
  "日本語",
  "한국어",
  "Français",
  "Deutsch",
  "Español",
  "Italiano",
  "Português",
  "Русский"
] as const;

export const TRANSLATION_STYLE_OPTIONS: Array<{
  value: PresetTranslationStyle;
  promptInstruction: string;
}> = [
  {
    value: "natural",
    promptInstruction: "Use fluent, natural wording that reads like native writing."
  },
  {
    value: "accurate",
    promptInstruction: "Prioritize faithfulness to the source meaning and terminology."
  },
  {
    value: "academic",
    promptInstruction: "Use formal, rigorous academic wording."
  },
  {
    value: "casual",
    promptInstruction: "Use relaxed, direct, conversational wording."
  }
];

export function getSystemTargetLanguage(): string {
  const language = getSystemLanguageCode();
  if (language.startsWith("zh")) return "中文";
  if (language.startsWith("ja")) return "日本語";
  if (language.startsWith("ko")) return "한국어";
  if (language.startsWith("fr")) return "Français";
  if (language.startsWith("de")) return "Deutsch";
  if (language.startsWith("es")) return "Español";
  if (language.startsWith("it")) return "Italiano";
  if (language.startsWith("pt")) return "Português";
  if (language.startsWith("ru")) return "Русский";
  return "English";
}

function getSystemLanguageCode(): string {
  try {
    return chrome.i18n?.getUILanguage?.() || navigator.language || "en-US";
  } catch {
    return navigator.language || "en-US";
  }
}

export const DEFAULT_CACHE_LIMIT = 240;
