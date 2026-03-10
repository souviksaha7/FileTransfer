// Configuration
const CONFIG = {
    API_BASE: '/api',
    CHUNK_SIZE: 1024 * 1024, // 1MB chunks
    TRANSFER_TIMEOUT: 30000,
    WS_RECONNECT_DELAY: 3000,
    PRIVATE_PBKDF2_ITERATIONS: 250000,
    PRIVATE_MAX_FILE_SIZE: 512 * 1024 * 1024 // 512MB
};

// Get auth token
const getAuthToken = () => localStorage.getItem('authToken') || '';
const PRIVATE_MODE_STORAGE_KEY = 'privateSharingModeEnabled';

// Add auth header to requests
const getHeaders = (includeAuth = true, includePrivateDigest = true) => {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAuth) {
        headers['X-Auth-Token'] = getAuthToken();
    }
    if (includePrivateDigest && state.privateSharing.keyDigest) {
        headers['X-Private-Key-Digest'] = state.privateSharing.keyDigest;
    }
    return headers;
};

// Logout function
const logout = () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
};

// State management
const state = {
    files: new Map(),
    stats: {
        totalUploads: 0,
        totalSize: 0,
        transfers: [],
        avgSpeed: 0
    },
    connectionInfo: null,
    bluetoothEnabled: false,
    activeTransfers: 0,
    wifiUsage: 100,
    bluetoothUsage: 0,
    privateSharing: {
        enabled: false,
        key: '',
        keyDigest: '',
        unlocked: false
    }
};

const encoder = new TextEncoder();

const normalizePrivateKey = (value) => String(value || '').trim();

const toBase64 = (value) => {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
};

const fromBase64 = (value) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const derivePrivateAesKey = async (privateKey, salt, iterations) => {
    const material = await crypto.subtle.importKey(
        'raw',
        encoder.encode(privateKey),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: 'SHA-256'
        },
        material,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
};

const computePrivateKeyDigest = async (privateKey) => {
    const digestBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(privateKey));
    return toBase64(digestBuffer).replace(/=+$/g, '');
};

const ensurePrivateCryptoSupport = () => {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.getRandomValues !== 'function') {
        throw new Error('This browser runtime does not support secure private encryption.');
    }
};

const encryptFileForPrivateShare = async (file, privateKey) => {
    ensurePrivateCryptoSupport();

    if (file.size > CONFIG.PRIVATE_MAX_FILE_SIZE) {
        const maxSizeLabel = formatFileSize(CONFIG.PRIVATE_MAX_FILE_SIZE);
        throw new Error(`Private encrypted upload currently supports files up to ${maxSizeLabel}.`);
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const iterations = CONFIG.PRIVATE_PBKDF2_ITERATIONS;
    const aesKey = await derivePrivateAesKey(privateKey, salt, iterations);
    const plaintext = await file.arrayBuffer();
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
    const keyDigest = await computePrivateKeyDigest(privateKey);

    return {
        encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
        metadata: {
            algorithm: 'AES-GCM',
            originalName: file.name,
            originalSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            salt: toBase64(salt),
            iv: toBase64(iv),
            iterations,
            keyDigest
        }
    };
};

const decryptPrivateFilePayload = async (encryptedBuffer, privateKey, metadata) => {
    ensurePrivateCryptoSupport();

    if (!metadata || !metadata.salt || !metadata.iv || !metadata.iterations) {
        throw new Error('Missing private encryption metadata.');
    }

    const salt = fromBase64(metadata.salt);
    const iv = fromBase64(metadata.iv);
    const iterations = Number.parseInt(metadata.iterations, 10);
    const aesKey = await derivePrivateAesKey(privateKey, salt, iterations);

    try {
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encryptedBuffer);
        return new Blob([plaintext], { type: metadata.mimeType || 'application/octet-stream' });
    } catch {
        throw new Error('Invalid private sharing key for this file.');
    }
};

const triggerBrowserDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// WebSocket connection
let ws = null;
const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateWiFiStatus('connected');
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (e) {
            console.error('WebSocket message error:', e);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateWiFiStatus('error');
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        updateWiFiStatus('disconnected');
        setTimeout(connectWebSocket, CONFIG.WS_RECONNECT_DELAY);
    };
};

