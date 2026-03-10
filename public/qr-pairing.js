const CONFIG = {
    API_BASE: '/api'
};

const state = {
    currentQRCode: null,
    qrTimerId: null,
    clientId: getClientId(),
    scanner: {
        stream: null,
        detector: null,
        active: false,
        frameId: null,
        processing: false
    },
    lastConnectedOrigin: localStorage.getItem('lastConnectedOrigin') || window.location.origin
};

function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

function getHeaders(includeAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAuth) {
        const token = getAuthToken();
        if (token) {
            headers['X-Auth-Token'] = token;
        }
    }
    return headers;
}

function generateClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `client-${window.crypto.randomUUID()}`;
    }

    return `client-${Math.random().toString(36).slice(2, 11)}`;
}

function getClientId() {
    let id = localStorage.getItem('pairClientId');
    if (!id) {
        id = generateClientId();
        localStorage.setItem('pairClientId', id);
    }
    return id;
}

function getDefaultDeviceName() {
    const saved = localStorage.getItem('pairDeviceName');
    if (saved) {
        return saved;
    }

    const platform = navigator.platform || 'Device';
    return `${platform}-Client`;
}

function saveDeviceName(name) {
    if (name && name.trim()) {
        localStorage.setItem('pairDeviceName', name.trim());
    }
}

function switchTab(tabId, buttonEl) {
    document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    if (buttonEl) {
        buttonEl.classList.add('active');
    }

    if (tabId === 'devices-tab') {
        loadPairedDevices();
    }

    if (tabId === 'ip-tab') {
        loadNetworkInfo();
    }

    if (tabId !== 'scan-tab') {
        stopScanner();
    }
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    el.className = `status ${type}`;
    el.textContent = message;
    el.style.display = 'block';
}

function clearStatus(elementId) {
    const el = document.getElementById(elementId);
    el.style.display = 'none';
    el.textContent = '';
    el.className = 'status info';
}

async function generateQRCode() {
    const btn = document.getElementById('generateQrBtn');
    const copyBtn = document.getElementById('copyQrBtn');
    const nameInput = document.getElementById('deviceNameQR');
    const deviceName = nameInput.value.trim() || getDefaultDeviceName();
    saveDeviceName(deviceName);

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>Generating...';

        const response = await fetch(`${CONFIG.API_BASE}/qr/generate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ deviceName })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to generate QR code');
        }

        state.currentQRCode = data;
        document.getElementById('qrCode').innerHTML = `<img src="${data.qrCode}" alt="Pairing QR Code">`;
        document.getElementById('qrLink').textContent = data.qrData;
        document.getElementById('qrLinkBox').style.display = 'block';
        copyBtn.disabled = false;

        if (state.qrTimerId) {
            clearInterval(state.qrTimerId);
        }

        let remaining = Number(data.expiresIn) || 300;
        showStatus('qrStatus', `QR ready. Expires in ${remaining}s.`, 'info');

        state.qrTimerId = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(state.qrTimerId);
                state.qrTimerId = null;
                showStatus('qrStatus', 'QR expired. Generate a new one.', 'error');
                return;
            }
            showStatus('qrStatus', `QR ready. Expires in ${remaining}s.`, 'info');
        }, 1000);
    } catch (error) {
        console.error('QR generation error:', error);
        showStatus('qrStatus', `Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate QR Code';
    }
}

