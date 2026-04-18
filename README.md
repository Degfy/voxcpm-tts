# Chinese TTS Service

基于 [VoxCPM2](https://github.com/OpenBMB/VoxCPM) 的中文语音合成服务，支持 30 种语言和语音克隆。

## 快速开始

### 安装依赖

```bash
uv pip install -e .
```

### 启动服务

```bash
python main.py
```

服务启动后访问 http://localhost:8000/docs 查看 API 文档。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/voices` | 获取所有音色 |
| POST | `/api/v1/voices` | 添加音色 |
| DELETE | `/api/v1/voices/:id` | 删除音色 |
| POST | `/api/v1/synthesize` | 合成语音 |

### 添加音色

```bash
curl -X POST http://localhost:8000/api/v1/voices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "少女音",
    "voice": "data:audio/wav;base64,...",
    "text": "参考音频的文本内容"
  }'
```

### 合成语音

```bash
curl -X POST http://localhost:8000/api/v1/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "今天天气真好",
    "voice_id": "a1b2c3d4",
    "cfg_value": 1.0,
    "inference_timesteps": 20
  }'
```

## 配置

在 `.env` 文件中设置：

```
MODEL_PATH=pretrained_models/VoxCPM2
VOICES_DIR=voices
BASE_URL=http://localhost:8000
```

## 音色存储

- 音频文件：`voices/<voice_id>.wav`
- 元数据：`voices/<voice_id>.json`
