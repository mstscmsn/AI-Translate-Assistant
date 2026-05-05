import {
  Eye,
  EyeOff,
  Keyboard,
  KeyRound,
  Languages,
  Save,
  Send,
  SlidersHorizontal
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { COMMON_LANGUAGES } from "../shared/constants";
import { sendRuntimeMessage } from "../shared/chrome";
import { COMMAND_DEFINITIONS, SHORTCUTS_PAGE_URL } from "../shared/shortcuts";
import {
  createTranslator,
  getShortcutText,
  getTranslationStyleOptions,
  getUILanguageOptions,
  type TranslationKey
} from "../shared/i18n";
import {
  DEFAULT_TRANSLATION_APPEARANCE,
  getSettings,
  saveSettings
} from "../shared/storage";
import type {
  Settings,
  TranslationAppearance,
  TranslationResponse,
  TranslationStyle,
  UILanguage
} from "../shared/types";

type StatusTone = "neutral" | "success" | "error" | "loading" | "info";
type StatusState = {
  key?: TranslationKey;
  values?: Record<string, string | number>;
  templateNameKey?: TranslationKey;
  message?: string;
  tone: StatusTone;
};

const APPEARANCE_TEMPLATES: Array<{
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  appearance: TranslationAppearance;
}> = [
  {
    nameKey: "template.default.name",
    descriptionKey: "template.default.description",
    appearance: DEFAULT_TRANSLATION_APPEARANCE
  },
  {
    nameKey: "template.blue.name",
    descriptionKey: "template.blue.description",
    appearance: {
      textColor: "#1d4ed8",
      backgroundColor: "#eff6ff",
      borderColor: "#60a5fa",
      borderWidth: 3,
      borderRadius: 5,
      fontSize: 15,
      fontWeight: 500,
      padding: 6,
      opacity: 1,
      layout: "auto"
    }
  },
  {
    nameKey: "template.amber.name",
    descriptionKey: "template.amber.description",
    appearance: {
      textColor: "#8a4b05",
      backgroundColor: "#fff7ed",
      borderColor: "#f59e0b",
      borderWidth: 3,
      borderRadius: 6,
      fontSize: 15,
      fontWeight: 600,
      padding: 6,
      opacity: 1,
      layout: "auto"
    }
  },
  {
    nameKey: "template.purple.name",
    descriptionKey: "template.purple.description",
    appearance: {
      textColor: "#6d28d9",
      backgroundColor: "#f5f3ff",
      borderColor: "#a78bfa",
      borderWidth: 3,
      borderRadius: 6,
      fontSize: 15,
      fontWeight: 600,
      padding: 6,
      opacity: 1,
      layout: "auto"
    }
  },
  {
    nameKey: "template.dark.name",
    descriptionKey: "template.dark.description",
    appearance: {
      textColor: "#d1fae5",
      backgroundColor: "#0f2f2b",
      borderColor: "#34d399",
      borderWidth: 3,
      borderRadius: 6,
      fontSize: 15,
      fontWeight: 500,
      padding: 7,
      opacity: 0.96,
      layout: "auto"
    }
  },
  {
    nameKey: "template.gray.name",
    descriptionKey: "template.gray.description",
    appearance: {
      textColor: "#334155",
      backgroundColor: "#f8fafc",
      borderColor: "#94a3b8",
      borderWidth: 2,
      borderRadius: 4,
      fontSize: 15,
      fontWeight: 500,
      padding: 5,
      opacity: 1,
      layout: "auto"
    }
  }
];

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    key: "options.statusInitial",
    tone: "neutral"
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = createTranslator(settings?.uiLanguage ?? "system");

  useEffect(() => {
    void getSettings().then((nextSettings) => {
      setSettings(nextSettings);
    });
    void refreshCommands();
  }, []);

  useEffect(() => {
    setStatus((current) =>
      current.message ? { key: "options.statusInitial", tone: "neutral" } : current
    );
  }, [settings?.uiLanguage]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setStatus({ key: "options.saving", tone: "loading" });
    try {
      const next = await saveSettings(settings);
      setSettings(next);
      setStatus({
        key: "options.saved",
        tone: "success"
      });
    } catch (error) {
      setStatus({
        ...(error instanceof Error
          ? { message: error.message }
          : { key: "options.saveFailed" as const }),
        tone: "error"
      });
    } finally {
      setSaving(false);
    }
  }

  async function testTranslation() {
    if (!settings) return;
    setTesting(true);
    setStatus({ key: "options.testingApi", tone: "loading" });
    try {
      const response = await sendRuntimeMessage<TranslationResponse>(
        {
          type: "TEST_TRANSLATION_CONFIG",
          payload: {
            settings,
            request: {
              texts: ["Hello, this is a quick translation test."],
              targetLanguage: settings.targetLanguage,
              style: settings.style,
              pageUrl: "options",
              mode: "selection",
              forceRefresh: true
            }
          }
        },
        settings.uiLanguage
      );
      setStatus({
        key: "options.testSucceeded",
        values: {
          translation: response.translations[0] ?? ""
        },
        tone: "success"
      });
    } catch (error) {
      setStatus({
        ...(error instanceof Error
          ? { message: error.message }
          : { key: "options.testFailed" as const }),
        tone: "error"
      });
    } finally {
      setTesting(false);
    }
  }

  async function refreshCommands() {
    if (!chrome.commands?.getAll) return;
    const next = await chrome.commands.getAll();
    setCommands(next);
  }

  async function openShortcutSettings() {
    try {
      await chrome.tabs.create({ url: SHORTCUTS_PAGE_URL });
    } catch {
      setStatus({
        key: "options.shortcutOpenFailed",
        tone: "error"
      });
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  }

  function updateAppearance<K extends keyof TranslationAppearance>(
    key: K,
    value: TranslationAppearance[K]
  ) {
    if (!settings) return;
    setSettings({
      ...settings,
      translationAppearance: {
        ...settings.translationAppearance,
        [key]: value
      }
    });
  }

  function resetAppearance() {
    if (!settings) return;
    setSettings({
      ...settings,
      translationAppearance: DEFAULT_TRANSLATION_APPEARANCE
    });
    setStatus({
      key: "options.resetAppearanceStatus",
      tone: "info"
    });
  }

  function applyAppearanceTemplate(
    appearance: TranslationAppearance,
    nameKey: TranslationKey
  ) {
    if (!settings) return;
    setSettings({
      ...settings,
      translationAppearance: {
        ...appearance
      }
    });
    setStatus({
      key: "options.templateApplied",
      templateNameKey: nameKey,
      tone: "info"
    });
  }

  if (!settings) {
    return <main className="options-shell">{t("common.loading")}</main>;
  }

  return (
    <main className="options-shell">
      <header>
        <p className="eyebrow">AI Translate</p>
        <h1>{t("options.title")}</h1>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="section-band">
          <div className="section-title">
            <Languages size={19} />
            <h2>{t("options.translationPreferences")}</h2>
          </div>
          <label>
            {t("options.uiLanguage")}
            <select
              value={settings.uiLanguage}
              onChange={(event) =>
                update("uiLanguage", event.target.value as UILanguage)
              }
            >
              {getUILanguageOptions(t).map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("options.targetLanguage")}
            <select
              value={settings.targetLanguage}
              onChange={(event) => update("targetLanguage", event.target.value)}
            >
              {COMMON_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("options.translationStyle")}
            <select
              value={settings.style}
              onChange={(event) =>
                update("style", event.target.value as TranslationStyle)
              }
            >
              {getTranslationStyleOptions(t, settings).map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label} - {style.description}
                </option>
              ))}
            </select>
          </label>

          {settings.style === "custom" ? (
            <div className="custom-style-grid">
              <label>
                {t("options.customStyleName")}
                <input
                  value={settings.customStyleName}
                  onChange={(event) =>
                    update("customStyleName", event.target.value)
                  }
                />
              </label>
              <label>
                {t("options.customStylePrompt")}
                <textarea
                  value={settings.customStylePrompt}
                  placeholder={t("options.customStylePlaceholder")}
                  onChange={(event) =>
                    update("customStylePrompt", event.target.value)
                  }
                />
              </label>
            </div>
          ) : null}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.selectionBubbleEnabled}
              onChange={(event) =>
                update("selectionBubbleEnabled", event.target.checked)
              }
            />
            <div>
              <strong>{t("options.selectionBubbleTitle")}</strong>
              <span>{t("options.selectionBubbleDescription")}</span>
            </div>
          </label>
        </section>

        <section className="section-band">
          <div className="section-title">
            <SlidersHorizontal size={19} />
            <h2>{t("options.appearance")}</h2>
          </div>
          <div className="template-grid" aria-label={t("options.colorTemplates")}>
            {APPEARANCE_TEMPLATES.map((template) => {
              const name = t(template.nameKey);
              return (
                <button
                  key={template.nameKey}
                  type="button"
                  className="template-button"
                  onClick={() =>
                    applyAppearanceTemplate(template.appearance, template.nameKey)
                  }
                >
                  <span
                    className="template-swatch"
                    style={getTemplateSwatchStyle(template.appearance)}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>{t(template.descriptionKey)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="appearance-grid">
            <label>
              {t("options.textColor")}
              <input
                type="color"
                value={settings.translationAppearance.textColor}
                onChange={(event) =>
                  updateAppearance("textColor", event.target.value)
                }
              />
            </label>
            <label>
              {t("options.backgroundColor")}
              <input
                type="color"
                value={settings.translationAppearance.backgroundColor}
                onChange={(event) =>
                  updateAppearance("backgroundColor", event.target.value)
                }
              />
            </label>
            <label>
              {t("options.borderColor")}
              <input
                type="color"
                value={settings.translationAppearance.borderColor}
                onChange={(event) =>
                  updateAppearance("borderColor", event.target.value)
                }
              />
            </label>
            <label>
              {t("options.layout")}
              <select
                value={settings.translationAppearance.layout}
                onChange={(event) =>
                  updateAppearance(
                    "layout",
                    event.target.value as TranslationAppearance["layout"]
                  )
                }
              >
                <option value="auto">{t("options.layoutAuto")}</option>
                <option value="block">{t("options.layoutBlock")}</option>
                <option value="inline">{t("options.layoutInline")}</option>
              </select>
            </label>
            <label>
              {t("options.fontSize")}
              <input
                type="number"
                min={10}
                max={28}
                value={settings.translationAppearance.fontSize}
                onChange={(event) =>
                  updateAppearance("fontSize", Number(event.target.value))
                }
              />
            </label>
            <label>
              {t("options.fontWeight")}
              <select
                value={settings.translationAppearance.fontWeight}
                onChange={(event) =>
                  updateAppearance("fontWeight", Number(event.target.value))
                }
              >
                <option value={400}>{t("options.fontWeightRegular")}</option>
                <option value={500}>{t("options.fontWeightMedium")}</option>
                <option value={600}>{t("options.fontWeightSemibold")}</option>
                <option value={700}>{t("options.fontWeightBold")}</option>
              </select>
            </label>
            <label>
              {t("options.borderWidth")}
              <input
                type="number"
                min={0}
                max={10}
                value={settings.translationAppearance.borderWidth}
                onChange={(event) =>
                  updateAppearance("borderWidth", Number(event.target.value))
                }
              />
            </label>
            <label>
              {t("options.borderRadius")}
              <input
                type="number"
                min={0}
                max={24}
                value={settings.translationAppearance.borderRadius}
                onChange={(event) =>
                  updateAppearance("borderRadius", Number(event.target.value))
                }
              />
            </label>
            <label>
              {t("options.padding")}
              <input
                type="number"
                min={0}
                max={20}
                value={settings.translationAppearance.padding}
                onChange={(event) =>
                  updateAppearance("padding", Number(event.target.value))
                }
              />
            </label>
            <label>
              {t("options.opacity")}
              <div className="range-row">
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={settings.translationAppearance.opacity}
                  onChange={(event) =>
                    updateAppearance("opacity", Number(event.target.value))
                  }
                />
                <span>{Math.round(settings.translationAppearance.opacity * 100)}%</span>
              </div>
            </label>
          </div>
          <div className="appearance-preview">
            <span>{t("options.previewTitle")}</span>
            <p style={getPreviewStyle(settings.translationAppearance)}>
              {t("options.previewText")}
            </p>
          </div>
          <button type="button" className="shortcut-button" onClick={resetAppearance}>
            {t("options.resetAppearance")}
          </button>
        </section>

        <section className="section-band">
          <div className="section-title">
            <KeyRound size={19} />
            <h2>{t("options.api")}</h2>
          </div>
          <label>
            {t("options.apiKey")}
            <div className="key-row">
              <input
                type={showKey ? "text" : "password"}
                value={settings.apiKey}
                placeholder="sk-..."
                onChange={(event) => update("apiKey", event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                title={showKey ? t("options.hideApiKey") : t("options.showApiKey")}
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label>
            {t("options.apiBaseUrl")}
            <input
              value={settings.apiBaseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => update("apiBaseUrl", event.target.value)}
            />
          </label>

          <label>
            {t("options.model")}
            <input
              value={settings.model}
              placeholder="gpt-4o-mini"
              onChange={(event) => update("model", event.target.value)}
            />
          </label>

          <label>
            {t("options.timeout")}
            <div className="timeout-row">
              <input
                type="number"
                min={5000}
                step={1000}
                value={settings.requestTimeoutMs}
                onChange={(event) =>
                  update("requestTimeoutMs", Number(event.target.value))
                }
              />
              <span>{t("options.milliseconds")}</span>
            </div>
          </label>
        </section>

        <section className="section-band">
          <div className="section-title">
            <Keyboard size={19} />
            <h2>{t("options.shortcutSection")}</h2>
          </div>
          <div className="shortcut-list">
            {COMMAND_DEFINITIONS.map((definition) => {
              const command = commands.find((item) => item.name === definition.id);
              return (
                <div className="shortcut-row" key={definition.id}>
                  <div>
                    <strong>{getShortcutText(definition.id, "label", t)}</strong>
                    <span>{getShortcutText(definition.id, "description", t)}</span>
                  </div>
                  <kbd>{command?.shortcut || t("options.unset")}</kbd>
                </div>
              );
            })}
          </div>
          <button type="button" className="shortcut-button" onClick={openShortcutSettings}>
            <Keyboard size={17} />
            {t("options.customizeShortcuts")}
          </button>
        </section>

        <footer className="actions">
          <p className={`status-message ${status.tone}`} role="status">
            {getStatusText(status, t)}
          </p>
          <div>
            <button type="button" onClick={testTranslation} disabled={testing}>
              <Send size={17} />
              {testing ? t("options.testing") : t("options.test")}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              <Save size={17} />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </footer>
      </form>

      <aside className="note">
        <SlidersHorizontal size={17} />
        {t("options.note")}
      </aside>
    </main>
  );
}

function getPreviewStyle(appearance: TranslationAppearance) {
  return {
    color: appearance.textColor,
    backgroundColor: appearance.backgroundColor,
    borderLeft: `${appearance.borderWidth}px solid ${appearance.borderColor}`,
    borderRadius: `${appearance.borderRadius}px`,
    fontSize: `${appearance.fontSize}px`,
    fontWeight: appearance.fontWeight,
    padding: `${appearance.padding}px`,
    opacity: appearance.opacity
  };
}

function getTemplateSwatchStyle(appearance: TranslationAppearance) {
  return {
    color: appearance.textColor,
    backgroundColor: appearance.backgroundColor,
    borderColor: appearance.borderColor
  };
}

function getStatusText(
  status: StatusState,
  t: ReturnType<typeof createTranslator>
) {
  if (!status.key) return status.message ?? "";
  const values = status.templateNameKey
    ? { ...status.values, name: t(status.templateNameKey) }
    : status.values;
  return t(status.key, values);
}
