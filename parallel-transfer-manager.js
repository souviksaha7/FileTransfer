/**
 * Parallel Transfer Manager
 * Manages simultaneous WiFi and Bluetooth file transfers
 * Optimizes bandwidth allocation for maximum throughput
 */

class ParallelTransferManager {
    constructor(bluetoothModule) {
        this.btModule = bluetoothModule;
        this.wifiTransfers = new Map();
        this.btTransfers = new Map();
        this.dualChannelTransfers = new Map();
        this.transferStats = new Map();
        this.bandwidthAllocator = new BandwidthAllocator();
        this.maxConcurrentTransfers = 10;
    }

    /**
     * Start parallel WiFi + Bluetooth transfer
     */
    async startParallelTransfer(fileId, fileData, fileName, targetDevices = []) {
        try {
            const transferId = this._generateTransferId();
            const fileSize = fileData.length;

            const dualTransfer = {
                id: transferId,
                fileName,
                fileSize,
                startTime: Date.now(),
                wifiTransferId: null,
                btTransferIds: [],
                status: 'in-progress',
                wifiProgress: 0,
                btProgress: 0,
                totalProgress: 0,
                combinedSpeed: 0
            };

            this.dualChannelTransfers.set(transferId, dualTransfer);

            // Allocate bandwidth
            const allocation = this.bandwidthAllocator.allocate(
                fileSize,
                targetDevices.length + 1 // +1 for WiFi
            );

            // Start WiFi transfer (60% bandwidth)
            const wifiSize = Math.ceil(fileSize * allocation.wifiRatio);
            const wifiData = fileData.slice(0, wifiSize);

            // Start Bluetooth transfers (40% combined)
            const btChunkSize = Math.ceil((fileSize * allocation.btRatio) / targetDevices.length);
            const btTransferIds = [];

            // WiFi transfer
            const wifiTransfer = await this._startWiFiTransfer(fileId, wifiData, fileName);
            dualTransfer.wifiTransferId = wifiTransfer.id;

            // Bluetooth transfers to each device
            for (const device of targetDevices) {
                const startIdx = wifiSize + (btTransferIds.length * btChunkSize);
                const endIdx = Math.min(startIdx + btChunkSize, fileSize);
                const btData = fileData.slice(startIdx, endIdx);

                const btTransfer = await this.btModule.transferFile(
                    device.id,
                    btData,
                    `${fileName} (BT)`
                );

                btTransferIds.push(btTransfer.id);
                dualTransfer.btTransferIds.push(btTransfer.id);
            }

            this.dualChannelTransfers.set(transferId, dualTransfer);

            // Monitor transfers
            this._monitorParallelTransfers(transferId);

            return dualTransfer;
        } catch (error) {
            console.error('Parallel transfer failed:', error);
            throw error;
        }
    }

    /**
     * Start WiFi-only transfer
     */
    async _startWiFiTransfer(fileId, fileData, fileName) {
        const transferId = `wifi-${fileId}-${Date.now()}`;

        const transfer = {
            id: transferId,
            fileName,
            fileSize: fileData.length,
            startTime: Date.now(),
            progress: 0,
            speed: 0,
            status: 'in-progress'
        };

        this.wifiTransfers.set(transferId, transfer);

        // Simulate WiFi transfer
        this._simulateWiFiTransfer(transferId, fileData.length);

        return transfer;
    }

    /**
     * Monitor parallel transfers and update progress
     */
    _monitorParallelTransfers(transferId) {
        const interval = setInterval(() => {
            const transfer = this.dualChannelTransfers.get(transferId);

            if (!transfer) {
                clearInterval(interval);
                return;
            }

            // Get WiFi progress
            const wifiTransfer = this.wifiTransfers.get(transfer.wifiTransferId);
            if (wifiTransfer) {
                transfer.wifiProgress = wifiTransfer.progress;
            }

            // Get Bluetooth progress
            let totalBtProgress = 0;
            for (const btId of transfer.btTransferIds) {
                const btTransfer = this.btModule.getTransferStatus(btId);
                if (btTransfer) {
                    totalBtProgress += (btTransfer.chunksTransferred / btTransfer.totalChunks) * 100;
                }
            }

            if (transfer.btTransferIds.length > 0) {
                transfer.btProgress = totalBtProgress / transfer.btTransferIds.length;
            }

            // Calculate combined progress (weighted)
            transfer.totalProgress = (transfer.wifiProgress * 0.6) + (transfer.btProgress * 0.4);

            // Calculate combined speed
            const elapsed = (Date.now() - transfer.startTime) / 1000;
            const bytesTransferred = (transfer.fileSize * transfer.totalProgress) / 100;
            transfer.combinedSpeed = (bytesTransferred / 1024 / 1024) / elapsed;

            // Check if complete
            if (transfer.wifiProgress === 100 && transfer.btProgress === 100) {
                transfer.status = 'completed';
                clearInterval(interval);
            }
        }, 500);
    }

