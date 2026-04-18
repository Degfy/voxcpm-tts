let voices = [];
let synthesizedAudio = null;

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
        inference_timesteps: parseInt(document.getElementById('inference_timesteps').value) || 20
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

        document.getElementById('result-section').style.display = 'block';
        showToast('合成成功', 'success');

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
    link.download = 'synthesized.wav';
    link.click();
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