// Handle WebSocket messages
const handleWebSocketMessage = (message) => {
    switch (message.type) {
        case 'file-uploaded':
            addFileToList(message);
            showToast(`${message.fileName} uploaded successfully!`, 'success');
            break;
        case 'file-deleted':
            removeFileFromList(message.transferId);
            break;
        case 'transfer-status':
            updateTransferStatus(message);
            break;
        case 'bluetooth-status':
            handleBluetoothStatus(message);
            break;
        case 'system-status':
            updateSystemStatus(message);
            break;
        default:
            break;
    }
};

// Initialize the application
const initApp = async () => {
    connectWebSocket();
    initializePrivateSharingState();
    loadConnectionInfo();
    setupEventListeners();
    setBluetoothControlState(state.bluetoothEnabled, 'Bluetooth: Disabled');
    updatePrivateSharingStatus();
    await loadFilesList();
};

// Setup event listeners
const setupEventListeners = () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const bluetoothBtn = document.getElementById('bluetoothBtn');
    const privateToggle = document.getElementById('privateSharingToggle');
    const privateKeyInput = document.getElementById('privateSharingKey');
    const applyPrivateKeyBtn = document.getElementById('applyPrivateKeyBtn');
    const clearPrivateKeyBtn = document.getElementById('clearPrivateKeyBtn');

    // Drag and drop
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleFileSelection(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files);
        fileInput.value = '';
    });

    // Bluetooth control
    if (bluetoothBtn) {
        bluetoothBtn.addEventListener('click', enableBluetooth);
    }

    if (privateToggle) {
        privateToggle.addEventListener('change', onPrivateModeToggle);
    }

    if (applyPrivateKeyBtn) {
        applyPrivateKeyBtn.addEventListener('click', applyPrivateSharingKey);
    }

    if (clearPrivateKeyBtn) {
        clearPrivateKeyBtn.addEventListener('click', clearPrivateSharingKey);
    }

    if (privateKeyInput) {
        privateKeyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyPrivateSharingKey();
            }
        });
    }
};

// Handle file selection
const handleFileSelection = async (files) => {
    for (const file of files) {
        try {
            const privateUpload = state.privateSharing.enabled;
            const useChunked = !privateUpload
                && document.getElementById('chunkUpload').checked
                && file.size > 50 * 1024 * 1024;

            if (useChunked) {
                await uploadFileChunked(file);
            } else {
                await uploadFile(file, { privateUpload });
            }
        } catch (error) {
            console.error('File upload error:', error);
            showToast(`Error uploading ${file.name}: ${error.message}`, 'error');
        }
    }
};

// Upload file (standard)
const uploadFile = async (file, options = {}) => {
    const privateUpload = Boolean(options.privateUpload);

    if (privateUpload && !state.privateSharing.unlocked) {
        throw new Error('Set and apply a private sharing key before private upload.');
    }

    let uploadBlob = file;
    let uploadName = file.name;
    let privateMeta = null;

    if (privateUpload) {
        document.getElementById('uploadProgress').style.display = 'block';
        document.getElementById('progressFileName').textContent = `Encrypting: ${file.name}`;
        updateProgressBar(0, 0, NaN);

        const encrypted = await encryptFileForPrivateShare(file, state.privateSharing.key);
        uploadBlob = encrypted.encryptedBlob;
        uploadName = `${file.name}.enc`;
        privateMeta = encrypted.metadata;
    }

    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', uploadBlob, uploadName);
        if (privateMeta) {
            formData.append('privateMeta', JSON.stringify(privateMeta));
        }

        const xhr = new XMLHttpRequest();
        const startTime = Date.now();

        // Show progress
        document.getElementById('uploadProgress').style.display = 'block';
        document.getElementById('progressFileName').textContent = privateUpload
            ? `Uploading encrypted: ${file.name}`
            : `Uploading: ${file.name}`;

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = (e.loaded / 1024 / 1024) / elapsed;
                const remaining = ((e.total - e.loaded) / 1024 / 1024) / speed;

                updateProgressBar(percent, speed, remaining);

                // Simulate parallel WiFi+Bluetooth transfer
                if (state.bluetoothEnabled) {
                    const wifiSpeed = speed * 0.6;
                    const btSpeed = speed * 0.4;
                    state.wifiUsage = 60;
                    state.bluetoothUsage = 40;
                } else {
                    state.wifiUsage = 100;
                    state.bluetoothUsage = 0;
                }
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                addFileToList({
                    ...response,
                    name: response.fileName || response.name,
                    transferType: response.transferType || (state.bluetoothEnabled ? 'WiFi + Bluetooth' : 'WiFi')
                });
                updateStats();
                if (privateUpload) {
                    showToast(`Private encrypted upload complete: ${file.name}`, 'success');
                }
                resolve(response);
            } else {
                let errorMessage = 'Upload failed';
                try {
                    const parsed = JSON.parse(xhr.responseText);
                    if (parsed && parsed.error) {
                        errorMessage = parsed.error;
                    }
                } catch {
                    // Keep generic upload error.
                }
                reject(new Error(errorMessage));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
        });

        xhr.open('POST', `${CONFIG.API_BASE}/upload`);
        xhr.setRequestHeader('X-Auth-Token', getAuthToken());
        xhr.send(formData);
    });
};

