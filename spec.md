# 声音服务

## 音色管理
### 音色定义
    - id: string 音色ID
    - name: string 音色名称
    - voice_path: string 参考音文件路径 (内部存储)
    - voice_url: string 参考音文件外链
    - text: string 参考音文件内容
### 接口
- 1. 获取所有音色
    - 请求
    ```http
    GET /api/v1/voices
    ```

    - 响应
    http-status: 200
    json:
    ```json
    [{
        "id": "string",
        "name": "string",
        "voice_url": "string", //对外可以访问的地址
        "text": "string"
    }]
    ```
- 2. 添加音色
    - 请求
    ```http
    POST /api/v1/voices
    content-type: application/json

    {
        "name": "string",
        "voice": "音频文件的data-uri",
        "text": "string",
    }
    ```
    - 响应
    http-status: 200

- 3. 删除音色
    - 请求
    ```http
    DELETE /api/v1/voices/:id
    ```
    - 响应
    http-status: 200

## 声音合成
### 接口
- 1. 合成声音
    - 请求
    ```http
    POST /api/v1/synthesize
    content-type: application/json

    {
        "text": "string", //文本
        "voice_id": "string",
        "control": "string",
        "speed": number,
        "cfg_value": number,
        "inference_timesteps": number,
    }
    ```
    - 响应
    http-status: 200
    音频文件响应