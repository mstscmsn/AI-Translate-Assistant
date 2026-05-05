import {
  createTranslator,
  type TranslationKey,
  type Translator
} from "../shared/i18n";
import type {
  ExtensionResponse,
  PageTranslationRecord,
  PublicSettings,
  SelectionTranslationStart,
  TranslationAppearance,
  TranslationResponse,
  TranslationStyle,
  UILanguage
} from "../shared/types";

type Settings = Pick<PublicSettings, "targetLanguage" | "style" | "uiLanguage"> &
  Partial<PublicSettings>;

interface FullPageEntry {
  id: string;
  original: string;
  translation: string;
  sourceNode: Text | null;
  translationElement: HTMLElement | null;
  targetLanguage: string;
  createdAt: number;
}

const PREFIX = "ai-translate-extension";
const STYLE_ID = `${PREFIX}-style`;
const BUBBLE_ID = `${PREFIX}-selection-bubble`;
const DATA_ROOT = "data-ai-translate-extension-root";
const DATA_ORIGINAL = "data-ai-translate-extension-original";
const DATA_TRANSLATION = "data-ai-translate-extension-translation";
const DATA_RECORD_ID = "data-ai-translate-extension-record-id";
const TRANSLATION_CSS_VARS = [
  `--${PREFIX}-translation-color`,
  `--${PREFIX}-translation-bg`,
  `--${PREFIX}-translation-border-color`,
  `--${PREFIX}-translation-border-width`,
  `--${PREFIX}-translation-radius`,
  `--${PREFIX}-translation-font-size`,
  `--${PREFIX}-translation-font-weight`,
  `--${PREFIX}-translation-padding`,
  `--${PREFIX}-translation-opacity`
];
const DEFAULT_TRANSLATION_APPEARANCE: TranslationAppearance = {
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
const LOADING_STATE = "__AI_TRANSLATE_LOADING__";
const MAX_TEXT_NODES = 800;
const MAX_FULL_PAGE_TEXT_CHARS = 2000;
const MAX_BATCH_CHARS = 3200;
const MAX_BATCH_ITEMS = 16;
const MIN_SELECTION_CHARS = 2;
const MAX_SELECTION_CHARS = 1800;
const SELECTION_TRANSLATION_COOLDOWN_MS = 2500;
const INLINE_TRANSLATION_MAX_CHARS = 24;
const BUBBLE_WIDTH = 344;
const BUBBLE_ESTIMATED_HEIGHT = 220;
const FALLBACK_SHORTCUTS = {
  translateSelection: new Set(["alt+shift+t", "ctrl+shift+y", "meta+shift+y"]),
  translateFullPage: new Set(["alt+shift+f", "ctrl+shift+u", "meta+shift+u"]),
  restorePage: new Set(["alt+shift+r", "ctrl+shift+e", "meta+shift+e"])
};
const EDITABLE_SELECTOR =
  "input, textarea, select, option, [role='textbox'], [contenteditable]:not([contenteditable='false'])";
const UNSAFE_TRANSLATION_SELECTOR = [
  DATA_ROOT,
  DATA_ORIGINAL,
  DATA_TRANSLATION
].map((attribute) => `[${attribute}]`).join(", ");
const NON_TRANSLATABLE_SELECTOR = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "option",
  "svg",
  "canvas",
  "iframe",
  "button",
  "a",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[onclick]"
].join(", ");

const entries = new Map<string, FullPageEntry>();
let sequence = 0;
let isTranslating = false;
let totalForCurrentRun = 0;
let translatedForCurrentRun = 0;
let currentError: string | undefined;
let currentErrorKey: TranslationKey | undefined;
let activeBubble: HTMLElement | null = null;
let lastSelectionTranslationAt = 0;
let currentAppearance: TranslationAppearance = DEFAULT_TRANSLATION_APPEARANCE;
let activeFullPageRunId = 0;
let activeFullPageRequestPrefix: string | null = null;
let translatedTextNodes = new WeakMap<Text, FullPageEntry>();

