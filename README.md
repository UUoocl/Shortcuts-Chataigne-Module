# Apple Shortcuts Custom Module (OS + WebSocket Return)

A Chataigne custom module based on the `OS` module that triggers macOS Apple Shortcuts (`/usr/bin/shortcuts`) non-blocking and returns results as a JSON payload over WebSocket.

## Architecture

```
Chataigne (Apple Shortcuts / OS Module)
  │  local.launchProcess(fullCmd, 0)  [non-blocking background thread]
  ▼
/usr/bin/python3  (hex-encoded bootstrap & packed args)
  ├──▶ /usr/bin/shortcuts run  
  │         └── captures stdout & parses JSON if valid
  └──▶ WebSocket client (stdlib socket)
            └── sends JSON text frame + Close frame
                  ▼
Chataigne (WebSocket Server, Protocol: JSON)
  └── parses JSON into live Chataigne Values
```

1. **Non-blocking execution**: `shortcuts.js` calls `local.launchProcess(..., 0)` so `OSModule` runs shortcuts on its background thread without pausing Chataigne's UI.
2. **Shell-free `ChildProcess` invocation**: JUCE's `ChildProcess::start()` tokenizes commands without a shell and passes tokens directly to `execvp`. Arguments (`action`, `shortcutName`, `wsUrl`, `inputText`) are hex-encoded and pipe-delimited (`|`) so empty fields never shift `sys.argv` indices.
3. **WebSocket return**: Python sends the JSON payload over a local WebSocket connection (using only Python's standard library) followed by a masked RFC-6455 Close frame.

## Requirements: Python 3 & Xcode Command Line Tools

`shortcuts.js` invokes `/usr/bin/python3` and uses **only Python 3 standard-library modules** (no `pip` packages needed).

### Option A: Install Xcode Command Line Tools (macOS default `/usr/bin/python3`)
On macOS, `/usr/bin/python3` is provided by **Xcode Command Line Tools** (full Xcode is not required):

```bash
xcode-select --install
```

If you previously had full `Xcode.app` installed and later uninstalled it, point `xcode-select` to Command Line Tools:

```bash
sudo xcode-select --switch /Library/Developer/CommandLineTools
```

### Option B: Use a Custom Python 3 Path
If you prefer a different Python 3 installation (e.g. Homebrew `/opt/homebrew/bin/python3` or python.org `/Library/Frameworks/Python.framework/Versions/Current/bin/python3`), update `/usr/bin/python3` in `shortcuts.js` (`executeShortcutsAction`):

```js
var fullCmd = "/opt/homebrew/bin/python3 -c exec(bytes.fromhex('" + bootHex + "').decode()) "
	+ pyHex + " " + argsPacked;
```

## Installation

Symlink or copy this folder into Chataigne's custom modules directory:

```bash
ln -sfn "$(pwd)/custom modules/Apple Shortcuts" ~/Documents/Chataigne/modules/"Apple Shortcuts"
```

(Or place it in a `modules/Apple Shortcuts` folder next to your `.noisette` project file.)

## Setup in Chataigne

1. Add **Protocol → WebSocket Server**:
   - Set **Local Port** (e.g. `8080`).
   - Set **Protocol** to `JSON`.
2. Add **System → Apple Shortcuts**:
   - Set **WebSocket URL** to `ws://127.0.0.1:8080` (matching the WebSocket Server port).

## Commands

- **Run Shortcut** (`Shortcut Name`, optional `Input Text`)
- **List Shortcuts**

## Returned JSON Payloads (via WebSocket)

### Run Shortcut
```json
{
  "ok": true,
  "action": "run",
  "shortcut": "My Shortcut",
  "output": "{\"status\":\"done\"}",
  "outputJson": { "status": "done" },
  "error": ""
}
```

### List Shortcuts
```json
{
  "ok": true,
  "action": "list",
  "shortcut": "",
  "shortcuts": ["Shortcut A", "Shortcut B"],
  "count": 2,
  "error": ""
}
```
