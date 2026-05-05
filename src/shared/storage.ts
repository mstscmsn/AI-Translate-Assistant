import {
  COMMON_LANGUAGES,
  DEFAULT_CACHE_LIMIT,
  getSystemTargetLanguage,
  STORAGE_KEYS
} from "./constants";
import type {
  FavoriteTranslation,
  PageTranslationRecord,
  Settings,
  TranslationAppearance,
  TranslationStyle,
  UILanguage
} from "./types";

const LEGACY_SETTING_KEYS = [
  "targetLanguage",
  "apiKey",
  "apiBaseUrl",
  "model",
  "style",
  "customStyleName",
  "customStylePrompt",
  "requestTimeoutMs",
  "selectionBubbleEnabled",
  "uiLanguage",
  "translationAppearance"
] as const;
const MAX_FAVORITES = 300;
const MAX_FAVORITE_TEXT_CHARS = 5000;

export const DEFAULT_TRANSLATION_APPEARANCE: TranslationAppearance = {
  textColor: "#0f766e",
  backgroundColor: "#dff5ef",
  borderColor: "#14b8a6",
  borderWidth: 3,
  borderRadius: 4,
  fontSize: 15,
  fontWeight: 500,
  padding: 6,
  opacity: 1,
  layout: "auto"
};

export const DEFAULT_SETTINGS: Settings = {
  targetLanguage: getSystemTargetLanguage(),
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  style: "natural",
  customStyleName: "",
  customStylePrompt: "",
  requestTimeoutMs: 30000,
  selectionBubbleEnabled: true,
  uiLanguage: "system",
  translationAppearance: DEFAULT_TRANSLATION_APPEARANCE
};

function storageGet<T>(keys: string | string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items as T);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

export async function getSettings(): Promise<Settings> {
  const items = await storageGet<Record<string, unknown>>([
    STORAGE_KEYS.settings,
    ...LEGACY_SETTING_KEYS
  ]);
  const saved = isObject(items[STORAGE_KEYS.settings])
    ? (items[STORAGE_KEYS.settings] as Partial<Settings>)
    : getLegacySettings(items);
  const normalized = normalizeSettings(saved);
  const hasLegacySettings = LEGACY_SETTING_KEYS.some((key) => key in items);

  if (!items[STORAGE_KEYS.settings] && Object.keys(saved).length > 0) {
    await storageSet({ [STORAGE_KEYS.settings]: normalized });
  }
  if (hasLegacySettings) {
    await storageRemove([...LEGACY_SETTING_KEYS]);
  }

  return normalized;
}

function getLegacySettings(items: Record<string, unknown>): Partial<Settings> {
  return Object.fromEntries(
    LEGACY_SETTING_KEYS.filter((key) => key in items).map((key) => [key, items[key]])
  ) as Partial<Settings>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveSettings(update: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...update,
    translationAppearance: {
      ...current.translationAppearance,
      ...update.translationAppearance
    }
  });
  await storageSet({ [STORAGE_KEYS.settings]: next });
  return next;
}

