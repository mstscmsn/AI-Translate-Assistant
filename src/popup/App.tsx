import {
  BookOpen,
  Languages,
  Keyboard,
  RotateCcw,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COMMON_LANGUAGES } from "../shared/constants";
import { SHORTCUTS_PAGE_URL } from "../shared/shortcuts";
import {
  createTab,
  getActiveTab,
  openExtensionOptionsPage,
  sendMessageToActiveTab
} from "../shared/chrome";
import {
  createTranslator,
  getTranslationStyleOptions,
  type TranslationKey,
  type Translator
} from "../shared/i18n";
import { getSettings, saveSettings } from "../shared/storage";
import type {
  ContentTranslationState,
  FullPageTranslationStart,
  Settings as SettingsShape,
  TranslationStyle
} from "../shared/types";

type StatusState = {
  key?: TranslationKey;
  values?: Record<string, string | number>;
  message?: string;
};

export function App() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageState, setPageState] = useState<ContentTranslationState | null>(null);
  const settingsRef = useRef<SettingsShape | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void getSettings().then((nextSettings) => {
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
    });
    void refreshPageState();
  }, []);

  const t = createTranslator(settings?.uiLanguage ?? "system");

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPageState(settings?.uiLanguage ?? "system");
    }, 1200);
    return () => window.clearInterval(timer);
  }, [settings?.uiLanguage]);

  useEffect(() => {
    setStatus((current) => (current?.message ? null : current));
    setPageState((current) =>
      current?.error ? { ...current, error: undefined } : current
    );
  }, [settings?.uiLanguage]);

  async function refreshPageState(
    uiLanguage: SettingsShape["uiLanguage"] = settings?.uiLanguage ?? "system"
  ) {
    try {
      const state = await sendMessageToActiveTab<ContentTranslationState>(
        {
          type: "GET_TRANSLATION_STATE"
        },
        uiLanguage
      );
      setPageState(state);
    } catch {
      setPageState(null);
    }
  }

  async function updateTargetLanguage(targetLanguage: string) {
    queueSettingsSave({ targetLanguage });
  }

  async function updateTranslationStyle(style: TranslationStyle) {
    queueSettingsSave({ style });
  }

  function queueSettingsSave(update: Partial<SettingsShape>) {
    const current = settingsRef.current;
    if (!current) return;
    const optimistic = { ...current, ...update };
    settingsRef.current = optimistic;
    setSettings(optimistic);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const latest = settingsRef.current;
        if (!latest) return;
        const saved = await saveSettings(latest);
        settingsRef.current = saved;
        setSettings(saved);
      });
    void saveQueueRef.current.catch((error) => {
      setStatus(
        error instanceof Error
          ? { message: error.message }
          : { key: "popup.fullPageFailed" }
      );
    });
  }

  async function translateFullPage() {
    if (!settings) return;
    setBusy(true);
    setStatus({ key: "popup.startingFullPage" });
    try {
      const result = await sendMessageToActiveTab<FullPageTranslationStart>(
        {
          type: "TRANSLATE_FULL_PAGE",
          payload: {
            targetLanguage: settings.targetLanguage,
            style: settings.style,
            uiLanguage: settings.uiLanguage,
            translationAppearance: settings.translationAppearance
          }
        },
        settings.uiLanguage
      );
      setStatus(
        result.started
          ? { key: "popup.fullPageStarted", values: { count: result.total } }
          : result.total > 0
            ? { key: "popup.alreadyTranslating" }
            : { key: "popup.noNewText" }
      );
      await refreshPageState(settings.uiLanguage);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? { message: error.message }
          : { key: "popup.fullPageFailed" }
      );
    } finally {
      setBusy(false);
    }
  }

  async function restorePage() {
    setBusy(true);
    setStatus({ key: "popup.restoring" });
    try {
      const state = await sendMessageToActiveTab<ContentTranslationState>(
        {
          type: "RESTORE_PAGE"
        },
        settings?.uiLanguage ?? "system"
      );
      setPageState(state);
      setStatus({ key: "popup.restored" });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? { message: error.message }
          : { key: "popup.restoreFailed" }
      );
    } finally {
      setBusy(false);
    }
  }

  async function openOptionsPage() {
    try {
      await openExtensionOptionsPage();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? { message: error.message }
          : { key: "popup.fullPageFailed" }
      );
    }
  }

  async function openShortcutSettings() {
    try {
      await createTab({ url: SHORTCUTS_PAGE_URL });
    } catch {
      setStatus({ key: "popup.shortcutOpenFailed" });
    }
  }

  if (!settings) {
    return <main className="popup-shell">{t("common.loading")}</main>;
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">AI Translate</p>
          <h1>{t("popup.title")}</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          title={t("popup.openSettings")}
          onClick={openOptionsPage}
        >
          <Settings size={18} />
        </button>
      </header>

      <section className="control-group">
        <label htmlFor="target-language">
          <Languages size={16} />
          {t("popup.targetLanguage")}
        </label>
        <select
          id="target-language"
          value={settings.targetLanguage}
          onChange={(event) => void updateTargetLanguage(event.target.value)}
        >
          {COMMON_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </section>

      <section className="control-group">
        <label htmlFor="translation-style">
          <SlidersHorizontal size={16} />
          {t("popup.translationStyle")}
        </label>
        <select
          id="translation-style"
          value={settings.style}
          onChange={(event) =>
            void updateTranslationStyle(event.target.value as TranslationStyle)
          }
        >
          {getTranslationStyleOptions(t, settings).map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </section>

      {pageState?.isTranslating ? (
        <div className="progress">
          <div
            style={{
              width: `${Math.max(
                8,
                Math.round((pageState.translated / Math.max(pageState.total, 1)) * 100)
              )}%`
            }}
          />
          <span>
            {t("popup.progress", {
              done: pageState.translated,
              total: pageState.total
            })}
          </span>
        </div>
      ) : null}

      {pageState?.errorKey || pageState?.error || status ? (
        <section className="popup-status">
          {getPageErrorText(pageState, t) ?? getStatusText(status, t)}
        </section>
      ) : null}

      <button
        className="primary-button"
        type="button"
        disabled={busy}
        onClick={translateFullPage}
      >
        <BookOpen size={18} />
        {t("popup.fullPageTranslate")}
      </button>

      <div className="button-grid">
        <button type="button" onClick={restorePage} disabled={busy}>
          <RotateCcw size={17} />
          {t("popup.restorePage")}
        </button>
        <button type="button" onClick={openShortcutSettings}>
          <Keyboard size={17} />
          {t("popup.openShortcuts")}
        </button>
      </div>

      <ActiveTabHint />
    </main>
  );
}

function getStatusText(status: StatusState | null, t: Translator): string {
  if (!status) return "";
  if (status.key) return t(status.key, status.values);
  return status.message ?? "";
}

function getPageErrorText(
  state: ContentTranslationState | null,
  t: Translator
): string | null {
  if (!state) return null;
  if (state.errorKey) return t(state.errorKey as TranslationKey);
  return state.error ?? null;
}

function ActiveTabHint() {
  const [host, setHost] = useState("");

  useEffect(() => {
    void getActiveTab().then((tab) => {
      if (!tab?.url) return;
      try {
        setHost(new URL(tab.url).host);
      } catch {
        setHost(tab.title ?? "");
      }
    });
  }, []);

  return host ? <footer className="active-tab">{host}</footer> : null;
}