async function copyQRLink() {
    if (!state.currentQRCode || !state.currentQRCode.qrData) {
        showStatus('qrStatus', 'Generate a QR code first.', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(state.currentQRCode.qrData);
        showStatus('qrStatus', 'Pairing link copied to clipboard.', 'success');
    } catch (error) {
        console.error('Copy link error:', error);
        showStatus('qrStatus', 'Could not copy link. Copy manually from box below.', 'error');
    }
}

async function pairByIP() {
    const btn = document.getElementById('pairIpBtn');
    const ipInput = document.getElementById('deviceIP').value.trim();
    const portInput = document.getElementById('devicePort').value.trim();

    const parsedTarget = parseIPAndPortInput(ipInput, portInput);
    if (parsedTarget.error) {
        showStatus('ipStatus', parsedTarget.error, 'error');
        return;
    }

    const ip = parsedTarget.ip;
    const port = parsedTarget.port;
    const deviceName = document.getElementById('deviceNameIP').value.trim() || `Device at ${ip}`;

    document.getElementById('deviceIP').value = ip;
    document.getElementById('devicePort').value = String(port);

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>Pairing...';

        const response = await fetch(`${CONFIG.API_BASE}/qr/pair-by-ip`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                ip,
                port,
                clientId: state.clientId,
                deviceName
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to pair by IP');
        }

        state.lastConnectedOrigin = `http://${ip}:${port}`;
        localStorage.setItem('lastConnectedOrigin', state.lastConnectedOrigin);

        showStatus('ipStatus', `Device paired successfully at ${ip}:${port}.`, 'success');
        document.getElementById('scanActions').style.display = 'flex';
        loadPairedDevices();
    } catch (error) {
        console.error('IP pairing error:', error);
        showStatus('ipStatus', `Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Pair by IP';
    }
}

async function loadNetworkInfo() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/network-info`, {
            headers: getHeaders()
        });
        const data = await response.json();

        const preferredIp = data.localhost;

        let html = `
            <p><strong>Local IP:</strong> <code>${data.localhost}</code></p>
            <p><strong>Port:</strong> <code>${data.port}</code></p>
            <p><strong>Hostname:</strong> <code>${data.hostname}</code></p>
            <p><strong>Available Networks:</strong></p>
        `;

        data.networks.forEach((net) => {
            const preferredMark = net.ip === preferredIp ? ' (Recommended)' : '';
            html += `<p style="margin-left: 14px;">• ${net.interface}: <code>${net.ip}</code>${preferredMark}</p>`;
        });

        document.getElementById('networkInfo').innerHTML = html;
    } catch (error) {
        console.error('Network info error:', error);
        document.getElementById('networkInfo').innerHTML = '<p>Could not load network information.</p>';
    }
}

function parseIPAndPortInput(ipInput, portInput) {
    let ip = String(ipInput || '').trim();
    let port = Number.parseInt(portInput, 10);

    if (!ip) {
        return { error: 'Please enter device IP address.' };
    }

    if (ip.startsWith('http://') || ip.startsWith('https://')) {
        try {
            const parsed = new URL(ip);
            ip = parsed.hostname;
            if (!Number.isInteger(port) && parsed.port) {
                port = Number.parseInt(parsed.port, 10);
            }
        } catch {
            return { error: 'Invalid device URL/IP format.' };
        }
    } else if (ip.includes(':') && ip.split(':').length === 2) {
        const [hostPart, portPart] = ip.split(':');
        ip = hostPart.trim();
        if (!Number.isInteger(port) && portPart) {
            port = Number.parseInt(portPart.trim(), 10);
        }
    }

    if (!Number.isInteger(port)) {
        port = 3000;
    }

    if (port < 1 || port > 65535) {
        return { error: 'Invalid port. Use a value between 1 and 65535.' };
    }

    const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
    if (!ipv4Regex.test(ip)) {
        return { error: 'Please enter a valid IPv4 address.' };
    }

    return { ip, port };
}

async function loadPairedDevices() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/qr/devices`, {
            headers: getHeaders()
        });
        const data = await response.json();
        const deviceList = document.getElementById('deviceList');

        if (!data.devices || data.devices.length === 0) {
            deviceList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No paired devices yet.</p>';
            return;
        }

        let html = '';
        data.devices.forEach((device) => {
            html += `
                <div class="device-item">
                    <div class="device-info">
                        <h3>${device.deviceName}</h3>
                        <p>${device.ip}:${device.port}</p>
                        <p>Paired ${formatTime(device.pairedAt)}</p>
                    </div>
                    <button class="btn-unpair" onclick="unpairDevice('${device.clientId}')">
                        Unpair
                    </button>
                </div>
            `;
        });

        deviceList.innerHTML = html;
    } catch (error) {
        console.error('Load devices error:', error);
    }
}

async function unpairDevice(clientId) {
    if (!confirm('Are you sure you want to unpair this device?')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE}/qr/unpair`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ clientId })
        });

        if (response.ok) {
            loadPairedDevices();
        }
    } catch (error) {
        console.error('Unpair error:', error);
    }
}

