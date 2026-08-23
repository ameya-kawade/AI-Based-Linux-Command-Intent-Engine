"""
CmdCaliper Vector Safety Store & Semantic Similarity Engine.
Loads precomputed 768-dim command embeddings and performs sub-15ms vector dot-product
similarity searches to identify known harmful and benign Linux command patterns.
"""

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.core.models import CmdCaliperVerdict, VectorSimilarityMatch

logger = logging.getLogger(__name__)

# Search paths for vector DB artifacts
_CURRENT_DIR = Path(__file__).resolve().parent
_APP_DIR = _CURRENT_DIR.parent
_BACKEND_DIR = _APP_DIR.parent
_WEB_DIR = _BACKEND_DIR.parent
_PROJECT_ROOT = _WEB_DIR.parent

DEFAULT_VECTORS_PATH = _WEB_DIR / "data" / "cmdcaliper_vectors.npz"
DEFAULT_CORPUS_PATH = _WEB_DIR / "data" / "cmdcaliper_corpus.json"
LOCAL_MODEL_DIR = _PROJECT_ROOT / "model"
HF_MODEL_ID = "Ameya-Kawade/cmdcaliper"


class CmdCaliperVectorStore:
    """
    In-memory vector similarity search engine powered by Ameya-Kawade/cmdcaliper.
    Maintains precomputed embeddings for near-instant threat pattern matching.
    """

    _instance: Optional["CmdCaliperVectorStore"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        vectors_path: Optional[Path] = None,
        corpus_path: Optional[Path] = None,
        model_source: Optional[str] = None,
        lazy_load: bool = False,
    ):
        # Prevent re-initialization if already loaded
        if getattr(self, "_initialized", False):
            return

        self.vectors_path = vectors_path or DEFAULT_VECTORS_PATH
        self.corpus_path = corpus_path or DEFAULT_CORPUS_PATH
        self.model_source = model_source
        self.embeddings: Optional[np.ndarray] = None
        self.corpus: List[Dict[str, Any]] = []
        self.model: Optional[object] = None
        self.vector_dim: int = 768
        self._load_error: Optional[str] = None
        self._initialized = True

        if not lazy_load:
            self._load()

    def _resolve_fallbacks(self):
        """Search multiple fallback locations for corpus and vectors."""
        candidates_vectors = [
            self.vectors_path,
            _WEB_DIR / "data" / "cmdcaliper_vectors.npz",
            _PROJECT_ROOT / "data" / "cmdcaliper_vectors.npz",
            _PROJECT_ROOT / "cli" / "data" / "cmdcaliper_vectors.npz",
        ]
        for p in candidates_vectors:
            if p and p.exists():
                self.vectors_path = p
                break

        candidates_corpus = [
            self.corpus_path,
            _WEB_DIR / "data" / "cmdcaliper_corpus.json",
            _PROJECT_ROOT / "data" / "cmdcaliper_corpus.json",
            _PROJECT_ROOT / "cli" / "data" / "cmdcaliper_corpus.json",
        ]
        for p in candidates_corpus:
            if p and p.exists():
                self.corpus_path = p
                break

    def _load(self):
        """Loads corpus JSON, precomputed numpy embeddings, and SentenceTransformer."""
        try:
            self._resolve_fallbacks()

            # 1. Load Corpus
            if not self.corpus_path.exists():
                self._load_error = f"Corpus file not found: {self.corpus_path}"
                logger.warning(self._load_error)
                return

            with open(self.corpus_path, "r", encoding="utf-8") as f:
                self.corpus = json.load(f)

            # 2. Load Precomputed Embeddings
            if not self.vectors_path.exists():
                self._load_error = f"Vectors file not found: {self.vectors_path}"
                logger.warning(self._load_error)
                return

            npz = np.load(self.vectors_path)
            self.embeddings = npz["embeddings"].astype(np.float32)
            self.vector_dim = self.embeddings.shape[1] if len(self.embeddings.shape) > 1 else 768

            # 3. Load SentenceTransformer Encoder
            if self.model is None:
                from sentence_transformers import SentenceTransformer

                chosen_source = self.model_source
                if not chosen_source:
                    if LOCAL_MODEL_DIR.exists() and (LOCAL_MODEL_DIR / "model.safetensors").exists():
                        chosen_source = str(LOCAL_MODEL_DIR)
                    else:
                        chosen_source = HF_MODEL_ID

                self.model = SentenceTransformer(chosen_source)
                self.model_source = chosen_source
                logger.info(
                    "CmdCaliperVectorStore initialized: %d vectors (dim=%d) loaded via %s",
                    len(self.corpus),
                    self.vector_dim,
                    self.model_source,
                )

        except Exception as e:
            self._load_error = str(e)
            logger.error("Failed to initialize CmdCaliperVectorStore: %s", e, exc_info=True)

    def is_available(self) -> bool:
        """Returns True if vectors, corpus, and model are successfully loaded."""
        if self.embeddings is None or self.model is None or not self.corpus:
            # Try reloading if not yet initialized
            if self._load_error is None:
                self._load()
        return self.embeddings is not None and self.model is not None and len(self.corpus) > 0

    def get_status(self) -> Dict[str, Any]:
        """Telemetry and status information for system health checks."""
        return {
            "available": self.is_available(),
            "model_name": self.model_source or HF_MODEL_ID,
            "vector_dim": self.vector_dim,
            "vector_count": len(self.corpus) if self.corpus else 0,
            "vectors_path": str(self.vectors_path),
            "corpus_path": str(self.corpus_path),
            "error": self._load_error,
        }

    def search(self, command: str, top_k: int = 5) -> CmdCaliperVerdict:
        """
        Computes cosine similarity of query against corpus vectors in <15ms.
        Synthesizes a threat assessment verdict with top matching neighbors.
        """
        clean_cmd = command.strip()
        if not clean_cmd:
            return CmdCaliperVerdict(
                verdict="UNKNOWN",
                confidence="LOW",
                similarity_score=0.0,
                explanation="Empty command query.",
                model_name=self.model_source or HF_MODEL_ID,
                vector_dim=self.vector_dim,
                db_size=len(self.corpus),
            )

        if not self.is_available():
            return CmdCaliperVerdict(
                verdict="UNKNOWN",
                confidence="LOW",
                similarity_score=0.0,
                explanation="CmdCaliper vector database not initialized or unavailable.",
                model_name=self.model_source or HF_MODEL_ID,
                vector_dim=self.vector_dim,
                db_size=0,
            )

        # 1. Encode query
        query_emb = self.model.encode([clean_cmd], normalize_embeddings=True)
        query_vec = np.asarray(query_emb[0], dtype=np.float32)

        # 2. Vector dot-product cosine similarity
        similarities = np.dot(self.embeddings, query_vec)

        # 3. Rank top-K
        k = min(top_k, len(self.corpus))
        top_indices = np.argsort(similarities)[::-1][:k]

        matches: List[VectorSimilarityMatch] = []
        for idx in top_indices:
            entry = self.corpus[idx]
            sim = float(similarities[idx])
            sim = max(0.0, min(1.0, round(sim, 4)))
            matches.append(
                VectorSimilarityMatch(
                    command=entry["command"],
                    similarity=sim,
                    label=entry.get("label", "BENIGN"),
                    category=entry.get("category", "General"),
                    description=entry.get("description", ""),
                    severity=entry.get("severity"),
                    mitre_attack=entry.get("mitre_attack"),
                    source=entry.get("source"),
                )
            )

        # 4. Synthesize Verdict
        top_match = matches[0] if matches else None
        top_sim = top_match.similarity if top_match else 0.0
        top_label = top_match.label if top_match else "BENIGN"
        top_cat = top_match.category if top_match else "General"
        top_mitre = top_match.mitre_attack if top_match else None
        top_cmd = top_match.command if top_match else None

        harmful_matches = [m for m in matches if m.label == "HARMFUL"]
        benign_matches = [m for m in matches if m.label == "BENIGN"]

        verdict: str
        confidence: str
        explanation: str

        if top_label == "HARMFUL":
            mitre_str = f" [MITRE {top_mitre}]" if top_mitre else ""
            if top_sim >= 0.68:
                verdict = "HARMFUL"
                confidence = "HIGH" if top_sim >= 0.78 else "MEDIUM"
                explanation = (
                    f"High semantic vector similarity ({top_sim:.1%}) to known threat pattern '{top_cat}'{mitre_str}: "
                    f"{top_match.description}"
                )
            elif top_sim >= 0.48:
                verdict = "SUSPICIOUS"
                confidence = "MEDIUM"
                explanation = (
                    f"Semantic vector proximity ({top_sim:.1%}) to threat pattern '{top_cmd}' ({top_cat}){mitre_str}: "
                    f"{top_match.description or 'Caution advised.'}"
                )
            elif top_sim >= 0.38:
                verdict = "SUSPICIOUS"
                confidence = "LOW"
                explanation = (
                    f"Potential semantic overlap ({top_sim:.1%}) with security threat '{top_cmd}' ({top_cat}){mitre_str}."
                )
            else:
                verdict = "UNKNOWN"
                confidence = "LOW"
                explanation = f"Command has low semantic similarity ({top_sim:.1%}) to known corpus clusters."
        elif top_label == "BENIGN" and top_sim >= 0.70:
            # Check if there is a harmful match close by
            if harmful_matches and harmful_matches[0].similarity >= 0.52:
                top_h = harmful_matches[0]
                mitre_h = f" [MITRE {top_h.mitre_attack}]" if top_h.mitre_attack else ""
                verdict = "SUSPICIOUS"
                confidence = "MEDIUM"
                matched_label = "HARMFUL"
                matched_cmd = top_h.command
                matched_cat = top_h.category
                matched_mitre = top_h.mitre_attack
                explanation = (
                    f"Nearest match is administrative ({top_sim:.1%}), but close threat vector detected "
                    f"({top_h.similarity:.1%}): '{top_h.command}' [{top_h.category}]{mitre_h}."
                )
            else:
                verdict = "BENIGN"
                confidence = "HIGH" if top_sim >= 0.80 else "MEDIUM"
                explanation = (
                    f"Matches standard administrative command vector profile ({top_sim:.1%}) in category '{top_cat}'."
                )
        elif top_label == "BENIGN" and top_sim >= 0.48:
            if harmful_matches and harmful_matches[0].similarity >= 0.48:
                top_h = harmful_matches[0]
                mitre_h = f" [MITRE {top_h.mitre_attack}]" if top_h.mitre_attack else ""
                verdict = "SUSPICIOUS"
                confidence = "LOW"
                explanation = (
                    f"Ambiguous semantic profile: top match benign ({top_sim:.1%}), "
                    f"threat vector proximity ({top_h.similarity:.1%}){mitre_h}."
                )
            else:
                verdict = "BENIGN"
                confidence = "LOW"
                explanation = f"Moderate similarity ({top_sim:.1%}) to administrative command pattern '{top_cmd}'."
        else:
            if harmful_matches and harmful_matches[0].similarity >= 0.48:
                top_h = harmful_matches[0]
                mitre_h = f" [MITRE {top_h.mitre_attack}]" if top_h.mitre_attack else ""
                verdict = "SUSPICIOUS"
                confidence = "LOW"
                explanation = (
                    f"Nearby threat vector proximity detected ({top_h.similarity:.1%}) '{top_h.command}' ({top_h.category}){mitre_h}."
                )
            else:
                verdict = "UNKNOWN"
                confidence = "LOW"
                explanation = (
                    f"Command has low semantic similarity ({top_sim:.1%}) to all known corpus clusters."
                )

        return CmdCaliperVerdict(
            verdict=verdict,
            confidence=confidence,
            similarity_score=top_sim,
            matched_command=top_cmd,
            matched_category=top_cat,
            matched_label=top_label,
            matched_mitre=top_mitre,
            explanation=explanation,
            top_matches=matches,
            model_name=self.model_source or HF_MODEL_ID,
            vector_dim=self.vector_dim,
            db_size=len(self.corpus),
        )
