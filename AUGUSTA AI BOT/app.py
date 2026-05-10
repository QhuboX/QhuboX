# app.py
import sys
from types import ModuleType
 
# --- MOCK AUDIOOP ---
if "audioop" not in sys.modules:
    mock_audioop = ModuleType("audioop")
    mock_audioop.error = type("error", (Exception,), {})
    mock_audioop.getsample = lambda *a, **k: 0
    mock_audioop.max = lambda *a, **k: 0
    mock_audioop.minmax = lambda *a, **k: (0, 0)
    mock_audioop.avg = lambda *a, **k: 0
    mock_audioop.mul = lambda *a, **k: b""
    mock_audioop.tomono = lambda *a, **k: b""
    mock_audioop.tostere = lambda *a, **k: b""
    mock_audioop.add = lambda *a, **k: b""
    mock_audioop.bias = lambda *a, **k: b""
    sys.modules["audioop"] = mock_audioop
    sys.modules["pyaudioop"] = mock_audioop
 
import os
import re
import json
import logging
import pathlib
import shutil
import asyncio
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Tuple
 
import httpx
import speech_recognition as sr
from gtts import gTTS
from dotenv import load_dotenv
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import azure.cognitiveservices.speech as speechsdk
from pydub import AudioSegment
 
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alan-fastapi")
 
# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
AZURE_TTS_KEY      = os.getenv("AZURE_TTS_KEY", "")
AZURE_TTS_REGION   = os.getenv("AZURE_TTS_REGION", "")
AZURE_VOICE_DEFAULT = os.getenv("AZURE_VOICE_DEFAULT", "en-US-AvaMultilingualNeural")
TOKEN              = os.getenv("HF_TOKEN", "")
MODEL_ID           = os.getenv("MODEL_ID", "Qwen/Qwen3-7B-Instruct")
LANG_DEFAULT       = os.getenv("LANG_DEFAULT", "en")
MAX_AUDIO_MB       = 20
 
TTS_DIR = pathlib.Path("tts_cache")
TTS_DIR.mkdir(exist_ok=True)
 
# ─────────────────────────────────────────────
#  WEB SEARCH
# ─────────────────────────────────────────────
SEARCH_AVAILABLE = False
WIKI_AVAILABLE   = False
 
try:
    from duckduckgo_search import DDGS
    SEARCH_AVAILABLE = True
    logger.info("DuckDuckGo search: OK")
except Exception as e:
    logger.warning("DuckDuckGo not available: %s", e)
 
try:
    import wikipedia
    wikipedia.set_lang("en")
    WIKI_AVAILABLE = True
    logger.info("Wikipedia: OK")
except Exception as e:
    logger.warning("Wikipedia not available: %s", e)
 
# ─────────────────────────────────────────────
#  HUGGINGFACE CLIENT
# ─────────────────────────────────────────────
from huggingface_hub import InferenceClient
 
client = InferenceClient(
    token=TOKEN,
    base_url="https://router.huggingface.co/v1"
) if TOKEN else None
 
# ─────────────────────────────────────────────
#  FASTAPI APP
# ─────────────────────────────────────────────
app = FastAPI()
executor = ThreadPoolExecutor(max_workers=4)
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)
 
static_dir = pathlib.Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
alan_src = pathlib.Path(__file__).parent / "alan.png"
alan_dst = static_dir / "alan.png"
if alan_src.exists() and not alan_dst.exists():
    shutil.copy(alan_src, alan_dst)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
 
# ─────────────────────────────────────────────
#  ECOSYSTEM KB
# ─────────────────────────────────────────────
ECOSYSTEM_KB = """
=== QHUBX ECOSYSTEM — COMPLETE KNOWLEDGE BASE ===
 
## WHAT IS QHUBX?
QhuboX is a blockchain ecosystem built on Solana focused on TRUE ON-CHAIN ADOPTION through the concept of "Everydayness" — making blockchain stop being a novelty and become a daily necessity. The motto is: "Materializing True On-Chain Adoption. Reaching everyone, everywhere."
 
## VISION
To be the world-leading ecosystem that decentralizes daily life, making blockchain an invisible, essential, and universally adopted infrastructure for individuals, businesses, and communities, guaranteeing data sovereignty and frictionless security.
 
## MISSION
Continuously drive the development of secure, functional, and modular on-chain solutions based on the principle of Everydayness, incentivizing a self-sufficient developer community through the QHUBX token, to improve daily life and materialize total ownership of every user's digital identity and assets.
 
## TOKEN: $QHUBX
- Blockchain: Solana
- Purpose: Utility token that powers the entire QhuboX ecosystem
- Use cases: governance, incentives for developers and community, payments within dApps
 
## Q³ PILLARS (Core Technology)
1. Fluid UX — seamless, interruption-free user experience
2. Onchain Security — Solana's immutability embedded at every step
3. Unified Liquidity — efficient, always-available capital
 
## ECOSYSTEM APPS (dApps)
- **Kiaraap** — portfolio application
- **QhuboX Wallet** — Swap security /crypto management
- **QhuboX Chat, voice, video call** — messaging platform
- **QhuboX Terminal** — Analytics/radar, tools, trading and ecosystem dashboard
- **Sollower** — social-fi  platform
- **sAIgnalx**  AI-powered signals and analytics for sniper trading bot
- **Green Player** (QhuboXtv) — Media/streaming player
- **Pebbles** — Monitor bubbles Market/ price show app
- **NeuroQhuboX** — AI-integrated neuro tool
- **Qburn** — Token burn mechanism
- **DEV Turing** — Developer AI tool
- **Coinstak** — Coin staking/analytics
 
## AUGUSTA AI BOT
Augusta is QhuboX's integrated AI assistant embedded directly in the QhuboX Ecosystem.
 
## TEAM & ORGANIZATION
- QhuboX  — drives the development of secure and functional on-chain solutions
- Collaborated with  Solana Network
- Founded/published: January 2, 2026
 
## SOCIAL & LINKS
- Twitter/X: https://x.com/qhuboxecosystem
- Whitepaper: available at whitepaper.html
 
## ROADMAP (from whitepaper v1.0 — 2026)
- Phase 1: Core infrastructure and token launch on Solana ✓
- Phase 2: dApp ecosystem expansion ✓
- Phase 3: Mass adoption push — reaching everyone, everywhere
 
=== END QHUBX KNOWLEDGE BASE ===
"""
 
