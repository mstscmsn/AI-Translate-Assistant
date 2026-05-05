# Privacy Policy

AI Translate Assistant translates text that you explicitly select or request to translate on a web page.

## Data Processed

- Selected text and visible page text that you actively translate.
- Target language, translation style, API endpoint, model name, and appearance settings.
- API Key, stored locally in `chrome.storage.local`.
- Optional favorite translations, stored locally in the browser.

## How Data Is Used

Text is sent only to the OpenAI-compatible API endpoint configured by the user, for the purpose of returning translations. When a translation request is made, the API Key is sent only as an `Authorization` header to that configured endpoint. The extension does not sell data, use data for advertising, or transfer data for unrelated purposes.

## Local Storage

Settings, API Key, translation cache, and favorites are stored locally in the browser. The API Key is not written to page DOM or logs.

## Third-Party Services

The extension connects to the API endpoint configured by the user. If you use a third-party AI provider, that provider's own privacy terms may apply to translation requests.

## User Control

You can clear translations from the current page with one-click restore. You can also remove the extension or clear extension storage from Chrome settings.