async function ensureBarcodeDetector() {
    if (!('BarcodeDetector' in window)) {
        throw new Error('QR scanning is not supported in this browser runtime.');
    }

    if (state.scanner.detector) {
        return state.scanner.detector;
    }

    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) {
            throw new Error('This browser runtime does not support QR format detection.');
        }
    }

    state.scanner.detector = new BarcodeDetector({ formats: ['qr_code'] });
    return state.scanner.detector;
}

async function listCameras() {
    const cameraSelect = document.getElementById('cameraSelect');

    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        cameraSelect.innerHTML = '<option value="">Camera unavailable</option>';
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === 'videoinput');

        if (cameras.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }

        const currentValue = cameraSelect.value;
        cameraSelect.innerHTML = '';

        cameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        if (currentValue && cameras.some((camera) => camera.deviceId === currentValue)) {
            cameraSelect.value = currentValue;
        }
    } catch (error) {
        console.error('List cameras error:', error);
    }
}

function getLegacyGetUserMedia() {
    return navigator.getUserMedia
        || navigator.webkitGetUserMedia
        || navigator.mozGetUserMedia
        || navigator.msGetUserMedia
        || null;
}

function hasCameraCaptureSupport() {
    return Boolean(
        (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
        || getLegacyGetUserMedia()
    );
}

function isIPAddressHost(hostname) {
    const value = String(hostname || '').trim();
    if (!value) {
        return false;
    }

    if (value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === '[::1]') {
        return false;
    }

    const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
    if (ipv4Regex.test(value)) {
        return true;
    }

    // Basic IPv6 host detection.
    return value.includes(':');
}

function isInsecureHttpIpOrigin() {
    return !window.isSecureContext
        && window.location.protocol === 'http:'
        && isIPAddressHost(window.location.hostname);
}

function getCameraUnavailableMessage() {
    if (!window.isSecureContext) {
        if (isInsecureHttpIpOrigin()) {
            return 'Browser blocks camera on HTTP over IP, so permission prompt will not appear. Use HTTPS/localhost, or use "Scan QR Image".';
        }
        return 'Camera needs a secure page (HTTPS or localhost). Use "Scan QR Image" or Pair by IP.';
    }

    return 'Camera access is not available in this browser runtime. Use "Scan QR Image" or Pair by IP.';
}

async function getCameraPermissionState() {
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
        return 'unknown';
    }

    try {
        const status = await navigator.permissions.query({ name: 'camera' });
        return status && status.state ? status.state : 'unknown';
    } catch {
        return 'unknown';
    }
}

async function getCameraPreflightMessage() {
    if (!hasCameraCaptureSupport()) {
        return getCameraUnavailableMessage();
    }

    const permissionState = await getCameraPermissionState();
    if (permissionState === 'denied') {
        return `Camera permission is blocked in browser settings for ${window.location.origin}. Allow camera access and try again.`;
    }

    return '';
}

function getUserMediaCompat(constraints) {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        return navigator.mediaDevices.getUserMedia(constraints);
    }

    const legacyGetUserMedia = getLegacyGetUserMedia();
    if (!legacyGetUserMedia) {
        return Promise.reject(new Error('Camera API unavailable'));
    }

    return new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
}

function formatScannerError(error) {
    if (!error || !error.name) {
        const message = error && error.message ? error.message : 'Unknown error';
        return `Camera error: ${message}`;
    }

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return 'Camera permission denied. Allow camera access and try again.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return 'No camera found on this device.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return 'Camera is already in use by another app/tab.';
    }

    if (error.name === 'NotSupportedError') {
        return 'QR scanning is not supported in this browser runtime.';
    }

    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        return 'Selected camera is not available. Try another camera.';
    }

    return `Camera error: ${error.message || error.name}`;
}