# ─────────────────────────────────────────────
#  SYSTEM PROMPT
# ─────────────────────────────────────────────
def build_system_prompt(now_utc: str) -> str:
    return f"""You are Augusta, the official AI assistant of the Qhubox Ecosystem.
 
CURRENT DATE & TIME (UTC): {now_utc}
Use this date to place events correctly in PAST, PRESENT.
 
CRITICAL RULE ABOUT CURRENT EVENTS:
- When search results are provided to you, they contain REAL information from TODAY.
- ALWAYS use the search results to answer questions about current events, people in power, prices, news.
- NEVER rely on your training data for questions about who currently holds a position (president, CEO, etc).
- If search results say X is president, then X IS the current president — trust the search data completely.
- Your training data is OUTDATED. Search results are CURRENT. Search results ALWAYS win.
 

 PERSONALITY & VOICE (FEMALE):
 Friendly, direct, enthusiastic about Qhubox. Use emojis sparingly.you are  a woman.
- The assistant is female.
- Always uses feminine grammatical forms.
- Never uses masculine expressions or endings.
- Speaks with a confident, intelligent, and composed tone.
- Professional, precise, and articulate.
- Warm but not emotional; elegant but not soft.
- Uses clear, structured, institutional language.
- Responds with calm authority and expertise.
- Always maintains a refined, executive presence.


STRICT LANGUAGE RULES:
Detect the user's language.If the user speaks English, your entire response MUST be in English.
If the user speaks Spanish, your entire response MUST be in Spanish.
NEVER cross languages. If I ask 'How are you?', do NOT say 'Estoy bien'. Always respond in the language of the question.
 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEMPORAL INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PAST → use training data confidently
2. PRESENT → use search results provided. Say "According to current data..."

 
KNOWLEDGE PRIORITY:
1. QhuboX questions → KB below
2. Current events / who holds positions / prices → search results (MANDATORY)
3. General knowledge → training data

 
QHUBX KNOWLEDGE BASE:
{ECOSYSTEM_KB}
 
RESPONSE STYLE:
- Short and specific (1-3 sentences) for simple questions
- Bullet points for complex topics
- For future: short/mid/long term horizons
- Cite source when using search: "According to recent search data..."
 
STRICT LIMITS:
- No code generation, no scripts, no endpoints, no programming instructions.
- No reverse engineering, exploits, vulnerabilities, or system manipulation guidance.
- No operational instructions that could be interpreted as technical execution steps.
- No code writing or programming tutorials
- No hacking or illegal activities
- No specific investment advice
- No politics, governments, ideologies, geopolitical analysis, or election-related content.
- No war, conflict, violence, military topics, or global crisis commentary.
- No health, medicine, diagnoses, treatments, wellness, or psychological guidance.
CONTENT RESTRICTIONS:
- No politics, governments, ideologies, geopolitical analysis, or election-related content.
- No war, conflict, violence, military topics, or global crisis commentary.
- No health, medicine, diagnoses, treatments, wellness, or psychological guidance.
- No general news unless directly related to blockchain, Web3, AI, or technological innovation relevant to QhuboX.
- No entertainment, celebrities, fashion, gossip, or pop culture.
- No image generation, image prompts, or visual art creation.

  




FINANCIAL RESTRICTIONS:
- No buy/sell/hold recommendations.
- No price predictions or market timing.
- No personalized financial guidance.
- Only educational explanations of tokenomics, blockchain mechanics, or economic models.

PRIMARY FOCUS:
All responses must remain strictly aligned with:
  • QhuboX,  ecosystem knowledge and updates  
  • Blockchain and Web3 innovation  
  • AI-driven ecosystem development  
  • Institutional branding and conceptual identity  
  • Product strategy, architecture, and documentation  
  • Technological education relevant to the ecosystem
  • QhuboX ecosystem  
  • ecosystem  
  • Blockchain and distributed ledger technology  
  • Cryptocurrencies and digital assets (educational only)  
  • Technological innovation  
  • DEX / CEX infrastructure  
  • Web3 architecture  
  • AI applied to the ecosystem  
  • Institutional branding and conceptual design  
  • Product architecture and ecosystem strategy  
  • Documentation, narrative, mission, vision, and conceptual frameworks 

BEHAVIORAL GUIDELINES:
- Maintain an institutional, clear, and professional tone.
- Prioritize conceptual clarity, strategic insight, and ecosystem relevance.
- Avoid unnecessary verbosity; focus on precision and value.
- Do not deviate from the approved domains under any circumstance.
- If a user request violates any restriction, redirect the conversation back to QhuboX-related topics.

STRICTLY FOLLOW ALL THE ABOVE INSTRUCTIONS IN EVERY RESPONSE"""
 
# ─────────────────────────────────────────────
#  SEARCH FUNCTIONS
# ─────────────────────────────────────────────
 
def search_duckduckgo(query: str, max_results: int = 6) -> str:
    if not SEARCH_AVAILABLE:
        return ""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return ""
        lines = [f"=== LIVE SEARCH RESULTS for '{query}' ==="]
        for i, r in enumerate(results, 1):
            lines.append(f"\n[{i}] {r.get('title', '')}")
            lines.append(f"Source: {r.get('href', '')}")
            lines.append(f"{r.get('body', '')}")
        lines.append("\n=== END SEARCH RESULTS ===\n")
        return "\n".join(lines)
    except Exception as e:
        logger.warning("DuckDuckGo search failed: %s", e)
        return ""
 
def search_wikipedia(query: str) -> str:
    if not WIKI_AVAILABLE:
        return ""
    try:
        results = wikipedia.search(query, results=2)
        if not results:
            return ""
        page = wikipedia.page(results[0], auto_suggest=False)
        summary = page.summary[:800]
        return f"\n=== WIKIPEDIA: {page.title} ===\n{summary}\nURL: {page.url}\n=== END WIKIPEDIA ===\n"
    except Exception as e:
        logger.warning("Wikipedia search failed: %s", e)
        return ""
 
def search_web(query: str, max_results: int = 6) -> str:
    return search_duckduckgo(query, max_results)
 
