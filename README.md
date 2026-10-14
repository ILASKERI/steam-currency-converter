# Steam Currency Converter

[![RU](https://img.shields.io/badge/README-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-red)](README.ru.md)
[![Checksums](https://img.shields.io/badge/SHA--256-verified-brightgreen?logo=shieldsio&logoColor=white)](../../releases)
[![Release](https://img.shields.io/github/v/release/ILASKERI/steam-currency-converter)](../../releases)
[![License](https://img.shields.io/github/license/ILASKERI/steam-currency-converter)](LICENSE)
[![Stars](https://img.shields.io/github/stars/ILASKERI/steam-currency-converter)](../../stargazers)

A [Millennium](https://github.com/SteamClientHomebrew/Millennium) plugin that shows Steam store prices and your wallet balance in the currency of your choice.

If your account is in tenge, euros, rubles, or any other currency — the plugin converts everything into the one you pick: USD, EUR, RUB and 40+ more, using up-to-date exchange rates.

## What it converts

| Where | What |
|---|---|
| Steam store pages (in the client) | Game, DLC and discount prices, cart, wishlist |
| Steam client header | Wallet balance next to your avatar |
| Purchase history page | Total spent summary with per-year breakdown |

Two display modes:

- **Next to original** — `190,45€ ≈ $224.14`
- **Replace price** — `$224.14`

Extras:

- **Alt+C quick panel** (or the floating currency button) — switch currency, toggle conversion and display mode without opening settings. Draggable and remembers its position
- **Rate tooltip** — hover any converted price to see the exchange rate used
- **Purchase history summary** — a block on top of your account history page: total spending, a Steam-style bar chart by year, and a one-click "Load more" button
- **Update checker** — the panel footer checks GitHub for new releases
- A couple of secrets we won't spoil here

Exchange rates are fetched from [open.er-api.com](https://www.exchangerate-api.com/) and cached for 24 hours. UI language (RU/EN) follows your Steam client language.

## Requirements

- Steam with [Millennium](https://millennium.patch.sc/) **v3.5.0 or newer**

## Installation (for users)

1. Download the plugin from [Releases](../../releases) and unpack it.
2. Find your Millennium `plugins` folder:
   - **Windows:** `<path to Steam>\millennium\plugins\` (e.g. `C:\Program Files (x86)\Steam\millennium\plugins\`)
   - **Linux:** `~/.local/share/millennium/plugins/`
3. Copy the `steam-currency-converter` folder there, so that `plugin.json` ends up at `plugins\steam-currency-converter\plugin.json`.
4. Fully restart Steam.
5. Open Millennium Settings → Plugins → enable **Steam Currency Converter** → hit Save.
6. Restart Steam once more.

Done! Open any game page in the store — prices will be converted.

## Settings

Open Millennium Settings → Plugins → **Steam Currency Converter**:

- **Convert prices** — enable/disable the plugin
- **Target currency** — the currency to convert into (USD, EUR, RUB, KZT, etc.)
- **Display mode** — show the converted price next to the original, or replace it

Settings apply on the fly — no Steam restart needed (give it a couple of seconds).

## Building from source (for developers)

Requires [Bun](https://bun.com/) >= 1.0.

```bash
git clone https://github.com/ILASKERI/steam-currency-converter.git
cd steam-currency-converter
bun install
bun run build
```

Built bundles appear in `.millennium/Dist/`. Copy the following into your Millennium `plugins` folder:

```
steam-currency-converter/
├── plugin.json
├── backend/
│   ├── main.lua
│   └── rpc_functions.lua
└── .millennium/Dist/
    ├── index.js      # settings panel + wallet balance converter (CDP)
    └── webkit.js     # store page price converter
```

Lua backend changes require a full Steam restart; JS bundles are picked up on UI reload (or a store page reload).

## How it works

- The **webkit script** is injected into Steam store pages, finds text nodes with prices and converts them using rates from the backend.
- The **Lua backend** downloads exchange rates, caches them, and serves them on request.
- The **frontend module** locates the wallet balance element in the main Steam window via Chrome DevTools Protocol and converts it.

## Troubleshooting

- **Prices don't convert** — make sure the plugin is enabled in Millennium settings and Steam was restarted after installation.
- **Plugin logs:**
  - Backend: `<Steam>\millennium\logs\steam-currency-converter_log.log`
  - Webkit/frontend: `<Steam>\logs\webhelper_js.txt` (lines with `[mcc]` and `[mcc-fe]`)
- **Rates fail to load** — check access to `open.er-api.com` (proxy/firewall). When the API is unreachable the plugin degrades gracefully — pages stay intact, conversion just pauses.

## License

This plugin is licensed under **GPL-3.0** (author — LASKER): you are free to use, modify and redistribute it, but derivative projects must also stay open under GPL-3.0. Full text — see [LICENSE](LICENSE).

Licenses of the bundled third-party libraries — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