document.addEventListener("mouseup", handleSelectionGesture);
document.addEventListener("keyup", (event) => {
  if (event.key === "Escape") {
    removeSelectionBubble();
    return;
  }
  handleSelectionGesture(event);
});
document.addEventListener("keydown", handleFallbackShortcut, true);
document.addEventListener("scroll", removeSelectionBubble, { passive: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    switch (message?.type) {
      case "TRANSLATE_FULL_PAGE": {
        const data = startFullPageTranslation(message.payload);
        sendResponse({ ok: true, data });
        break;
      }
      case "TRANSLATE_SELECTION": {
        const data = startSelectionTranslationFromShortcut(message.payload);
        sendResponse({ ok: true, data });
        break;
      }
      case "RESTORE_PAGE": {
        restorePage();
        sendResponse({ ok: true, data: getTranslationState() });
        break;
      }
      case "GET_TRANSLATION_STATE": {
        sendResponse({ ok: true, data: getTranslationState() });
        break;
      }
      default:
        sendResponse({
          ok: false,
          error: createTranslator("system")("content.unknownMessage")
        });
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : createTranslator("system")("content.scriptFailed")
    });
  }
  return false;
});

function startFullPageTranslation(payload: {
  targetLanguage: string;
  style: TranslationStyle;
  uiLanguage?: UILanguage;
  translationAppearance?: TranslationAppearance;
}) {
  const t = createTranslator(payload.uiLanguage ?? "system");
  ensureStyle();
  currentError = undefined;
  currentErrorKey = undefined;
  applyTranslationAppearance(payload.translationAppearance);

  if (isTranslating) {
    return {
      started: false,
      total: totalForCurrentRun,
      message: t("content.alreadyTranslating")
    };
  }

  const textNodes = scanVisibleTextNodes();
  const newEntries = textNodes.map((node) =>
    wrapTextNode(node, payload.targetLanguage, t)
  );
  const entriesToTranslate = newEntries.filter((entry) => entry.original.length > 0);

  if (entriesToTranslate.length === 0) {
    return {
      started: false,
      total: 0,
      message: entries.size > 0 ? t("content.noNewText") : t("content.noText")
    };
  }

  isTranslating = true;
  const runId = activeFullPageRunId + 1;
  activeFullPageRunId = runId;
  const requestPrefix = `${PREFIX}:full:${Date.now().toString(36)}:${runId}`;
  activeFullPageRequestPrefix = requestPrefix;
  totalForCurrentRun = entriesToTranslate.length;
  translatedForCurrentRun = 0;

  void translateEntries(
    entriesToTranslate,
    payload.targetLanguage,
    payload.style,
    runId,
    requestPrefix
  ).catch((error) => {
      if (!isCurrentFullPageRun(runId)) return;
      currentErrorKey = "error.translationRequestFailed";
      currentError = t(currentErrorKey);
      const errorMessage = currentError;
      entriesToTranslate.forEach((entry) => {
        if (entry.translationElement && entry.translation === LOADING_STATE) {
          entry.translation = errorMessage;
          entry.translationElement.textContent = errorMessage;
          entry.translationElement.classList.add(`${PREFIX}-translation-error`);
        }
      });
    }).finally(() => {
    if (isCurrentFullPageRun(runId)) {
      isTranslating = false;
      activeFullPageRequestPrefix = null;
    }
  });

  return {
    started: true,
    total: entriesToTranslate.length,
    message: t("content.fullPageStarted", { count: entriesToTranslate.length })
  };
}

async function translateEntries(
  entriesToTranslate: FullPageEntry[],
  targetLanguage: string,
  style: TranslationStyle,
  runId: number,
  requestPrefix: string
) {
  const groups = new Map<string, FullPageEntry[]>();
  entriesToTranslate.forEach((entry) => {
    const list = groups.get(entry.original) ?? [];
    list.push(entry);
    groups.set(entry.original, list);
  });

  const uniqueTexts = Array.from(groups.keys());
  const batches = createBatches(uniqueTexts);

  for (const [batchIndex, batch] of batches.entries()) {
    if (!isCurrentFullPageRun(runId)) return;
    const response = await sendRuntimeMessage<TranslationResponse>({
      type: "TRANSLATE_TEXTS",
      payload: {
        texts: batch,
        targetLanguage,
        style,
        pageUrl: window.location.href,
        mode: "full-page",
        requestId: `${requestPrefix}:${batchIndex}`
      }
    });

    if (!isCurrentFullPageRun(runId)) return;
    batch.forEach((text, index) => {
      const translation = normalizeText(response.translations[index] ?? "");
      const matchingEntries = groups.get(text) ?? [];
      matchingEntries.forEach((entry) => {
        if (!entries.has(entry.id)) return;
        entry.translation = translation;
        if (entry.translationElement) {
          entry.translationElement.toggleAttribute("hidden", translation.length === 0);
          entry.translationElement.textContent = translation;
          entry.translationElement.classList.remove(`${PREFIX}-translation-error`);
        }
        translatedForCurrentRun += 1;
      });
    });

  }
}