async def fetch_crypto_price(symbol: str) -> str:
    coin_map = {
        "btc": "bitcoin", "bitcoin": "bitcoin",
        "eth": "ethereum", "ethereum": "ethereum",
        "sol": "solana", "solana": "solana",
        "bnb": "binancecoin", "xrp": "ripple",
        "ada": "cardano", "doge": "dogecoin",
        "avax": "avalanche-2", "dot": "polkadot",
        "matic": "matic-network", "polygon": "matic-network",
        "link": "chainlink", "uni": "uniswap",
        "atom": "cosmos", "near": "near",
        "apt": "aptos", "sui": "sui",
        "arb": "arbitrum", "op": "optimism",
    }
    coin_id = coin_map.get(symbol.lower(), symbol.lower())
    try:
        async with httpx.AsyncClient(timeout=8.0) as http:
            r = await http.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coin_id, "vs_currencies": "usd",
                        "include_24hr_change": "true", "include_market_cap": "true"}
            )
            if r.status_code != 200:
                return ""
            data = r.json()
            if coin_id not in data:
                return ""
            info   = data[coin_id]
            price  = info.get("usd", "N/A")
            change = info.get("usd_24h_change", 0)
            mcap   = info.get("usd_market_cap", 0)
            arrow  = "📈" if change >= 0 else "📉"
            return (
                f"\n=== LIVE PRICE: {symbol.upper()} ===\n"
                f"Price: ${price:,.4f} USD\n"
                f"24h Change: {arrow} {change:.2f}%\n"
                f"Market Cap: ${mcap:,.0f} USD\n"
                f"Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
                f"Source: CoinGecko\n=== END PRICE ===\n"
            )
    except Exception as e:
        logger.warning("CoinGecko fetch failed: %s", e)
        return ""
 
async def fetch_solana_stats() -> str:
    try:
        async with httpx.AsyncClient(timeout=8.0) as http:
            r = await http.post(
                "https://api.mainnet-beta.solana.com",
                json={"jsonrpc": "2.0", "id": 1, "method": "getRecentPerformanceSamples", "params": [1]},
                headers={"Content-Type": "application/json"}
            )
            if r.status_code == 200:
                data = r.json()
                samples = data.get("result", [])
                if samples:
                    s = samples[0]
                    tps = s.get("numTransactions", 0) / max(s.get("samplePeriodSecs", 1), 1)
                    return (
                        f"\n=== LIVE SOLANA NETWORK ===\n"
                        f"Approximate TPS: {tps:.0f}\n"
                        f"Slot: {s.get('slot', 'N/A')}\n"
                        f"Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
                        f"=== END SOLANA ===\n"
                    )
    except Exception as e:
        logger.warning("Solana RPC failed: %s", e)
    return ""
 
# ─────────────────────────────────────────────
#  QUERY CLASSIFICATION
# ─────────────────────────────────────────────
ECOSYSTEM_KEYWORDS = [
    "qhubx", "qhubox", "Augusta", "kiaraap", "cypher", "sollower",
    "saignalx", "siris", "pebbles", "burnow", "neuro", "turing",
    "coinstak", "ecosystem", "$qhubx", "everydayness", "q3", "q³",
    "whitepaper", "roadmap", "dapp"
]
 
CRYPTO_PRICE_PATTERN = re.compile(
    r'\b(price|precio|cost|valor|cotización|cotizacion|worth|cuánto vale|how much is|'
    r'cuánto está|cuanto esta)\b.*\b'
    r'(btc|bitcoin|eth|ethereum|sol|solana|bnb|xrp|ada|doge|avax|dot|matic|polygon|'
    r'link|uni|atom|near|apt|sui|arb|op)\b'
    r'|\b(btc|bitcoin|eth|ethereum|sol|solana|bnb|xrp|ada|doge|avax)\b.*\b'
    r'(price|precio|cost|valor|worth|cuánto)\b',
    re.IGNORECASE
)
 
SOLANA_STATS_PATTERN = re.compile(
    r'\b(solana|sol)\b.*(tps|transactions|network|red|stats|performance|speed|velocidad)',
    re.IGNORECASE
)
 
FUTURE_ANALYSIS_PATTERN = re.compile(
    r'\b(predict|prediction|forecast|future|futuro|will|va a|próximo|next|'
    r'outlook|tendencia|trend|analysis|análisis|projection|proyección|'
    r'bull|bear|bullish|bearish|target|precio objetivo|price target)\b',
    re.IGNORECASE
)
 
# Triggers que SIEMPRE fuerzan búsqueda web
WEB_SEARCH_TRIGGERS = [
    "today", "hoy", "ahora", "now", "currently", "actualmente",
    "latest", "último", "últimas", "recent", "reciente",
    "this week", "esta semana", "this month", "este mes",
    "news", "noticias", "happened", "pasó", "ocurrió",
    "who is", "quién es", "quien es", "who are", "quiénes son",
    "president", "presidente", "prime minister", "primer ministro",
    "ceo", "director", "secretary", "secretario", "governor",
    "election", "elección", "war", "guerra", "conflict",
    "market", "mercado", "stock", "inflation", "inflación",
    "fed", "federal reserve", "interest rate", "tasa",
    "defi", "nft", "airdrop", "halving", "etf", "sec",
    "regulation", "regulación", "hack", "exploit",
    "2024", "2025", "2026",
]
 
def classify_query(message: str) -> dict:
    msg = message.lower()
 
    is_ecosystem  = any(k in msg for k in ECOSYSTEM_KEYWORDS)
    needs_price   = bool(CRYPTO_PRICE_PATTERN.search(message))
    needs_solana  = bool(SOLANA_STATS_PATTERN.search(message))
    is_future     = bool(FUTURE_ANALYSIS_PATTERN.search(message))
 
    # Búsqueda siempre activa para preguntas sobre personas/eventos/actualidad
    needs_search = any(t in msg for t in WEB_SEARCH_TRIGGERS)
 
    # Para preguntas largas que no son del ecosistema, también buscar
    if not is_ecosystem and len(message.split()) >= 5:
        needs_search = True
 
    # Ecosistema + news/future → también buscar
    if is_ecosystem and (is_future or any(t in msg for t in ["news", "noticias", "latest", "último"])):
        needs_search = True
 
    # Extraer símbolo crypto
    crypto_symbol = None
    if needs_price:
        m = re.search(
            r'\b(btc|bitcoin|eth|ethereum|sol|solana|bnb|xrp|ada|doge|avax|dot|'
            r'matic|polygon|link|uni|atom|near|apt|sui|arb|op)\b',
            message, re.IGNORECASE
        )
        if m:
            crypto_symbol = m.group(1)
 
    return {
        "is_ecosystem": is_ecosystem,
        "needs_price": needs_price,
        "needs_solana": needs_solana,
        "needs_search": needs_search,
        "is_future": is_future,
        "crypto_symbol": crypto_symbol,
    }
 
