// Mock implementation for testing the testing infrastructure
// This allows us to validate the test framework before building the actual native addon

class MockAddon {
  constructor() {
    this.memoryPool = {
      buffers: new Map(),
      stats: {
        totalBuffersCreated: 0,
        totalMemoryAllocated: 0,
        availableBuffers: 0,
        peakMemoryUsage: 0,
        memoryReuseCount: 0
      }
    };
  }

  // Mock SIMD functions
  getSIMDCapabilities() {
    return 'SSE2, SSE4.1, AVX2';
  }

  getWebPSIMDOptimizations() {
    return 'SIMD optimizations enabled for pixel conversion and WebP encoding';
  }

  convertBGRAToRGBA(buffer, width, height) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    const expectedSize = width * height * 4;
    if (buffer.length < expectedSize) {
      throw new Error(`Buffer too small: expected ${expectedSize}, got ${buffer.length}`);
    }

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid dimensions');
    }

    // Simulate BGRA to RGBA conversion
    const result = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i += 4) {
      result[i] = buffer[i + 2];     // R = B
      result[i + 1] = buffer[i + 1]; // G = G
      result[i + 2] = buffer[i];     // B = R
      result[i + 3] = buffer[i + 3]; // A = A
    }
    
    return result;
  }

  convertRGBAToRGB(buffer, width, height) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    const expectedSize = width * height * 4;
    if (buffer.length < expectedSize) {
      throw new Error(`Buffer too small: expected ${expectedSize}, got ${buffer.length}`);
    }

    // Convert RGBA to RGB (remove alpha channel)
    const result = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < buffer.length; i += 4, j += 3) {
      result[j] = buffer[i];         // R
      result[j + 1] = buffer[i + 1]; // G
      result[j + 2] = buffer[i + 2]; // B
    }
    
    return result;
  }

  convertBGRAToRGBAInPlace(buffer, pixelCount) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    // In-place BGRA to RGBA conversion
    for (let i = 0; i < pixelCount * 4; i += 4) {
      const temp = buffer[i];     // Save B
      buffer[i] = buffer[i + 2];  // R = B
      buffer[i + 2] = temp;       // B = original R
    }
  }

  // Mock WebP encoding
  encodeWebP(buffer, width, height, stride, params = {}) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    const quality = params.quality || 80;
    if (quality < 0 || quality > 100) {
      throw new Error('Quality must be between 0 and 100');
    }

    // Simulate WebP encoding with compression
    const compressionRatio = 8 + (quality / 100) * 4; // 8-12x compression
    const compressedSize = Math.floor(buffer.length / compressionRatio);
    
    // Create mock WebP data
    const webpData = Buffer.alloc(compressedSize);
    webpData.write('RIFF', 0);
    webpData.writeUInt32LE(compressedSize - 8, 4);
    webpData.write('WEBP', 8);
    
    // Fill with mock data
    for (let i = 12; i < compressedSize; i++) {
      webpData[i] = Math.floor(Math.random() * 256);
    }
    
    return webpData;
  }

  encodeSIMDOptimized(buffer, width, height, stride, params) {
    // Simulate faster SIMD encoding
    const startTime = process.hrtime.bigint();
    const result = this.encodeWebP(buffer, width, height, stride, params);
    const endTime = process.hrtime.bigint();
    
    // Add some timing to simulate SIMD speedup
    return result;
  }

  // Mock memory pool functions
  allocateScreenshotBuffer(size) {
    if (size <= 0) {
      throw new Error('Invalid buffer size');
    }

    if (size > 1024 * 1024 * 1024) { // 1GB limit
      throw new Error('Buffer too large');
    }

    const buffer = Buffer.alloc(size);
    const id = Math.random().toString(36);
    
    this.memoryPool.buffers.set(id, { buffer, size });
    this.memoryPool.stats.totalBuffersCreated++;
    this.memoryPool.stats.totalMemoryAllocated += size;
    
    if (this.memoryPool.stats.totalMemoryAllocated > this.memoryPool.stats.peakMemoryUsage) {
      this.memoryPool.stats.peakMemoryUsage = this.memoryPool.stats.totalMemoryAllocated;
    }
    
    // Store ID in buffer for tracking
    buffer._poolId = id;
    return buffer;
  }

  returnScreenshotBuffer(buffer, size) {
    if (!Buffer.isBuffer(buffer) || !buffer._poolId) {
      return; // Ignore invalid returns
    }

    if (this.memoryPool.buffers.has(buffer._poolId)) {
      this.memoryPool.buffers.delete(buffer._poolId);
      this.memoryPool.stats.totalMemoryAllocated -= size;
      this.memoryPool.stats.memoryReuseCount++;
      
      // Simulate pool size limits (max 10 buffers)
      if (this.memoryPool.stats.availableBuffers < 10) {
        this.memoryPool.stats.availableBuffers++;
      }
    }
  }

  getMemoryPoolStats() {
    return { ...this.memoryPool.stats };
  }

  clearMemoryPool() {
    this.memoryPool.buffers.clear();
    this.memoryPool.stats.availableBuffers = 0;
  }

  // Mock screenshot capture
  async captureScreenshot(options = {}) {
    // Simulate capture delay
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 50));
    
    const width = 1920;
    const height = 1080;
    const data = Buffer.alloc(width * height * 4);
    
    // Fill with test pattern
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.floor(Math.random() * 256);     // R
      data[i + 1] = Math.floor(Math.random() * 256); // G
      data[i + 2] = Math.floor(Math.random() * 256); // B
      data[i + 3] = 255;                             // A
    }
    
    return {
      success: true,
      width,
      height,
      data,
      stride: width * 4,
      format: 'RGBA'
    };
  }

  // Mock zero-copy functions
  isZeroCopySupported() {
    return process.platform === 'win32'; // Simulate Windows support
  }

  captureWithZeroCopyOptimization(displayIndex) {
    if (!this.isZeroCopySupported()) {
      throw new Error('Zero-copy not supported');
    }

    return {
      success: true,
      width: 1920,
      height: 1080,
      dataSize: 1920 * 1080 * 4,
      format: 'RGBA'
    };
  }

  // Mock GPU functions
  isGPUSupported() {
    return true; // Simulate GPU support
  }

  // Mock streaming functions
  initializeUltraStreaming(workerThreads) {
    return true;
  }

  configureUltraStreaming(chunkWidth, chunkHeight, maxMemoryMB, compressionLevel) {
    // Configuration successful
  }

  getUltraStreamingStats() {
    return {
      totalPixelsProcessed: 1920 * 1080 * 5,
      totalChunksProcessed: 25,
      peakMemoryUsageMb: 256,
      averageThroughputMpixelsPerSecond: 15.5,
      activeWorkerThreads: 4
    };
  }

  async captureAndEncodeUltraLarge(displayIndex, params, progressCallback) {
    if (progressCallback) {
      progressCallback(0, 'Starting capture');
      progressCallback(25, 'Capture complete, starting chunked encoding');
      progressCallback(50, 'Processing chunks');
      progressCallback(75, 'Combining results');
      progressCallback(100, 'Ultra-streaming encoding complete');
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return Buffer.from('Mock ultra-large WebP data');
  }

  encodeWebPStreaming(buffer, width, height, stride, params) {
    return this.encodeWebP(buffer, width, height, stride, params);
  }
}

// Export mock addon
module.exports = new MockAddon();