// Upload file (chunked) for large files with retry logic
const uploadFileChunked = async (file) => {
    const fileId = generateUUID();
    const totalChunks = Math.ceil(file.size / CONFIG.CHUNK_SIZE);
    const startTime = Date.now();

    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('progressFileName').textContent = `Uploading (chunked): ${file.name}`;

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CONFIG.CHUNK_SIZE;
        const end = Math.min(start + CONFIG.CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        // Retry logic: up to 3 attempts with exponential backoff
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`Uploading chunk ${i}/${totalChunks} (attempt ${attempt}/3)`);
                await uploadChunk(fileId, file.name, chunk, i, totalChunks, startTime);
                break; // Success, exit retry loop
            } catch (error) {
                lastError = error;
                console.error(`Chunk ${i} attempt ${attempt} failed:`, error.message);
                
                if (attempt < 3) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    console.log(`Retrying chunk ${i} in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // Final attempt failed
                    throw error;
                }
            }
        }
    }
};

// Upload individual chunk with timeout and retry
const uploadChunk = (fileId, fileName, chunk, chunkIndex, totalChunks, startTime) => {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('fileId', fileId);
        formData.append('fileName', fileName);
        formData.append('chunkIndex', chunkIndex);
        formData.append('totalChunks', totalChunks);

        const xhr = new XMLHttpRequest();
        
        // Increase timeout for large chunks (5 minutes)
        xhr.timeout = 5 * 60 * 1000;

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const uploadedBytes = chunkIndex * CONFIG.CHUNK_SIZE + e.loaded;
                const totalBytes = totalChunks * CONFIG.CHUNK_SIZE;
                const percent = (uploadedBytes / totalBytes) * 100;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = uploadedBytes / 1024 / 1024 / elapsed;

                updateProgressBar(percent, speed, (totalBytes - uploadedBytes) / 1024 / 1024 / speed);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    console.log(`Chunk ${chunkIndex}/${totalChunks} uploaded successfully`);
                    resolve(response);
                } else {
                    reject(new Error(`Chunk ${chunkIndex}: ${response.error}`));
                }
            } else {
                const errorMsg = xhr.responseText ? JSON.parse(xhr.responseText).error : 'Unknown error';
                reject(new Error(`Chunk ${chunkIndex} upload failed (HTTP ${xhr.status}): ${errorMsg}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error(`Chunk ${chunkIndex} upload failed: Network error`));
        });

        xhr.addEventListener('timeout', () => {
            reject(new Error(`Chunk ${chunkIndex} upload timeout: Server took too long to respond`));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error(`Chunk ${chunkIndex} upload aborted`));
        });

        xhr.open('POST', `${CONFIG.API_BASE}/upload-chunk`);
        const token = getAuthToken();
        if (token) {
            xhr.setRequestHeader('X-Auth-Token', token);
        }
        xhr.send(formData);
    });
};

