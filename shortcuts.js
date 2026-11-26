/*
  Apple Shortcuts Custom Module (OS + JXA + WebSocket Return)
  Executes Apple Shortcuts Events non-blocking via osascript (JXA) and sends
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
	var inStr = (inputText !== undefined && inputText !== null) ? ("" + inputText) : "";
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
		if (code < 0x80)
		{
			hex += digits.charAt((code >> 4) & 0x0f) + digits.charAt(code & 0x0f);
		}
		else if (code < 0x800)
		{
			var b1 = 0xc0 | (code >> 6);
			var b2 = 0x80 | (code & 0x3f);
			hex += digits.charAt((b1 >> 4) & 0x0f) + digits.charAt(b1 & 0x0f);
			hex += digits.charAt((b2 >> 4) & 0x0f) + digits.charAt(b2 & 0x0f);
		}
		else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length)
		{
			var next = str.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff)
			{
				var cp = 0x10000 + (((code - 0xd800) << 10) | (next - 0xdc00));
				var u1 = 0xf0 | (cp >> 18);
				var u2 = 0x80 | ((cp >> 12) & 0x3f);
				var u3 = 0x80 | ((cp >> 6) & 0x3f);
				var u4 = 0x80 | (cp & 0x3f);
				hex += digits.charAt((u1 >> 4) & 0x0f) + digits.charAt(u1 & 0x0f);
				hex += digits.charAt((u2 >> 4) & 0x0f) + digits.charAt(u2 & 0x0f);
				hex += digits.charAt((u3 >> 4) & 0x0f) + digits.charAt(u3 & 0x0f);
				hex += digits.charAt((u4 >> 4) & 0x0f) + digits.charAt(u4 & 0x0f);
				i++;
				continue;
			}
		}
		else
		{
			var c1 = 0xe0 | (code >> 12);
			var c2 = 0x80 | ((code >> 6) & 0x3f);
			var c3 = 0x80 | (code & 0x3f);
			hex += digits.charAt((c1 >> 4) & 0x0f) + digits.charAt(c1 & 0x0f);
			hex += digits.charAt((c2 >> 4) & 0x0f) + digits.charAt(c2 & 0x0f);
			hex += digits.charAt((c3 >> 4) & 0x0f) + digits.charAt(c3 & 0x0f);
		}
	}
	return hex;
}

function executeShortcutsAction(action, shortcutName, inputText)
{
	var wsUrl = local.parameters.webSocketURL.get();
	if (!wsUrl || wsUrl === "") wsUrl = "ws://127.0.0.1:8080";

	script.log("Apple Shortcuts -> " + action + (shortcutName !== "" ? " (" + shortcutName + ")" : ""));

	var pyLines = [
		"import sys, subprocess, socket, os, base64, json, urllib.parse as u",
		"parts = [bytes.fromhex(x).decode('utf-8') for x in sys.argv[2].split('|')]",
		"action, name, ws, inp = parts[0], parts[1], parts[2], parts[3]",
		"res = {'ok': True, 'action': action, 'shortcut': name, 'error': ''}",
		"jxa = '\\n'.join([",
		"    'var action = ' + json.dumps(action) + ';',",
		"    'var name = ' + json.dumps(name) + ';',",
		"    'var inp = ' + json.dumps(inp) + ';',",
		"    'var se = Application(\"Shortcuts Events\");',",
		"    'if (action === \"list\") {',",
		"    '    var names = se.shortcuts.name();',",
		"    '    JSON.stringify({ ok: true, shortcuts: names });',",
		"    '} else if (action === \"run\") {',",
		"    '    var sc = se.shortcuts.byName(name);',",
		"    '    if (!sc.exists()) sc = se.shortcuts.byId(name);',",
		"    '    if (!sc.exists()) throw new Error(\"Shortcut not found: \" + name);',",
		"    '    var outVal;',",
		"    '    if (inp !== \"\") {',",
		"    '        var inputArg = inp;',",
		"    '        var trimmed = inp.trim();',",
		"    '        if ((trimmed.charAt(0) === \"{\" && trimmed.charAt(trimmed.length - 1) === \"}\") || (trimmed.charAt(0) === \"[\" && trimmed.charAt(trimmed.length - 1) === \"]\")) {',",
		"    '            try { inputArg = JSON.parse(trimmed); } catch (e) { inputArg = inp; }',",
		"    '        }',",
		"    '        outVal = se.run(sc, { withInput: inputArg });',",
		"    '    } else {',",
		"    '        outVal = se.run(sc);',",
		"    '    }',",
		"    '    var hasOut = (outVal !== undefined && outVal !== null);',",
		"    '    JSON.stringify({ ok: true, hasOutput: hasOut, rawOutput: hasOut ? outVal : null });',",
		"    '}'",
		"])",
		"try:",
		"    proc = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', '-'], input=jxa, capture_output=True, text=True)",
		"    if proc.returncode != 0:",
		"        res['ok'] = False",
		"        res['error'] = proc.stderr.strip() or ('Exit code ' + str(proc.returncode))",
		"        if action == 'list':",
		"            res['shortcuts'] = []",
		"            res['count'] = 0",
		"        elif action == 'run':",
		"            res['output'] = ''",
		"            res['outputJson'] = None",
		"        print('SHORTCUTS_ERR: ' + res['error'], flush=True)",
		"    else:",
		"        data = json.loads(proc.stdout.strip() or '{}')",
		"        if action == 'list':",
		"            items = [str(x).strip() for x in data.get('shortcuts', []) if str(x).strip()]",
		"            res['shortcuts'] = items",
		"            res['count'] = len(items)",
		"        elif action == 'run':",
		"            res['output'] = ''",
		"            res['outputJson'] = None",
		"            if data.get('hasOutput'):",
		"                raw = data.get('rawOutput')",
		"                if isinstance(raw, str):",
		"                    res['output'] = raw.strip()",
		"                    if res['output']:",
		"                        try:",
		"                            res['outputJson'] = json.loads(res['output'])",
		"                        except Exception:",
		"                            pass",
		"                elif isinstance(raw, (dict, list)):",
		"                    res['output'] = json.dumps(raw)",
		"                    res['outputJson'] = raw",
		"                else:",
		"                    res['output'] = str(raw)",
		"                    res['outputJson'] = raw",
		"except Exception as ex:",
		"    res['ok'] = False",
		"    res['error'] = str(ex)",
		"    print('SHORTCUTS_ERR: ' + str(ex), flush=True)",
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