    /**
     * Simulate WiFi transfer with realistic speed
     */
    _simulateWiFiTransfer(transferId, fileSize) {
        const transfer = this.wifiTransfers.get(transferId);
        if (!transfer) return;

        const startTime = Date.now();
        const duration = fileSize / (100 * 1024 * 1024); // 100 MB/s baseline

        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(100, (elapsed / (duration * 1000)) * 100);
            const speed = (fileSize / 1024 / 1024) / elapsed;

            transfer.progress = progress;
            transfer.speed = speed;

            if (progress >= 100) {
                transfer.progress = 100;
                transfer.status = 'completed';
                clearInterval(interval);
            }
        }, 100);
    }

    /**
     * Get transfer statistics
     */
    getTransferStats(transferId) {
        const transfer = this.dualChannelTransfers.get(transferId);
        if (!transfer) return null;

        return {
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            wifiProgress: transfer.wifiProgress.toFixed(1),
            btProgress: transfer.btProgress.toFixed(1),
            totalProgress: transfer.totalProgress.toFixed(1),
            combinedSpeed: transfer.combinedSpeed.toFixed(2),
            status: transfer.status,
            elapsedTime: this._formatTime(Date.now() - transfer.startTime)
        };
    }

    /**
     * Get all active transfers
     */
    getActiveTransfers() {
        const transfers = [];

        this.dualChannelTransfers.forEach((transfer, id) => {
            if (transfer.status === 'in-progress') {
                transfers.push({
                    id,
                    type: 'parallel',
                    ...this.getTransferStats(id)
                });
            }
        });

        this.wifiTransfers.forEach((transfer, id) => {
            if (transfer.status === 'in-progress') {
                transfers.push({
                    id,
                    type: 'wifi',
                    fileName: transfer.fileName,
                    progress: transfer.progress.toFixed(1),
                    speed: transfer.speed.toFixed(2)
                });
            }
        });

        return transfers;
    }

    /**
     * Cancel transfer
     */
    async cancelTransfer(transferId) {
        let transfer = this.dualChannelTransfers.get(transferId);

        if (transfer) {
            transfer.status = 'cancelled';

            // Cancel WiFi transfer
            if (transfer.wifiTransferId) {
                this.wifiTransfers.delete(transfer.wifiTransferId);
            }

            // Cancel Bluetooth transfers
            for (const btId of transfer.btTransferIds) {
                await this.btModule.cancelTransfer(btId);
            }

            this.dualChannelTransfers.delete(transferId);
            return;
        }

        transfer = this.wifiTransfers.get(transferId);
        if (transfer) {
            transfer.status = 'cancelled';
            this.wifiTransfers.delete(transferId);
        }
    }

    /**
     * Private: Generate unique transfer ID
     */
    _generateTransferId() {
        return `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Private: Format time
     */
    _formatTime(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / 1000 / 60) % 60);
        const hours = Math.floor(ms / 1000 / 60 / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

/**
 * Bandwidth Allocator
 * Intelligently allocates bandwidth between WiFi and Bluetooth
 */
class BandwidthAllocator {
    allocate(fileSize, numDevices) {
        // Optimal allocation: WiFi 60%, Bluetooth 40%
        // This balances speed with redundancy
        return {
            wifiRatio: 0.6,
            btRatio: 0.4,
            wifiSize: Math.ceil(fileSize * 0.6),
            btSize: Math.ceil(fileSize * 0.4),
            btChunkSize: Math.ceil((fileSize * 0.4) / Math.max(numDevices - 1, 1))
        };
    }

    /**
     * Allocate based on device capabilities
     */
    allocateByCapability(fileSize, devices) {
        const wifiDevice = devices.find(d => d.type === 'wifi');
        const btDevices = devices.filter(d => d.type === 'bluetooth');

        let wifiRatio = 0.6;
        let btRatio = 0.4;

        // Adjust based on device speeds
        if (wifiDevice && wifiDevice.speed) {
            const avgBtSpeed = btDevices.reduce((sum, d) => sum + (d.speed || 2), 0) / Math.max(btDevices.length, 1);
            const speedRatio = wifiDevice.speed / (wifiDevice.speed + avgBtSpeed);

            wifiRatio = Math.min(0.9, Math.max(0.5, speedRatio));
            btRatio = 1 - wifiRatio;
        }

        return {
            wifiRatio,
            btRatio,
            wifiSize: Math.ceil(fileSize * wifiRatio),
            btSize: Math.ceil(fileSize * btRatio),
            btChunkSize: Math.ceil((fileSize * btRatio) / Math.max(btDevices.length, 1))
        };
    }
}

module.exports = { ParallelTransferManager, BandwidthAllocator };
