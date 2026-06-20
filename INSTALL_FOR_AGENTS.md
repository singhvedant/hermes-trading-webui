# INSTALL_FOR_AGENTS.md — Hermes Trading Web UI

> **You are an AI agent. This file is written for you.** Follow it top to bottom.
> Run one numbered step at a time, check the **Verify** gate before moving on, and
> stop to ask the human only where a step says **ASK**. Every command is
> idempotent — re-running a completed step is safe.

This installs and operates the **Hermes Trading Web UI**: the standard
[hermes-webui](https://github.com/nesquena/hermes-webui) plus a trading render
layer (interactive candlestick/line charts, sortable tables, quote scorecards,
allocation bars) and **two skills** that teach the agent to drive it:
`trading-widgets` (the rendering contract — emit a fenced ```hermes JSON block
and the UI renders it live) and `webui-system-management` (start / stop /
restart / update the server). The agent stays text-only.

**Any agent can run this guide** — Hermes Agent, Claude Code, Codex, or any
assistant that can run shell commands and keep persistent notes/memory.
Wherever this file says "the agent", it means *you*. Steps that write to
memory use Hermes's `memory` toolset if you are Hermes, or your equivalent
persistent notes / MEMORY file otherwise.

**Canonical entry point** (what a human pastes to you to start a fresh install):

> Retrieve and follow the instructions at:
> `https://raw.githubusercontent.com/singhvedant/hermes-trading-webui/master/INSTALL_FOR_AGENTS.md`

---

## 0. Preconditions

- OS: Linux, macOS, WSL2, or Windows native (see note below).
- `python3` / `python` (3.11+) and `git` on PATH.
- Network access (first run may download the Hermes Agent and Python deps).

**Verify (Linux/macOS/WSL2):**
```bash
python3 --version && git --version && uname -s
```

**Verify (Windows native cmd/PowerShell):**
```cmd
python --version && git --version
```

If Python is missing, **ASK** the human to install Python 3.11+ before continuing.

### Windows native note

WSL2 is the easiest path on Windows. If WSL2 is available, use it and follow
the Linux steps throughout. If the agent is running in a native Windows Python
environment (no WSL2), use the adapted steps marked **[Windows]** in steps 2–4
below and skip `ctl.sh` entirely — it is a bash script and does not run on
Windows. Everything else in the guide works unchanged.

---

## 1. Get the repository

If you are already running inside a clone of this repo, skip to step 2.
Otherwise:

```bash
git clone https://github.com/singhvedant/hermes-trading-webui.git hermes-trading-webui
cd hermes-trading-webui
```

**Verify:** `ls bootstrap.py ctl.sh skills/trading-widgets/SKILL.md static/trading.js` lists all four with no error.

---

## 2. Install the skills into the agent

The repo ships two skills under `skills/`. Install **all** of them into the
agent skills directory (default `~/.hermes/skills/`) — copy every skill the repo
provides so future additions are picked up by the same step:

```bash
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_HOME/skills"
for d in skills/*/; do
  name="$(basename "$d")"
  rm -rf "$HERMES_HOME/skills/$name"
  cp -R "$d" "$HERMES_HOME/skills/$name"
done
```

This installs:
- **`trading-widgets`** — the contract that makes you emit chart/table/quote widgets.
- **`webui-system-management`** — how to start/stop/restart/update this UI server.

**Verify:**
```bash
ls "$HERMES_HOME/skills/trading-widgets/SKILL.md" "$HERMES_HOME/skills/webui-system-management/SKILL.md"
```
Keep **both enabled** in the UI's **Skills** panel (the layers icon in the left
rail) — a skill toggled off there will not load into the agent. The `skills`
toolset must be enabled for the agent (it is in the default toolset list).
> If the running agent uses a non-default skills path, install there instead;
> confirm the path in the Skills panel or the agent's `config.yaml`.

---

## 3. Install + first-run bootstrap of the WebUI

`bootstrap.py` detects (or installs) the Hermes Agent, provisions a Python
environment with the WebUI dependencies, starts the server, and waits for
`/health`. Run it once in no-browser foreground mode to complete setup:

**Linux / macOS / WSL2:**
```bash
python3 bootstrap.py --no-browser --foreground --host 127.0.0.1 8787
```

**[Windows] native Python — two sub-steps:**

First, install the Hermes Agent manually (the bash auto-installer does not run
on native Windows). Clone or download it into `%USERPROFILE%\.hermes\hermes-agent`
and install its Python dependencies:
```cmd
git clone https://github.com/NousResearch/hermes-agent.git %USERPROFILE%\.hermes\hermes-agent
cd %USERPROFILE%\.hermes\hermes-agent
python -m pip install -r requirements.txt
```
Then run the bootstrap with `--skip-agent-install` so it does not attempt the
bash installer:
```cmd
python bootstrap.py --no-browser --foreground --host 127.0.0.1 --skip-agent-install 8787
```

- It binds `127.0.0.1:8787` by default.
- On first run it drops into an onboarding wizard for provider/API-key setup.
  **ASK** the human for any provider choice or API key it requests — do not
  guess credentials.

**Verify (in a second shell):**
```bash
curl -fsS http://127.0.0.1:8787/health && echo " — healthy"
```
On Windows without curl, use:
```cmd
python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8787/health').read())"
```
Once healthy, stop this foreground process (**Ctrl-C**) and run it as a managed
daemon in step 4. (Foreground is only for the guided first run.)

---

## 4. Run as a managed daemon (the normal way to launch)

**Linux / macOS / WSL2** — use `ctl.sh`, which owns the PID file and is the
only launch method with a clean stop path:

```bash
./ctl.sh start                 # background daemon; PID at ~/.hermes/webui.pid
```
Bind elsewhere with env overrides, e.g. expose on the LAN:
```bash
HERMES_WEBUI_HOST=0.0.0.0 HERMES_WEBUI_PORT=8787 ./ctl.sh start
```

**Verify (Linux/macOS/WSL2):**
```bash
./ctl.sh status                # expect "● hermes-webui — running" + Health: ok
```

**[Windows] native Python — `ctl.sh` does not work; launch directly:**

```cmd
set HERMES_WEBUI_HOST=127.0.0.1
set HERMES_WEBUI_PORT=8787
start /B python bootstrap.py --no-browser --skip-agent-install 8787 > webui.log 2>&1
```
To stop: find and kill the Python process by port:
```cmd
for /f "tokens=5" %p in ('netstat -ano ^| findstr :8787') do taskkill /PID %p /F
```
To expose on the LAN, set `HERMES_WEBUI_HOST=0.0.0.0` before running.

Report the bound URL to the human: `http://<host>:<port>` (default
`http://127.0.0.1:8787`).

**Remember the deployment (do this once).** Persist these facts to your memory
so any future session can open / stop / restart the UI without rediscovering
them — this is what makes you able to manage the server on request:

- `WEBUI_REPO` — absolute path to this repo clone (run `pwd`)
- `WEBUI_URL`  — `http://<host>:<port>` from the status output
- management: `cd $WEBUI_REPO && ./ctl.sh start|stop|restart|status`

> Hermes: write it with the `memory` toolset, e.g. a note
> `webui: repo=<pwd> url=http://127.0.0.1:8787 manage via ./ctl.sh start|stop|restart`.
> Other agents: write the same line to your persistent notes / MEMORY file.
> The `webui-system-management` skill (installed in step 2) documents the full
> operating procedure and how to re-derive the port if memory goes stale.

---

## 5. Enable the trading look

The Bloomberg-terminal **Terminal** skin ships with this build. Tell the human:

> In the WebUI: **Settings → Appearance → Skin → Terminal** (pairs best with the
> Dark theme), or type `/theme terminal` in the composer.

This is a per-user UI preference; you cannot set it from the shell. It is
optional — widgets render under any skin.

---

## 6. Operate (start / stop / status / logs)

**Linux / macOS / WSL2:**

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

**[Windows] native Python:**

| Intent | Command |
|---|---|
| Launch | `start /B python bootstrap.py --no-browser --skip-agent-install 8787 > webui.log 2>&1` |
| Stop | `for /f "tokens=5" %p in ('netstat -ano ^| findstr :8787') do taskkill /PID %p /F` |
| Health check | `python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8787/health').read())"` |
| Tail logs | `type webui.log` or `Get-Content webui.log -Wait` (PowerShell) |

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

## 8. Keep the UI and skills updated

When the user asks to "update the trading UI", or as periodic maintenance, pull
the latest and **re-sync the skills** so your widget vocabulary stays current
(an update may add new widget types or fix the contract):

```bash
cd "$WEBUI_REPO"          # the path you saved in memory (step 4)
git pull origin master

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
for d in skills/*/; do
  name="$(basename "$d")"
  rm -rf "$HERMES_HOME/skills/$name"
  cp -R "$d" "$HERMES_HOME/skills/$name"
done

./ctl.sh restart          # pick up server/template changes
./ctl.sh status
```
Then re-read `skills/trading-widgets/SKILL.md` if it changed, and tell the user
what's new (a `git log` summary since the last pull helps). The
`webui-system-management` skill carries this same procedure for runtime use.

---

## 9. Troubleshooting

- **`/health` unreachable after start** → `./ctl.sh logs --lines 200 --no-follow`; common causes are an incomplete provider setup (re-run step 3 onboarding) or a missing dependency.
- **Port already in use** → another instance is bound. `./ctl.sh status`; if stale, `./ctl.sh stop` then `start`. To run a second instance, pick another port: `HERMES_WEBUI_PORT=8788 ./ctl.sh start`.
- **macOS launchd conflict** ("Refusing to start … launchd job") → a system-managed instance owns the port; either use its URL or `launchctl kickstart -k gui/$(id -u)/com.parantoux.hermes-webui`.
- **Widgets show as raw JSON code blocks** → the browser is on an old cached build; hard-refresh. The render layer lives in `static/trading.js` + `static/trading.css` (linked from `static/index.html`).
- **Agent doesn't emit ```hermes blocks** → the skill isn't loaded. Re-check step 2's path and that the `skills` toolset is enabled for the agent.

---

## 10. Uninstall / clean stop

```bash
./ctl.sh stop
rm -f "$HOME/.hermes/webui.pid" "$HOME/.hermes/webui.ctl.env"
# optional: remove the skills
rm -rf "${HERMES_HOME:-$HOME/.hermes}/skills/trading-widgets" \
       "${HERMES_HOME:-$HOME/.hermes}/skills/webui-system-management"
```

That's the whole lifecycle: **install skills → bootstrap → `ctl.sh start` →
operate → update (`git pull` + re-sync skills) → `ctl.sh stop`.**