function isCurrentFullPageRun(runId: number): boolean {
  return activeFullPageRunId === runId;
}

function scanVisibleTextNodes(): Text[] {
  const nodes: Text[] = [];
  if (!document.body) {
    return nodes;
  }

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (nodes.length >= MAX_TEXT_NODES) {
          return NodeFilter.FILTER_REJECT;
        }
        return shouldTranslateTextNode(node as Text)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let currentNode = walker.nextNode();
  while (currentNode && nodes.length < MAX_TEXT_NODES) {
    nodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  return nodes;
}

function shouldTranslateTextNode(node: Text): boolean {
  const parent = node.parentElement;
  const normalized = normalizeText(node.textContent ?? "");

  if (!parent || normalized.length < 2) return false;
  if (normalized.length > MAX_FULL_PAGE_TEXT_CHARS) return false;
  if (isMostlySymbols(normalized)) return false;
  if (parent.closest(UNSAFE_TRANSLATION_SELECTOR)) {
    return false;
  }
  if (isInsideInteractiveLikeElement(parent)) {
    return false;
  }
  const existingEntry = translatedTextNodes.get(node);
  if (existingEntry?.original === normalized) return false;
  if ((parent as HTMLElement).isContentEditable) return false;
  return isElementVisible(parent);
}

function wrapTextNode(
  node: Text,
  targetLanguage: string,
  t: Translator
): FullPageEntry {
  const id = createId();
  const originalText = node.textContent ?? "";
  const normalized = normalizeText(originalText);
  const parent = node.parentNode;
  const existingEntry = translatedTextNodes.get(node);
  const translation = document.createElement("span");

  if (existingEntry) {
    existingEntry.translationElement?.remove();
    entries.delete(existingEntry.id);
  }

  translation.setAttribute(DATA_TRANSLATION, "true");
  translation.setAttribute(DATA_RECORD_ID, id);
  translation.className = `${PREFIX}-translation ${getTranslationLayoutClass(
    node.parentElement,
    normalized
  )}`;
  translation.textContent = t("content.loading");

  if (parent) {
    parent.insertBefore(translation, node.nextSibling);
  }

  const entry: FullPageEntry = {
    id,
    original: normalized,
    translation: LOADING_STATE,
    sourceNode: node,
    translationElement: translation,
    targetLanguage,
    createdAt: Date.now()
  };
  entries.set(id, entry);
  translatedTextNodes.set(node, entry);
  return entry;
}

function createBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let charCount = 0;

  texts.forEach((text) => {
    if (text.length > MAX_FULL_PAGE_TEXT_CHARS) return;
    const wouldOverflow =
      batch.length >= MAX_BATCH_ITEMS || charCount + text.length > MAX_BATCH_CHARS;
    if (batch.length > 0 && wouldOverflow) {
      batches.push(batch);
      batch = [];
      charCount = 0;
    }
    batch.push(text);
    charCount += text.length;
  });

  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

function handleSelectionGesture(event: MouseEvent | KeyboardEvent) {
  if (!event.isTrusted) {
    return;
  }
  if (event.target instanceof Node && activeBubble?.contains(event.target)) {
    return;
  }
  const point =
    event instanceof MouseEvent
      ? { x: event.clientX, y: event.clientY }
      : undefined;

  window.setTimeout(() => {
    if (!hasUsableSelection()) {
      removeSelectionBubble();
      return;
    }

    void sendRuntimeMessage<Settings>({ type: "GET_PUBLIC_SETTINGS" })
      .then((settings) => {
        if (settings.selectionBubbleEnabled === false) {
          if (event instanceof MouseEvent) {
            removeSelectionBubble();
          }
          return;
        }
        showSelectionBubble({ point, settings });
      })
      .catch(() => showSelectionBubble({ point }));
  }, 20);
}

function startSelectionTranslationFromShortcut(payload: {
  targetLanguage: string;
  style: TranslationStyle;
  uiLanguage?: UILanguage;
  forceRefresh?: boolean;
}): SelectionTranslationStart {
  return showSelectionBubble({
    autoTranslate: true,
    forceRefresh: payload.forceRefresh ?? false,
    point: undefined,
    settings: {
      targetLanguage: payload.targetLanguage,
      style: payload.style,
      uiLanguage: payload.uiLanguage ?? "system"
    }
  });
}

function handleFallbackShortcut(event: KeyboardEvent) {
  if (!event.isTrusted || event.repeat || isKeyboardEventInEditableContext(event)) {
    return;
  }

  const shortcut = getShortcutSignature(event);
  const command =
    FALLBACK_SHORTCUTS.translateSelection.has(shortcut)
      ? "translate-selection"
      : FALLBACK_SHORTCUTS.translateFullPage.has(shortcut)
        ? "translate-full-page"
        : FALLBACK_SHORTCUTS.restorePage.has(shortcut)
          ? "restore-page"
          : null;

  if (!command) return;
  event.preventDefault();
  event.stopPropagation();
  void runFallbackShortcut(command).catch(() => undefined);
}

async function runFallbackShortcut(
  command: "translate-selection" | "translate-full-page" | "restore-page"
) {
  const settings = await getPublicSettingsForContent();

  if (command === "translate-selection") {
    showSelectionBubble({
      autoTranslate: true,
      forceRefresh: false,
      point: undefined,
      settings
    });
    return;
  }

  if (command === "translate-full-page") {
    startFullPageTranslation({
      targetLanguage: settings.targetLanguage,
      style: settings.style,
      uiLanguage: settings.uiLanguage,
      translationAppearance: settings.translationAppearance
    });
    return;
  }

  restorePage();
}

async function getPublicSettingsForContent(): Promise<Settings> {
  try {
    return await sendRuntimeMessage<Settings>({ type: "GET_PUBLIC_SETTINGS" });
  } catch {
    return sendRuntimeMessage<Settings>({ type: "GET_SETTINGS" });
  }
}

function getShortcutSignature(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(event.key.toLowerCase());
  return parts.join("+");
}

function isKeyboardEventInEditableContext(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(EDITABLE_SELECTOR) ||
      (target instanceof HTMLElement && target.isContentEditable)
  );
}