// Update progress bar
const updateProgressBar = (percent, speed, timeRemaining) => {
    const fill = document.getElementById('progressBarFill');
    fill.style.width = percent + '%';
    document.getElementById('progressPercent').textContent = Math.round(percent) + '%';
    document.getElementById('progressSpeed').textContent = speed.toFixed(2) + ' MB/s';

    if (!isNaN(timeRemaining)) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = Math.floor(timeRemaining % 60);
        document.getElementById('progressTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
};

// Load files list
const loadFilesList = async () => {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/files`, {
            headers: getHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load files');
        }

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';
        state.files.clear();

        if (data.files.length === 0) {
            filesList.innerHTML = getEmptyFilesMessage();
            updateStats();
            return;
        }

        data.files.forEach(file => {
            addFileToList(file);
        });
        updateStats();
    } catch (error) {
        console.error('Error loading files:', error);
        showToast(error.message || 'Error loading files', 'error');
    }
};

// Add file to list in UI
const addFileToList = (file) => {
    if (file.isPrivate && !state.privateSharing.unlocked) {
        return;
    }

    const filesList = document.getElementById('filesList');

    // Remove empty message if present
    const emptyMsg = filesList.querySelector('.empty-message');
    if (emptyMsg) {
        emptyMsg.remove();
    }

    const existing = document.getElementById(`file-${file.transferId}`);
    if (existing) {
        existing.remove();
    }

    const fileCard = document.createElement('div');
    fileCard.className = `file-card ${file.isPrivate ? 'private-file' : ''}`;
    fileCard.id = `file-${file.transferId}`;

    const fileIcon = getFileIcon(file.name || file.fileName);
    const fileSize = formatFileSize(file.size);
    const fileName = file.name || file.fileName || 'Unnamed file';
    const transferType = file.transferType || 'WiFi';
    const safeFileName = escapeHTML(fileName);
    const privateBadge = file.isPrivate ? '<span class="private-badge">Private</span>' : '';
    const detailsSuffix = file.isPrivate ? ' • Encrypted (E2E)' : '';
    const shareButton = file.isPrivate
        ? ''
        : `
            <button class="btn-share" onclick="shareFile('${file.transferId}')" title="Generate share link">
                🔗 Share
            </button>
        `;

    fileCard.innerHTML = `
        <div class="file-info-container">
            <div class="file-icon">${fileIcon}</div>
            <div class="file-details">
                <h4>${safeFileName} ${privateBadge}</h4>
                <p>${fileSize} • ${transferType}${detailsSuffix}</p>
            </div>
        </div>
        <div class="file-actions">
            <button class="btn-download" onclick="downloadFile('${file.transferId}')" title="Download file">
                ⬇️ Download
            </button>
            ${shareButton}
            <button class="btn-delete" onclick="deleteFile('${file.transferId}')" title="Delete file">
                🗑️ Delete
            </button>
        </div>
    `;

    filesList.appendChild(fileCard);
    state.files.set(file.transferId, file);
};

const removeFileFromList = (transferId) => {
    const fileCard = document.getElementById(`file-${transferId}`);
    if (fileCard) {
        fileCard.remove();
    }

    state.files.delete(transferId);

    const filesList = document.getElementById('filesList');
    if (filesList && filesList.children.length === 0) {
        filesList.innerHTML = getEmptyFilesMessage();
    }

    updateStats();
};

// Download file
const downloadFile = async (transferId) => {
    const fileInfo = state.files.get(transferId);
    const fileName = fileInfo && (fileInfo.name || fileInfo.fileName) ? (fileInfo.name || fileInfo.fileName) : 'file';

    try {
        if (fileInfo && fileInfo.isPrivate) {
            if (!state.privateSharing.unlocked || !state.privateSharing.key) {
                showToast('Enter and apply your private sharing key to download this file.', 'warning');
                return;
            }

            const response = await fetch(`${CONFIG.API_BASE}/download/${transferId}`, {
                headers: getHeaders()
            });

            if (!response.ok) {
                let serverError = 'Private download failed';
                try {
                    const errorData = await response.json();
                    serverError = errorData.error || serverError;
                } catch {
                    // Ignore parse errors and keep generic message.
                }
                throw new Error(serverError);
            }

            const encryptedBuffer = await response.arrayBuffer();
            const headerMetadata = response.headers.get('X-Private-File') === '1'
                ? {
                    algorithm: response.headers.get('X-Private-Enc-Algorithm') || 'AES-GCM',
                    salt: response.headers.get('X-Private-Enc-Salt') || '',
                    iv: response.headers.get('X-Private-Enc-Iv') || '',
                    iterations: response.headers.get('X-Private-Enc-Iterations') || '',
                    mimeType: response.headers.get('X-Private-Mime-Type') || 'application/octet-stream',
                    originalSize: response.headers.get('X-Private-Original-Size') || 0
                }
                : null;

            const metadata = fileInfo.encryption || headerMetadata;
            const decryptedBlob = await decryptPrivateFilePayload(encryptedBuffer, state.privateSharing.key, metadata);
            triggerBrowserDownload(decryptedBlob, fileName);
            showToast(`Private file decrypted and downloaded: ${fileName}`, 'success');
            return;
        }

        const link = document.createElement('a');
        link.href = `${CONFIG.API_BASE}/download/${transferId}`;
        link.download = fileName;
        link.click();
        showToast(`Downloading: ${fileName}`, 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast(error.message || 'Download failed', 'error');
    }
};

// Share file
const shareFile = async (transferId) => {
    const fileInfo = state.files.get(transferId);
    const fileName = fileInfo && (fileInfo.name || fileInfo.fileName) ? (fileInfo.name || fileInfo.fileName) : 'file';

    if (fileInfo && fileInfo.isPrivate) {
        showToast('Private encrypted files cannot use public share links.', 'warning');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE}/files/${transferId}/share`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to generate share link');
        }

        // Copy share URL to clipboard
        await navigator.clipboard.writeText(data.shareUrl);
        
        // Show modal with share link
        const shareModal = document.createElement('div');
        const safeModalName = escapeHTML(fileName);
        shareModal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        
        shareModal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 30px; max-width: 500px; width: 90%;">
                <h3 style="margin-bottom: 15px; color: #333;">Share File</h3>
                <p style="color: #666; margin-bottom: 15px;">Share link copied to clipboard!</p>
                <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 20px; word-break: break-all; font-size: 14px;">
                    ${data.shareUrl}
                </div>
                <p style="color: #999; font-size: 12px; margin-bottom: 20px;">
                    Send this link to anyone to let them download <strong>${safeModalName}</strong>
                </p>
                <button onclick="this.parentElement.parentElement.remove()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; width: 100%;">
                    ✅ Done
                </button>
            </div>
        `;
        
        document.body.appendChild(shareModal);
        showToast('Share link copied to clipboard!', 'success');
    } catch (error) {
        console.error('Share error:', error);
        showToast(error.message || 'Failed to generate share link', 'error');
    }
};

// Delete file with password protection
const deleteFile = async (transferId) => {
    const fileInfo = state.files.get(transferId);
    const fileName = fileInfo && (fileInfo.name || fileInfo.fileName) ? (fileInfo.name || fileInfo.fileName) : 'file';

    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
        return;
    }

    // Prompt for delete password
    const deletePassword = prompt('Enter delete password:');
    if (!deletePassword) {
        showToast('Delete cancelled', 'info');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE}/files/${transferId}`, {
            method: 'DELETE',
            headers: getHeaders(),
            body: JSON.stringify({ password: deletePassword })
        });

        const data = await response.json();

        if (response.ok) {
            const fileCard = document.getElementById(`file-${transferId}`);
            if (fileCard) {
                fileCard.remove();
            }
            state.files.delete(transferId);
            updateStats();
            showToast(`Deleted: ${fileName}`, 'success');
        } else {
            showToast(data.error || 'Failed to delete file', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete file', 'error');
    }

};

