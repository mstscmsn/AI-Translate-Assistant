import type { ExtensionResponse, UILanguage } from "./types";
import { createTranslator } from "./i18n";

export function sendRuntimeMessage<T>(
  message: unknown,
  uiLanguage: UILanguage = "system"
): Promise<T> {
  const t = createTranslator(uiLanguage);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ExtensionResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response) {
        reject(new Error(t("error.runtimeNoResponse")));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

export async function sendMessageToActiveTab<T>(
  message: unknown,
  uiLanguage: UILanguage = "system"
): Promise<T> {
  const t = createTranslator(uiLanguage);
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error(t("error.activeTabMissing"));
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id!, message, (response: ExtensionResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response) {
        reject(new Error(t("error.contentNoResponseRefresh")));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

export async function openExtensionOptionsPage(): Promise<void> {
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    });
  }
}
