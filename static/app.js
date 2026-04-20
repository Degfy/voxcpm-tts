let voices = [];
let synthesizedAudio = null;
let synthesisHistory = [];
let currentSynthesisData = null;

async function loadModelStatus() {
    try {
        const response = await fetch('/api/v1/model/status');
        if (!response.ok) throw new Error('获取模型状态失败');
        const data = await response.json();
        updateModelStatusUI(data);
    } catch (error) {
        document.getElementById('status-text').textContent = '状态未知';
        document.getElementById('status-indicator').className = 'status-indicator unknown';
    }
}

function updateModelStatusUI(data) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const unloadBtn = document.getElementById('unload-btn');

    if (data.loaded) {
        indicator.className = 'status-indicator loaded';
        statusText.textContent = `模型已加载${data.busy ? ' (忙碌中)' : ''}`;
        unloadBtn.style.display = data.busy ? 'none' : 'inline-block';
    } else {
        indicator.className = 'status-indicator unloaded';
        statusText.textContent = '模型已卸载';
        unloadBtn.style.display = 'none';
    }
}

async function unloadModel() {
    if (!confirm('确定要卸载模型吗？卸载后将释放内存。')) return;

    try {
        const response = await fetch('/api/v1/model/unload', { method: 'POST' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '卸载失败');
        }
        showToast('模型已卸载', 'success');
        loadModelStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadVoices() {
    try {
        const response = await fetch('/api/v1/voices');
        if (!response.ok) throw new Error('加载音色列表失败');
        voices = await response.json();
        renderVoices();
        updateVoiceSelect();
    } catch (error) {
        showToast('加载音色列表失败: ' + error.message, 'error');
    }
}

function renderVoices() {
    const container = document.getElementById('voices-list');

    if (voices.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无音色，请添加第一个音色开始使用</div>';
        return;
    }

    container.innerHTML = voices.map(voice => `
        <div class="voice-card">
            <h4>${escapeHtml(voice.name)}</h4>
            <div class="voice-id" onclick="copyVoiceId('${voice.id}')" title="点击复制音色ID">
                ID: ${escapeHtml(voice.id)} <span class="copy-icon">📋</span>
            </div>
            <audio controls src="${voice.voice_url}"></audio>
            <p class="voice-text" title="${escapeHtml(voice.text)}">${escapeHtml(voice.text)}</p>
            <div class="voice-actions">
                <button class="btn btn-secondary" onclick="useVoice('${voice.id}')">使用</button>
                <button class="btn btn-danger" onclick="confirmDeleteVoice('${voice.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function updateVoiceSelect() {
    const select = document.getElementById('voice-select');
    select.innerHTML = '<option value="">请选择音色...</option>' +
        voices.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
}

function useVoice(voiceId) {
    document.getElementById('voice-select').value = voiceId;
    document.getElementById('synthesize-panel').scrollIntoView({ behavior: 'smooth' });
}

async function copyVoiceId(voiceId) {
    try {
        await navigator.clipboard.writeText(voiceId);
        showToast('音色ID已复制', 'success');
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = voiceId;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('音色ID已复制', 'success');
    }
}

function showAddVoiceModal() {
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('add-voice-form').reset();
    document.getElementById('audio-preview').style.display = 'none';
}

function hideModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

document.getElementById('voice-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const preview = document.getElementById('audio-preview');
        const previewAudio = document.getElementById('uploaded-audio-preview');
        previewAudio.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    }
});

document.getElementById('add-voice-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('name', document.getElementById('voice-name').value);
    formData.append('text', document.getElementById('voice-text').value);

    const fileInput = document.getElementById('voice-file');
    const file = fileInput.files[0];

    if (!file) {
        showToast('请选择音频文件', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const audioDataUri = await fileToDataUri(file);
        const data = {
            name: document.getElementById('voice-name').value,
            text: document.getElementById('voice-text').value,
            voice: audioDataUri
        };

        try {
            const response = await fetch('/api/v1/voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '添加音色失败');
            }

            showToast('音色添加成功', 'success');
            hideModal();
            loadVoices();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
});

function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const arrayBuffer = reader.result;
            const mimeType = file.type || 'audio/wav';
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            resolve(`data:${mimeType};base64,${base64}`);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function confirmDeleteVoice(voiceId) {
    if (!confirm('确定要删除这个音色吗？')) return;

    try {
        const response = await fetch(`/api/v1/voices/${voiceId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '删除音色失败');
        }

        showToast('音色已删除', 'success');
        loadVoices();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('synthesize-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = document.getElementById('synthesize-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    const data = {
        text: document.getElementById('text').value,
        voice_id: document.getElementById('voice-select').value,
        control: document.getElementById('control').value || null,
        cfg_value: parseFloat(document.getElementById('cfg_value').value) || 1.0,
        inference_timesteps: parseInt(document.getElementById('inference_timesteps').value) || 20,
        output_format: document.getElementById('output_format').value || 'wav'
    };

    if (!data.text.trim()) {
        showToast('请输入要合成的文本', 'error');
        resetSubmitBtn();
        return;
    }

    try {
        const response = await fetch('/api/v1/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '合成失败');
        }

        const blob = await response.blob();
        synthesizedAudio = blob;
        const audioUrl = URL.createObjectURL(blob);

        const audioPlayer = document.getElementById('audio-player');
        audioPlayer.src = audioUrl;

        currentSynthesisData = {
            text: data.text,
            audioBlob: blob,
            audioUrl: audioUrl,
            voice_id: data.voice_id,
            control: data.control,
            output_format: data.output_format,
            createdAt: new Date().toISOString()
        };

        document.getElementById('result-section').style.display = 'block';
        showToast('合成成功', 'success');
        loadModelStatus();

        addToSynthesisHistory(currentSynthesisData);
        audioPlayer.play().catch(() => {});
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        resetSubmitBtn();
    }
});

function resetSubmitBtn() {
    const submitBtn = document.getElementById('synthesize-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    submitBtn.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
}

function downloadAudio() {
    if (!synthesizedAudio) return;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(synthesizedAudio);
    link.download = `synthesized.${data.output_format}`;
    link.click();
}

function addToSynthesisHistory(data) {
    synthesisHistory.unshift(data);
    if (synthesisHistory.length > 10) {
        synthesisHistory.pop();
    }
    renderSynthesisHistory();
}

function renderSynthesisHistory() {
    const container = document.getElementById('synthesis-history-list');

    if (synthesisHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无合成历史</div>';
        return;
    }

    container.innerHTML = synthesisHistory.map((item, index) => `
        <div class="history-item">
            <div class="history-item-header">
                <span class="history-item-text">${escapeHtml(item.text)}</span>
                <span class="history-item-time">${formatTime(item.createdAt)}</span>
            </div>
            <div class="history-item-content">
                <audio controls src="${item.audioUrl}"></audio>
                <div class="history-item-actions">
                    <button class="btn btn-secondary btn-small" onclick="useSynthesisText('${escapeHtml(item.text)}')">使用文本</button>
                    <button class="btn btn-primary btn-small" onclick="showAddFromHistoryModal(${index})">添加到音色</button>
                    <button class="btn btn-secondary btn-small" onclick="downloadSynthesis(${index})">下载</button>
                </div>
            </div>
        </div>
    `).join('');
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function useSynthesisText(text) {
    document.getElementById('text').value = text;
    document.getElementById('synthesize-panel').scrollIntoView({ behavior: 'smooth' });
}

function downloadSynthesis(index) {
    const item = synthesisHistory[index];
    if (!item) return;

    const link = document.createElement('a');
    link.href = item.audioUrl;
    link.download = `synthesized_${Date.now()}.${item.output_format || 'wav'}`;
    link.click();
}

let currentHistoryIndex = null;

function showAddFromHistoryModal(index) {
    currentHistoryIndex = index;
    const item = synthesisHistory[index];
    if (!item) return;

    document.getElementById('synthesis-voice-name').value = '';
    document.getElementById('synthesis-text-preview').textContent = item.text;
    document.getElementById('synthesis-modal-overlay').style.display = 'flex';
}

function showAddFromSynthesisModal() {
    if (!currentSynthesisData) return;
    currentHistoryIndex = -1;

    document.getElementById('synthesis-voice-name').value = '';
    document.getElementById('synthesis-text-preview').textContent = currentSynthesisData.text;
    document.getElementById('synthesis-modal-overlay').style.display = 'flex';
}

function hideSynthesisModal() {
    document.getElementById('synthesis-modal-overlay').style.display = 'none';
    currentHistoryIndex = null;
}

document.getElementById('synthesis-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) hideSynthesisModal();
});

document.getElementById('add-from-synthesis-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    let item;
    if (currentHistoryIndex === -1 && currentSynthesisData) {
        item = currentSynthesisData;
    } else {
        item = synthesisHistory[currentHistoryIndex];
    }

    if (!item) {
        showToast('未找到合成音频', 'error');
        return;
    }

    const name = document.getElementById('synthesis-voice-name').value.trim();
    if (!name) {
        showToast('请输入音色名称', 'error');
        return;
    }

    try {
        const data = {
            name: name,
            text: item.text,
            voice: await blobToDataUri(item.audioBlob)
        };

        const response = await fetch('/api/v1/voices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '添加音色失败');
        }

        showToast('音色添加成功', 'success');
        hideSynthesisModal();
        loadVoices();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

async function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) hideModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideModal();
});

loadVoices();
loadModelStatus();

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        loadModelStatus();
    }
});