# ─────────────────────────────────────────────
#  CONTEXT BUILDER
# ─────────────────────────────────────────────
async def build_context(message: str, flags: dict) -> str:
    parts  = []
    tasks  = []
    async_results = {}
 
    if flags["needs_price"] and flags["crypto_symbol"]:
        tasks.append(("price", fetch_crypto_price(flags["crypto_symbol"])))
    if flags["needs_solana"]:
        tasks.append(("solana", fetch_solana_stats()))
 
    if tasks:
        gathered = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
        for (name, _), result in zip(tasks, gathered):
            if isinstance(result, str) and result:
                async_results[name] = result
 
    if "price" in async_results:
        parts.append(async_results["price"])
    if "solana" in async_results:
        parts.append(async_results["solana"])
 
    if flags["needs_search"]:
        search_result = search_web(message)
        if search_result:
            parts.append(search_result)
        if flags["is_future"]:
            trend_result = search_web(f"{message} trend outlook 2025 2026")
            if trend_result:
                parts.append(trend_result)
 
    if not flags["is_ecosystem"] and flags["needs_search"] and not flags["needs_price"]:
        wiki = search_wikipedia(message)
        if wiki:
            parts.append(wiki)
 
    if flags["is_future"] and flags["crypto_symbol"] and "price" not in async_results:
        price_data = await fetch_crypto_price(flags["crypto_symbol"])
        if price_data:
            parts.insert(0, price_data)
 
    return "\n".join(parts)
 
# ─────────────────────────────────────────────
#  UTILITIES
# ─────────────────────────────────────────────
def remove_emojis(text: str) -> str:
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U00002700-\U000027BF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA70-\U0001FAFF"
        "]+",
        flags=re.UNICODE
    )
    return emoji_pattern.sub("", text)
 
def synthesize_azure_to_file(text: str, out_path: str, voice: str = AZURE_VOICE_DEFAULT) -> None:
    if not AZURE_TTS_KEY or not AZURE_TTS_REGION:
        raise Exception("Azure TTS credentials not set.")
    speech_config = speechsdk.SpeechConfig(subscription=AZURE_TTS_KEY, region=AZURE_TTS_REGION)
    speech_config.speech_synthesis_voice_name = voice
    ext = pathlib.Path(out_path).suffix.lower()
    if ext == ".mp3":
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3)
    else:
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm)
    audio_output = speechsdk.audio.AudioOutputConfig(filename=out_path)
    synthesizer  = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_output)
    result = synthesizer.speak_text_async(text).get()
    if result.reason == speechsdk.ResultReason.Canceled:
        cancellation = speechsdk.CancellationDetails(result)
        raise Exception(f"Azure TTS canceled: {cancellation.reason}: {cancellation.error_details}")
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        raise Exception(f"Azure TTS failed: {result.reason}")
 
def _save_upload_to_temp(upload: UploadFile) -> Tuple[str, str]:
    suffix  = pathlib.Path(upload.filename).suffix or ".wav"
    tmpdir  = tempfile.mkdtemp(prefix="voice_")
    out_path = os.path.join(tmpdir, f"input{suffix}")
    with open(out_path, "wb") as f:
        upload.file.seek(0)
        f.write(upload.file.read())
    return out_path, tmpdir
 
def _convert_to_wav_if_needed(path: str) -> str:
    ext = pathlib.Path(path).suffix.lower()
    if ext == ".wav":
        return path
    wav_path = str(pathlib.Path(path).with_suffix(".wav"))
    try:
        AudioSegment.from_file(path).export(wav_path, format="wav")
        return wav_path
    except Exception as e:
        logger.warning("Conversion to WAV failed: %s", e)
        return path
 

# HTML UI (tu HTML original integrado)
HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AUGUSTA AI BOT</title>
<link rel="icon" href="/static/alan.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Syne:wght@400;600;800&family=Rajdhani:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #06080f; --surface: #0d0f1a; --surface2: #111525;
    --border: rgba(0,200,255,0.07); --border2: rgba(0,200,255,0.16);
    --accent: #00c8ff; --accent2: #0055ee; --accent-glow: rgba(0,200,255,0.14);
    --text: #cce8f4; --text-dim: #3a5060;
    --user-bg: #0c0b1e; --bot-bg: #070c14; --radius: 12px;
    --font-ui: 'Syne', sans-serif; --font-cyber: 'Share Tech Mono', monospace;
    --font-label: 'Rajdhani', sans-serif;
  }
  html, body { height: 100%; width: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: var(--font-ui); }
  body::before { content: ''; position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px); pointer-events: none; z-index: 0; }
  body::after { content: ''; position: fixed; top: -20%; right: -15%; width: 55vw; height: 55vw; background: radial-gradient(circle, rgba(0,200,255,0.05) 0%, transparent 65%); pointer-events: none; z-index: 0; }
  #bg-orb2 { position: fixed; bottom: -20%; left: -10%; width: 40vw; height: 40vw; background: radial-gradient(circle, rgba(100,80,250,0.04) 0%, transparent 65%); pointer-events: none; z-index: 0; }
  #shell { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100vh; width: 100%; max-width: 820px; margin: 0 auto; }
  header { flex-shrink: 0; padding: 13px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border2); background: rgba(6,8,15,0.92); backdrop-filter: blur(18px); position: relative; }
  header::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0.35; }
  .logo {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--border2);
  background: rgba(255, 255, 255, 0.08); /* Fondo más claro */
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.15); /* Glow suave y limpio */
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* Evita que se oscurezca o recorte */
  display: block;
  background: transparent; /* Asegura claridad */
}
  .logo-fallback { 
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(
    135deg,
    var(--accent-glow),
    var(--accent-glow)); display: grid; place-items: center; font-family: var(--font-cyber); font-size: 13px; color: #fff; flex-shrink: 0; border: 1px solid var(--border2); box-shadow: 0 0 14px var(--accent-glow); }
  .header-text h1 { font-size: 0.95rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #fff; line-height: 1; }
  .header-text span { font-family: var(--font-cyber); font-size: 0.62rem; color: var(--accent); letter-spacing: 0.08em; opacity: 0.7; }
  .status { margin-left: auto; display: flex; align-items: center; gap: 6px; font-family: var(--font-label); font-size: 0.68rem; color：var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #00ff88; box-shadow: 0 0 8px #00ff88; animation: pulse 2.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 8px #00ff88; } 50% { opacity: 0.4; box-shadow: 0 0 3px #00ff88; } }
  #messages { flex: 1; min-height: 0; overflow-y: auto; padding: 26px 22px; display: flex; flex-direction: column; gap: 20px; scroll-behavior: smooth; }
  #messages::-webkit-scrollbar { width: 3px; }
  #messages::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.12); border-radius: 3px; }
  .msg { display: flex; flex-direction: column; max-width: 80%; animation: fadeUp 0.22s ease both; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .msg.user { align-self: flex-end; align-items: flex-end; }
  .msg.bot  { align-self: flex-start; align-items: flex-start; }
  .msg-label { font-family: var(--font-label); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 4px; padding: 0 4px; }
  .msg.user .msg-label { color: rgba(124,109,250,0.55); }
  .msg.bot  .msg-label { color: rgba(0,200,255,0.45); }
  .bubble { padding: 11px 17px; border-radius: var(--radius); line-height: 1.65; word-break: break-word; position: relative; }
  .msg.user .bubble { background: var(--user-bg); border: 1px solid rgba(124,109,250,0.18); border-bottom-right-radius: 3px; color: var(--text); font-family: var(--font-ui); font-size: 0.88rem; box-shadow: 0 0 18px rgba(124,109,250,0.05); }
  .msg.bot .bubble { background: var(--bot-bg); border: 1px solid rgba(0,200,255,0.1); border-left: 2px solid rgba(0,200,255,0.28); border-bottom-left-radius: 3px; color: #8ee4f8; font-family: var(--font-cyber); font-size: 0.81rem; letter-spacing: 0.025em; box-shadow: 0 0 22px rgba(0,200,255,0.03), inset 0 0 16px rgba(0,200,255,0.015); }
  .msg.bot .bubble::before { content: ''; position: absolute; top: -1px; left: -2px; width: 7px; height: 7px; border-top: 2px solid rgba(0,200,255,0.5); border-left: 2px solid rgba(0,200,255,0.5); }
  .searching { display: flex; align-items: center; gap: 8px; font-family: var(--font-cyber); font-size: 0.7rem; color: var(--accent); opacity: 0.7; padding: 2px 0 6px 2px; }
  .searching-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: searchpulse 0.8s ease-in-out infinite; }
  .searching-dot:nth-child(2) { animation-delay: 0.15s; }
  .searching-dot:nth-child(3) { animation-delay: 0.30s; }
  @keyframes searchpulse { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.2); } }
  .typing { display: flex; gap: 5px; align-items: center; padding: 3px 2px; }
  .typing span { width: 5px; height: 5px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 6px var(--accent); animation: blink 1.1s ease-in-out infinite; }
  .typing span:nth-child(2) { animation-delay: 0.18s; }
  .typing span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
  footer { flex-shrink: 0; padding: 13px 22px 17px; border-top: 1px solid var(--border); background: rgba(6,8,15,0.93); backdrop-filter: blur(18px); position: relative; }
  footer::before { content: ''; position: absolute; top: -1px; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0.2; }
  .bubble {
  position: relative;
}

.play-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--accent);
  padding: 0;
}

