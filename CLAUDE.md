# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chinese TTS (Text-to-Speech) service built on **VoxCPM2** — a 2B-parameter multilingual speech synthesis model supporting 30 languages with 48kHz audio output.

## Development Commands

```bash
# Install dependencies
pip install -e .

# Run the service (FastAPI-based)
python main.py

# The model path is configured via MODEL_PATH in .env
# Default: pretrained_models/VoxCPM2
```

## Architecture

**Core Components:**
- [main.py](main.py) — FastAPI entry point exposing `/api/v1/synthesize` and voice CRUD endpoints
- [service.py](service.py) — Business logic layer (placeholder for synthesis orchestration)
- [voice.py](voice.py) — Voice/timbre management module
- [config.py](config.py) — Configuration (reads from `config` object using `.env` variables)

**Model:**
- VoxCPM2 loaded via `VoxCPM.from_pretrained(config.model_path, load_denoiser=True)`
- Located in [pretrained_models/VoxCPM2/](pretrained_models/VoxCPM2/) (4.5GB model.safetensors)

**API Specification** (defined in [spec.md](spec.md)):
- `GET /api/v1/voices` — List all available voices
- `POST /api/v1/voices` — Add a new voice (name + audio data-uri + text reference)
- `DELETE /api/v1/voices/:id` — Remove a voice
- `POST /api/v1/synthesize` — Generate speech (text, voice_id, control, speed, cfg_value, inference_timesteps)

**Synthesis Flow** (main.py):
1. Lookup voice by `voice_id` to get reference audio path and transcript
2. If `control` string provided: wraps text as `({control}){text}` for style guidance
3. Calls `model.generate()` with reference_wav_path, optional prompt_wav_path/prompt_text
4. Writes WAV to memory file via soundfile, returns as response

## Configuration

`.env` contains `MODEL_PATH=pretrained_models/VoxCPM2` — the local model directory.

## Notes

- No tests exist in this project
- The `get_ref_audio(voice_id)` function in main.py is a TODO placeholder
- Voice storage/retrieval implementation is not yet complete
- Output format is WAV via soundfile (sf.write), not MP3 as spec.md mentions
