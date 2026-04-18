from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()


class Config:
    model_path: str = os.getenv("MODEL_PATH", "pretrained_models/VoxCPM2")
    voices_dir: Path = Path(os.getenv("VOICES_DIR", "voices"))
    base_url: str = os.getenv("BASE_URL", "http://localhost:8000")
    queue_size: int = int(os.getenv("QUEUE_SIZE", "10"))


config = Config()