function showSelectionBubble(options?: {
  autoTranslate?: boolean;
  forceRefresh?: boolean;
  point?: { x: number; y: number };
  settings?: Settings;
}): SelectionTranslationStart {
  const t = getSettingsTranslator(options?.settings);
  const selection = window.getSelection();
  const selectedText = normalizeText(selection?.toString() ?? "");

  if (
    !selection ||
    selection.rangeCount === 0 ||
    selectedText.length < MIN_SELECTION_CHARS ||
    isSelectionInEditableContext(selection)
  ) {
    removeSelectionBubble();
    return { started: false, message: t("content.noSelection") };
  }

  if (document.activeElement && activeBubble?.contains(document.activeElement)) {
    return { started: false, message: t("content.bubbleOpen") };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    removeSelectionBubble();
    return { started: false, message: t("content.selectionPositionFailed") };
  }

  ensureStyle();
  removeSelectionBubble();

  const bubbleHost = document.createElement("div");
  bubbleHost.id = BUBBLE_ID;
  bubbleHost.setAttribute(DATA_ROOT, "true");
  const position = getFloatingPosition(rect, options?.point, {
    width: BUBBLE_WIDTH,
    height: BUBBLE_ESTIMATED_HEIGHT
  });
  bubbleHost.style.left = `${position.left}px`;
  bubbleHost.style.top = `${position.top}px`;

  const shadowRoot = bubbleHost.attachShadow({ mode: "closed" });
  const bubbleStyle = createSelectionBubbleStyle();
  const bubble = document.createElement("div");
  bubble.className = `${PREFIX}-bubble`;

  const header = document.createElement("div");
  header.className = `${PREFIX}-bubble-header`;
  const title = document.createElement("strong");
  title.textContent = t("content.bubbleTitle");
  const close = createBubbleButton(t("content.close"), "close");
  header.append(title, close);

  const original = document.createElement("div");
  original.className = `${PREFIX}-bubble-original`;
  original.textContent = selectedText;

  const translated = document.createElement("div");
  translated.className = `${PREFIX}-bubble-translated`;
  translated.textContent =
    selectedText.length > MAX_SELECTION_CHARS
      ? t("content.selectionTooLong", { count: MAX_SELECTION_CHARS })
      : t("content.selectionHint");

  const actions = document.createElement("div");
  actions.className = `${PREFIX}-bubble-actions`;
  const translate = createBubbleButton(t("content.translate"), "translate");
  const copy = createBubbleButton(t("content.copy"), "copy");
  const retry = createBubbleButton(t("content.retry"), "retry");
  const favorite = createBubbleButton(t("content.favorite"), "favorite");
  actions.append(translate, copy, retry, favorite);

  bubble.append(header, actions, original, translated);
  shadowRoot.append(bubbleStyle, bubble);
  document.body.appendChild(bubbleHost);
  activeBubble = bubbleHost;

  let latestTranslation = "";
  const canTranslate = selectedText.length <= MAX_SELECTION_CHARS;
  translate.disabled = !canTranslate;
  retry.disabled = !canTranslate;
  copy.disabled = true;
  favorite.disabled = true;

  close.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    event.stopPropagation();
    removeSelectionBubble();
  });
  translate.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    event.stopPropagation();
    void runSelectionTranslation({
      selectedText,
      target: translated,
      forceRefresh: false,
      settings: options?.settings,
      onSuccess: (translation) => {
        latestTranslation = translation;
        copy.disabled = false;
        favorite.disabled = false;
      }
    });
  });
  copy.addEventListener("click", (event) => {
    if (!event.isTrusted || !latestTranslation) return;
    event.stopPropagation();
    void navigator.clipboard.writeText(latestTranslation).catch(() => {
      translated.textContent = t("content.selectionFailed");
      translated.classList.add(`${PREFIX}-translation-error`);
    });
  });
  retry.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    event.stopPropagation();
    void runSelectionTranslation({
      selectedText,
      target: translated,
      forceRefresh: true,
      settings: options?.settings,
      onSuccess: (translation) => {
        latestTranslation = translation;
        copy.disabled = false;
        favorite.disabled = false;
      }
    });
  });
  favorite.addEventListener("click", (event) => {
    if (!event.isTrusted || !latestTranslation) return;
    event.stopPropagation();
    void saveSelectionFavorite(selectedText, latestTranslation).catch(() => {
      translated.textContent = t("content.selectionFailed");
      translated.classList.add(`${PREFIX}-translation-error`);
    });
  });

  if (options?.autoTranslate && canTranslate) {
    void runSelectionTranslation({
      selectedText,
      target: translated,
      forceRefresh: options.forceRefresh ?? false,
      settings: options.settings,
      onSuccess: (translation) => {
        latestTranslation = translation;
        copy.disabled = false;
        favorite.disabled = false;
      }
    });
  }

  return {
    started: canTranslate,
    message: canTranslate
      ? t("content.selectionShortcutStarted")
      : t("content.selectionTooLong", { count: MAX_SELECTION_CHARS })
  };
}

