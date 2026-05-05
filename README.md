# AI Translate Assistant

Chrome Manifest V3 AI 翻译插件，支持划词翻译、全网页翻译、双语对照和一键恢复原网页。

## 功能

- 划词翻译：选中文字后弹出翻译气泡，支持复制、重新翻译、收藏。
- 全网页翻译：扫描当前页面可见文本，批量请求 AI 翻译并逐步注入译文。
- 双语对照：默认在原文下方显示译文，保留原网页结构。
- 一键恢复：清理插件注入的译文、样式和包裹节点，恢复原网页显示。
- 翻译风格：Popup 可快速切换风格，设置页可编写自定义翻译风格要求。
- 设置页：配置目标语言、界面语言、API Key、接口地址、模型名和译文样式；源语言由 AI 自动识别。
- 国际化：界面语言默认跟随 Chrome/系统语言，支持简体中文、繁體中文、English、日本語、한국어、Français、Deutsch、Español、Italiano、Português、Русский。
- 快捷键：支持选中文本翻译、全网页翻译、恢复网页，可在 Chrome 扩展快捷键页自定义。
- 划词弹窗设置：可选择选中文本时是否显示翻译小窗口；关闭后选中文本不显示任何浮层，可使用快捷键翻译。
- 网页译文样式：可自定义网页内译文的颜色、背景、边框、字号、圆角、内边距、透明度和显示策略。

## 开发

```bash
npm ci
npm run build
```

构建后在 Chrome 打开 `chrome://extensions`，开启开发者模式，选择 `dist` 目录加载已解压的扩展程序。

## 上架包

Chrome Web Store 上传 `release/ai-translate-assistant-0.1.0-webstore.zip`。重新生成上架包：

```bash
npm run package:webstore
```

本地 CRX 测试包在 `release/ai-translate-assistant-0.1.0.crx`，对应私钥 `release/ai-translate-assistant-0.1.0.pem` 需要妥善保管。

## 快捷键

默认快捷键：

- `Alt+Shift+T`：翻译选中文本
- `Alt+Shift+F`：全网页翻译
- `Alt+Shift+R`：恢复原网页

加载扩展后可在 `chrome://extensions/shortcuts` 修改快捷键。

## OpenAI-compatible 接口

默认接口地址是 `https://api.openai.com/v1`，插件会请求 `{apiBaseUrl}/chat/completions`。如果你填写的接口地址已经以 `/chat/completions` 结尾，插件会直接使用该地址。接口地址必须使用 HTTPS。

API Key 仅保存在 `chrome.storage.local`，不会写入页面 DOM 或日志。