export function normalizeSettings(settings: Partial<Settings>): Settings {
  return {
    targetLanguage: normalizeTargetLanguage(settings.targetLanguage),
    apiKey: normalizeString(settings.apiKey) ?? DEFAULT_SETTINGS.apiKey,
    apiBaseUrl: normalizeString(settings.apiBaseUrl) ?? DEFAULT_SETTINGS.apiBaseUrl,
    model: normalizeString(settings.model) ?? DEFAULT_SETTINGS.model,
    style: normalizeTranslationStyle(settings.style),
    customStyleName:
      normalizeOptionalString(settings.customStyleName) ??
      DEFAULT_SETTINGS.customStyleName,
    customStylePrompt:
      normalizeOptionalString(settings.customStylePrompt) ??
      DEFAULT_SETTINGS.customStylePrompt,
    requestTimeoutMs: clampNumber(
      settings.requestTimeoutMs,
      5000,
      120000,
      DEFAULT_SETTINGS.requestTimeoutMs
    ),
    selectionBubbleEnabled:
      typeof settings.selectionBubbleEnabled === "boolean"
        ? settings.selectionBubbleEnabled
        : DEFAULT_SETTINGS.selectionBubbleEnabled,
    uiLanguage: normalizeUILanguage(settings.uiLanguage),
    translationAppearance: normalizeTranslationAppearance(
      settings.translationAppearance
    )
  };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeTargetLanguage(language: unknown): string {
  const normalized = normalizeString(language);
  return normalized && COMMON_LANGUAGES.includes(normalized as typeof COMMON_LANGUAGES[number])
    ? normalized
    : getSystemTargetLanguage();
}

function normalizeTranslationStyle(style: unknown): TranslationStyle {
  return style === "accurate" ||
    style === "academic" ||
    style === "casual" ||
    style === "natural" ||
    style === "custom"
    ? style
    : DEFAULT_SETTINGS.style;
}

function normalizeUILanguage(language: unknown): UILanguage {
  return language === "zh-CN" ||
    language === "zh-TW" ||
    language === "en-US" ||
    language === "ja-JP" ||
    language === "ko-KR" ||
    language === "fr-FR" ||
    language === "de-DE" ||
    language === "es-ES" ||
    language === "it-IT" ||
    language === "pt-BR" ||
    language === "ru-RU" ||
    language === "system"
    ? language
    : DEFAULT_SETTINGS.uiLanguage;
}

function normalizeTranslationAppearance(
  appearance: Partial<TranslationAppearance> | undefined
): TranslationAppearance {
  return {
    ...DEFAULT_TRANSLATION_APPEARANCE,
    ...(appearance ?? {}),
    borderWidth: clampNumber(appearance?.borderWidth, 0, 10, DEFAULT_TRANSLATION_APPEARANCE.borderWidth),
    borderRadius: clampNumber(appearance?.borderRadius, 0, 24, DEFAULT_TRANSLATION_APPEARANCE.borderRadius),
    fontSize: clampNumber(appearance?.fontSize, 10, 28, DEFAULT_TRANSLATION_APPEARANCE.fontSize),
    fontWeight: clampNumber(appearance?.fontWeight, 300, 900, DEFAULT_TRANSLATION_APPEARANCE.fontWeight),
    padding: clampNumber(appearance?.padding, 0, 20, DEFAULT_TRANSLATION_APPEARANCE.padding),
    opacity: clampNumber(appearance?.opacity, 0.2, 1, DEFAULT_TRANSLATION_APPEARANCE.opacity),
    layout:
      appearance?.layout === "block" || appearance?.layout === "inline"
        ? appearance.layout
        : "auto"
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export async function getFavorites(): Promise<FavoriteTranslation[]> {
  const items = await storageGet<Record<string, unknown>>(
    STORAGE_KEYS.favorites
  );
  const raw = items[STORAGE_KEYS.favorites];
  return Array.isArray(raw)
    ? raw
        .map((item) => normalizeFavorite(item))
        .filter((item): item is FavoriteTranslation => item !== null)
    : [];
}

export async function saveFavorite(
  record: Omit<FavoriteTranslation, "favoriteId">
): Promise<FavoriteTranslation[]> {
  const normalizedRecord = normalizePageTranslationRecord(record);
  if (!normalizedRecord) {
    throw new Error("Invalid favorite record.");
  }
  const favorites = await getFavorites();
  const favorite: FavoriteTranslation = {
    ...normalizedRecord,
    favoriteId: `${normalizedRecord.id}-${Date.now().toString(36)}`
  };
  const withoutDuplicate = favorites.filter(
    (item) =>
      item.original !== normalizedRecord.original ||
      item.translation !== normalizedRecord.translation ||
      item.pageUrl !== normalizedRecord.pageUrl
  );
  const next = [favorite, ...withoutDuplicate].slice(0, MAX_FAVORITES);
  await storageSet({ [STORAGE_KEYS.favorites]: next });
  return next;
}

export async function removeFavorite(favoriteId: string): Promise<FavoriteTranslation[]> {
  const favorites = await getFavorites();
  const normalizedId = normalizeString(favoriteId);
  const next = normalizedId
    ? favorites.filter((item) => item.favoriteId !== normalizedId)
    : favorites;
  await storageSet({ [STORAGE_KEYS.favorites]: next });
  return next;
}

export async function getTranslationCache(): Promise<Record<string, string>> {
  const items = await storageGet<Record<string, unknown>>(
    STORAGE_KEYS.translationCache
  );
  return normalizeTranslationCache(items[STORAGE_KEYS.translationCache]);
}

export async function setTranslationCache(
  cache: Record<string, string>,
  limit = DEFAULT_CACHE_LIMIT
): Promise<void> {
  const entries = Object.entries(normalizeTranslationCache(cache));
  const trimmed =
    entries.length <= limit
      ? Object.fromEntries(entries)
      : Object.fromEntries(entries.slice(entries.length - limit));
  await storageSet({ [STORAGE_KEYS.translationCache]: trimmed });
}

function normalizeFavorite(value: unknown): FavoriteTranslation | null {
  if (!isObject(value)) return null;
  const record = normalizePageTranslationRecord(value);
  const favoriteId = normalizeString(value.favoriteId);
  return record && favoriteId ? { ...record, favoriteId } : null;
}

function normalizePageTranslationRecord(
  value: unknown
): PageTranslationRecord | null {
  if (!isObject(value)) return null;
  const id = normalizeString(value.id);
  const original = normalizeBoundedString(value.original, MAX_FAVORITE_TEXT_CHARS);
  const translation = normalizeBoundedString(
    value.translation,
    MAX_FAVORITE_TEXT_CHARS
  );
  const targetLanguage = normalizeTargetLanguage(value.targetLanguage);
  const pageUrl = normalizeBoundedString(value.pageUrl, 2048);
  const mode = value.mode === "selection" || value.mode === "full-page"
    ? value.mode
    : null;
  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();

  if (!id || !original || !translation || !targetLanguage || !pageUrl || !mode) {
    return null;
  }

  return {
    id,
    original,
    translation,
    targetLanguage,
    pageUrl,
    mode,
    createdAt
  };
}

function normalizeBoundedString(
  value: unknown,
  maxLength: number
): string | undefined {
  const normalized = normalizeString(value);
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function normalizeTranslationCache(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const next: Record<string, string> = {};
  Object.entries(value).forEach(([key, translation]) => {
    if (typeof key === "string" && typeof translation === "string") {
      next[key] = translation;
    }
  });
  return next;
}
