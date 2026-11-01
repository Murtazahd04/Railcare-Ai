"""
SRLMS AI microservice.

The Render-friendly deployment provides lightweight English intent classification
with FastEmbed/ONNX. Speech-to-text and text-to-speech remain optional local
features; the client falls back to browser speech APIs when they are absent.
"""

import hmac
import io
import os
import tempfile
import threading
import wave
from pathlib import Path
from typing import Optional

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

app = FastAPI(title="SRLMS AI Service")

EMBEDDING_MODEL = os.environ.get(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)
_embedder = None
_embedder_lock = threading.Lock()
_embedding_cache = {}
_embedding_cache_lock = threading.Lock()
_whisper_model = None
_piper_voice = None


class IntentIn(BaseModel):
    name: str
    questions: list[str] = Field(default_factory=list)
    synonyms: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    confidenceThreshold: float = 0.7


class ClassifyIn(BaseModel):
    utterance: str = Field(min_length=1, max_length=2000)
    intents: list[IntentIn] = Field(max_length=500)


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def get_embedder():
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                from fastembed import TextEmbedding

                cache_dir = os.environ.get("FASTEMBED_CACHE_DIR", ".fastembed_cache")
                _embedder = TextEmbedding(
                    model_name=EMBEDDING_MODEL,
                    cache_dir=cache_dir,
                    threads=1,
                    providers=["CPUExecutionProvider"],
                )
    return _embedder


def authorize_classifier(authorization: Optional[str]) -> None:
    expected_token = os.environ.get("AI_SERVICE_TOKEN")
    token_required = os.environ.get("REQUIRE_AI_SERVICE_TOKEN", "").lower() == "true"
    if not expected_token:
        if token_required:
            raise HTTPException(status_code=503, detail="Classifier API token is not configured.")
        return

    provided_token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not hmac.compare_digest(provided_token, expected_token):
        raise HTTPException(status_code=401, detail="Invalid AI service token.")


def cosine_similarity(left, right) -> float:
    import numpy as np

    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denominator <= 1e-12:
        return 0.0
    return float(np.dot(left, right) / denominator)


def embed_texts(texts):
    with _embedding_cache_lock:
        missing = list(dict.fromkeys(text for text in texts if text not in _embedding_cache))
        if len(_embedding_cache) + len(missing) > 5000:
            _embedding_cache.clear()
            missing = list(dict.fromkeys(texts))
        if missing:
            embedder = get_embedder()
            for start in range(0, len(missing), 16):
                batch = missing[start : start + 16]
                vectors = list(embedder.embed(batch, batch_size=16))
                _embedding_cache.update(zip(batch, vectors))
        return [_embedding_cache[text] for text in texts]


@app.post("/classify")
def classify(
    payload: ClassifyIn,
    authorization: Optional[str] = Header(default=None),
):
    authorize_classifier(authorization)
    if not payload.intents:
        return {
            "matchedIntent": None,
            "confidence": 0.0,
            "thresholdMet": False,
            "ranked": [],
        }

    references = []
    reference_ranges = []
    for intent in payload.intents:
        phrases = intent.questions + intent.synonyms + intent.keywords
        start = len(references)
        references.extend(phrases)
        reference_ranges.append((start, len(references)))

    phrases_to_encode = [payload.utterance, *references]
    vectors = embed_texts(phrases_to_encode)
    utterance_vector = vectors[0]
    ranked = []
    best_intent = None
    best_score = -1.0

    for intent, (start, end) in zip(payload.intents, reference_ranges):
        if start == end:
            score = 0.0
        else:
            score = max(cosine_similarity(utterance_vector, vector) for vector in vectors[start + 1 : end + 1])
        ranked.append({"name": intent.name, "confidence": round(score, 3)})
        if score > best_score:
            best_score = score
            best_intent = intent

    ranked.sort(key=lambda result: result["confidence"], reverse=True)
    confidence = round(max(0.0, best_score), 3)
    return {
        "matchedIntent": best_intent.name if best_intent else None,
        "confidence": confidence,
        "thresholdMet": bool(best_intent) and confidence >= best_intent.confidenceThreshold,
        "ranked": ranked[:5],
    }


def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise HTTPException(status_code=503, detail="Speech recognition is not installed on this deployment.") from exc
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper_model


def get_piper_voice():
    global _piper_voice
    if _piper_voice is None:
        try:
            from piper import PiperVoice
        except ImportError as exc:
            raise HTTPException(status_code=503, detail="Text-to-speech is not installed on this deployment.") from exc
        model_path = Path(os.environ.get("PIPER_VOICE_PATH", "./voices/en_US-lessac-medium.onnx"))
        if not model_path.is_file():
            raise HTTPException(status_code=503, detail="Piper voice model is not configured on this deployment.")
        _piper_voice = PiperVoice.load(str(model_path))
    return _piper_voice


@app.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    model = get_whisper()
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(tmp_path, beam_size=5)
        transcript = " ".join(segment.text.strip() for segment in segments)
        return JSONResponse({
            "text": transcript.strip(),
            "language": info.language,
            "language_probability": info.language_probability,
        })
    finally:
        os.unlink(tmp_path)


@app.post("/tts")
def text_to_speech(payload: TtsIn):
    voice = get_piper_voice()
    buffer = io.BytesIO()
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as wav_file:
            voice.synthesize_wav(payload.text, wav_file)
        tmp.seek(0)
        buffer.write(tmp.read())
    return Response(content=buffer.getvalue(), media_type="audio/wav")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "srlms-ai",
        "embeddingModel": EMBEDDING_MODEL,
        "modelLoaded": _embedder is not None,
    }