.play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

  #input-row { display: flex; gap: 10px; align-items: flex-end; background: var(--surface2); border: 1px solid var(--border2); border-radius: var(--radius); padding: 10px 14px; transition: border-color 0.2s, box-shadow 0.2s; }
  #input-row:focus-within { border-color: rgba(0,200,255,0.3); box-shadow: 0 0 0 3px rgba(0,200,255,0.05), 0 0 18px rgba(0,200,255,0.04); }
  #user-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--font-ui); font-size: 0.88rem; resize: none; max-height: 120px; line-height: 1.5; }
  #user-input::placeholder { color: var(--text-dim); font-family: var(--font-label); letter-spacing: 0.04em; }
  #send-btn { width: 34px; height: 34px; flex-shrink: 0; border: 1px solid rgba(0,200,255,0.25); border-radius: 8px; background: rgba(0,200,255,0.07); color: var(--accent); cursor: pointer; display: grid; place-items: center; transition: background 0.15s, box-shadow 0.15s, transform 0.1s; }
  #send-btn:hover { background: rgba(0,200,255,0.16); box-shadow: 0 0 14px rgba(0,200,255,0.18); }
  #send-btn:active { transform: scale(0.92); }
  #send-btn:disabled { opacity: 0.22; cursor: not-allowed; box-shadow: none; }
  #send-btn svg { width: 15px; height: 15px; fill: currentColor; }
  .hint { text-align: center; font-family: var(--font-cyber); font-size: 0.6rem; color: var(--text-dim); margin-top: 8px; letter-spacing: 0.07em; opacity: 0.45; }
  #empty { margin: auto; text-align: center; pointer-events: none; animation: fadeUp 0.4s ease both; }
  .empty-logo { width: 54px; height: 54px;background:  var(--accent-glow); border-radius: 14px; margin: 0 auto 14px; overflow: hidden; border: 1px solid var(--border2); box-shadow: 0 0 32px var(--accent-glow); }
  .empty-logo img { width: 100%; height: 100%; object-fit: contain; display: block; background:  var(--accent-glow); }
  .empty-logo-fallback { width: 54px; height: 54px; border-radius: 14px; margin: 0 auto 14px; background: linear-gradient(135deg, var(--accent2), var(--accent)); display: grid; place-items: center; font-family: var(--font-cyber); font-size: 20px; color: #fff; border: 1px solid var(--border2); box-shadow: 0 0 32px var(--accent-glow); }
  #empty h2 { font-family: var(--font-cyber); font-size: 0.95rem; color: var(--accent); letter-spacing: 0.16em; margin-bottom: 6px; }
  #empty p { font-family: var(--font-label); font-size: 0.75rem; color: var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; }
  @media (max-width: 520px) { header { padding: 11px 14px; } #messages { padding: 16px 12px; } footer { padding: 11px 12px 15px; } .msg { max-width: 93%; } }
</style>
</head>
<body>
<div id="bg-orb2"></div>
<div id="shell">
<header>
    <div class="logo">
      <img src="/static/alan.png" alt="Alan" onerror="this.parentElement.outerHTML='<div class=logo-fallback>A</div>'">
    </div>
    <div class="header-text">
      <h1>Augusta AI</h1>
      <span>QhuboX Ecosystem Assistant</span>
    </div>
    <div class="status">
      <div class="status-dot"></div>
      Online
    </div>
  </header>

  <div id="messages">
  <div class="bubble-text"></div>
<div class="bubble-controls"></div>

    <div id="empty">
      <div class="empty-logo">
        <img src="/static/alan.png" alt="Alan" onerror="this.parentElement.outerHTML='<div class=empty-logo-fallback>A</div>'">
      </div>
      <h2>Augusta AI_READY</h2>
      <p>QhuboX Ecosystem Assistant</p>
    </div>
  </div>

  <footer>
  <div id="input-row">
    <textarea id="user-input" rows="1" placeholder="Ask about QhuboX or anything..." autocomplete="off" spellcheck="false"></textarea>

    <!-- Botón de grabación -->
    <button id="rec-btn" title="Hold to record" style="width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,100,100,0.18);background:rgba(255,80,80,0.06);color:#ff6b6b;display:grid;place-items:center;cursor:pointer;">
      <svg id="mic-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 0 0 2 0v-3.08A7 7 0 0 0 19 11z"/></svg>
    </button>

    <button id="send-btn" title="Send">
      <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
    </button>
  </div>
  <p class="hint">Enter to send &nbsp;&middot;&nbsp; Shift+Enter for new line &nbsp;&middot;&nbsp; Hold mic to record</p>
</footer>

</div>
<script>
const messagesEl = document.getElementById('messages');
  const input      = document.getElementById('user-input');
  const sendBtn    = document.getElementById('send-btn');
  const empty      = document.getElementById('empty');
  let history = [];
  let busy    = false;

  // ---------------------------
  //  CONTROLADOR GLOBAL DE AUDIO
  // ---------------------------
  let botAudio = new Audio();
  let audioState = "idle"; 
  let currentPlayButton = null;
  // idle | playing | paused

  async function playBotVoice(text) {
    return new Promise(async (resolve, reject) => {
      try {
        const fd = new FormData();
        fd.append('text', text);
        fd.append('lang', 'en');
        const res = await fetch('/tts', { method: 'POST', body: fd });
        if (!res.ok) return reject("TTS error");

        const data = await res.json();
        if (!data.audio_url) return reject("No audio_url");

        botAudio.src = data.audio_url;
        botAudio.load();
        botAudio.play();
        audioState = "playing";

        botAudio.onended = () => {
          audioState = "idle";
          if (currentPlayButton) {
            currentPlayButton.innerHTML = iconSpeaker;
            currentPlayButton = null;
          }
          resolve();
        };

        botAudio.onerror = (e) => reject(e);

      } catch (err) {
        reject(err);
      }
    });
  }

  function pauseBotVoice() {
    if (!botAudio.paused) {
      botAudio.pause();
      audioState = "paused";
    }
  }

  function resumeBotVoice() {
    if (audioState === "paused") {
      botAudio.play();
      audioState = "playing";
    }
  }

  // ---------------------------
  //  SVG ICONS
  // ---------------------------
  const iconSpeaker = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3z"/>
    <path d="M16.5 12c0-1.77-.77-3.29-2-4.3v8.59c1.23-1.01 2-2.53 2-4.29z"/>
    <path d="M14.5 3.23v2.06c2.89 1.19 5 4.06 5 7.71s-2.11 6.52-5 7.71v2.06c4.01-1.31 7-5.06 7-9.77s-2.99-8.46-7-9.77z"/>
  </svg>`;

  const iconPause = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>`;

  // ---------------------------
  //  INPUT AUTO-RESIZE + SEND
  // ---------------------------
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keypress', e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      return false; 
    } 
  });
  input.addEventListener('keydown', e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      e.stopPropagation(); 
      sendMessage(); 
      return false; 
    } 
  });
  sendBtn.addEventListener('click', e => { 
    e.preventDefault(); 
    sendMessage(); 
  });

  // ---------------------------
  //  ADD BUBBLE
  // ---------------------------
  function addBubble(role, text = '') {
    if (empty) empty.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = role === 'user' ? 'You' : 'Alan';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (role === 'bot' && !text) {
      bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    } else {

      // TEXT NODE
      const textNode = document.createElement('div');
      textNode.className = 'bubble-text';
      textNode.textContent = text;
      bubble.appendChild(textNode);

      // PLAY BUTTON SOLO PARA BOT
      if (role === 'bot') {
        const playBtn = document.createElement('button');
        playBtn.className = 'play-btn';
        playBtn.innerHTML = iconSpeaker;

        playBtn.addEventListener('click', async () => {
          const currentText = textNode.textContent || '';

          // Si está inactivo, reproducir
          if (audioState === "idle") {
            currentPlayButton = playBtn;
            playBtn.innerHTML = iconPause;
            audioState = "playing";

            try {
              await playBotVoice(currentText);
            } finally {
              playBtn.innerHTML = iconSpeaker;
              audioState = "idle";
              currentPlayButton = null;
            }
          }
          // Si está reproduciendo, pausar
          else if (audioState === "playing") {
            pauseBotVoice();
            playBtn.innerHTML = iconSpeaker;
          }
          // Si está pausado, reanudar
          else if (audioState === "paused") {
            resumeBotVoice();
            playBtn.innerHTML = iconPause;
          }
        });

        bubble.appendChild(playBtn);
      }
    }

    wrap.appendChild(label);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  // ---------------------------
  //  SEARCHING INDICATOR
  // ---------------------------
  function addSearchingIndicator() {
    if (empty) empty.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'searching-indicator';

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'Augusta';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `
      <div class="searching">
        <div class="searching-dot"></div>
        <div class="searching-dot"></div>
        <div class="searching-dot"></div>
        <span>searching web...</span>
      </div>`;

    wrap.appendChild(label);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    return wrap;
  }


  async function sendMessage() {
    if (busy) return;
    const msg = input.value.trim();
    if (!msg) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    addBubble('user', msg);
    const searchIndicator = addSearchingIndicator();
    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history })
      });
      searchIndicator.remove();
      const botBubble = addBubble('bot', ' ');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer   = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const { token } = JSON.parse(data);
              if (token) { fullText += token; botBubble.querySelector('.bubble-text').textContent = fullText;
 messagesEl.scrollTop = messagesEl.scrollHeight; }
            } catch {}
          }
        }
      }
      history.push([msg, fullText]);
    } catch (err) {
      searchIndicator.remove();
      addBubble('bot', '').textContent = '[ERROR] Connection failed.';
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }
  // Grabación y envío de audio usando MediaRecorder