async function startScanner() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const video = document.getElementById('scannerVideo');
    const cameraId = document.getElementById('cameraSelect').value;

    if (state.scanner.active) {
        return;
    }

    const preflightMessage = await getCameraPreflightMessage();
    if (preflightMessage) {
        showStatus('scanStatus', preflightMessage, 'error');
        if (isInsecureHttpIpOrigin()) {
            openImageScanner();
        }
        return;
    }

    try {
        await ensureBarcodeDetector();

        const constraints = cameraId
            ? { video: { deviceId: { exact: cameraId } }, audio: false }
            : { video: { facingMode: { ideal: 'environment' } }, audio: false };

        const stream = await getUserMediaCompat(constraints);
        video.srcObject = stream;
        await video.play();

        state.scanner.stream = stream;
        state.scanner.active = true;
        state.scanner.processing = false;

        startBtn.disabled = true;
        stopBtn.disabled = false;
        clearStatus('scanStatus');
        showStatus('scanStatus', 'Camera started. Point at a QR code.', 'info');

        await listCameras();
        startScanLoop();
    } catch (error) {
        console.error('Start scanner error:', error);
        showStatus('scanStatus', formatScannerError(error), 'error');
        stopScanner();
    }
}

function openImageScanner() {
    const input = document.getElementById('qrImageInput');
    if (!input) {
        return;
    }

    input.click();
}

async function detectQRCodeFromImage(file) {
    const detector = await ensureBarcodeDetector();

    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        try {
            const detections = await detector.detect(bitmap);
            return detections && detections[0] && detections[0].rawValue
                ? detections[0].rawValue.trim()
                : '';
        } finally {
            if (typeof bitmap.close === 'function') {
                bitmap.close();
            }
        }
    }

    const imageUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to decode selected image.'));
            img.src = imageUrl;
        });
        const detections = await detector.detect(image);
        return detections && detections[0] && detections[0].rawValue
            ? detections[0].rawValue.trim()
            : '';
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

async function scanQRCodeFromImageFile(event) {
    const input = event.target;
    const file = input && input.files && input.files[0];
    if (!file) {
        return;
    }

    try {
        const rawValue = await detectQRCodeFromImage(file);
        if (!rawValue) {
            showStatus('scanStatus', 'No QR code found in selected image.', 'error');
            return;
        }

        showStatus('scanStatus', 'QR detected from image. Opening connection...', 'success');
        await handleScannedValue(rawValue);
    } catch (error) {
        console.error('Image scan error:', error);
        showStatus('scanStatus', `Image scan error: ${error.message}`, 'error');
    } finally {
        input.value = '';
    }
}

function stopScanner() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const video = document.getElementById('scannerVideo');

    state.scanner.active = false;
    state.scanner.processing = false;

    if (state.scanner.frameId) {
        cancelAnimationFrame(state.scanner.frameId);
        state.scanner.frameId = null;
    }

    if (state.scanner.stream) {
        state.scanner.stream.getTracks().forEach((track) => track.stop());
        state.scanner.stream = null;
    }

    if (video.srcObject) {
        video.srcObject = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
}

function startScanLoop() {
    const loop = async () => {
        if (!state.scanner.active) {
            return;
        }

        await detectQRCodeFrame();
        state.scanner.frameId = requestAnimationFrame(loop);
    };

    loop();
}

async function detectQRCodeFrame() {
    if (!state.scanner.active || state.scanner.processing) {
        return;
    }

    const video = document.getElementById('scannerVideo');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
    }

    try {
        const detections = await state.scanner.detector.detect(video);
        if (!detections || detections.length === 0) {
            return;
        }

        const rawValue = detections[0].rawValue ? detections[0].rawValue.trim() : '';
        if (!rawValue) {
            return;
        }

        await handleScannedValue(rawValue);
    } catch (error) {
        if (error.name !== 'NotSupportedError') {
            console.error('QR detect error:', error);
        }
    }
}

