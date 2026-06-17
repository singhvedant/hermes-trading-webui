# INSTALL_FOR_AGENTS.md — Hermes Trading Web UI

> **You are an AI agent. This file is written for you.** Follow it top to bottom.
> Run one numbered step at a time, check the **Verify** gate before moving on, and
> stop to ask the human only where a step says **ASK**. Every command is
> idempotent — re-running a completed step is safe.

This installs and operates the **Hermes Trading Web UI**: the standard
[hermes-webui](https://github.com/nesquena/hermes-webui) plus a trading render
layer (interactive candlestick/line charts, sortable tables, quote scorecards,
allocation bars) and a `trading-widgets` skill that teaches the Hermes Agent to
emit them. The agent stays text-only; it prints a fenced ```hermes JSON block
and the UI renders it live.

**Canonical entry point** (what a human pastes to you to start a fresh install):

> Retrieve and follow the instructions at:
> `https://raw.githubusercontent.com/<YOUR_FORK>/hermes-trading-webui/master/INSTALL_FOR_AGENTS.md`

---

## 0. Preconditions

- OS: Linux, macOS, or WSL2. **Native Windows is not supported by the bootstrap** — use WSL2.
- `python3` (3.11+) and `git` on PATH.
- Network access (first run may download the Hermes Agent and Python deps).

**Verify:**
```bash
python3 --version && git --version && uname -s
```
If `python3` is missing, **ASK** the human to install Python 3.11+ before continuing.

---

## 1. Get the repository

If you are already running inside a clone of this repo, skip to step 2.
Otherwise:

```bash
git clone https://github.com/<YOUR_FORK>/hermes-trading-webui.git hermes-trading-webui
cd hermes-trading-webui
```

**Verify:** `ls bootstrap.py ctl.sh skills/trading-widgets/SKILL.md static/trading.js` lists all four with no error.

---

## 2. Install the `trading-widgets` skill into the Hermes Agent

The skill is the contract that makes the agent emit widgets. It must live in the
Hermes Agent skills directory (default `~/.hermes/skills/`).

```bash
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_HOME/skills"
cp -R skills/trading-widgets "$HERMES_HOME/skills/trading-widgets"
```

**Verify:**
```bash
test -f "$HERMES_HOME/skills/trading-widgets/SKILL.md" && echo "skill installed"
```
> If the running agent uses a non-default skills path, install there instead.
> You can confirm the path later in the WebUI (Settings → it lists discovered
> skills) or from the agent's `config.yaml`. The `skills` toolset must be enabled
> for the agent to load it (it is in the default toolset list).

---

## 3. Install + first-run bootstrap of the WebUI

`bootstrap.py` detects (or installs) the Hermes Agent, provisions a Python
environment with the WebUI dependencies, starts the server, and waits for
`/health`. Run it once in no-browser foreground mode to complete setup:

```bash
python3 bootstrap.py --no-browser --foreground --host 127.0.0.1 8787
```

- It binds `127.0.0.1:8787` by default.
- If the Hermes Agent is missing it will attempt the official installer.
- On first run it drops into an onboarding wizard for provider/API-key setup.
  **ASK** the human for any provider choice or API key it requests — do not
  guess credentials.

**Verify (in a second shell):**
```bash
curl -fsS http://127.0.0.1:8787/health && echo " — healthy"
```
Once healthy, stop this foreground process (**Ctrl-C**) and run it as a managed
daemon in step 4. (Foreground is only for the guided first run.)

---

## 4. Run as a managed daemon (the normal way to launch)

Use `ctl.sh` — it owns the PID file and is the only launch method with a clean
stop path.

```bash
./ctl.sh start                 # background daemon; PID at ~/.hermes/webui.pid
```
Bind elsewhere with env overrides, e.g. expose on the LAN:
```bash
HERMES_WEBUI_HOST=0.0.0.0 HERMES_WEBUI_PORT=8787 ./ctl.sh start
```

**Verify:**
```bash
./ctl.sh status                # expect "● hermes-webui — running" + Health: ok
```
Report the bound URL to the human: `http://<host>:<port>` (default
`http://127.0.0.1:8787`).

---

## 5. Enable the trading look

The Bloomberg-terminal **Terminal** skin ships with this build. Tell the human:

> In the WebUI: **Settings → Appearance → Skin → Terminal** (pairs best with the
> Dark theme), or type `/theme terminal` in the composer.

This is a per-user UI preference; you cannot set it from the shell. It is
optional — widgets render under any skin.

---

## 6. Operate (start / stop / status / logs)

| Intent | Command |
|---|---|
| Launch on user request | `./ctl.sh start` |
| Stop on user request | `./ctl.sh stop` (SIGTERM, waits, then SIGKILL) |
| Restart | `./ctl.sh restart` |
| Health / PID / uptime / port | `./ctl.sh status` |
| Tail logs | `./ctl.sh logs --lines 100` (add `--no-follow` to not block) |

> `./ctl.sh stop` only stops a server **it** started. A server launched with bare
> `python3 bootstrap.py` is stopped with **Ctrl-C**; a detached `bootstrap.py` or
> `./start.sh` is stopped by finding the PID (`lsof -i :8787` or `ss -tlnp`) and
> `kill`ing it. Prefer `ctl.sh` for everything so stop is deterministic.

---

## 7. Using the widgets (agent runtime behavior)

Once installed, when the human asks to *see* market data — a chart, a price, an
indicator (moving average, RSI, Bollinger, VWAP), a portfolio table, an
allocation breakdown — emit a fenced ```hermes block whose body is a JSON spec.
The full contract, every widget type, and copy-paste examples are in
`skills/trading-widgets/SKILL.md` (now installed at
`~/.hermes/skills/trading-widgets/SKILL.md`). Minimal example:

````
```hermes
{"type":"quote","symbol":"RELIANCE","currency":"₹","price":2890.5,"change":34.2,"changePct":1.2}
```
````
Only plot data you actually have. For large datasets, save a JSON file and
reference it with `"src":"path.json"`.

---

## 8. Troubleshooting

- **`/health` unreachable after start** → `./ctl.sh logs --lines 200 --no-follow`; common causes are an incomplete provider setup (re-run step 3 onboarding) or a missing dependency.
- **Port already in use** → another instance is bound. `./ctl.sh status`; if stale, `./ctl.sh stop` then `start`. To run a second instance, pick another port: `HERMES_WEBUI_PORT=8788 ./ctl.sh start`.
- **macOS launchd conflict** ("Refusing to start … launchd job") → a system-managed instance owns the port; either use its URL or `launchctl kickstart -k gui/$(id -u)/com.parantoux.hermes-webui`.
- **Widgets show as raw JSON code blocks** → the browser is on an old cached build; hard-refresh. The render layer lives in `static/trading.js` + `static/trading.css` (linked from `static/index.html`).
- **Agent doesn't emit ```hermes blocks** → the skill isn't loaded. Re-check step 2's path and that the `skills` toolset is enabled for the agent.

---

## 9. Uninstall / clean stop

```bash
./ctl.sh stop
rm -f "$HOME/.hermes/webui.pid" "$HOME/.hermes/webui.ctl.env"
# optional: remove the skill
rm -rf "${HERMES_HOME:-$HOME/.hermes}/skills/trading-widgets"
```

That's the whole lifecycle: **install skill → bootstrap → `ctl.sh start` →
operate → `ctl.sh stop`.**
