import {
  getFavorites,
  getSettings,
  normalizeSettings,
  removeFavorite,
  saveFavorite,
  saveSettings
} from "../shared/storage";
import { SELECTION_TRANSLATE_COMMAND_ID } from "../shared/shortcuts";
import { createTranslator } from "../shared/i18n";
import type {
  ContentMessage,
  ExtensionResponse,
  FullPageTranslationStart,
  PublicSettings,
  RuntimeMessage,
  SelectionTranslationStart,
  Settings,
  UILanguage
} from "../shared/types";
import {
  cancelTranslationRequests,
  translateTexts,
  translateTextsWithSettings
} from "./translator";

const TRANSLATE_RATE_WINDOW_MS = 60_000;
const MAX_TRANSLATE_REQUESTS_PER_WINDOW = 90;
const translateRateBuckets = new Map<string, number[]>();

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender,
    sendResponse: (response: ExtensionResponse<unknown>) => void
  ) => {
    handleMessage(message, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: getResponseError(error, message, sender)
        })
      );
    return true;
  }
);

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab).catch((error) => {
    void showCommandError(tab?.id, error);
  });
});

async function handleMessage(message: RuntimeMessage, sender?: chrome.runtime.MessageSender) {
  switch (message.type) {
    case "GET_SETTINGS": {
      const settings = await getSettings();
      return sender?.tab ? toPublicSettings(settings) : settings;
    }
    case "GET_PUBLIC_SETTINGS":
      return toPublicSettings(await getSettings());
    case "GET_SELECTION_SHORTCUT":
      return getCommandShortcut(SELECTION_TRANSLATE_COMMAND_ID);
    case "SAVE_SETTINGS":
      assertExtensionPageSender(sender);
      return saveSettings(message.payload);
    case "TRANSLATE_TEXTS":
      assertTranslateRateLimit(sender);
      return translateTexts(message.payload);
    case "TEST_TRANSLATION_CONFIG":
      assertExtensionPageSender(sender);
      return translateTextsWithSettings(
        message.payload.request,
        normalizeSettings(message.payload.settings)
      );
    case "CANCEL_TRANSLATION_REQUESTS":
      return cancelTranslationRequests(message.payload.requestPrefix);
    case "GET_FAVORITES":
      assertExtensionPageSender(sender);
      return getFavorites();
    case "SAVE_FAVORITE":
      return saveFavorite(message.payload);
    case "REMOVE_FAVORITE":
      assertExtensionPageSender(sender);
      return removeFavorite(message.payload.favoriteId);
    default:
      throw new Error(createTranslator("system")("error.unknownRuntimeMessage"));
  }
}

function assertExtensionPageSender(sender?: chrome.runtime.MessageSender): void {
  if (sender?.tab) {
    throw new Error(createTranslator("system")("error.unknownRuntimeMessage"));
  }
}

function assertTranslateRateLimit(sender?: chrome.runtime.MessageSender): void {
  if (!sender?.tab?.id) return;
  const now = Date.now();
  const key = `tab:${sender.tab.id}`;
  const bucket = translateRateBuckets
    .get(key)
    ?.filter((time) => now - time < TRANSLATE_RATE_WINDOW_MS) ?? [];
  if (bucket.length >= MAX_TRANSLATE_REQUESTS_PER_WINDOW) {
    throw new Error(createTranslator("system")("content.tooFrequent"));
  }
  bucket.push(now);
  translateRateBuckets.set(key, bucket);
}

function getResponseError(
  error: unknown,
  message: RuntimeMessage,
  sender?: chrome.runtime.MessageSender
): string {
  const t = createTranslator("system");
  if (sender?.tab && message.type === "TRANSLATE_TEXTS") {
    return getSafeContentTranslationError(error, t);
  }
  return error instanceof Error ? error.message : t("error.backgroundFailed");
}

function getSafeContentTranslationError(
  error: unknown,
  t: ReturnType<typeof createTranslator>
): string {
  const raw = error instanceof Error ? error.message : "";
  const safeMessages = new Set([
    t("error.apiKeyMissing"),
    t("error.apiUrlInvalid"),
    t("error.invalidTranslationRequest"),
    t("error.translationRequestTooLarge"),
    t("content.tooFrequent")
  ]);
  return safeMessages.has(raw) ? raw : t("error.translationRequestFailed");
}

async function getCommandShortcut(commandName: string): Promise<string> {
  const commands = await chrome.commands.getAll();
  return commands.find((command) => command.name === commandName)?.shortcut ?? "";
}

async function getCurrentTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  const tabId = tab?.id ?? (await getCurrentTabId());
  if (!tabId) return;

  switch (command) {
    case "translate-selection": {
      const settings = await getSettings();
      const result = await sendContentMessage<SelectionTranslationStart>(
        tabId,
        {
          type: "TRANSLATE_SELECTION",
          payload: {
            targetLanguage: settings.targetLanguage,
            style: settings.style,
            uiLanguage: settings.uiLanguage
          }
        },
        settings.uiLanguage
      );
      if (!result.started) {
        throw new Error(result.message);
      }
      break;
    }
    case "translate-full-page": {
      const settings = await getSettings();
      const result = await sendContentMessage<FullPageTranslationStart>(
        tabId,
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
      if (!result.started) {
        throw new Error(result.message);
      }
      break;
    }
    case "restore-page": {
      const settings = await getSettings();
      await sendContentMessage(
        tabId,
        { type: "RESTORE_PAGE" },
        settings.uiLanguage
      );
      break;
    }
    default:
      break;
  }
}

function sendContentMessage<T>(
  tabId: number,
  message: ContentMessage,
  uiLanguage: UILanguage = "system"
): Promise<T> {
  const t = createTranslator(uiLanguage);
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: ExtensionResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? t("error.pageScriptNoResponse")));
        return;
      }
      resolve(response.data);
    });
  });
}

function toPublicSettings(settings: Settings): PublicSettings {
  return {
    targetLanguage: settings.targetLanguage,
    style: settings.style,
    customStyleName: settings.customStyleName,
    selectionBubbleEnabled: settings.selectionBubbleEnabled,
    uiLanguage: settings.uiLanguage,
    translationAppearance: settings.translationAppearance
  };
}

async function showCommandError(
  tabId: number | undefined,
  error: unknown
): Promise<void> {
  const activeTabId = tabId ?? (await getCurrentTabId());
  if (!activeTabId) return;
  const message =
    error instanceof Error
      ? error.message
      : createTranslator("system")("error.backgroundFailed");

  await chrome.action.setBadgeBackgroundColor({
    tabId: activeTabId,
    color: "#b91c1c"
  });
  await chrome.action.setBadgeText({ tabId: activeTabId, text: "!" });
  await chrome.action.setTitle({ tabId: activeTabId, title: message });
  globalThis.setTimeout(() => {
    void chrome.action.setBadgeText({ tabId: activeTabId, text: "" });
    void chrome.action.setTitle({
      tabId: activeTabId,
      title: chrome.i18n.getMessage("extensionName") || "AI Translate"
    });
  }, 4500);
}