const initializePrivateSharingState = () => {
    state.privateSharing.enabled = localStorage.getItem(PRIVATE_MODE_STORAGE_KEY) === '1';
    state.privateSharing.key = '';
    state.privateSharing.keyDigest = '';
    state.privateSharing.unlocked = false;

    const privateToggle = document.getElementById('privateSharingToggle');
    const keyInput = document.getElementById('privateSharingKey');
    if (privateToggle) {
        privateToggle.checked = false;
    }
    if (keyInput) {
        keyInput.value = '';
    }
};

const onPrivateModeToggle = (event) => {
    const enabled = Boolean(event.target.checked);

    if (enabled && !state.privateSharing.unlocked) {
        event.target.checked = false;
        state.privateSharing.enabled = false;
        showToast('Apply a private sharing key first, then enable private upload mode.', 'warning');
        updatePrivateSharingStatus();
        return;
    }

    state.privateSharing.enabled = enabled;
    localStorage.setItem(PRIVATE_MODE_STORAGE_KEY, enabled ? '1' : '0');
    updatePrivateSharingStatus();
};

const applyPrivateSharingKey = async () => {
    const input = document.getElementById('privateSharingKey');
    if (!input) {
        return;
    }

    const keyValue = normalizePrivateKey(input.value);
    if (keyValue.length < 6) {
        showToast('Private sharing key must be at least 6 characters.', 'warning');
        return;
    }

    try {
        const keyDigest = await computePrivateKeyDigest(keyValue);
        state.privateSharing.key = keyValue;
        state.privateSharing.keyDigest = keyDigest;
        state.privateSharing.unlocked = true;

        if (localStorage.getItem(PRIVATE_MODE_STORAGE_KEY) === '1') {
            state.privateSharing.enabled = true;
        }

        const privateToggle = document.getElementById('privateSharingToggle');
        if (privateToggle) {
            privateToggle.checked = state.privateSharing.enabled;
        }

        updatePrivateSharingStatus();
        await loadFilesList();
        showToast('Private sharing key applied. Matching private files are now visible.', 'success');
    } catch (error) {
        console.error('Private key apply error:', error);
        showToast('Failed to apply private sharing key.', 'error');
    }
};

