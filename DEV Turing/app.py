from __future__ import annotations
import os
import re
import sys
import base64
import inspect
import logging
import html as _html
from types import ModuleType
from typing import Any, List, Dict, Generator
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DEV Turing")

# ─────────────────────────────────────────
# Branding / demos / prompts
# ─────────────────────────────────────────
SYSTEM_PROMPT = """
You are DEV Turing, a senior software engineer expert in React, Tailwind, and Ant Design.
Output a single ```html code block with a self-contained page.
"""

DEMO_LIST = [
    {"title": "Dashboard",    "description": "Administrative panel with metrics and charts in mint color."},
    {"title": "Landing Page", "description": "Modern homepage for an AI startup."},
    {"title": "Weather App",  "description": "Weather application with animated icons and gradient background."},
]


def _load_asset_b64(rel_path: str, mime: str) -> str:
    """Loads a local file and returns a Base64 data URI. Returns '' on failure."""
    try:
        abs_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), rel_path)
        with open(abs_path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f"data:{mime};base64,{data}"
    except FileNotFoundError:
        logger.warning("Asset not found: %s", rel_path)
        return ""


BRAND_LOGO  = _load_asset_b64("image/vicon.png", "image/png")   # static logo (PNG)
BRAND_VIDEO = _load_asset_b64("image/vicon.mp4", "video/mp4")   # animated logo (MP4)

# ─────────────────────────────────────────
# Compatibility patches
# ─────────────────────────────────────────
if "audioop" not in sys.modules:
    _mock = ModuleType("audioop")
    _mock.error = type("error", (Exception,), {})               # type: ignore[assignment]
    for _fn in ("getsample", "max", "minmax", "avg", "cross"):
        setattr(_mock, _fn, lambda *a, **k: 0)
    sys.modules["audioop"] = _mock

try:
    import huggingface_hub as _hf
    if not hasattr(_hf, "HfFolder"):
        class _HfFolder:
            @staticmethod
            def get_token()    -> str | None: return os.getenv("HF_TOKEN")
            @staticmethod
            def save_token(_t) -> None: ...
            @staticmethod
            def delete_token() -> None: ...
        _hf.HfFolder = _HfFolder                               # type: ignore[attr-defined]
except Exception:
    pass

# ─────────────────────────────────────────
# Imports
# ─────────────────────────────────────────
import gradio as gr

current_dir = os.path.dirname(os.path.abspath(__file__))
image_path  = os.path.join(current_dir, "image")

InferenceClient = InferenceApi = None
try:
    from huggingface_hub import InferenceClient, InferenceApi   # type: ignore
except ImportError:
    try:
        from huggingface_hub import InferenceClient             # type: ignore
    except ImportError:
        pass

# ─────────────────────────────────────────
# Config
# ─────────────────────────────────────────
TOKEN           = os.getenv("HF_TOKEN", "")
HF_ROUTER_URL   = "https://router.huggingface.co"
MODEL_ID        = os.getenv("MODEL_ID", "Qwen/Qwen2.5-Coder-32B-Instruct")
MAX_TOKENS      = 4096
MAX_NO_PROGRESS = 80

# ─────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────
def coerce_to_str(value: Any) -> str:
    """Safely coerces any value to a plain string."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    if isinstance(value, dict):
        for key in ("value", "text", "content", "input", "body"):
            if key in value and isinstance(value[key], (str, bytes)):
                return coerce_to_str(value[key])
        parts = [coerce_to_str(v) for v in value.values() if isinstance(v, (str, bytes))]
        return " ".join(parts) if parts else str(value)
    if isinstance(value, (list, tuple)):
        return " ".join(coerce_to_str(v) for v in value)
    return str(value)


def extract_html(text: str) -> str:
    """Extracts the HTML block from the model's raw response."""
    s = coerce_to_str(text)
    if not s:
        return ""
    m = re.search(r'```(?:html|xml|markdown)?\s*(.*?)\s*```', s, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else s.replace("```html", "").replace("```", "").strip()


def build_sandbox(code: str) -> str:
    """Wraps generated HTML in a Base64 data-URI iframe."""
    encoded = base64.b64encode(code.encode("utf-8")).decode("utf-8")
    uri = f"data:text/html;charset=utf-8;base64,{encoded}"
    return (
        f'<iframe src="{uri}" '
        f'style="width:100%;height:100%;border:0;display:block;background:#fff;" '
        f'sandbox="allow-scripts allow-same-origin"></iframe>'
    )


def build_terminal_wrapper(cleaned_code: str) -> str:
    """
    Builds the terminal HTML with preview + source-code panes.

    Layout: pure flexbox — NO position:absolute.
      #terminal_wrapper  flex column; height driven by flex:1 from CSS chain
        #preview_inner   flex:1 + min-height:0  → fills space, iframe scrolls internally
        #code_inner      flex:1 + min-height:0  → hidden by default, overflow-y:auto scrolls
    """
    iframe  = build_sandbox(cleaned_code)
    escaped = _html.escape(cleaned_code)
    return (
        '<div id="terminal_wrapper">'
        f'<div id="preview_inner">{iframe}</div>'
        f'<pre id="code_inner">{escaped}</pre>'
        '</div>'
    )

# ─────────────────────────────────────────
# Inference client factory
# ─────────────────────────────────────────
def create_client(token: str, router_url: str):
    """Creates an InferenceClient, trying several constructor signatures."""
    if not token or InferenceClient is None:
        logger.info("No HF token or InferenceClient unavailable; using fallback.")
        return None
    try:
        params = list(inspect.signature(InferenceClient.__init__).parameters.keys())
    except Exception:
        params = []

    kwargs: dict = {"token": token}
    for k in ("base_url", "api_url", "endpoint"):
        if k in params:
            kwargs[k] = router_url
            break

    try:
        c = InferenceClient(**kwargs)
        logger.info("InferenceClient created with params: %s", list(kwargs.keys()))
        return c
    except TypeError:
        try:
            return InferenceClient(token)
        except Exception as e:
            logger.warning("InferenceClient token-only fallback failed: %s", e)
    except Exception as e:
        logger.warning("InferenceClient creation error: %s", e)
    return None


client = create_client(TOKEN, HF_ROUTER_URL)

# ─────────────────────────────────────────
# Streaming abstraction
# ─────────────────────────────────────────
def model_stream(messages: List[Dict[str, str]]):
    """Returns an iterable of chunks from the model. Tries multiple API methods."""
    if client is None:
        raise RuntimeError("No inference client available.")

    prompt = "\n".join(f"{m['role']}: {coerce_to_str(m['content'])}" for m in messages)

    for method_name, call in [
        ("chat_completion", lambda: client.chat_completion(
            model=MODEL_ID, messages=messages, stream=True)),
        ("chat", lambda: client.chat(
            model=MODEL_ID, messages=messages, stream=True)),
        ("text_generation", lambda: [client.text_generation(
            model=MODEL_ID, inputs=prompt, max_new_tokens=MAX_TOKENS)]),
    ]:
        if not hasattr(client, method_name):
            continue
        try:
            return call()
        except Exception as e:
            logger.debug("%s error: %s", method_name, e)

    if InferenceApi is not None:
        try:
            api = InferenceApi(repo_id=MODEL_ID, token=TOKEN, base_url=HF_ROUTER_URL)
            return [api(inputs=prompt, parameters={"max_new_tokens": MAX_TOKENS})]
        except Exception as e:
            logger.debug("InferenceApi error: %s", e)

    raise RuntimeError(
        f"No compatible method found on InferenceClient. "
        f"Available: {[m for m in dir(client) if not m.startswith('_')]}"
    )


def chunk_to_token(chunk: Any) -> str:
    """Extracts the text token from a stream chunk."""
    try:
        if isinstance(chunk, (str, bytes)):
            return coerce_to_str(chunk)
        if isinstance(chunk, dict):
            choices = chunk.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                return coerce_to_str(delta.get("content", "") if isinstance(delta, dict) else "")
            for k in ("generated_text", "text", "content", "output"):
                if k in chunk:
                    return coerce_to_str(chunk[k])
        if hasattr(chunk, "choices") and chunk.choices:
            delta = getattr(chunk.choices[0], "delta", None)
            if delta:
                return coerce_to_str(getattr(delta, "content", "") or "")
        return coerce_to_str(chunk)
    except Exception as e:
        logger.debug("chunk_to_token error: %s", e)
        return ""

# ─────────────────────────────────────────
# Fallback HTML (no inference client)
# ─────────────────────────────────────────
def _fallback_response(prompt_text: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>DEV Turing - Fallback</title>
<style>
  body{{font-family:system-ui;padding:28px;background:#f7fbf9;color:#042018;margin:0}}
  .card{{background:#fff;padding:24px;border-radius:10px;max-width:700px;
         margin:40px auto;box-shadow:0 2px 12px rgba(0,0,0,.08)}}
  h1{{color:#2ebf91;margin:0 0 12px}}
  code{{background:#f0faf6;padding:4px 8px;border-radius:4px;font-size:.9em}}
</style>
</head>
<body>
  <div class="card">
    <h1>DEV Turing - Fallback Mode</h1>
    <p>No inference client available. Set <code>HF_TOKEN</code> to enable the model.</p>
    <p><strong>Received prompt:</strong> {_html.escape(prompt_text)}</p>
  </div>
</body>
</html>"""

# ─────────────────────────────────────────
# Main generator
# ─────────────────────────────────────────
def on_submit(raw_input: Any) -> Generator:
    """Streams model output, yielding (progress_md, terminal_wrapper, copy_btn) tuples."""
    text = coerce_to_str(raw_input).strip()

    if not text:
        yield (
            gr.update(value="⚠️ Please enter a prompt before generating.", visible=True),
            gr.update(),
            gr.update(visible=False),
        )
        return

    # ── No client — serve fallback page ──────────────────────────────────────
    if client is None:
        cleaned = _fallback_response(text)
        yield (
            gr.update(visible=False),
            gr.update(value=build_terminal_wrapper(cleaned), visible=True),
            gr.update(visible=True),
        )
        return

    # ── Stream from model ─────────────────────────────────────────────────────
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": text},
    ]

    try:
        stream = model_stream(messages)
    except Exception as e:
        logger.exception("Error creating stream")
        yield (
            gr.update(value=f"❌ Error creating stream: {e}", visible=True),
            gr.update(),
            gr.update(visible=False),
        )
        return

    # Non-iterable response (single object)
    if not hasattr(stream, "__iter__") or isinstance(stream, (str, bytes)):
        cleaned = extract_html(chunk_to_token(stream))
        yield (
            gr.update(visible=False),
            gr.update(value=build_terminal_wrapper(cleaned), visible=True),
            gr.update(visible=True),
        )
        return

    # Iterable stream
    full_res    = ""
    no_progress = 0

    # 1. Show progress area on the first yield
    yield (
        gr.update(value="⏳ Generating code…", visible=True),
        gr.update(visible=True),
        gr.update(visible=False),
    )

    for chunk in stream:
        token = chunk_to_token(chunk)
        if token:
            full_res    += token
            no_progress  = 0
            yield (
                gr.update(value=full_res, visible=True),
                gr.update(),
                gr.update(visible=False),
            )
        else:
            no_progress += 1
            if no_progress >= MAX_NO_PROGRESS:
                logger.warning("Stream stalled — aborting.")
                break

    # 2. Generation complete → hide progress, show final result
    cleaned = extract_html(full_res)
    logger.info("Generated code (%d chars)", len(cleaned))
    yield (
        gr.update(visible=False),
        gr.update(value=build_terminal_wrapper(cleaned), visible=True),
        gr.update(visible=True),
    )

# ─────────────────────────────────────────
# JS helpers
# ─────────────────────────────────────────
# NOTE: preview uses display:flex (matches #preview_inner CSS default)
#       code    uses display:block so <pre> renders as a block-level scroller
_JS_PREVIEW = """() => {
  const p = document.getElementById('preview_inner');
  const c = document.getElementById('code_inner');
  if (p && c) { p.style.display = 'flex'; c.style.display = 'none'; }
}"""

_JS_CODE = """() => {
  const p = document.getElementById('preview_inner');
  const c = document.getElementById('code_inner');
  if (p && c) { p.style.display = 'none'; c.style.display = 'block'; }
}"""

_JS_COPY = """() => {
  const el  = document.getElementById('code_inner');
  const btn = document.getElementById('copy_btn');
  if (!el || !btn) return;
  const text = el.innerText || el.textContent || '';
  navigator.clipboard.writeText(text)
    .then(() => { const t = btn.innerText; btn.innerText = '✓ Copied!'; setTimeout(() => btn.innerText = t, 1400); })
    .catch(() => { const t = btn.innerText; btn.innerText = '✗ Failed';  setTimeout(() => btn.innerText = t, 1400); });
}"""

# ─────────────────────────────────────────
# CSS — clean, no redundancies, fully responsive
# ─────────────────────────────────────────
# Layout budget:
#   --topbar-h : 64px
#   --footer-h : 60px
#   .main_area : height = 100vh - 64 - 60 = calc(100vh - 124px)
#   #terminal_wrapper safety net: 100vh - 64 - 60 - padding(32) - header(48) ≈ 100vh - 204px

CUSTOM_CSS = r"""
/* ── Variables ──────────────────────────────────────────────────────────── */
:root {
  --mint:        #2ebf91;
  --mint-glow:   rgba(46, 191, 145, 0.15);
  --mint-border: rgba(46, 191, 145, 0.25);
  --mint-bright: #3dedb5;
  --dark:        #071018;
  --dark-card:   rgba(7, 16, 24, 0.55);
  --term-text:   #dffcf0;
  --term-accent: #9fe9c9;
  --muted:       #9fbfb0;
  --border:      rgba(137, 139, 141, 0.15);
  --radius:      10px;
  --transition:  0.25s ease;
  --topbar-h:    64px;
  --footer-h:    60px;
}

/* ── Reset ──────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
html, body             { margin: 0; padding: 0; }
footer                 { display: none !important; }

/* ── Global background ──────────────────────────────────────────────────── */
.gradio-container {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  min-height: 100vh;
  background:
    linear-gradient(135deg, rgba(0,0,0,.72) 0%, rgba(3,20,12,.65) 100%),
    url("file/image/back.png") center / cover no-repeat fixed;
}

/* ── Hide Gradio's native copy button inside code blocks ────────────────── */
.progress_area [class*="copy"],
.progress_area button[aria-label="Copy"] { display: none !important; }

/* ── Top Bar ────────────────────────────────────────────────────────────── */
.top_bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  height: var(--topbar-h);
  gap: 12px;
  background: transparent;
  border-bottom: 1px solid var(--mint-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.brand img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }

.brand h1 {
  margin: 0;
  font-size: 15px;
  color: #e8f8f3;
  letter-spacing: -0.2px;
}

.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }


.btn {
  background: var(--mint-glow);
  color: #e8f8f3;
  border: 1px solid var(--mint-border);
  padding: 7px 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition), transform var(--transition), border-color var(--transition);
  white-space: nowrap;
}

.btn:hover  { background: rgba(46,191,145,.28); border-color: rgba(46,191,145,.55); transform: translateY(-1px); }
.btn:active { transform: translateY(0); filter: brightness(.9); }
.btn.ghost  { background: transparent; color: var(--mint); border-color: var(--mint-border); }
.btn.ghost:hover { background: var(--mint-glow); border-color: rgba(46,191,145,.55); color: var(--mint-bright); }


.main_area {
  display: flex;
  gap: 16px;
  padding: 16px;
  height: calc(100vh - var(--topbar-h) - var(--footer-h));
}


.left_col {
  width: 320px;
  min-width: 260px;
  flex-shrink: 0;
  height: 100%;
  background: var(--dark-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0,1,15,.6);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #4a5568 #1a202c;
}

.left_col::-webkit-scrollbar       { width: 6px; }
.left_col::-webkit-scrollbar-track { background: #1a202c; border-radius: 6px; }
.left_col::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 6px; }
.left_col::-webkit-scrollbar-thumb:hover { background: #718096; }

.logo_small {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.logo_small video,
.logo_small img {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  pointer-events: none;
}

.templates { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }

.tpl-btn {
  background: rgba(1,5,26,.45);
  border: 1px solid rgba(245,245,245,.12);
  padding: 7px 11px;
  border-radius: 8px;
  font-size: 12px;
  color: #c8d8d0;
  cursor: pointer;
  transition: background var(--transition), transform var(--transition), border-color var(--transition);
}

.tpl-btn:hover {
  background: rgba(46,191,145,.2);
  border-color: var(--mint-border);
  transform: translateY(-1px);
  color: #e8f8f3;
}


.right_col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,1,15,.6);
  overflow: hidden;
}


.terminal_card {
  flex: 1;
  min-height: 0;        
  display: flex;
  flex-direction: column;
  background: rgba(7,16,24,.55);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  overflow: hidden;
}

.terminal_header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;       /* header never shrinks */
}

.terminal_title { color: var(--term-accent); font-weight: 700; font-size: 13px; letter-spacing: .3px; }


.terminal_content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
}


.terminal_content > div,
.terminal_content > div > div {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}


.terminal_wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /*
    Safety net height: if the flex chain somehow breaks (e.g. older Gradio version),
    this calc() ensures the pane is still visible and usable.
  */
  min-height: max(400px, calc(100vh - var(--topbar-h) - var(--footer-h) - 210px));
}

/* ── Preview pane ───────────────────────────────────────────────────────── */
.preview_inner {
  flex: 1;
  min-height: 0;
  display: flex;              /* default visible state; _JS_CODE sets display:none */
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.preview_inner iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

/* ── Code pane ──────────────────────────────────────────────────────────── */
#code_inner {
  display: none;              /* hidden by default; _JS_CODE sets display:block */
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 16px;
  color: var(--term-text);
  background: var(--dark);
  /*
    SCROLL FIX: overflow-y:auto makes the <pre> scrollable once displayed.
    white-space:pre keeps code formatting; overflow-x:auto handles long lines.
  */
  overflow-y: auto;
  overflow-x: auto;
  white-space: pre;
  word-break: normal;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  tab-size: 2;
  scrollbar-width: thin;
  scrollbar-color: #4a5568 #1a202c;
}

#code_inner::-webkit-scrollbar        { width: 8px; height: 8px; }
#code_inner::-webkit-scrollbar-track  { background: #1a202c; border-radius: 8px; }
#code_inner::-webkit-scrollbar-thumb  {
  background: linear-gradient(180deg, #718096, #4a5568);
  border-radius: 8px;
  border: 2px solid #1a202c;
}
#code_inner::-webkit-scrollbar-thumb:hover { background: #a0aec0; }
#code_inner::-webkit-scrollbar-corner      { background: #1a202c; }

/* ── Progress / stream area ─────────────────────────────────────────────── */
.progress_area {
  flex-shrink: 0;
  background: var(--dark-card);
  color: #cfeee0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  max-height: 220px;
  overflow-y: auto;
  white-space: pre-wrap;
  scrollbar-width: thin;
  scrollbar-color: #4a5568 #1a202c;
}

.progress_area::-webkit-scrollbar       { width: 6px; }
.progress_area::-webkit-scrollbar-track { background: #1a202c; border-radius: 6px; }
.progress_area::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 6px; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.custom-footer-box {
  height: var(--footer-h);
  background: var(--dark);
  border-top: 1px solid var(--mint-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  font-size: 12px;
  color: var(--muted);
  overflow: visible;
  position: relative;
  z-index: 10;
}

.custom-footer-box a            { color: #e8f8f3; text-decoration: none; transition: color var(--transition); }
.custom-footer-box a:hover      { color: var(--term-accent); }
.main-nav                       { display: flex; align-items: center; gap: 20px; }

.buy-menu-container             { position: relative; display: inline-block; }

.buy-trigger {
  cursor: pointer;
  font-weight: 700;
  color: #e8f8f3;
  padding: 20px 0;
  user-select: none;
}

.up-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(7,16,24,.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--mint-border);
  border-radius: 10px;
  list-style: none;
  padding: 10px;
  margin: 0;
  display: none;
  flex-direction: column;
  gap: 4px;
  min-width: 190px;
  box-shadow: 0 -12px 30px rgba(0,0,0,.5);
  z-index: 200;
}

.buy-menu-container:hover .up-menu { display: flex; }

.up-menu li a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  white-space: nowrap;
  font-size: 12.5px;
  transition: background var(--transition);
}

.up-menu li a:hover { background: var(--mint-glow); }

.nav-logo { height: 18px; width: 18px; border-radius: 4px; object-fit: cover; }

.soon-tag {
  background: rgba(46,191,145,.2);
  color: var(--mint);
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--mint);
  margin-left: auto;
}

.social-container               { display: flex; gap: 14px; align-items: center; }
.social-container img           { height: 26px; filter: grayscale(1) brightness(1.4); transition: filter var(--transition); }
.social-container a:hover img   { filter: grayscale(0) brightness(1); }

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .left_col { width: 270px; min-width: 210px; }
}
 
@media (max-width: 900px) {
  .main_area {
    flex-direction: column;
    padding: 10px;
    gap: 10px;
    overflow: visible;
    min-height: unset;
    height: auto;
  }
  .left_col {
    width: 100%;
    min-width: unset;
    height: auto;
    flex: 0 0 auto;
    overflow: visible;
  }
  .left_col > div {
    overflow: visible;
    height: auto;
  }
  .right_col  { flex: 0 0 auto; height: 70vh; min-height: 420px; }
  .terminal_card { min-height: 380px; }
  .terminal_wrapper { min-height: 320px; }
}
 
@media (max-width: 780px) {
  .top_bar_inner { padding: 0 14px; gap: 10px; }
  .brand h1      { font-size: 13px; }
  .brand-sub     { display: none; }
  .controls .btn { padding: 6px 11px; font-size: 12px; }
}
 
@media (max-width: 560px) {
  :root { --topbar-h: 52px; --footer-h: 46px; }
  .top_bar_inner { padding: 0 10px; gap: 8px; }
  .brand img, .brand video { width: 32px; height: 32px; }
  .brand h1      { display: none; }
  .controls .btn { padding: 5px 8px; font-size: 11px; }
  .main_area     { padding: 8px; gap: 8px; }
  .custom-footer-box { padding: 0 10px; font-size: 10.5px; }
  .main-nav      { gap: 10px; }
  .social-container { gap: 8px; }
  .right_col     { height: 65vh; min-height: 360px; }
}
 
@media (max-width: 420px) {
  .top_bar_inner { padding: 0 8px; gap: 6px; }
  .controls      { gap: 5px; }
  .controls .btn { padding: 4px 7px; font-size: 10px; }
  .left_col      { padding: 10px; }
  .tpl-btn, .templates button { font-size: 10.5px !important; padding: 6px 4px !important; }
}
"""

# ─────────────────────────────────────────
# Initial terminal placeholder
# ─────────────────────────────────────────
_INITIAL_WRAPPER = """
<div id="terminal_wrapper">
  <div id="preview_inner">
    <div style="display:flex;align-items:center;justify-content:center;
                height:100%;color:#4a7a60;font-family:monospace;font-size:13px;gap:8px;">
      <span style="font-size:18px;">▸</span> Ready to render&hellip;
    </div>
  </div>
  <pre id="code_inner"></pre>
</div>
"""

# ─────────────────────────────────────────
# Gradio UI
# ─────────────────────────────────────────
with gr.Blocks(title="DEV Turing", css=CUSTOM_CSS) as demo:

    # ── Top bar ──────────────────────────────────────────────────────────────
    with gr.Row(elem_classes="top_bar"):
        with gr.Column(scale=1, min_width=0):
            gr.HTML(
                f'<div class="brand">'
                f'  <img src="{BRAND_LOGO}" alt="DEV Turing logo" />'
                f'  <div>'
                f'    <h1>DEV Turing</h1>'
                f'    <div style="font-size:11px;color:var(--muted);">Software Engineering AI</div>'
                f'  </div>'
                f'</div>'
            )
        with gr.Column(scale=1, min_width=0):
            with gr.Row(elem_classes="controls"):
                preview_btn = gr.Button("Preview",     elem_classes="btn")
                code_btn    = gr.Button("Source Code", elem_classes="btn ghost")
                copy_btn    = gr.Button("Copy Code",   elem_id="copy_btn", elem_classes="btn", visible=False)

    # ── Main area ────────────────────────────────────────────────────────────
    with gr.Row(elem_classes="main_area"):

        # Left column
        with gr.Column(elem_classes="left_col"):
            # Animated video logo; falls back to static PNG if MP4 is missing
            if BRAND_VIDEO:
                gr.HTML(
                    f'<div class="logo_small">'
                    f'  <video src="{BRAND_VIDEO}" autoplay loop muted playsinline></video>'
                    f'  <div>'
                    f'    <strong style="color:#e8f8f3;">DEV Turing</strong>'
                    f'    <div style="font-size:11px;color:var(--muted);">UI Generator</div>'
                    f'  </div>'
                    f'</div>'
                )
            else:
                gr.HTML(
                    f'<div class="logo_small">'
                    f'  <img src="{BRAND_LOGO}" alt="logo" />'
                    f'  <div>'
                    f'    <strong style="color:#e8f8f3;">DEV Turing</strong>'
                    f'    <div style="font-size:11px;color:var(--muted);">UI Generator</div>'
                    f'  </div>'
                    f'</div>'
                )

            input_txt = gr.Textbox(
                placeholder="Describe the app you want to generate…",
                lines=5,
                elem_classes="prompt_input",
                label="",
                show_label=False,
            )

            with gr.Row():
                send_btn  = gr.Button("⚡ Generate Artifact", elem_classes="btn")
                clear_btn = gr.Button("Clear",               elem_classes="btn ghost")

            gr.Markdown("**Quick Templates**")
            with gr.Row(elem_classes="templates"):
                for item in DEMO_LIST:
                    _btn = gr.Button(item["title"], elem_classes="tpl-btn")
                    _btn.click(fn=lambda d=item["description"]: d, outputs=[input_txt])

        # Right column
        with gr.Column(elem_classes="right_col"):
            with gr.Column(elem_classes="terminal_card"):
                with gr.Row(elem_classes="terminal_header"):
                    gr.HTML('<div class="terminal_title">▸ Terminal — Preview / Source Code</div>')

                terminal_wrapper = gr.HTML(
                    value=_INITIAL_WRAPPER,
                    elem_classes="terminal_content",
                )
                progress_md = gr.Markdown(
                    value="",
                    elem_classes="progress_area",
                    visible=False,
                )

    # ── Footer ───────────────────────────────────────────────────────────────
    gr.HTML('''
    <div class="custom-footer-box">
      <div class="footer-left">
        <a href="http://127.0.0.1:5501" target="_blank">© 2026 · QhuboX.</a>
      </div>

      <nav class="main-nav">
        <a href="/ecosystem/BurnMENT4L/iBurn.html" target="_blank">Burn QHUBX</a>

        <div class="buy-menu-container">
          <span class="buy-trigger">Buy QHUBX ▴</span>
          <ul class="up-menu">
            
            <li><a href="https://raydium.io"      target="_blank"><img src="file/image/ray.png"     class="nav-logo"> Raydium</a></li>
            <li><a href="#"><img src="file/image/binance.png" class="nav-logo"> Binance <span class="soon-tag">Soon</span></a></li>
            <li><a href="#"><img src="file/image/bybit.jpg"   class="nav-logo"> Bybit   <span class="soon-tag">Soon</span></a></li>
            <li><a href="#"><img src="file/image/Bingx.png"   class="nav-logo"> BingX   <span class="soon-tag">Soon</span></a></li>
            <li><a href="#"><img src="file/image/4.png"       class="nav-logo"> OKX     <span class="soon-tag">Soon</span></a></li>
            <li><a href="#"><img src="file/image/bitget.png"  class="nav-logo"> Bitget  <span class="soon-tag">Soon</span></a></li>
          </ul>
        </div>
      </nav>

      <div class="footer-right">
        <div class="social-container">
          <a href="/ecosystem/mentalecosystemapp.html"><img src="file/image/home.jpg"    alt="home"></a>
          <a href="#" target="_blank">              <img src="file/image/twitter.png" alt="X"></a>
          <a href="https://discord.com" target="_blank"><img src="file/image/discord.png" alt="Discord"></a>
        </div>
      </div>
    </div>
    ''')

    # ── Event wiring ─────────────────────────────────────────────────────────
    preview_btn.click(fn=lambda: None, js=_JS_PREVIEW)
    code_btn   .click(fn=lambda: None, js=_JS_CODE)
    copy_btn   .click(fn=lambda: None, js=_JS_COPY)

    send_btn.click(
        fn=on_submit,
        inputs=[input_txt],
        outputs=[progress_md, terminal_wrapper, copy_btn],
    )

    clear_btn.click(
        fn=lambda: (
            gr.update(value=""),
            gr.update(value=_INITIAL_WRAPPER),
            gr.update(visible=False),
        ),
        outputs=[input_txt, terminal_wrapper, copy_btn],
    )

    # Start in preview mode on page load
    demo.load(fn=lambda: None, js=_JS_PREVIEW)


# ─────────────────────────────────────────
# Launch
# ─────────────────────────────────────────
if __name__ == "__main__":
    demo.queue().launch(
        allowed_paths=[image_path],
        show_error=True,
        share=False,    # Set to True for a public shareable link
    )