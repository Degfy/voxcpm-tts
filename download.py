from modelscope import snapshot_download
from config import config

snapshot_download("OpenBMB/VoxCPM2", local_dir=config.model_path)