const clearPrivateSharingKey = async () => {
    state.privateSharing.key = '';
    state.privateSharing.keyDigest = '';
    state.privateSharing.unlocked = false;
    state.privateSharing.enabled = false;
    localStorage.setItem(PRIVATE_MODE_STORAGE_KEY, '0');

    const privateToggle = document.getElementById('privateSharingToggle');
    const keyInput = document.getElementById('privateSharingKey');
    if (privateToggle) {
        privateToggle.checked = false;
    }
    if (keyInput) {
        keyInput.value = '';
    }

    updatePrivateSharingStatus();
    await loadFilesList();
    showToast('Private sharing key cleared. Private files are hidden.', 'info');
};

const updatePrivateSharingStatus = () => {
    const statusEl = document.getElementById('privateSharingStatus');
    if (!statusEl) {
        return;
    }

    if (!state.privateSharing.unlocked) {
        statusEl.textContent = 'Private files are locked. Enter your key to unlock and download them.';
        statusEl.className = 'private-status locked';
        return;
    }

    if (state.privateSharing.enabled) {
        statusEl.textContent = 'Private upload mode is ON. New files will be end-to-end encrypted.';
        statusEl.className = 'private-status enabled';
        return;
    }

    statusEl.textContent = 'Private key is active. Private files are unlocked. Enable private upload to encrypt new files.';
    statusEl.className = 'private-status unlocked';
};

const getEmptyFilesMessage = () => {
    if (!state.privateSharing.unlocked) {
        return '<p class="empty-message">No public files visible. Private files stay hidden until you apply a private sharing key.</p>';
    }
    return '<p class="empty-message">No files yet. Upload some to get started!</p>';
};

const setBluetoothControlState = (enabled, enabledLabel = 'Bluetooth: Enabled') => {
    const bluetoothBtn = document.getElementById('bluetoothBtn');
    const bluetoothLiveStatus = document.getElementById('bluetoothLiveStatus');
    const bluetoothStatus = document.getElementById('bluetoothStatus');
    const bluetoothIcon = document.getElementById('bluetoothIcon');

    if (bluetoothBtn) {
        bluetoothBtn.hidden = enabled;
    }

    if (bluetoothLiveStatus) {
        bluetoothLiveStatus.hidden = !enabled;
    }

    if (bluetoothStatus) {
        bluetoothStatus.textContent = enabled ? enabledLabel : 'Bluetooth: Disabled';
    }

    if (bluetoothIcon) {
        bluetoothIcon.textContent = enabled ? '🟢' : '🔵';
    }
};