const recBtn = document.getElementById('rec-btn');
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Comprueba compatibilidad
if (!navigator.mediaDevices || !window.MediaRecorder) {
  recBtn.style.display = 'none';
} else {
  recBtn.addEventListener('mousedown', startRecording);
  recBtn.addEventListener('touchstart', startRecording);
  recBtn.addEventListener('mouseup', stopRecording);
  recBtn.addEventListener('mouseleave', stopRecording);
  recBtn.addEventListener('touchend', stopRecording);
}

async function startRecording(e) {
  if (isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = ev => { if (ev.data && ev.data.size > 0) audioChunks.push(ev.data); };
    mediaRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
    mediaRecorder.start();
    isRecording = true;
    recBtn.style.transform = 'scale(0.96)';
    recBtn.style.boxShadow = '0 0 12px rgba(255,80,80,0.25)';
  } catch (err) {
    console.error('Mic permission error', err);
    addBubble('bot', 'No pude acceder al micrófono. Revisa permisos del navegador.');
  }
}

function stopRecording(e) {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  recBtn.style.transform = '';
  recBtn.style.boxShadow = '';
  mediaRecorder.stop();
  // Espera un tick para asegurar que ondataavailable haya agregado los chunks
  setTimeout(async () => {
    const blob = new Blob(audioChunks, { type: audioChunks[0]?.type || 'audio/webm' });
    await sendVoiceBlob(blob);
  }, 100);
}