async function handleScannedValue(rawValue) {
    if (state.scanner.processing) {
        return;
    }

    state.scanner.processing = true;
    stopScanner();

    try {
        const parsed = parseScannedValue(rawValue);
        if (!parsed) {
            showStatus('scanStatus', 'Invalid QR content. Use a pairing QR from this app.', 'error');
            return;
        }

        if (parsed.type === 'url') {
            showStatus('scanStatus', 'QR detected. Opening connection page...', 'success');
            setTimeout(() => {
                window.location.href = parsed.url;
            }, 500);
            return;
        }

        const pairingUrl = buildLegacyPairingUrl(parsed.payload);
        showStatus('scanStatus', 'Legacy QR detected. Opening pairing page...', 'success');
        setTimeout(() => {
            window.location.href = pairingUrl;
        }, 500);
    } finally {
        state.scanner.processing = false;
    }
}

function parseScannedValue(rawValue) {
    try {
        const maybeUrl = new URL(rawValue);
        if (maybeUrl.protocol === 'http:' || maybeUrl.protocol === 'https:') {
            return { type: 'url', url: maybeUrl.toString() };
        }
    } catch {
        // Continue with JSON parsing fallback.
    }

    try {
        const payload = JSON.parse(rawValue);
        if (payload && payload.id && payload.ip) {
            return { type: 'legacy-json', payload };
        }
    } catch {
        // Unsupported QR format.
    }

    return null;
}

function buildLegacyPairingUrl(payload) {
    const port = payload.port || 3000;
    const url = new URL(`http://${payload.ip}:${port}/qr-pairing.html`);
    url.searchParams.set('pairingCode', payload.id);
    url.searchParams.set('deviceName', payload.deviceName || 'Device');
    url.searchParams.set('ip', payload.ip);
    url.searchParams.set('port', String(port));
    url.searchParams.set('expiresAt', String((payload.timestamp || Date.now()) + (payload.expiresIn || 300000)));
    return url.toString();
}

async function pairWithCode(pairingCode, remoteDeviceName) {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/qr/pair`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                pairingCode,
                clientId: state.clientId,
                deviceName: getDefaultDeviceName()
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Pairing failed');
        }

        state.lastConnectedOrigin = window.location.origin;
        localStorage.setItem('lastConnectedOrigin', state.lastConnectedOrigin);
        document.getElementById('scanActions').style.display = 'flex';
        showStatus('scanStatus', `Connected to ${data.device.deviceName || remoteDeviceName}.`, 'success');
        loadPairedDevices();
        clearPairingQueryFromURL();
    } catch (error) {
        console.error('Auto pairing error:', error);
        showStatus('scanStatus', `Pairing failed: ${error.message}`, 'error');
    }
}

function clearPairingQueryFromURL() {
    if (!window.location.search) {
        return;
    }

    const clean = new URL(window.location.href);
    clean.search = '';
    window.history.replaceState({}, '', clean.toString());
}

async function tryAutoPairFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const pairingCode = params.get('pairingCode');
    if (!pairingCode) {
        return;
    }

    const expiresAt = Number(params.get('expiresAt') || 0);
    if (expiresAt && Date.now() > expiresAt) {
        switchTab('scan-tab', document.getElementById('tab-scan'));
        showStatus('scanStatus', 'This QR code has expired. Generate a fresh code.', 'error');
        clearPairingQueryFromURL();
        return;
    }

    const remoteDeviceName = params.get('deviceName') || 'Device';
    switchTab('scan-tab', document.getElementById('tab-scan'));
    showStatus('scanStatus', `Pairing with ${remoteDeviceName}...`, 'info');
    await pairWithCode(pairingCode, remoteDeviceName);
}

function openConnectedHost() {
    const target = state.lastConnectedOrigin || localStorage.getItem('lastConnectedOrigin') || window.location.origin;
    window.location.href = `${target}/`;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const nameInput = document.getElementById('deviceNameQR');
    const imageInput = document.getElementById('qrImageInput');
    nameInput.value = getDefaultDeviceName();
    nameInput.addEventListener('change', () => saveDeviceName(nameInput.value));
    if (imageInput) {
        imageInput.addEventListener('change', scanQRCodeFromImageFile);
    }

    await loadNetworkInfo();
    await listCameras();
    await loadPairedDevices();
    await tryAutoPairFromQuery();
});

window.addEventListener('beforeunload', () => {
    stopScanner();
    if (state.qrTimerId) {
        clearInterval(state.qrTimerId);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopScanner();
    }
});
