import hashlib
import json
import logging
import os
import urllib.request
from typing import Any, Dict, Optional, Tuple, List
from pathlib import Path
from dotenv import load_dotenv

from app.core.pipeline.base import BasePipelineTool, PipelineContext

# Load .env prioritizing backend/.env then web/.env
_curr = Path(__file__).resolve().parent
for candidate in [_curr.parent.parent.parent / ".env", _curr.parent.parent.parent.parent / ".env"]:
    if candidate.exists():
        load_dotenv(candidate, override=True)
load_dotenv()

logger = logging.getLogger(__name__)

# Economical models ranked by cost and efficiency (cheapest first)
CHEAP_GROQ_MODELS_PRIORITY = [
    "groq/compound-mini",      # Cheapest, low-latency, high-efficiency compound mini
    "openai/gpt-oss-20b",      # Fast 20B
    "qwen/qwen3.6-27b",        # Qwen 27B
    "groq/compound",           # Full compound
    "openai/gpt-oss-120b",     # 120B Large
]

# Enriched, holistic system prompt directing the SLM/LLM to explain real-world operational impact and propose safer alternatives
SYSTEM_PROMPT = """You are an expert Linux systems and security analyst.
Your task is to provide a concise, comprehensive explanation of what the given Linux shell command accomplishes in the real world, and suggest safer command alternatives whenever the command is risky, hazardous, or malicious.

CRITICAL INSTRUCTIONS:
- DO NOT just explain the basic binary in isolation (e.g. do not just say "echo prints text" or "bash runs scripts").
- Explain the complete, end-to-end operational intent, systemic impact, and consequences of the command altogether—including its arguments, target files, paths, network destinations, kernel interfaces, redirections, pipes, and any attached bash/shell scripts.
- For system or kernel pseudo-files (like /proc/sysrq-trigger, /proc/sys/*, /dev/*, /etc/*), explicitly explain what kernel action or system mutation is triggered (e.g., forced kernel panic, memory dumping, drive wipe, credential alteration).
- For network or security actions (like reverse shells, listening sockets, firewall modifications, downloads), explain the security implication and operational access granted.
- If an attached script analysis is provided, incorporate the script's behavioral traces (eBPF syscalls, network sockets, sensitive file reads, and security alerts) into your holistic judgment of what executing this command with this script will do.
- If the command is hazardous, destructive, or malicious, propose 1-3 concrete, copy-pasteable SAFER Linux command alternatives in the `suggested_alternatives` array.

Return a valid JSON object matching this schema EXACTLY:
{
  "summary": "Brief 1-sentence plain-English summary of what running this specific command line does",
  "risk_level": "SAFE" | "CAUTION" | "CRITICAL",
  "suggested_alternatives": ["safer_command_1 (Explanation)", "safer_command_2 (Explanation)"],
  "detailed_explanation": "Detailed explanation covering what the command will do to the system, kernel, network, or files"
}

Example for `nc -lvnp 4444`:
{
  "summary": "Starts a local Netcat listener bound to TCP port 4444 awaiting inbound network connections.",
  "risk_level": "CAUTION",
  "suggested_alternatives": ["ssh -L 4444:localhost:4444 user@remote (Encrypted SSH Tunnel)", "ncat --ssl -lvnp 4444 (TLS Encrypted Netcat Listener)"],
  "detailed_explanation": "This command invokes Netcat in listen mode on port 4444 with verbose logging (-v) and numeric IP resolution (-n). It binds port 4444 to await incoming connections, commonly used as a listener to catch incoming reverse shells or for unencrypted network data transfers."
}"""


def _is_valid_groq_key(key: Optional[str]) -> bool:
    k = (key or "").strip()
    return bool(k and not k.startswith("your_") and (k.startswith("gsk_") or len(k) >= 24))