async function runSelectionTranslation({
  selectedText,
  target,
  forceRefresh,
  settings,
  onSuccess
}: {
  selectedText: string;
  target: HTMLElement;
  forceRefresh: boolean;
  settings?: Settings;
  onSuccess: (translation: string) => void;
}) {
  let t = getSettingsTranslator(settings);
  try {
    const now = Date.now();
    if (!forceRefresh && now - lastSelectionTranslationAt < SELECTION_TRANSLATION_COOLDOWN_MS) {
      target.textContent = t("content.tooFrequent");
      return;
    }
    if (selectedText.length > MAX_SELECTION_CHARS) {
      target.textContent = t("content.selectionTooLong", {
        count: MAX_SELECTION_CHARS
      });
      return;
    }
    lastSelectionTranslationAt = now;
    target.textContent = t("content.loading");
    target.classList.remove(`${PREFIX}-translation-error`);
    const activeSettings =
      settings ?? (await sendRuntimeMessage<Settings>({ type: "GET_PUBLIC_SETTINGS" }));
    t = getSettingsTranslator(activeSettings);
    const response = await sendRuntimeMessage<TranslationResponse>({
      type: "TRANSLATE_TEXTS",
      payload: {
        texts: [selectedText],
        targetLanguage: activeSettings.targetLanguage,
        style: activeSettings.style,
        pageUrl: window.location.href,
        mode: "selection",
        forceRefresh
      }
    });
    const translation = response.translations[0] ?? "";
    target.textContent = translation;
    onSuccess(translation);
  } catch (error) {
    target.textContent =
      error instanceof Error ? error.message : t("content.selectionFailed");
    target.classList.add(`${PREFIX}-translation-error`);
  }
}

async function saveSelectionFavorite(original: string, translation: string) {
  if (!translation || translation === LOADING_STATE) return;
  const settings = await sendRuntimeMessage<Settings>({ type: "GET_PUBLIC_SETTINGS" });
  await sendRuntimeMessage({
    type: "SAVE_FAVORITE",
    payload: {
      id: createId(),
      original,
      translation,
      targetLanguage: settings.targetLanguage,
      pageUrl: window.location.href,
      mode: "selection",
      createdAt: Date.now()
    }
  });
}

