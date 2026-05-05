export type PresetTranslationStyle = "natural" | "accurate" | "academic" | "casual";

export type TranslationStyle = PresetTranslationStyle | "custom";

export type UILanguage =
  | "system"
  | "zh-CN"
  | "zh-TW"
  | "en-US"
  | "ja-JP"
  | "ko-KR"
  | "fr-FR"
  | "de-DE"
  | "es-ES"
  | "it-IT"
  | "pt-BR"
  | "ru-RU";

export type TranslationLayout = "auto" | "block" | "inline";

export interface TranslationAppearance {
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  fontSize: number;
  fontWeight: number;
  padding: number;
  opacity: number;
  layout: TranslationLayout;
}

export type TranslationTriggerMode = "selection" | "full-page";

export interface Settings {
  targetLanguage: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  style: TranslationStyle;
  customStyleName: string;
  customStylePrompt: string;
  requestTimeoutMs: number;
  selectionBubbleEnabled: boolean;
  uiLanguage: UILanguage;
  translationAppearance: TranslationAppearance;
}

export type PublicSettings = Pick<
  Settings,
  | "targetLanguage"
  | "style"
  | "customStyleName"
  | "selectionBubbleEnabled"
  | "uiLanguage"
  | "translationAppearance"
>;

export interface TranslationRequest {
  texts: string[];
  targetLanguage?: string;
  style?: TranslationStyle;
  pageUrl?: string;
  mode: TranslationTriggerMode;
  forceRefresh?: boolean;
  requestId?: string;
}

export interface TranslationResponse {
  translations: string[];
  cached: boolean;
}

export interface PageTranslationRecord {
  id: string;
  original: string;
  translation: string;
  targetLanguage: string;
  pageUrl: string;
  mode: TranslationTriggerMode;
  createdAt: number;
}

export interface FavoriteTranslation extends PageTranslationRecord {
  favoriteId: string;
}

export interface FullPageTranslationStart {
  started: boolean;
  total: number;
  message: string;
}

export interface SelectionTranslationStart {
  started: boolean;
  message: string;
}

export interface ContentTranslationState {
  isTranslating: boolean;
  total: number;
  translated: number;
  errorKey?: string;
  error?: string;
  records: PageTranslationRecord[];
}

export type ExtensionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RuntimeMessage =
  | { type: "GET_SETTINGS" }
  | { type: "GET_PUBLIC_SETTINGS" }
  | { type: "GET_SELECTION_SHORTCUT" }
  | { type: "SAVE_SETTINGS"; payload: Partial<Settings> }
  | { type: "TRANSLATE_TEXTS"; payload: TranslationRequest }
  | {
      type: "TEST_TRANSLATION_CONFIG";
      payload: { settings: Partial<Settings>; request: TranslationRequest };
    }
  | { type: "CANCEL_TRANSLATION_REQUESTS"; payload: { requestPrefix: string } }
  | { type: "SAVE_FAVORITE"; payload: PageTranslationRecord }
  | { type: "GET_FAVORITES" }
  | { type: "REMOVE_FAVORITE"; payload: { favoriteId: string } };

export type ContentMessage =
  | {
      type: "TRANSLATE_SELECTION";
      payload: {
        targetLanguage: string;
        style: TranslationStyle;
        uiLanguage?: UILanguage;
        forceRefresh?: boolean;
      };
    }
  | {
      type: "TRANSLATE_FULL_PAGE";
      payload: {
        targetLanguage: string;
        style: TranslationStyle;
        uiLanguage?: UILanguage;
        translationAppearance?: TranslationAppearance;
      };
    }
  | { type: "RESTORE_PAGE" }
  | { type: "GET_TRANSLATION_STATE" };
