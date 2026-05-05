import type { ExtensionResponse, UILanguage } from "./types";
import { createTranslator } from "./i18n";

type ChromeCallback<T> = (result: T) => void;

function chromeCallback<T>(
  executor: (callback: ChromeCallback<T>) => Promise<T> | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (result: T) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    try {
      const maybePromise = executor((result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          settleReject(new Error(error.message));
          return;
        }
        settleResolve(result);
      });
      if (isPromiseLike<T>(maybePromise)) {
        maybePromise.then(settleResolve).catch(settleReject);
      }
    } catch (error) {
      settleReject(error);
    }
  });
}

function chromeVoidCallback(
  executor: (callback: () => void) => Promise<void> | void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    try {
      const maybePromise = executor(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          settleReject(new Error(error.message));
          return;
        }
        settleResolve();
      });
      if (isPromiseLike<void>(maybePromise)) {
        maybePromise.then(settleResolve).catch(settleReject);
      }
    } catch (error) {
      settleReject(error);
    }
  });
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

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
  const tabs = await queryTabs({ active: true, currentWindow: true });
  return tabs[0];
}

export function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return chromeCallback((callback) => chrome.tabs.query(queryInfo, callback));
}

export function createTab(createProperties: chrome.tabs.CreateProperties) {
  return chromeCallback<chrome.tabs.Tab>((callback) =>
    chrome.tabs.create(createProperties, callback)
  );
}

export function getAllCommands(): Promise<chrome.commands.Command[]> {
  if (!chrome.commands?.getAll) return Promise.resolve([]);
  return chromeCallback((callback) => chrome.commands.getAll(callback));
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
    if (!chrome.runtime.openOptionsPage) {
      throw new Error("Options page API is unavailable.");
    }
    await chromeVoidCallback((callback) => chrome.runtime.openOptionsPage(callback));
  } catch {
    await createTab({
      url: chrome.runtime.getURL("options.html")
    });
  }
}

export function setActionBadgeBackgroundColor(
  details: chrome.action.BadgeBackgroundColorDetails
): Promise<void> {
  if (!chrome.action?.setBadgeBackgroundColor) return Promise.resolve();
  return chromeVoidCallback((callback) =>
    chrome.action.setBadgeBackgroundColor(details, callback)
  );
}

export function setActionBadgeText(details: chrome.action.BadgeTextDetails): Promise<void> {
  if (!chrome.action?.setBadgeText) return Promise.resolve();
  return chromeVoidCallback((callback) => chrome.action.setBadgeText(details, callback));
}

export function setActionTitle(details: chrome.action.TitleDetails): Promise<void> {
  if (!chrome.action?.setTitle) return Promise.resolve();
  return chromeVoidCallback((callback) => chrome.action.setTitle(details, callback));
}