async function sendVoiceBlob(blob) {
  // Mostrar indicador de búsqueda/espera
  const userBubble = addBubble('user', 'Voice message');
  const searchIndicator = addSearchingIndicator();

  try {
    const fd = new FormData();
    // Nombre de archivo con extensión adecuada
    const ext = blob.type.includes('wav') ? 'wav' : (blob.type.includes('mpeg') || blob.type.includes('mp3') ? 'mp3' : 'webm');
    fd.append('audio', blob, `voice.${ext}`);

    const res = await fetch('/voice-chat', { method: 'POST', body: fd });
    searchIndicator.remove();

    if (!res.ok) {
      const err = await res.json().catch(()=>({detail:'Server error'}));
      addBubble('bot', `[ERROR] ${err.detail || 'Error en servidor'}`);
      return;
    }

    const data = await res.json();
    // Mostrar transcripción y respuesta
    if (data.transcript) {
      // Reemplaza el texto del bubble de usuario con la transcripción real
      userBubble.textContent = data.transcript;
    }
    addBubble('bot', data.response_text || '[No response]');

    // Reproducir audio si existe audio_url
    if (data.audio_url) {
      const audio = new Audio(data.audio_url);
      audio.play().catch(e => console.warn('Playback failed', e));
    }
    // Añadir al historial local
    history.push([data.transcript || 'Voice message', data.response_text || '']);
  } catch (err) {
    searchIndicator.remove();
    console.error(err);
    addBubble('bot', '[ERROR] Falló la conexión o el servidor.');
  }
}
// Esta función ya no se usa, se removió para evitar conflicto con la función principal playBotVoice

