import json
import base64
import threading
from io import BytesIO
from pathlib import Path
from dataclasses import dataclass
from queue import Queue, Empty

from voxcpm import VoxCPM
import soundfile as sf

from config import config


_model = None
_generate_queue = None
_worker_thread = None
_worker_started = False


def get_model():
    global _model
    if _model is None:
        _model = VoxCPM.from_pretrained(config.model_path, load_denoiser=True)
    return _model


def get_generate_queue() -> Queue:
    global _generate_queue, _worker_thread, _worker_started
    if _generate_queue is None:
        _generate_queue = Queue(maxsize=config.queue_size)
    if not _worker_started:
        _worker_started = True
        _worker_thread = threading.Thread(target=_queue_worker, daemon=True)
        _worker_thread.start()
    return _generate_queue


def _queue_worker():
    while True:
        item = _generate_queue.get()
        if item is None:
            break
        task, event = item
        try:
            task()
        except Exception:
            pass
        finally:
            event.set()
            _generate_queue.task_done()


def get_voices_dir() -> Path:
    voices_dir = Path(config.voices_dir)
    voices_dir.mkdir(exist_ok=True)
    return voices_dir


@dataclass
class Voice:
    id: str
    name: str
    voice_path: str
    voice_url: str
    text: str

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "voice_path": self.voice_path,
            "voice_url": self.voice_url,
            "text": self.text,
        }

    @classmethod
    def from_json(cls, data: dict) -> "Voice":
        return cls(
            id=data["id"],
            name=data["name"],
            voice_path=data["voice_path"],
            voice_url=data["voice_url"],
            text=data["text"],
        )


def get_ref_audio(voice_id: str) -> Voice:
    voices_dir = get_voices_dir()
    metadata_path = voices_dir / f"{voice_id}.json"

    if not metadata_path.exists():
        raise FileNotFoundError(f"Voice '{voice_id}' not found")

    with open(metadata_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return Voice.from_json(data)


def save_voice(voice: Voice) -> None:
    voices_dir = get_voices_dir()
    metadata_path = voices_dir / f"{voice.id}.json"

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(voice.to_json(), f, ensure_ascii=False, indent=2)


def delete_voice(voice_id: str) -> None:
    voices_dir = get_voices_dir()

    audio_path = voices_dir / f"{voice_id}.wav"
    if audio_path.exists():
        audio_path.unlink()

    metadata_path = voices_dir / f"{voice_id}.json"
    if metadata_path.exists():
        metadata_path.unlink()


def parse_data_uri(data_uri: str) -> tuple[str, bytes]:
    if not data_uri.startswith("data:"):
        raise ValueError("Invalid data-URI format: missing 'data:' prefix")

    header, b64_data = data_uri.split(",", 1)

    mime_part = header[5:]
    if mime_part.endswith(";base64"):
        mime_type = mime_part[:-7]
    else:
        mime_type = mime_part

    if not mime_type:
        mime_type = "audio/wav"

    audio_bytes = base64.b64decode(b64_data)
    return mime_type, audio_bytes


def generate(
    text: str,
    voice_id: str = None,
    control: str = None,
    cfg_value: float = 2.0,
    inference_timesteps: int = 10,
) -> BytesIO:
    queue = get_generate_queue()
    result_holder = [None]
    exception_holder = [None]
    event = threading.Event()

    def do_generate():
        try:
            result_holder[0] = _do_generate(text, voice_id, control, cfg_value, inference_timesteps)
        except Exception as e:
            exception_holder[0] = e

    try:
        queue.put((do_generate, event), block=True, timeout=30)
    except Empty:
        raise RuntimeError("Queue is full, please try again later")

    event.wait()
    if exception_holder[0]:
        raise exception_holder[0]
    return result_holder[0]


def _do_generate(
    text: str,
    voice_id: str = None,
    control: str = None,
    cfg_value: float = 2.0,
    inference_timesteps: int = 10,
) -> BytesIO:
    model = get_model()

    if voice_id:
        voice = get_ref_audio(voice_id)

        if control:
            wav = model.generate(
                text=f"({control}){text}",
                reference_wav_path=voice.voice_path,
                cfg_value=cfg_value,
                inference_timesteps=inference_timesteps,
            )
        else:
            wav = model.generate(
                text=text,
                reference_wav_path=voice.voice_path,
                prompt_wav_path=voice.voice_path,
                prompt_text=voice.text,
                cfg_value=cfg_value,
                inference_timesteps=inference_timesteps,
            )
    else:
        if control:
            wav = model.generate(
                text=f"({control}){text}",
                cfg_value=cfg_value,
                inference_timesteps=inference_timesteps,
            )
        else:
            wav = model.generate(
                text=control + text if control else text,
                cfg_value=cfg_value,
                inference_timesteps=inference_timesteps,
            )

    file = BytesIO()
    sf.write(file, wav, model.tts_model.sample_rate, format="WAV")
    file.seek(0)

    return file