function createBubbleButton(label: string, action: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("data-action", action);
  return button;
}

function createSelectionBubbleStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host {
      position: fixed !important;
      width: 344px !important;
      max-width: calc(100vw - 16px) !important;
      z-index: 2147483647 !important;
      color: #17201d !important;
      background: #ffffff !important;
      border: 1px solid #cbd5d1 !important;
      border-radius: 8px !important;
      box-shadow: 0 16px 42px rgba(15, 23, 42, 0.22) !important;
      padding: 10px !important;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      box-sizing: border-box !important;
    }
    *,
    *::before,
    *::after {
      box-sizing: border-box !important;
    }
    .${PREFIX}-bubble-header,
    .${PREFIX}-bubble-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 8px !important;
    }
    .${PREFIX}-bubble-header {
      margin-bottom: 8px !important;
    }
    .${PREFIX}-bubble-actions {
      justify-content: flex-start !important;
      margin-bottom: 8px !important;
      flex-wrap: wrap !important;
    }
    .${PREFIX}-bubble-original {
      color: #64706c !important;
      max-height: 64px !important;
      overflow: auto !important;
      border-bottom: 1px solid #edf2f0 !important;
      padding-bottom: 8px !important;
      margin-bottom: 8px !important;
    }
    .${PREFIX}-bubble-translated {
      color: #0f3f37 !important;
      background: #effaf7 !important;
      border-radius: 6px !important;
      min-height: 34px !important;
      max-height: 132px !important;
      overflow: auto !important;
      padding: 8px !important;
      margin-bottom: 8px !important;
      white-space: pre-wrap !important;
    }
    button {
      appearance: none !important;
      border: 1px solid #bfd3cd !important;
      background: #ffffff !important;
      color: #173c35 !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      font: inherit !important;
      padding: 4px 8px !important;
    }
    button:hover {
      background: #ecfdf7 !important;
      border-color: #14b8a6 !important;
    }
    button:disabled {
      cursor: not-allowed !important;
      opacity: 0.55 !important;
    }
  `;
  return style;
}

function restorePage() {
  if (activeFullPageRequestPrefix) {
    void sendRuntimeMessage({
      type: "CANCEL_TRANSLATION_REQUESTS",
      payload: { requestPrefix: activeFullPageRequestPrefix }
    }).catch(() => undefined);
  }
  activeFullPageRunId += 1;
  activeFullPageRequestPrefix = null;
  removeSelectionBubble();
  document
    .querySelectorAll<HTMLElement>(`[${DATA_TRANSLATION}]`)
    .forEach((element) => element.remove());

  document.querySelectorAll<HTMLElement>(`[${DATA_ORIGINAL}]`).forEach((wrapper) => {
    try {
      wrapper.replaceWith(document.createTextNode(wrapper.textContent ?? ""));
    } catch {
      wrapper.removeAttribute(DATA_ORIGINAL);
      wrapper.removeAttribute(DATA_RECORD_ID);
      wrapper.classList.remove(`${PREFIX}-original`);
    }
  });

  document.getElementById(STYLE_ID)?.remove();
  clearTranslationAppearanceVariables();
  entries.clear();
  translatedTextNodes = new WeakMap<Text, FullPageEntry>();
  isTranslating = false;
  totalForCurrentRun = 0;
  translatedForCurrentRun = 0;
  currentError = undefined;
  currentErrorKey = undefined;
}

function getTranslationState() {
  return {
    isTranslating,
    total: totalForCurrentRun,
    translated: translatedForCurrentRun,
    errorKey: currentErrorKey,
    error: currentError,
    records: Array.from(entries.values())
      .filter(
        (entry) => entry.translation && entry.translation !== LOADING_STATE
      )
      .map<PageTranslationRecord>((entry) => ({
        id: entry.id,
        original: entry.original,
        translation: entry.translation,
        targetLanguage: entry.targetLanguage,
        pageUrl: window.location.href,
        mode: "full-page",
        createdAt: entry.createdAt
      }))
  };
}

function removeSelectionBubble() {
  activeBubble?.remove();
  activeBubble = null;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasUsableSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const selectedText = normalizeText(selection.toString());
  if (selectedText.length < MIN_SELECTION_CHARS) return false;
  return !isSelectionInEditableContext(selection);
}

function getFloatingPosition(
  rect: DOMRect,
  point: { x: number; y: number } | undefined,
  size: { width: number; height: number }
): { left: number; top: number } {
  const margin = 8;
  const gap = 12;
  const anchorX = point?.x ?? rect.left + rect.width / 2;
  const anchorY = point?.y ?? rect.bottom;
  const preferRight = anchorX + gap + size.width <= window.innerWidth - margin;
  const preferBelow = anchorY + gap + size.height <= window.innerHeight - margin;

  const left = preferRight
    ? anchorX + gap
    : anchorX - size.width - gap;
  const top = preferBelow
    ? anchorY + gap
    : anchorY - size.height - gap;

  return {
    left: Math.max(margin, Math.min(window.innerWidth - size.width - margin, left)),
    top: Math.max(margin, Math.min(window.innerHeight - size.height - margin, top))
  };
}

function isSelectionInEditableContext(selection: Selection): boolean {
  if (selection.rangeCount === 0) return false;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  const element =
    container instanceof Element ? container : container.parentElement;
  return Boolean(
    element?.closest(EDITABLE_SELECTOR) ||
      (element instanceof HTMLElement && element.isContentEditable)
  );
}

function isInsideInteractiveLikeElement(element: Element): boolean {
  if (element.closest(NON_TRANSLATABLE_SELECTOR)) {
    return true;
  }

  let current: Element | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    if (style.cursor === "pointer" || current.hasAttribute("tabindex")) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function isMostlySymbols(text: string): boolean {
  return /^[\d\s\p{P}\p{S}]+$/u.test(text);
}

function isElementVisible(element: Element): boolean {
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      current.hasAttribute("hidden") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return element.getClientRects().length > 0;
}

function getTranslationLayoutClass(parent: Element | null, originalText: string): string {
  if (!parent) return `${PREFIX}-translation-block`;
  if (currentAppearance.layout === "block") {
    return `${PREFIX}-translation-block`;
  }
  if (currentAppearance.layout === "inline") {
    return `${PREFIX}-translation-inline`;
  }
  if (originalText.length > INLINE_TRANSLATION_MAX_CHARS) {
    return `${PREFIX}-translation-block`;
  }
  const tagName = parent.tagName.toLowerCase();
  if (parent.closest("p, li, article, main, section, blockquote")) {
    return `${PREFIX}-translation-block`;
  }
  if (
    ["time", "span", "strong", "em", "b", "i", "small"].includes(
      tagName
    )
  ) {
    return `${PREFIX}-translation-inline`;
  }
  return `${PREFIX}-translation-block`;
}

function createId(): string {
  sequence += 1;
  return `${PREFIX}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  const t = createTranslator("system");
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
        reject(new Error(response.error ?? t("error.backgroundFailed")));
        return;
      }
      resolve(response.data as T);
    });
  });
}

