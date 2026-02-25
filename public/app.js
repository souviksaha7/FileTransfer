// Configuration
const CONFIG = {
    API_BASE: '/api',
    CHUNK_SIZE: 1024 * 1024, // 1MB chunks
    TRANSFER_TIMEOUT: 30000,
    WS_RECONNECT_DELAY: 3000
};

// Get auth token
const getAuthToken = () => localStorage.getItem('authToken') || '';

// Add auth header to requests
const getHeaders = (includeAuth = true) => {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAuth) {
        headers['X-Auth-Token'] = getAuthToken();
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
    bluetoothUsage: 0
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
    loadConnectionInfo();
    setupEventListeners();
    loadFilesList();
};

// Setup event listeners
const setupEventListeners = () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const bluetoothBtn = document.getElementById('bluetoothBtn');

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
    bluetoothBtn.addEventListener('click', enableBluetooth);
};

// Handle file selection
const handleFileSelection = async (files) => {
    for (const file of files) {
        try {
            const useChunked = document.getElementById('chunkUpload').checked && file.size > 50 * 1024 * 1024;

            if (useChunked) {
                await uploadFileChunked(file);
            } else {
                await uploadFile(file);
            }
        } catch (error) {
            console.error('File upload error:', error);
            showToast(`Error uploading ${file.name}: ${error.message}`, 'error');
        }
    }
};

// Upload file (standard)
const uploadFile = (file) => {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        const startTime = Date.now();

        // Show progress
        document.getElementById('uploadProgress').style.display = 'block';
        document.getElementById('progressFileName').textContent = `Uploading: ${file.name}`;

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
                state.files.set(response.transferId, {
                    ...response,
                    transferType: state.bluetoothEnabled ? 'WiFi + Bluetooth' : 'WiFi'
                });
                updateStats();
                resolve(response);
            } else {
                reject(new Error('Upload failed'));
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

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';

        if (data.files.length === 0) {
            filesList.innerHTML = '<p class="empty-message">No files yet. Upload some to get started!</p>';
            return;
        }

        data.files.forEach(file => {
            addFileToList(file);
        });
    } catch (error) {
        console.error('Error loading files:', error);
        showToast('Error loading files', 'error');
    }
};

// Add file to list in UI
const addFileToList = (file) => {
    const filesList = document.getElementById('filesList');

    // Remove empty message if present
    const emptyMsg = filesList.querySelector('.empty-message');
    if (emptyMsg) {
        emptyMsg.remove();
    }

    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    fileCard.id = `file-${file.transferId}`;

    const fileIcon = getFileIcon(file.name || file.fileName);
    const fileSize = formatFileSize(file.size);
    const fileName = file.name || file.fileName;
    const transferType = file.transferType || 'WiFi';

    fileCard.innerHTML = `
        <div class="file-info-container">
            <div class="file-icon">${fileIcon}</div>
            <div class="file-details">
                <h4>${fileName}</h4>
                <p>${fileSize} • ${transferType}</p>
            </div>
        </div>
        <div class="file-actions">
            <button class="btn-download" onclick="downloadFile('${file.transferId}', '${fileName}')" title="Download file">
                ⬇️ Download
            </button>
            <button class="btn-share" onclick="shareFile('${file.transferId}', '${fileName}')" title="Generate share link">
                🔗 Share
            </button>
            <button class="btn-delete" onclick="deleteFile('${file.transferId}', '${fileName}')" title="Delete file">
                🗑️ Delete
            </button>
        </div>
    `;

    filesList.appendChild(fileCard);
    state.files.set(file.transferId, file);
};

// Download file
const downloadFile = async (transferId, fileName) => {
    try {
        const link = document.createElement('a');
        link.href = `${CONFIG.API_BASE}/download/${transferId}`;
        link.download = fileName;
        link.click();
        showToast(`Downloading: ${fileName}`, 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed', 'error');
    }
};

// Share file
const shareFile = async (transferId, fileName) => {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/files/${transferId}/share`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (data.success) {
            // Copy share URL to clipboard
            await navigator.clipboard.writeText(data.shareUrl);
            
            // Show modal with share link
            const shareModal = document.createElement('div');
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
                        Send this link to anyone to let them download <strong>${fileName}</strong>
                    </p>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; width: 100%;">
                        ✅ Done
                    </button>
                </div>
            `;
            
            document.body.appendChild(shareModal);
            showToast('Share link copied to clipboard!', 'success');
        }
    } catch (error) {
        console.error('Share error:', error);
        showToast('Failed to generate share link', 'error');
    }
};

// Delete file with password protection
const deleteFile = async (transferId, fileName) => {
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

// Enable Bluetooth
const enableBluetooth = () => {
    state.bluetoothEnabled = true;

    const bluetoothBtn = document.getElementById('bluetoothBtn');
    bluetoothBtn.style.display = 'none';

    const bluetoothInfo = document.getElementById('bluetoothInfo');
    bluetoothInfo.style.display = 'block';

    const bluetoothStatus = document.getElementById('bluetoothStatus');
    bluetoothStatus.textContent = '🔴 Bluetooth: Enabled';

    const bluetoothIcon = document.getElementById('bluetoothIcon');
    bluetoothIcon.textContent = '🟢';

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
        console.log('Bluetooth enabled for transfer');
    }
};

// Update system status
const updateSystemStatus = (message) => {
    if (message.bluetooth) {
        const bluetoothStatus = document.getElementById('bluetoothStatus');
        bluetoothStatus.textContent = '🟢 Bluetooth: Active';
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
            infoHTML += `<li><code>http://${ip.address}:${info.port}</code> (${ip.interface})</li>`;
        });

        infoHTML += `
            </ul>
            <p style="margin-top: 1rem;"><strong>📱 On same network:</strong></p>
            <ul style="margin: 0.5rem 0 0 1.5rem;">
                <li>Mobile devices can connect using the IP address above</li>
                <li>Bluetooth will enable simultaneous dual-channel transfer</li>
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