// Enable Bluetooth
const enableBluetooth = () => {
    state.bluetoothEnabled = true;
    setBluetoothControlState(true, 'Bluetooth: Enabled');

    // Send to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'bluetooth-enable'
        }));
    }

    showToast('✓ Bluetooth enabled! Parallel transfers active', 'success');
};

// Handle Bluetooth status
const handleBluetoothStatus = (message) => {
    if (message.status === 'enabled') {
        state.bluetoothEnabled = true;
        setBluetoothControlState(true, 'Bluetooth: Enabled');
        console.log('Bluetooth enabled for transfer');
    } else if (message.status === 'disabled') {
        state.bluetoothEnabled = false;
        setBluetoothControlState(false, 'Bluetooth: Disabled');
    }
};

// Update system status
const updateSystemStatus = (message) => {
    if (typeof message.bluetooth === 'boolean') {
        state.bluetoothEnabled = message.bluetooth;
        setBluetoothControlState(message.bluetooth, message.bluetooth ? 'Bluetooth: Active' : 'Bluetooth: Disabled');
    }
};

// Update WiFi status
const updateWiFiStatus = (status) => {
    const wifiStatus = document.getElementById('wifiStatus');
    switch (status) {
        case 'connected':
            wifiStatus.textContent = '✓ WiFi: Connected';
            break;
        case 'disconnected':
            wifiStatus.textContent = '✗ WiFi: Disconnected';
            break;
        case 'error':
            wifiStatus.textContent = '⚠️ WiFi: Error';
            break;
    }
};

// Load connection info
const loadConnectionInfo = async () => {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/system-info`, {
            headers: getHeaders()
        });
        const info = await response.json();

        state.connectionInfo = info;

        let infoHTML = `
            <p><strong>📍 Hostname:</strong> ${info.hostname}</p>
            <p><strong>🌐 Access URL:</strong></p>
            <ul style="margin: 0.5rem 0 0 1.5rem;">
        `;

        info.ipAddresses.forEach(ip => {
            const preferredLabel = ip.preferred ? ' • Recommended' : '';
            infoHTML += `<li><code>http://${ip.address}:${info.port}</code> (${ip.interface}${preferredLabel})</li>`;
        });

        infoHTML += `
            </ul>
            <p style="margin-top: 1rem;"><strong>📱 On same network:</strong></p>
            <ul style="margin: 0.5rem 0 0 1.5rem;">
                <li>Mobile devices can connect using the IP address above</li>
                <li>Bluetooth will enable simultaneous dual-channel transfer</li>
                <li><a href="/qr-pairing.html" style="color: #34d399;">Open QR Pairing & Camera Scanner</a> for instant device connection</li>
            </ul>
        `;

        document.getElementById('connectionInfo').innerHTML = infoHTML;
    } catch (error) {
        console.error('Error loading connection info:', error);
    }
};

// Update transfer status
const updateTransferStatus = (status) => {
    // Can be extended to show more detailed transfer information
    console.log('Transfer status:', status);
};

// Update stats
const updateStats = () => {
    state.stats.totalUploads = state.files.size;
    state.stats.totalSize = Array.from(state.files.values())
        .reduce((sum, file) => sum + file.size, 0);

    document.getElementById('totalUploads').textContent = state.stats.totalUploads;
    document.getElementById('totalSize').textContent = formatFileSize(state.stats.totalSize);
    document.getElementById('activeTransfers').textContent = state.activeTransfers;
};

// Utility functions
const escapeHTML = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
}[ch] || ch));

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📄',
        'doc': '📝', 'docx': '📝', 'txt': '📝',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
        'mp4': '🎥', 'avi': '🎥', 'mov': '🎥', 'mkv': '🎥',
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵',
        'zip': '📦', 'rar': '📦', '7z': '📦',
        'exe': '⚙️', 'msi': '⚙️',
        'csv': '📊', 'xls': '📊', 'xlsx': '📊',
        'html': '🌐', 'css': '🎨', 'js': '💻', 'json': '💻'
    };
    return icons[ext] || '📎';
};

const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
};

// Initialize on page load
window.addEventListener('load', initApp);

// Keep connection alive
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    }
}, 30000);