function getSettingsTranslator(settings?: Pick<Settings, "uiLanguage">): Translator {
  return createTranslator(settings?.uiLanguage ?? "system");
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${PREFIX}-translation {
      color: var(--${PREFIX}-translation-color, #0f766e) !important;
      background: var(--${PREFIX}-translation-bg, #dff5ef) !important;
      border-left: var(--${PREFIX}-translation-border-width, 3px) solid var(--${PREFIX}-translation-border-color, #14b8a6) !important;
      border-radius: var(--${PREFIX}-translation-radius, 4px) !important;
      font-size: var(--${PREFIX}-translation-font-size, 15px) !important;
      font-weight: var(--${PREFIX}-translation-font-weight, 500) !important;
      opacity: var(--${PREFIX}-translation-opacity, 1) !important;
      line-height: 1.45 !important;
      padding: var(--${PREFIX}-translation-padding, 6px) !important;
      word-break: break-word !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
    }
    .${PREFIX}-translation-block {
      display: block !important;
      margin: 4px 0 7px !important;
    }
    .${PREFIX}-translation-inline {
      display: inline-block !important;
      margin: 2px 0 2px 0.35em !important;
      vertical-align: baseline !important;
    }
    [${DATA_TRANSLATION}][hidden],
    [${DATA_TRANSLATION}]:empty {
      display: none !important;
    }
    .${PREFIX}-translation-error {
      color: #b91c1c !important;
      background: rgba(248, 113, 113, 0.12) !important;
      border-left-color: #ef4444 !important;
    }
    #${BUBBLE_ID} {
      position: fixed !important;
      width: 344px !important;
      max-width: calc(100vw - 16px) !important;
      z-index: 2147483647 !important;
      color: #17201d !important;
      background: #ffffff !important;
      border: 1px solid #cbd5d1 !important;
      border-radius: 8px !important;
      box-shadow: 0 16px 42px rgba(15, 23, 42, 0.22) !important;
      padding: 10px !important;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
    }
    .${PREFIX}-bubble-header,
    .${PREFIX}-bubble-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 8px !important;
    }
    .${PREFIX}-bubble-header {
      margin-bottom: 8px !important;
    }
    .${PREFIX}-bubble-actions {
      justify-content: flex-start !important;
      margin-bottom: 8px !important;
    }
    .${PREFIX}-bubble-original {
      color: #64706c !important;
      max-height: 64px !important;
      overflow: auto !important;
      border-bottom: 1px solid #edf2f0 !important;
      padding-bottom: 8px !important;
      margin-bottom: 8px !important;
    }
    .${PREFIX}-bubble-translated {
      color: #0f3f37 !important;
      background: #effaf7 !important;
      border-radius: 6px !important;
      min-height: 34px !important;
      max-height: 132px !important;
      overflow: auto !important;
      padding: 8px !important;
      margin-bottom: 8px !important;
      white-space: pre-wrap !important;
    }
    #${BUBBLE_ID} button {
      appearance: none !important;
      border: 1px solid #bfd3cd !important;
      background: #ffffff !important;
      color: #173c35 !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      font: inherit !important;
      padding: 4px 8px !important;
    }
    #${BUBBLE_ID} button:hover {
      background: #ecfdf7 !important;
      border-color: #14b8a6 !important;
    }
    #${BUBBLE_ID} button:disabled {
      cursor: not-allowed !important;
      opacity: 0.55 !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function applyTranslationAppearance(appearance?: TranslationAppearance) {
  currentAppearance = normalizeTranslationAppearance(appearance);
  ensureStyle();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty(
    `--${PREFIX}-translation-color`,
    currentAppearance.textColor
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-bg`,
    currentAppearance.backgroundColor
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-border-color`,
    currentAppearance.borderColor
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-border-width`,
    `${currentAppearance.borderWidth}px`
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-radius`,
    `${currentAppearance.borderRadius}px`
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-font-size`,
    `${currentAppearance.fontSize}px`
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-font-weight`,
    String(currentAppearance.fontWeight)
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-padding`,
    `${currentAppearance.padding}px`
  );
  rootStyle.setProperty(
    `--${PREFIX}-translation-opacity`,
    String(currentAppearance.opacity)
  );
  refreshTranslationLayoutClasses();
}

function normalizeTranslationAppearance(
  appearance: TranslationAppearance | undefined
): TranslationAppearance {
  const next = {
    ...DEFAULT_TRANSLATION_APPEARANCE,
    ...(appearance ?? {})
  };
  return {
    ...next,
    borderWidth: clampNumber(next.borderWidth, 0, 10, DEFAULT_TRANSLATION_APPEARANCE.borderWidth),
    borderRadius: clampNumber(next.borderRadius, 0, 24, DEFAULT_TRANSLATION_APPEARANCE.borderRadius),
    fontSize: clampNumber(next.fontSize, 10, 28, DEFAULT_TRANSLATION_APPEARANCE.fontSize),
    fontWeight: clampNumber(next.fontWeight, 300, 900, DEFAULT_TRANSLATION_APPEARANCE.fontWeight),
    padding: clampNumber(next.padding, 0, 20, DEFAULT_TRANSLATION_APPEARANCE.padding),
    opacity: clampNumber(next.opacity, 0.2, 1, DEFAULT_TRANSLATION_APPEARANCE.opacity),
    layout:
      next.layout === "block" || next.layout === "inline" ? next.layout : "auto"
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function refreshTranslationLayoutClasses() {
  entries.forEach((entry) => {
    const element = entry.translationElement;
    if (!element) return;
    const isError = element.classList.contains(`${PREFIX}-translation-error`);
    element.className = `${PREFIX}-translation ${getTranslationLayoutClass(
      entry.sourceNode?.parentElement ?? element.parentElement,
      entry.original
    )}`;
    if (isError) {
      element.classList.add(`${PREFIX}-translation-error`);
    }
  });
}

function clearTranslationAppearanceVariables() {
  TRANSLATION_CSS_VARS.forEach((name) => {
    document.documentElement.style.removeProperty(name);
  });
}
