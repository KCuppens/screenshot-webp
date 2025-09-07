const path = require('path');
const os = require('os');

let nativeBinding;
let sharp; // Fallback WebP converter

// Try to load the native module
try {
    nativeBinding = require('bindings')('webp_screenshot');
} catch (error) {
    console.warn('Native WebP screenshot module not available:', error.message);
    console.warn('Falling back to Sharp for WebP conversion');
    
    try {
        sharp = require('sharp');
    } catch (sharpError) {
        throw new Error('Neither native WebP screenshot nor Sharp fallback is available');
    }
}

class WebPScreenshot {
    constructor() {
        this.fallbackMode = !nativeBinding;
        this.performanceMetrics = {
            captureCount: 0,
            totalCaptureTime: 0,
            fallbackUsage: 0,
            successfulCaptures: 0,
            failedCaptures: 0
        };
    }

    /**
     * Get information about available displays
     * @returns {Promise<DisplayInfo[]>}
     */
    async getDisplays() {
        if (this.fallbackMode) {
            // In fallback mode, we can't enumerate displays, so return a single primary display
            const { width, height } = this._getPrimaryDisplaySize();
            return [{
                index: 0,
                width,
                height,
                x: 0,
                y: 0,
                scaleFactor: 1.0,
                isPrimary: true,
                name: 'Primary Display'
            }];
        }

        return new Promise((resolve, reject) => {
            try {
                const displays = nativeBinding.getDisplays();
                resolve(displays);
            } catch (error) {
                reject(new Error(`Failed to get displays: ${error.message}`));
            }
        });
    }

    /**
     * Capture a screenshot from a specific display
     * @param {number} displayIndex - Index of the display to capture
     * @param {CaptureOptions} options - Capture and encoding options
     * @returns {Promise<ScreenshotResult>}
     */
    async captureDisplay(displayIndex = 0, options = {}) {
        const startTime = Date.now();
        this.performanceMetrics.captureCount++;

        // Merge with default options
        const finalOptions = {
            quality: 80,
            method: 4,
            targetSize: 0,
            targetPsnr: 0.0,
            segments: 4,
            snsStrength: 50,
            filterStrength: 60,
            filterSharpness: 0,
            filterType: 1,
            autofilter: 0,
            alphaCompression: 1,
            alphaFiltering: 1,
            alphaQuality: 100,
            pass: 1,
            showCompressed: 0,
            preprocessing: 0,
            partitions: 0,
            partitionLimit: 0,
            emulateJpegSize: 0,
            threadLevel: 0,
            lowMemory: 0,
            nearLossless: 100,
            exact: 0,
            useDeltaPalette: 0,
            useSharpYuv: 0,
            ...options
        };

        try {
            let result;

            if (this.fallbackMode) {
                result = await this._captureFallback(displayIndex, finalOptions);
                this.performanceMetrics.fallbackUsage++;
            } else {
                result = await this._captureNative(displayIndex, finalOptions);
            }

            const endTime = Date.now();
            const captureTime = endTime - startTime;
            this.performanceMetrics.totalCaptureTime += captureTime;
            this.performanceMetrics.successfulCaptures++;

            // Add performance metadata to result
            result.performance = {
                captureTime,
                implementation: this.fallbackMode ? 'fallback' : nativeBinding.getImplementationInfo().implementation,
                memoryUsage: process.memoryUsage().heapUsed
            };

            return result;

        } catch (error) {
            this.performanceMetrics.failedCaptures++;
            throw new Error(`Screenshot capture failed: ${error.message}`);
        }
    }

