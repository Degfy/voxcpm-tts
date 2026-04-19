import os
import sys
import uuid
import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path

from voice import (
    Voice,
    get_ref_audio,
    save_voice,
    delete_voice,
    parse_data_uri,
    generate,
    get_voices_dir,
    is_model_loaded,
    is_worker_busy,
    get_queue_size,
    unload_model,
)
from config import config


app = FastAPI(title="Chinese TTS Service", version="1.0.0")

voices_dir = get_voices_dir()
app.mount("/voices", StaticFiles(directory=str(voices_dir)), name="voices")

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def serve_index():
    return FileResponse(str(static_dir / "index.html"))


class VoiceCreateRequest(BaseModel):
    name: str
    voice: str
    text: str


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    control: str | None = None
    speed: float | None = None
    cfg_value: float | None = 1.0
    inference_timesteps: int | None = 20


@app.get("/api/v1/voices")
def list_voices():
    voices_dir = get_voices_dir()
    voices = []

    for json_file in voices_dir.glob("*.json"):
        with open(json_file, "r", encoding="utf-8") as f:
            voice_data = json.load(f)
            public_voice = {
                "id": voice_data["id"],
                "name": voice_data["name"],
                "voice_url": voice_data["voice_url"],
                "text": voice_data["text"],
            }
            voices.append(public_voice)

    return voices


@app.post("/api/v1/voices", status_code=200)
def create_voice(request: VoiceCreateRequest):
    voice_id = str(uuid.uuid4())[:8]

    mime_type, audio_bytes = parse_data_uri(request.voice)

    voices_dir = get_voices_dir()
    audio_path = voices_dir / f"{voice_id}.wav"

    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    voice_url = f"{config.base_url}/voices/{voice_id}.wav"

    voice = Voice(
        id=voice_id,
        name=request.name,
        voice_path=str(audio_path),
        voice_url=voice_url,
        text=request.text,
    )
    save_voice(voice)

    return {
        "id": voice.id,
        "name": voice.name,
        "voice_url": voice.voice_url,
        "text": voice.text,
    }


@app.delete("/api/v1/voices/{voice_id}")
def remove_voice(voice_id: str):
    try:
        get_ref_audio(voice_id)
        delete_voice(voice_id)
        return {"message": f"Voice '{voice_id}' deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found")


@app.post("/api/v1/synthesize")
def synthesize_speech(request: SynthesizeRequest):
    try:
        audio_file = generate(
            text=request.text,
            voice_id=request.voice_id,
            control=request.control,
            cfg_value=request.cfg_value,
            inference_timesteps=request.inference_timesteps,
        )

        return StreamingResponse(
            audio_file,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=synthesized.wav"},
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/v1/model/status")
def model_status():
    return {
        "loaded": is_model_loaded(),
        "busy": is_worker_busy(),
        "queue_size": get_queue_size(),
    }


@app.post("/api/v1/model/unload")
def model_unload():
    if is_worker_busy():
        raise HTTPException(status_code=409, detail="Worker is busy, cannot unload model")
    queue_size = get_queue_size()
    if queue_size > 0:
        raise HTTPException(status_code=409, detail=f"Queue has {queue_size} pending tasks")
    unloaded = unload_model()
    # Restart the process in background to fully reclaim GPU memory after returning response
    if unloaded:
        import threading
        def _restart():
            import time
            time.sleep(0.5)
            os.execv(sys.executable, [sys.executable] + sys.argv)
        threading.Thread(target=_restart, daemon=True).start()
    return {"unloaded": unloaded}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.host, port=config.port)