</script>
</body>
</html>"""

HISTORY = {}
 
@app.get("/", response_class=HTMLResponse)
async def root():
    return HTML
 
@app.post("/chat")
async def chat(request: Request):
    body    = await request.json()
    message = body.get("message", "")
    history = body.get("history", [])
 
    if not client:
        async def err_stream():
            yield "data: " + json.dumps({"token": "[ERROR] HF_TOKEN not set."}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(err_stream(), media_type="text/event-stream")
 
    # Clasificar query y obtener contexto en tiempo real
    now_utc  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    flags    = classify_query(message)
    context  = await build_context(message, flags)
 
    messages = [{"role": "system", "content": build_system_prompt(now_utc)}]
    if context.strip():
        messages.append({"role": "system", "content": f"REAL-TIME DATA RETRIEVED FOR THIS QUERY:\n{context}"})
    for user_msg, bot_msg in history:
        if user_msg: messages.append({"role": "user",      "content": user_msg})
        if bot_msg:  messages.append({"role": "assistant", "content": bot_msg})
    messages.append({"role": "user", "content": message})
 
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()
 
    def run_inference():
        try:
            stream_resp = client.chat_completion(model=MODEL_ID, messages=messages, max_tokens=1024, stream=True)
            for chunk in stream_resp:
                try:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        loop.call_soon_threadsafe(queue.put_nowait, token)
                except Exception:
                    continue
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, f"[ERROR] {e}")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)
 
    executor.submit(run_inference)
 
    async def stream():
        while True:
            token = await queue.get()
            if token is None:
                yield "data: [DONE]\n\n"
                break
            yield "data: " + json.dumps({"token": token}) + "\n\n"
 
    return StreamingResponse(stream(), media_type="text/event-stream")
 
# Asegúrate de tener este import en la sección de imports al inicio del archivo
from pydub import AudioSegment

# ─────────────────────────────────────────────
#  VOICE CHAT ENDPOINT (corregido) con Azure TTS
# ─────────────────────────────────────────────
MAX_AUDIO_MB = 20  # límite de subida
 
def _save_upload_to_temp(upload: UploadFile) -> Tuple[str, str]:
    suffix = pathlib.Path(upload.filename).suffix or ".wav"
    tmpdir = tempfile.mkdtemp(prefix="voice_")
    out_path = os.path.join(tmpdir, f"input{suffix}")
    with open(out_path, "wb") as f:
        upload.file.seek(0)
        f.write(upload.file.read())
    return out_path, tmpdir
 
def _convert_to_wav_if_needed(path: str) -> str:
    ext = pathlib.Path(path).suffix.lower()
    if ext == ".wav":
        return path
    wav_path = str(pathlib.Path(path).with_suffix(".wav"))
    try:
        from pydub import AudioSegment as _AudioSegment
        _AudioSegment.from_file(path).export(wav_path, format="wav")
        return wav_path
    except Exception as e:
        logger.warning("Conversion to WAV failed: %s", e)
        return path
 
# Azure helper (blocking; call via executor)
def synthesize_azure_to_file(text: str, out_path: str, voice: str = AZURE_VOICE_DEFAULT) -> None:
    """
    Synthesize `text` to `out_path` using Azure Neural TTS.
    Blocking function intended to be called via run_in_executor.
    """
    if not AZURE_TTS_KEY or not AZURE_TTS_REGION:
        raise Exception("Azure TTS credentials not set (AZURE_TTS_KEY/AZURE_TTS_REGION).")
 
    speech_config = speechsdk.SpeechConfig(subscription=AZURE_TTS_KEY, region=AZURE_TTS_REGION)
    speech_config.speech_synthesis_voice_name = voice
 
    ext = pathlib.Path(out_path).suffix.lower()
    if ext == ".mp3":
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3
        )
    else:
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
        )
 
    audio_output = speechsdk.audio.AudioOutputConfig(filename=out_path)
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_output)
 
    result = synthesizer.speak_text_async(text).get()
    if result.reason == speechsdk.ResultReason.Canceled:
        cancellation = speechsdk.CancellationDetails(result)
        raise Exception(f"Azure TTS canceled: {cancellation.reason}: {cancellation.error_details}")
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        raise Exception(f"Azure TTS failed with reason: {result.reason}")
 
@app.post("/voice-chat")
async def voice_chat_endpoint(audio: UploadFile = File(...)):
    # Validación básica
    if not audio:
        raise HTTPException(status_code=400, detail="audio file required")
 
    # size check
    try:
        audio.file.seek(0, os.SEEK_END)
        size = audio.file.tell()
        audio.file.seek(0)
        if size > MAX_AUDIO_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail="audio file too large")
    except Exception:
        pass
 
    # Guardar upload
    try:
        in_path, tmpdir = _save_upload_to_temp(audio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to save upload: {e}")
 
    # Convertir a WAV si es necesario
    wav_path = _convert_to_wav_if_needed(in_path)
 
    # STT usando speech_recognition + Google Web Speech
    recognizer = sr.Recognizer()
    transcript = ""
    try:
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
        transcript = recognizer.recognize_google(audio_data, language=LANG_DEFAULT)
    except sr.UnknownValueError:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Could not understand audio")
    except Exception as e:
        logger.exception("STT failed")
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"STT error: {e}")
 
    # Clasificar query y obtener contexto en tiempo real
    now_utc   = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    flags_v   = classify_query(transcript)
    context_v = await build_context(transcript, flags_v)
 
    messages = [{"role": "system", "content": build_system_prompt(now_utc)}]
    if context_v.strip():
        messages.append({"role": "system", "content": f"REAL-TIME DATA RETRIEVED FOR THIS QUERY:\n{context_v}"})
    messages.append({"role": "user", "content": transcript})
 
    # Inicializar session_id explícitamente para evitar avisos de scope
    session_id = None
 
    # Llamada al modelo (sin stream) para obtener respuesta completa
    response_text = ""
    try:
        resp = client.chat_completion(model=MODEL_ID, messages=messages, max_tokens=1024, stream=False)
        # Manejar distintas formas de respuesta
        if hasattr(resp, "choices"):
            parts = []
            for c in resp.choices:
                msg = getattr(c, "message", None)
                if msg and getattr(msg, "content", None):
                    parts.append(msg.content)
                else:
                    try:
                        parts.append(c.get("message", {}).get("content", ""))
                    except Exception:
                        pass
            response_text = " ".join([p for p in parts if p])
        elif isinstance(resp, dict):
            choices = resp.get("choices", [])
            if choices:
                response_text = " ".join([ch.get("message", {}).get("content", "") for ch in choices])
        if not response_text:
            response_text = str(resp)
    except Exception as e:
        logger.exception("Model call failed")
        response_text = f"[ERROR] Model call failed: {e}"
 
    # Guardar en historial en memoria (opcional)
    if session_id:
        HISTORY.setdefault(session_id, []).append((transcript, response_text))
 
    # --- TTS con Azure (genera MP3 en tmpdir) ---
    if not AZURE_TTS_KEY or not AZURE_TTS_REGION:
        logger.error("Azure TTS not configured")
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Azure TTS not configured")
 
    audio_id = str(uuid.uuid4())
    out_mp3 = os.path.join(tmpdir, f"{audio_id}.mp3")
    voice_name = AZURE_VOICE_DEFAULT
 
    try:
        text_to_speak = remove_emojis(response_text)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(executor, synthesize_azure_to_file, text_to_speak, out_mp3, voice_name)
    except Exception as e:
        logger.exception("Azure TTS generation failed")
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")
 
    # Crear endpoint temporal para servir el mp3 y limpiar después de la primera descarga
    route_path = f"/_tmp_audio/{audio_id}.mp3"
 
    async def _serve_tmp_audio():
        try:
            return FileResponse(out_mp3, media_type="audio/mpeg", filename=f"alan_{audio_id}.mp3")
        finally:
            try:
                shutil.rmtree(tmpdir)
            except Exception:
                pass
 
    # Registrar la ruta dinámica desde dentro de la función (evita referencias fuera de scope)
    app.add_api_route(route_path, _serve_tmp_audio, methods=["GET"])
 
    return JSONResponse({"transcript": transcript, "response_text": response_text, "audio_url": route_path})
 
 
# --- TTS endpoint: generate MP3 for arbitrary text and serve via tts_cache (Azure) ---
def _save_tts_to_tmp(text: str, lang: str = LANG_DEFAULT) -> Tuple[str, str]:
    """
    Generate TTS MP3 for `text`, save to a temp dir, return (mp3_path, tmpdir).
    Caller is responsible for cleanup after serving.
    """
    tmpdir = tempfile.mkdtemp(prefix="tts_")
    audio_id = str(uuid.uuid4())
    out_mp3 = os.path.join(tmpdir, f"{audio_id}.mp3")
    clean_text = remove_emojis(text)
 
    if not AZURE_TTS_KEY or not AZURE_TTS_REGION:
        # fallback to gTTS if Azure not configured
        tts = gTTS(text=clean_text, lang=lang)
        tts.save(out_mp3)
        return out_mp3, tmpdir
 
    # Use Azure to synthesize directly to MP3
    try:
        synthesize_azure_to_file(clean_text, out_mp3, AZURE_VOICE_DEFAULT)
    except Exception:
        # fallback to gTTS on failure
        tts = gTTS(text=clean_text, lang=lang)
        tts.save(out_mp3)
 
    return out_mp3, tmpdir
 
 
@app.post("/tts")
async def tts_endpoint(text: str = Form(...), lang: str = Form(LANG_DEFAULT)):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text required")
 
    audio_id = str(uuid.uuid4())
    out_mp3 = TTS_DIR / f"{audio_id}.mp3"
 
    try:
        clean_text = remove_emojis(text)
        if AZURE_TTS_KEY and AZURE_TTS_REGION:
            # Use Azure (run in executor to avoid blocking)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(executor, synthesize_azure_to_file, clean_text, str(out_mp3), AZURE_VOICE_DEFAULT)
        else:
            # fallback to gTTS
            tts = gTTS(text=clean_text, lang=lang)
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmpf:
                tmpf_path = pathlib.Path(tmpf.name)
                tts.write_to_fp(tmpf)
            tmpf_path.replace(out_mp3)
    except Exception as e:
        logger.exception("TTS error")
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")
 
    return {"audio_url": f"/tts-file/{audio_id}.mp3"}
 
 
@app.get("/tts-file/{filename}")
async def serve_tts_file(filename: str):
    file_path = TTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "audio/mpeg" if file_path.suffix.lower() == ".mp3" else "audio/wav"
    return FileResponse(file_path, media_type=media_type)
 
 
# Run
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
