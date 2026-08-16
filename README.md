# ♟ Chess Assist

A Chrome/Chromium MV3 browser extension for **chess analysis and bot testing**, powered by a bundled local Stockfish WebAssembly engine.

> **Purpose:** This project is intended for personal chess analysis, development, and testing automated chess bots/environments. It is not intended to assist human players in live games against other people.

## Features

- Local Stockfish WASM engine
- Best-move analysis
- Top-3 engine analysis
- Configurable engine depth
- Chess position/FEN analysis
- Automatic move testing for bot/development environments
- Chess.com and Lichess page integration
- Chrome DevTools Protocol support where trusted browser events are required
- Move-in-progress protection to prevent duplicate actions
- Configurable move delay
- Persistent settings using `chrome.storage.local`
- MV3 service worker architecture
- Local engine execution without requiring a remote Stockfish server

## Architecture

```text
Chess Assist
│
├── manifest.json
│
├── engine.js
│   ├── Stockfish WASM
│   ├── FEN handling
│   ├── Best-move search
│   ├── MultiPV analysis
│   └── Auto-play/test logic
│
├── ui.js
│   ├── Evaluation display
│   ├── Top moves
│   ├── Settings
│   └── Analysis interface
│
├── background.js
│   ├── MV3 service worker
│   └── Chrome DevTools Protocol communication
│
├── style.css
│
├── stockfish.wasm.js
│
├── stockfish.wasm
│
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Engine

Chess Assist bundles a local Stockfish WebAssembly build.

The engine is loaded into a Web Worker so that chess calculations don't block the extension UI.

### Best Move

The single-best-move search uses:

```text
MultiPV = 1
```

### Top Moves

The analysis UI can request multiple candidate moves using:

```text
MultiPV = 3
```

This allows the interface to display several strong candidate moves instead of only one.

## Search Flow

```text
Current position
       │
       ▼
      FEN
       │
       ▼
Stockfish WASM
       │
       ├── MultiPV 1
       │      │
       │      ▼
       │   Best move
       │
       └── MultiPV 3
              │
              ▼
          Top 3 moves
```

Before starting an independent search, the engine can reset its game state with:

```text
ucinewgame
```

This helps keep separate analysis requests consistent.

## Auto-Play / Bot Testing

The auto-play functionality is intended for:

- Local chess applications
- Personal bot testing
- Development environments
- Chess bots
- Test accounts/environments where automation is permitted
- Automated regression testing

The move pipeline is:

```text
Position
   ↓
FEN validation
   ↓
Stockfish search
   ↓
Selected test move
   ↓
Move execution
   ↓
Position verification
```

A `moveInProgress` state prevents the UI from processing the board again while a move is being executed.

## Move Delay

The extension supports a configurable delay before executing a test move.

The setting is stored using:

```javascript
chrome.storage.local;
```

The delay can be configured from the extension UI.

This is intended to simulate different bot/test timing conditions and make automated testing easier.

## Chrome Extension

Chess Assist uses:

```json
{
  "manifest_version": 3
}
```

The extension uses:

- Content scripts
- MV3 service worker
- Local storage
- Web-accessible resources
- Optional Chrome debugger/CDP functionality

## Permissions

Current permissions include:

```json
"permissions": [
  "debugger",
  "storage"
]
```

### `storage`

Used for persistent extension settings.

### `debugger`

Used for Chrome DevTools Protocol communication where normal synthetic browser events are not accepted by the target chessboard implementation.

Because this is a powerful permission, it should only be enabled when required by the testing functionality.

## Web-Accessible Resources

The Stockfish files are exposed to supported pages:

```json
"web_accessible_resources": [
  {
    "resources": [
      "stockfish.wasm.js",
      "stockfish.wasm"
    ],
    "matches": [
      "https://www.chess.com/*",
      "https://lichess.org/*"
    ]
  }
]
```

## Installation — Development

### 1. Clone/open the project

```bash
cd /Users/home/WorkSpace/testlab/LichessHelper
```

### 2. Open Chrome Extensions

Navigate to:

```text
chrome://extensions
```

### 3. Enable Developer Mode

Enable:

```text
Developer mode
```

### 4. Load the extension

Select:

```text
Load unpacked
```

and choose:

```text
/WorkspaceFolder
```

### 5. Reload after changes

After modifying extension files:

```text
chrome://extensions
        ↓
Chess Assist
        ↓
Reload
```

Then refresh the chess page.

## Building a Release ZIP

The ZIP should contain `manifest.json` at its root:

```text
chess-assist.zip
│
├── manifest.json
├── background.js
├── engine.js
├── ui.js
├── style.css
├── stockfish.wasm
├── stockfish.wasm.js
└── icons/
```

From macOS Terminal:

```bash
cd /Users/home/WorkSpace/testlab
zip -r chess-assist.zip LichessHelper/
```

For production releases, make sure unnecessary development files are excluded.

## Browser Compatibility

The extension targets Chromium Manifest V3 browsers.

Expected compatibility:

| Browser        | Status                                        |
| -------------- | --------------------------------------------- |
| Chrome         | ✅ Primary target                             |
| Microsoft Edge | ✅ Chromium                                   |
| Brave          | ✅ Chromium                                   |
| Opera          | ✅ Chromium                                   |
| Firefox        | ⚠️ Requires testing/possible manifest changes |
| Safari         | ⚠️ Requires a separate Safari extension build |

## Development Notes

### Engine consistency

When comparing MultiPV results with single-best-move results, searches should be treated as separate engine searches.

Resetting the UCI game state before a new search can help avoid stale search state affecting results:

```text
stop
ucinewgame
setoption name MultiPV value N
position fen <FEN>
go depth <DEPTH>
```

### Caching

Best-move results can be cached using:

```text
depth + FEN
```

A top-move cache can similarly use:

```text
count + depth + FEN
```

This avoids unnecessary repeated engine calculations for identical positions.

## Project Goals

Chess Assist is designed to make it easier to:

- Experiment with chess engines
- Build chess automation prototypes
- Test chess bots
- Analyze positions
- Compare engine variations
- Learn how browser extensions interact with chess applications
- Experiment with Stockfish WASM
- Develop chess-related browser tools

## Disclaimer

This project should only be used where automation and engine assistance are permitted.

Do not use the extension to gain an unfair advantage against human opponents or to circumvent a chess platform's fair-play, anti-cheating, or automation systems.

## License

Add your preferred license here, for example:

```text
MIT License
```

if the project and all bundled dependencies are compatible with that license.