class LLMAnalyzerTool(BasePipelineTool):
    """
    AI / SLM Semantic Intent & Reasoning Tool.
    Prioritizes low-cost, fast Groq models (groq/compound-mini), local Ollama SLMs
    (llama3.2:1b, phi4-mini:3.8b), and cloud LLM APIs, grounded with Explainshell
    SQLite manpages, SafeCmd verdicts, CmdCaliper vector intelligence, and Aqua Tracee traces.
    """

    def __init__(self):
        self.provider, self.model_name, self.client = self._init_client()
        self._prompt_cache: Dict[str, Dict[str, Any]] = {}
        self.timeout = float(os.getenv("LLM_TIMEOUT", "45.0"))

    def reconfigure(self, provider_pref: Optional[str] = None, model_pref: Optional[str] = None):
        """Allows hot-reloading active provider and model at runtime."""
        if provider_pref is not None:
            os.environ["LLM_PROVIDER"] = provider_pref
        if model_pref is not None:
            os.environ["AI_MODEL"] = model_pref
            if provider_pref == "groq":
                os.environ["GROQ_MODEL"] = model_pref
        self.provider, self.model_name, self.client = self._init_client()
        self._prompt_cache.clear()

    def _detect_best_groq_model(self, api_key: str) -> str:
        """Detects and returns active available Groq models from API, prioritizing cheapest models first."""
        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/models",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "LinuxCommandIntentEngine/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=2.5) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    ids = [m["id"] for m in data.get("data", [])]
                    for cand in CHEAP_GROQ_MODELS_PRIORITY:
                        if cand in ids:
                            return cand
                    if ids:
                        return ids[0]
        except Exception as e:
            logger.debug(f"Could not auto-detect Groq models via HTTP: {e}")
        return CHEAP_GROQ_MODELS_PRIORITY[0]

    def _init_client(self) -> Tuple[str, str, Optional[object]]:
        provider_pref = os.getenv("LLM_PROVIDER", "").lower()
        ollama_host = os.getenv("OLLAMA_HOST", os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))
        if not ollama_host.endswith("/v1"):
            ollama_v1 = ollama_host.rstrip("/") + "/v1"
        else:
            ollama_v1 = ollama_host

        env_model = os.getenv("AI_MODEL", "")

        # 1. Groq Cloud LPU Provider (Prioritizing cheapest economical models first)
        groq_key = os.getenv("GROQ_API_KEY", "").strip()
        groq_model = os.getenv("GROQ_MODEL", env_model or "")

        if _is_valid_groq_key(groq_key) and provider_pref in ("groq", ""):
            try:
                from openai import AsyncOpenAI
                resolved_model = groq_model
                if not resolved_model or resolved_model in ("llama-3.1-8b-instant", "default"):
                    resolved_model = self._detect_best_groq_model(groq_key)

                client = AsyncOpenAI(
                    base_url="https://api.groq.com/openai/v1",
                    api_key=groq_key,
                )
                logger.info(f"Initialized Groq Cloud LPU provider with cost-efficient model '{resolved_model}'")
                return ("Groq", resolved_model, client)
            except Exception as e:
                logger.warning(f"Failed to init Groq client: {e}")

        # 2. Local Ollama Provider (If explicitly selected or fallback if Groq not configured)
        if provider_pref == "ollama" or (provider_pref == "" and self._is_ollama_available(ollama_v1)):
            if self._is_ollama_available(ollama_v1):
                try:
                    from openai import AsyncOpenAI

                    resolved_model = env_model if env_model and provider_pref == "ollama" else ""
                    if not resolved_model:
                        resolved_model = self._detect_best_ollama_model(ollama_v1)

                    client = AsyncOpenAI(
                        base_url=ollama_v1,
                        api_key="ollama",
                    )
                    logger.info(f"Initialized Ollama local SLM provider with model '{resolved_model}'")
                    return ("Ollama", resolved_model, client)
                except Exception as e:
                    logger.warning(f"Failed to init Ollama client: {e}")

        # 3. Fallback to Groq if key is available even if provider preference wasn't explicitly groq
        if _is_valid_groq_key(groq_key):
            try:
                from openai import AsyncOpenAI
                resolved_model = groq_model or self._detect_best_groq_model(groq_key)
                client = AsyncOpenAI(
                    base_url="https://api.groq.com/openai/v1",
                    api_key=groq_key,
                )
                return ("Groq", resolved_model, client)
            except Exception as e:
                logger.warning(f"Failed to init Groq fallback client: {e}")

        # 4. Fallback to Ollama if available
        if self._is_ollama_available(ollama_v1):
            try:
                from openai import AsyncOpenAI
                resolved_model = self._detect_best_ollama_model(ollama_v1)
                client = AsyncOpenAI(base_url=ollama_v1, api_key="ollama")
                return ("Ollama", resolved_model, client)
            except Exception as e:
                logger.warning(f"Failed to init Ollama client: {e}")

        # 5. Cloud Providers (OpenRouter, Gemini, OpenAI)
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")
        openai_key = os.getenv("OPENAI_API_KEY")

        if openrouter_key:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(
                    api_key=openrouter_key,
                    base_url="https://openrouter.ai/api/v1",
                )
                model = os.getenv("AI_MODEL", "google/gemini-2.5-flash")
                return ("OpenRouter", model, client)
            except Exception as e:
                logger.warning(f"Failed to init OpenRouter client: {e}")

        if gemini_key:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(
                    api_key=gemini_key,
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                )
                model = os.getenv("AI_MODEL", "gemini-2.5-flash")
                return ("Google Gemini", model, client)
            except Exception as e:
                logger.warning(f"Failed to init Gemini client: {e}")

        if openai_key:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=openai_key)
                model = os.getenv("AI_MODEL", "gpt-4o-mini")
                return ("OpenAI", model, client)
            except Exception as e:
                logger.warning(f"Failed to init OpenAI client: {e}")

        return ("Offline Engine", "None", None)

    def _is_ollama_available(self, base_url: str) -> bool:
        """Quick health check to see if Ollama server is running."""
        try:
            root_url = base_url.replace("/v1", "").rstrip("/") + "/api/tags"
            req = urllib.request.Request(root_url, method="GET")
            with urllib.request.urlopen(req, timeout=0.6) as response:
                return response.status == 200
        except Exception:
            return False

    def _detect_best_ollama_model(self, base_url: str) -> str:
        """Detect and prioritize available fast 1B / 3B local models."""
        try:
            root_url = base_url.replace("/v1", "").rstrip("/") + "/api/tags"
            req = urllib.request.Request(root_url, method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    available_names = [m.get("name", "") for m in data.get("models", [])]
                    for candidate in [
                        "llama3.2:1b",
                        "llama3.2",
                        "gemma3:1b",
                        "phi4-mini:3.8b",
                        "phi4-mini",
                        "qwen2.5-coder:3b-instruct-q4_K_M",
                    ]:
                        for avail in available_names:
                            if candidate == avail or avail.startswith(candidate):
                                return avail
                    if available_names:
                        return available_names[0]
        except Exception:
            pass
        return "llama3.2:1b"

    def _resolve_runtime_client(self, context: PipelineContext) -> Tuple[str, str, Optional[object]]:
        """Resolves the client to use, prioritizing per-request overrides if provided."""
        if context.requested_provider:
            req_provider = context.requested_provider.lower()
            if req_provider == "groq":
                key = context.requested_api_key or os.getenv("GROQ_API_KEY", "")
                model = context.requested_model or os.getenv("GROQ_MODEL", "")
                if not model or model in ("llama-3.1-8b-instant", "default"):
                    model = CHEAP_GROQ_MODELS_PRIORITY[0]  # groq/compound-mini
                if _is_valid_groq_key(key):
                    from openai import AsyncOpenAI
                    return ("Groq", model, AsyncOpenAI(base_url="https://api.groq.com/openai/v1", api_key=key))
            elif req_provider == "ollama":
                ollama_host = os.getenv("OLLAMA_HOST", os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))
                ollama_v1 = ollama_host if ollama_host.endswith("/v1") else ollama_host.rstrip("/") + "/v1"
                model = context.requested_model or self._detect_best_ollama_model(ollama_v1)
                from openai import AsyncOpenAI
                return ("Ollama", model, AsyncOpenAI(base_url=ollama_v1, api_key="ollama"))

        return (self.provider, self.model_name, self.client)

    @property
    def name(self) -> str:
        if self.client:
            return f"{self.provider} ({self.model_name})"
        return "LLM Semantic Analyzer (Offline)"

    @property
    def description(self) -> str:
        return "Grounded SLM/LLM semantic reasoning and contextual command analysis"

    def is_available(self) -> bool:
        return self.client is not None

    def _build_user_prompt(self, context: PipelineContext) -> str:
        lines = [
            f"Command: {context.command}",
        ]
        if context.cwd:
            lines.append(f"CWD: {context.cwd}")

        # 1. Ground-truth manpage & used flag definitions from SQLite
        if context.manpage_explanation:
            me = context.manpage_explanation
            if me.synopsis:
                lines.append(f"Synopsis: {me.command} - {me.synopsis}")
            if me.used_flags:
                flag_parts = []
                for f in me.used_flags[:6]:
                    val_str = f"={f.argument_value}" if f.argument_value else ""
                    summary_clean = f.summary[:60] if f.summary else ""
                    flag_parts.append(f"{f.flag}{val_str} ({summary_clean})" if summary_clean else f"{f.flag}{val_str}")
                lines.append(f"Flags: {', '.join(flag_parts)}")
            if me.nested_command and me.nested_command.synopsis:
                lines.append(f"Nested: {me.nested_command.command} - {me.nested_command.synopsis}")

        # 2. SafeCmd Policy Enforcement
        if context.safecmd_verdict and not context.safecmd_verdict.allowed:
            lines.append(f"SafeCmd Policy: RESTRICTED ({context.safecmd_verdict.message})")

        # 3. CmdCaliper Vector Safety & Threat Intelligence
        if context.cmdcaliper_verdict:
            cc = context.cmdcaliper_verdict
            if cc.verdict in ("HARMFUL", "SUSPICIOUS") or cc.matched_label == "HARMFUL":
                mitre_tag = f" [MITRE {cc.matched_mitre}]" if cc.matched_mitre else ""
                lines.append(
                    f"Threat Intel: Vector proximity ({cc.similarity_score:.1%}) to '{cc.matched_category}'{mitre_tag} "
                    f"pattern: {cc.matched_command}"
                )

        # 4. Attached Script Intent & Tracee eBPF Execution Intelligence
        if context.script_verdict and context.script_verdict.script_content_provided:
            sv = context.script_verdict
            lines.append(f"Attached Script File: {sv.script_name}")
            lines.append(
                f"Script Security Assessment: {'MALICIOUS' if sv.is_malicious else 'BENIGN'} "
                f"(Severity: {sv.severity}, Engine: {sv.source})"
            )
            if sv.summary:
                lines.append(f"Script Behavioral Summary: {sv.summary}")
            if sv.detected_signatures:
                lines.append(f"Script Threat Signatures: {', '.join(sv.detected_signatures)}")
            if sv.accessed_files:
                lines.append(f"Script Sensitive File Access: {', '.join(sv.accessed_files)}")
            if sv.network_connections:
                lines.append(f"Script Network Connections: {', '.join(sv.network_connections)}")
            if sv.script_output and sv.script_output.strip() and not sv.script_output.startswith("["):
                preview = sv.script_output.strip()[:300]
                lines.append(f"Script Sandbox Output Preview: {preview}")

        # 5. Heuristic & Kernel/System Indicators
        if context.heuristic_intent:
            lines.append(f"Heuristic Classification: {context.heuristic_intent}")

        # 6. Network & System Impacts
        if context.network.ports_opened:
            lines.append(f"Network Impact: Opens inbound listening ports: {context.network.ports_opened}")
        if context.filesystem.deleted:
            lines.append(f"Filesystem Impact: Deletes targets: {context.filesystem.deleted}")

        return "\n".join(lines)

    def _extract_intent_string(self, data: Dict[str, Any]) -> str:
        """Parses structured JSON response into a rich, multi-sentence intent description."""
        summary = ""
        detailed = ""

        if "summary" in data and isinstance(data["summary"], str):
            summary = data["summary"].strip()
        elif "base_command_summary" in data and isinstance(data["base_command_summary"], str):
            summary = data["base_command_summary"].strip()

        if "detailed_explanation" in data:
            val = data["detailed_explanation"]
            if isinstance(val, str):
                if val.strip().startswith("{") and val.strip().endswith("}"):
                    try:
                        parsed_val = json.loads(val)
                        parts = [f"{k.replace('_', ' ').title()}: {v}" for k, v in parsed_val.items() if v]
                        detailed = " • ".join(parts)
                    except Exception:
                        detailed = val.strip()
                else:
                    detailed = val.strip()
            elif isinstance(val, dict):
                parts = [f"{k.replace('_', ' ').title()}: {v}" for k, v in val.items() if v]
                detailed = " • ".join(parts)
        elif "intent" in data and isinstance(data["intent"], str):
            detailed = data["intent"].strip()

        if summary and detailed:
            if summary.lower() in detailed.lower():
                return detailed
            return f"{summary}\n\n{detailed}"
        return detailed or summary or "Command analyzed by AI reasoning engine."

    def _populate_context_from_llm_data(self, context: PipelineContext, data: Dict[str, Any]) -> None:
        """Populates context fields including intent, risk level, and suggested alternatives."""
        context.llm_intent = self._extract_intent_string(data)
        context.llm_risk = data.get("risk_level")
        context.llm_data = data
        if "suggested_alternatives" in data and isinstance(data["suggested_alternatives"], list):
            for alt in data["suggested_alternatives"]:
                if isinstance(alt, str) and alt.strip() and alt.strip() not in context.suggested_alternatives:
                    context.suggested_alternatives.append(alt.strip())

    async def process(self, context: PipelineContext) -> None:
        provider, model_name, client = self._resolve_runtime_client(context)
        if not client:
            return

        cmd = context.command.strip()
        if not cmd:
            return

        user_prompt = self._build_user_prompt(context)
        cache_key = hashlib.sha256(f"{provider}|{model_name}|{cmd}|{user_prompt}".encode("utf-8")).hexdigest()

        # Check in-memory prompt cache
        if cache_key in self._prompt_cache:
            data = self._prompt_cache[cache_key]
            self._populate_context_from_llm_data(context, data)
            context.tools_executed.append(f"{provider} ({model_name}) [Cached]")
            return

        try:
            extra_params = {}
            if provider == "Ollama":
                extra_params["extra_body"] = {
                    "options": {
                        "num_predict": 250,
                        "num_ctx": 1536,
                        "num_thread": 4,
                        "temperature": 0.1,
                    },
                    "keep_alive": "60m",
                }
            elif provider == "Groq":
                extra_params["max_tokens"] = 600

            response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                timeout=self.timeout,
                **extra_params,
            )

            content = response.choices[0].message.content
            data = json.loads(content)

            self._prompt_cache[cache_key] = data
            self._populate_context_from_llm_data(context, data)
            context.tools_executed.append(f"{provider} ({model_name})")
        except Exception as e:
            logger.warning(f"LLM inference error for '{cmd}' via {provider} ({model_name}): {e}")
            if provider == "Groq":
                # If error is 401 Unauthorized / AuthenticationError, do NOT retry other models on the same invalid key!
                is_auth_error = "401" in str(e) or "AuthenticationError" in str(type(e).__name__) or "invalid_api_key" in str(e)
                if not is_auth_error:
                    # Try with other cheap Groq models in priority order before falling back to local Ollama
                    for alt_m in CHEAP_GROQ_MODELS_PRIORITY:
                        if alt_m != model_name:
                            try:
                                res = await client.chat.completions.create(
                                    model=alt_m,
                                    messages=[
                                        {"role": "system", "content": SYSTEM_PROMPT},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    response_format={"type": "json_object"},
                                    temperature=0.1,
                                    timeout=self.timeout,
                                    max_tokens=600,
                                )
                                data = json.loads(res.choices[0].message.content)
                                self._prompt_cache[cache_key] = data
                                self._populate_context_from_llm_data(context, data)
                                context.tools_executed.append(f"Groq ({alt_m})")
                                return
                            except Exception:
                                pass

                # If all Groq models fail, attempt local Ollama fallback
                ollama_host = os.getenv("OLLAMA_HOST", os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))
                ollama_v1 = ollama_host if ollama_host.endswith("/v1") else ollama_host.rstrip("/") + "/v1"
                if self._is_ollama_available(ollama_v1):
                    try:
                        from openai import AsyncOpenAI
                        fallback_model = self._detect_best_ollama_model(ollama_v1)
                        fallback_client = AsyncOpenAI(base_url=ollama_v1, api_key="ollama")
                        res = await fallback_client.chat.completions.create(
                            model=fallback_model,
                            messages=[
                                {"role": "system", "content": SYSTEM_PROMPT},
                                {"role": "user", "content": user_prompt},
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.1,
                            timeout=self.timeout,
                            extra_body={
                                "options": {"num_predict": 250, "num_ctx": 1536, "temperature": 0.1},
                                "keep_alive": "60m",
                            },
                        )
                        data = json.loads(res.choices[0].message.content)
                        self._prompt_cache[cache_key] = data
                        self._populate_context_from_llm_data(context, data)
                        context.tools_executed.append(f"Ollama ({fallback_model}) [Fallback]")
                    except Exception as fe:
                        logger.warning(f"Fallback to Ollama failed: {fe}")