    /**
     * Capture screenshots from all available displays
     * @param {CaptureOptions} options - Capture and encoding options
     * @returns {Promise<ScreenshotResult[]>}
     */
    async captureAllDisplays(options = {}) {
        try {
            const displays = await this.getDisplays();
            const results = [];

            for (let i = 0; i < displays.length; i++) {
                try {
                    const result = await this.captureDisplay(i, options);
                    results.push(result);
                } catch (error) {
                    // Continue with other displays even if one fails
                    results.push({
                        error: error.message,
                        displayIndex: i,
                        success: false
                    });
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to capture all displays: ${error.message}`);
        }
    }

    /**
     * Check if native WebP screenshot capture is supported
     * @returns {boolean}
     */
    isNativeSupported() {
        return !this.fallbackMode && nativeBinding && nativeBinding.isSupported();
    }

    /**
     * Get implementation information
     * @returns {ImplementationInfo}
     */
    getImplementationInfo() {
        if (this.fallbackMode) {
            return {
                implementation: 'Sharp fallback',
                platform: os.platform(),
                supported: !!sharp,
                fallbackMode: true
            };
        }

        return {
            ...nativeBinding.getImplementationInfo(),
            fallbackMode: false
        };
    }

    /**
     * Get performance metrics
     * @returns {PerformanceMetrics}
     */
    getPerformanceMetrics() {
        const avgCaptureTime = this.performanceMetrics.captureCount > 0 
            ? this.performanceMetrics.totalCaptureTime / this.performanceMetrics.captureCount 
            : 0;

        return {
            ...this.performanceMetrics,
            averageCaptureTime: avgCaptureTime,
            successRate: this.performanceMetrics.captureCount > 0 
                ? (this.performanceMetrics.successfulCaptures / this.performanceMetrics.captureCount) * 100 
                : 0,
            fallbackUsagePercent: this.performanceMetrics.captureCount > 0 
                ? (this.performanceMetrics.fallbackUsage / this.performanceMetrics.captureCount) * 100 
                : 0
        };
    }

    /**
     * Reset performance metrics
     */
    resetPerformanceMetrics() {
        this.performanceMetrics = {
            captureCount: 0,
            totalCaptureTime: 0,
            fallbackUsage: 0,
            successfulCaptures: 0,
            failedCaptures: 0
        };
    }

    // Private methods

    /**
     * Capture using native module
     * @private
     */
    async _captureNative(displayIndex, options) {
        return new Promise((resolve, reject) => {
            nativeBinding.captureDisplay(displayIndex, options, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Fallback capture using Sharp and system screenshot tools
     * @private
     */
    async _captureFallback(displayIndex, options) {
        if (!sharp) {
            throw new Error('Sharp is not available for fallback WebP conversion');
        }

        // For fallback, we need to use system screenshot tools
        const screenshot = await this._captureSystemScreenshot(displayIndex);
        
        // Convert to WebP using Sharp
        const webpBuffer = await sharp(screenshot.buffer)
            .webp({
                quality: Math.round(options.quality),
                effort: Math.min(6, Math.max(0, options.method)),
                smartSubsample: options.useSharpYuv === 1,
                nearLossless: options.nearLossless < 100,
                alphaQuality: options.alphaQuality
            })
            .toBuffer();

        return {
            data: webpBuffer,
            width: screenshot.width,
            height: screenshot.height,
            format: 'webp',
            success: true
        };
    }

    /**
     * Capture screenshot using system tools (fallback)
     * @private
     */
    async _captureSystemScreenshot(displayIndex) {
        const platform = os.platform();
        
        if (platform === 'win32') {
            return await this._captureWindows(displayIndex);
        } else if (platform === 'darwin') {
            return await this._captureMacOS(displayIndex);
        } else if (platform === 'linux') {
            return await this._captureLinux(displayIndex);
        } else {
            throw new Error(`Fallback screenshot capture not implemented for platform: ${platform}`);
        }
    }

    /**
     * Windows fallback screenshot
     * @private
     */
    async _captureWindows(displayIndex) {
        // This would require a simple PowerShell script or other system tool
        // For now, throw an error indicating fallback implementation needed
        throw new Error('Windows fallback screenshot capture not yet implemented');
    }

    /**
     * macOS fallback screenshot
     * @private
     */
    async _captureMacOS(displayIndex) {
        // This would use the 'screencapture' command-line tool
        throw new Error('macOS fallback screenshot capture not yet implemented');
    }

    /**
     * Linux fallback screenshot
     * @private
     */
    async _captureLinux(displayIndex) {
        // This would use tools like 'scrot', 'import', or 'gnome-screenshot'
        throw new Error('Linux fallback screenshot capture not yet implemented');
    }

    /**
     * Get primary display size for fallback mode
     * @private
     */
    _getPrimaryDisplaySize() {
        // This is a simplified fallback - in reality we'd need to detect screen resolution
        return { width: 1920, height: 1080 };
    }
}

// Export the main class and utility functions
module.exports = {
    WebPScreenshot,
    
    // Convenience function to create a new instance
    create() {
        return new WebPScreenshot();
    },
    
    // Static method to check if native support is available
    isNativeSupported() {
        return !!nativeBinding && nativeBinding.isSupported();
    },
    
    // Get version information
    getVersion() {
        return require('../package.json').version;
    }
};

// TypeScript-style JSDoc type definitions for better IDE support

/**
 * @typedef {Object} DisplayInfo
 * @property {number} index - Display index
 * @property {number} width - Display width in pixels
 * @property {number} height - Display height in pixels
 * @property {number} x - Display X offset
 * @property {number} y - Display Y offset
 * @property {number} scaleFactor - Display scale factor (DPI scaling)
 * @property {boolean} isPrimary - Whether this is the primary display
 * @property {string} name - Display name/identifier
 */

/**
 * @typedef {Object} CaptureOptions
 * @property {number} [quality=80] - WebP quality (0-100)
 * @property {number} [method=4] - Compression method (0-6, 0=fast, 6=slow/better)
 * @property {number} [targetSize=0] - Target size in bytes (0=disabled)
 * @property {number} [targetPsnr=0.0] - Target PSNR (0=disabled)
 * @property {number} [segments=4] - Number of segments (1-4)
 * @property {number} [snsStrength=50] - Spatial noise shaping strength (0-100)
 * @property {number} [filterStrength=60] - Filter strength (0-100)
 * @property {number} [filterSharpness=0] - Filter sharpness (0-7)
 * @property {number} [filterType=1] - Filter type (0=simple, 1=strong)
 * @property {number} [autofilter=0] - Auto adjust filter strength (0-1)
 * @property {number} [alphaCompression=1] - Alpha plane compression (0-1)
 * @property {number} [alphaFiltering=1] - Alpha plane filtering (0-2)
 * @property {number} [alphaQuality=100] - Alpha quality (0-100)
 * @property {number} [pass=1] - Number of entropy passes (1-10)
 * @property {number} [showCompressed=0] - Export compressed for analysis (0-1)
 * @property {number} [preprocessing=0] - Preprocessing (0-4)
 * @property {number} [partitions=0] - Log2 of partitions (0-3)
 * @property {number} [partitionLimit=0] - Quality degradation limit (0-100)
 * @property {number} [emulateJpegSize=0] - Emulate JPEG compression (0-1)
 * @property {number} [threadLevel=0] - Threading level (0-1)
 * @property {number} [lowMemory=0] - Low memory mode (0-1)
 * @property {number} [nearLossless=100] - Near lossless threshold (0-100)
 * @property {number} [exact=0] - Preserve RGB under transparency (0-1)
 * @property {number} [useDeltaPalette=0] - Use delta palettes (0-1)
 * @property {number} [useSharpYuv=0] - Use sharp RGB->YUV conversion (0-1)
 */

/**
 * @typedef {Object} ScreenshotResult
 * @property {Buffer} data - WebP encoded screenshot data
 * @property {number} width - Screenshot width in pixels
 * @property {number} height - Screenshot height in pixels
 * @property {string} format - Image format ('webp')
 * @property {boolean} success - Whether capture was successful
 * @property {string} [error] - Error message if failed
 * @property {Object} [performance] - Performance metrics for this capture
 * @property {number} performance.captureTime - Time taken for capture in milliseconds
 * @property {string} performance.implementation - Implementation used
 * @property {number} performance.memoryUsage - Memory usage in bytes
 */

/**
 * @typedef {Object} ImplementationInfo
 * @property {string} implementation - Implementation name
 * @property {string} platform - Platform identifier
 * @property {boolean} supported - Whether implementation is supported
 * @property {boolean} fallbackMode - Whether running in fallback mode
 */

/**
 * @typedef {Object} PerformanceMetrics
 * @property {number} captureCount - Total number of captures attempted
 * @property {number} totalCaptureTime - Total time spent capturing
 * @property {number} fallbackUsage - Number of fallback captures
 * @property {number} successfulCaptures - Number of successful captures
 * @property {number} failedCaptures - Number of failed captures
 * @property {number} averageCaptureTime - Average capture time
 * @property {number} successRate - Success rate percentage
 * @property {number} fallbackUsagePercent - Fallback usage percentage
 */