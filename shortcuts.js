/*
  Apple Shortcuts Custom Module (OS + WebSocket Return)
  Executes /usr/bin/shortcuts non-blocking via Python and sends
  a JSON payload of results to a Chataigne WebSocket Server.
*/

function init()
{
}

function moduleParameterChanged(param)
{
	if (param.name == "runDefault")
	{
		var defName = local.parameters.defaultShortcut.get();
		if (defName && defName !== "")
		{
			runShortcut(defName, "");
		}
		else
		{
			script.logWarning("Default Shortcut is empty");
		}
	}
	else if (param.name == "listShortcuts")
	{
		listShortcuts();
	}
}

function processDataReceived(data, command)
{
	if (data && data.length > 0)
	{
		script.log("Apple Shortcuts output: " + data);
	}
}

function runShortcut(shortcutName, inputText)
{
	if (!shortcutName || shortcutName === "")
	{
		script.logWarning("Shortcut Name is empty");
		return;
	}
	var inStr = inputText ? ("" + inputText) : "";
	executeShortcutsAction("run", "" + shortcutName, inStr);
}

function listShortcuts()
{
	executeShortcutsAction("list", "", "");
}

function toHex(str)
{
	var digits = "0123456789abcdef";
	var hex = "";
	for (var i = 0; i < str.length; i++)
	{
		var code = str.charCodeAt(i);
		hex += digits.charAt((code >> 4) & 0x0f) + digits.charAt(code & 0x0f);
	}
	return hex;
}

function executeShortcutsAction(action, shortcutName, inputText)
{
	var wsUrl = local.parameters.webSocketURL.get();
	if (!wsUrl || wsUrl === "") wsUrl = "ws://127.0.0.1:8080";

	script.log("Apple Shortcuts -> " + action + (shortcutName !== "" ? " (" + shortcutName + ")" : ""));

	var pyLines = [
		"import sys, subprocess, socket, os, base64, json, tempfile, urllib.parse as u",
		"parts = [bytes.fromhex(x).decode('utf-8') for x in sys.argv[2].split('|')]",
		"action, name, ws, inp = parts[0], parts[1], parts[2], parts[3]",
		"res = {'ok': True, 'action': action, 'shortcut': name, 'error': ''}",
		"in_path = None",
		"out_path = None",
		"try:",
		"    if action == 'list':",
		"        proc = subprocess.run(['/usr/bin/shortcuts', 'list'], capture_output=True, text=True)",
		"        if proc.returncode != 0:",
		"            res['ok'] = False",
		"            res['error'] = proc.stderr.strip() or 'shortcuts list failed'",
		"            res['shortcuts'] = []",
		"            res['count'] = 0",
		"        else:",
		"            items = [line.strip() for line in proc.stdout.splitlines() if line.strip()]",
		"            res['shortcuts'] = items",
		"            res['count'] = len(items)",
		"    elif action == 'run':",
		"        fd_out, out_path = tempfile.mkstemp(prefix='chataigne_sc_out_')",
		"        os.close(fd_out)",
		"        cmd = ['/usr/bin/shortcuts', 'run', name, '--output-path', out_path, '--output-type', 'public.plain-text']",
		"        if inp:",
		"            fd_in, in_path = tempfile.mkstemp(prefix='chataigne_sc_in_')",
		"            with os.fdopen(fd_in, 'w', encoding='utf-8') as f:",
		"                f.write(inp)",
		"            cmd.extend(['--input-path', in_path])",
		"        proc = subprocess.run(cmd, capture_output=True, text=True)",
		"        out_text = ''",
		"        if os.path.exists(out_path):",
		"            with open(out_path, 'r', encoding='utf-8', errors='replace') as f:",
		"                out_text = f.read().strip()",
		"        if not out_text and proc.stdout:",
		"            out_text = proc.stdout.strip()",
		"        res['output'] = out_text",
		"        res['outputJson'] = None",
		"        if out_text:",
		"            try:",
		"                res['outputJson'] = json.loads(out_text)",
		"            except Exception:",
		"                pass",
		"        if proc.returncode != 0:",
		"            res['ok'] = False",
		"            res['error'] = proc.stderr.strip() or ('Exit code ' + str(proc.returncode))",
		"            print('SHORTCUTS_ERR: ' + res['error'], flush=True)",
		"except Exception as ex:",
		"    res['ok'] = False",
		"    res['error'] = str(ex)",
		"    print('SHORTCUTS_ERR: ' + str(ex), flush=True)",
		"finally:",
		"    for pth in (in_path, out_path):",
		"        if pth and os.path.exists(pth):",
		"            try: os.remove(pth)",
		"            except Exception: pass",
		"p = json.dumps(res).encode('utf-8')",
		"try:",
		"    r = u.urlparse(ws)",
		"    s = socket.create_connection((r.hostname or '127.0.0.1', r.port or 80), 2)",
		"    k = base64.b64encode(os.urandom(16)).decode()",
		"    req = ('GET ' + (r.path or '/') + ' HTTP/1.1\\r\\nHost: ' + r.netloc + '\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: ' + k + '\\r\\nSec-WebSocket-Version: 13\\r\\n\\r\\n').encode()",
		"    s.sendall(req)",
		"    s.recv(4096)",
		"    m = os.urandom(4)",
		"    n = len(p)",
		"    if n < 126: h = bytes([0x81, 0x80 | n])",
		"    elif n < 65536: h = bytes([0x81, 0xfe]) + n.to_bytes(2, 'big')",
		"    else: h = bytes([0x81, 0xff]) + n.to_bytes(8, 'big')",
		"    s.sendall(h + m + bytes(b ^ m[i % 4] for i, b in enumerate(p)))",
		"    cm = os.urandom(4)",
		"    s.sendall(bytes([0x88, 0x82]) + cm + bytes(b ^ cm[i % 4] for i, b in enumerate(b'\\x03\\xe8')))",
		"    s.settimeout(0.2)",
		"    try: s.recv(64)",
		"    except Exception: pass",
		"    s.close()",
		"except Exception as ex:",
		"    print('WS_ERR: ' + str(ex), flush=True)"
	];

	var pyCode = "";
	for (var i = 0; i < pyLines.length; i++)
	{
		if (i > 0) pyCode += "\n";
		pyCode += pyLines[i];
	}

	var bootHex = toHex("import sys;exec(bytes.fromhex(sys.argv[1]).decode())");
	var pyHex = toHex(pyCode);
	var argsPacked = toHex(action) + "|" + toHex(shortcutName) + "|" + toHex(wsUrl) + "|" + toHex(inputText);

	var fullCmd = "/usr/bin/python3 -c exec(bytes.fromhex('" + bootHex + "').decode()) "
		+ pyHex + " " + argsPacked;

	// Non-blocking execution on OSModule's background thread
	local.launchProcess(fullCmd, 0);
}
