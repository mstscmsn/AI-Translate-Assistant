# Chrome Web Store Submission Notes

## Package

Upload this file to Chrome Web Store:

`release/ai-translate-assistant-0.1.0-webstore.zip`

Chrome Web Store uploads use a ZIP package. A CRX was also generated for local distribution/testing:

`release/ai-translate-assistant-0.1.0.crx`

Keep the generated PEM private if you continue distributing the CRX yourself:

`release/ai-translate-assistant-0.1.0.pem`

## Permissions Justification

- `storage`: saves user settings, API Key, translation cache, appearance settings, and favorites locally.
- `activeTab`: lets the popup and keyboard commands interact with the active tab after user action.
- `host_permissions: <all_urls>`: required because the content script is preloaded on web pages so selection shortcuts, page translation, and restore can work consistently. It reads visible page text only after the user selects text, clicks the extension UI, or uses a configured shortcut.

Removed unused higher-risk permissions:

- `scripting`
- `tabs`

## Privacy Form Guidance

The extension processes user-provided text only when the user selects text or starts page translation.

Recommended disclosures:

- Website content: Yes, visible text is processed for translation after user action.
- Authentication information: API Key is stored locally in Chrome storage and is sent only as an Authorization header to the user-configured translation API endpoint when the user triggers translation.
- Data sale/advertising: No.
- Remote code: No. Extension pages use bundled local code only.

Use `PRIVACY_POLICY.md` as the basis for the public privacy policy URL required by Chrome Web Store if requested.

## Listing Notes

Short description:

AI webpage translator with selection translation, bilingual full-page translation, custom styles, and one-click restore.

Feature bullets:

- Translate selected text with a bubble or keyboard shortcut.
- Translate visible page text in bilingual mode without deleting original DOM.
- Restore injected translations with one click.
- Customize target language, translation style, UI language, API endpoint, model, and translation appearance.
- Supports localized UI for Simplified Chinese, Traditional Chinese, English, Japanese, Korean, French, German, Spanish, Italian, Portuguese, and Russian.
