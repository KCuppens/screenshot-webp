const { expect } = require('chai');
const addon = require('../../build/Release/webp_screenshot');

describe('Ultra-Streaming Pipeline Integration Tests', function() {
  this.timeout(120000); // 2 minute timeout for streaming tests

  before(function() {
    // Initialize ultra-streaming pipeline
    if (addon.initializeUltraStreaming) {
      const threadCount = Math.max(2, require('os').cpus().length);
      const initialized = addon.initializeUltraStreaming(threadCount);
      
      if (!initialized) {
        console.log('Ultra-streaming pipeline initialization failed');
      }
    }
  });

  describe('Pipeline Initialization and Configuration', function() {
    it('should initialize ultra-streaming pipeline successfully', function() {
      if (!addon.initializeUltraStreaming) {
        this.skip();
        return;
      }

      const result = addon.initializeUltraStreaming(4);
      expect(result).to.be.true;
      
      const stats = addon.getUltraStreamingStats();
      expect(stats).to.be.an('object');
      expect(stats.activeWorkerThreads).to.equal(4);
    });

    it('should configure streaming parameters correctly', function() {
      if (!addon.configureUltraStreaming) {
        this.skip();
        return;
      }

      // Configure: 256x256 chunks, 1GB memory limit, compression level 7
      addon.configureUltraStreaming(256, 256, 1024, 7);
      
      // Configuration should not throw errors
      expect(() => {
        addon.configureUltraStreaming(512, 512, 2048, 6);
      }).to.not.throw();
    });
  });

  describe('Chunked Image Processing', function() {
    it('should process large images using chunked encoding', async function() {
      if (!addon.captureAndEncodeUltraLarge) {
        this.skip();
        return;
      }

      const largeImageSize = { width: 2560, height: 1440 }; // 1440p
      let progressCallCount = 0;
      const progressUpdates = [];
      
      const progressCallback = (progress, status) => {
        progressCallCount++;
        progressUpdates.push({ progress, status });
        console.log(`Progress: ${progress.toFixed(1)}% - ${status}`);
        return true; // Continue processing
      };

      try {
        const result = await addon.captureAndEncodeUltraLarge(0, {
          quality: 80,
          method: 4,
          enableStreaming: true,
          enableMultithreading: true
        }, progressCallback);

        expect(result).to.be.instanceOf(Buffer);
        expect(result.length).to.be.above(0);
        expect(progressCallCount).to.be.above(2); // Should have multiple progress updates
        
        // Verify progress updates are sequential and reasonable
        for (let i = 1; i < progressUpdates.length; i++) {
          expect(progressUpdates[i].progress).to.be.at.least(progressUpdates[i-1].progress);
        }
        
        console.log(`Chunked processing completed with ${progressCallCount} progress updates`);
      } catch (error) {
        if (error.message.includes('No display') || error.message.includes('capture failed')) {
          this.skip(); // Skip if no display available (CI environment)
        } else {
          throw error;
        }
      }
    });

    it('should handle memory-constrained chunked processing', function() {
      if (!addon.configureUltraStreaming || !addon.getUltraStreamingStats) {
        this.skip();
        return;
      }

      // Configure very small memory limit to force chunking
      addon.configureUltraStreaming(128, 128, 256, 6); // 128x128 chunks, 256MB limit
      
      const testImage = createLargeTestImage(1920, 1080);
      
      // This should force the streaming pipeline to use very small chunks
      const startTime = process.hrtime.bigint();
      
      try {
        const result = addon.encodeWebPStreaming(testImage, 1920, 1080, 1920 * 4, {
          quality: 75,
          enableStreaming: true,
          streamBufferSize: 32 * 1024 // Small buffer size
        });
        
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        
        expect(result).to.be.instanceOf(Buffer);
        expect(result.length).to.be.above(0);
        
        const stats = addon.getUltraStreamingStats();
        expect(stats.peakMemoryUsageMb).to.be.below(300); // Should stay under limit
        
        console.log(`Memory-constrained processing: ${durationMs.toFixed(2)}ms, peak memory: ${stats.peakMemoryUsageMb}MB`);
      } catch (error) {
        if (error.message.includes('not supported')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Multi-Display Streaming', function() {
    it('should handle multiple displays simultaneously', async function() {
      if (!addon.captureMultipleDisplaysUltraLarge) {
        this.skip();
        return;
      }

      // Get available displays
      let displayCount = 1;
      try {
        const displays = addon.getDisplays ? addon.getDisplays() : [{ index: 0 }];
        displayCount = Math.min(displays.length, 2); // Test up to 2 displays
      } catch (error) {
        // Fallback to single display
      }

      const displayIndices = Array.from({ length: displayCount }, (_, i) => i);
      let totalProgressUpdates = 0;
      
      const progressCallback = (progress, status) => {
        totalProgressUpdates++;
        console.log(`Multi-display progress: ${progress.toFixed(1)}% - ${status}`);
        return true;
      };

      try {
        const results = await addon.captureMultipleDisplaysUltraLarge(displayIndices, {
          quality: 80,
          method: 4,
          enableStreaming: true
        }, progressCallback);

        expect(results).to.be.an('array');
        expect(results.length).to.equal(displayCount);
        
        results.forEach((result, index) => {
          expect(result).to.be.instanceOf(Buffer);
          expect(result.length).to.be.above(0);
          console.log(`Display ${index}: ${result.length} bytes`);
        });
        
        expect(totalProgressUpdates).to.be.above(displayCount); // Should have progress from each display
        
      } catch (error) {
        if (error.message.includes('No display') || error.message.includes('not supported')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Progress Callback System', function() {
    it('should provide accurate progress updates', function() {
      const testImage = createLargeTestImage(1024, 1024);
      const progressUpdates = [];
      let lastProgress = -1;
      
      const progressCallback = (progress, status) => {
        progressUpdates.push({ progress, status, timestamp: Date.now() });
        
        // Progress should be monotonically increasing
        expect(progress).to.be.at.least(lastProgress);
        expect(progress).to.be.at.most(100);
        expect(status).to.be.a('string');
        expect(status.length).to.be.above(0);
        
        lastProgress = progress;
        return true;
      };

      if (addon.encodeWebPStreamingWithCallback) {
        const success = addon.encodeWebPStreamingWithCallback(
          testImage, 1024, 1024, 1024 * 4,
          { quality: 80, enableStreaming: true },
          progressCallback
        );
        
        expect(success).to.be.true;
        expect(progressUpdates.length).to.be.above(1);
        
        // Should start at 0 and end at 100
        expect(progressUpdates[0].progress).to.be.at.most(10);
        expect(progressUpdates[progressUpdates.length - 1].progress).to.be.at.least(95);
        
        console.log(`Progress callback received ${progressUpdates.length} updates`);
      } else {
        this.skip();
      }
    });

    it('should handle callback cancellation', function() {
      const testImage = createLargeTestImage(2048, 2048);
      let callbackCount = 0;
      
      const cancellingCallback = (progress, status) => {
        callbackCount++;
        console.log(`Cancelling at ${progress.toFixed(1)}%`);
        
        // Cancel after a few updates
        return callbackCount < 3;
      };

      if (addon.encodeWebPStreamingWithCallback) {
        const success = addon.encodeWebPStreamingWithCallback(
          testImage, 2048, 2048, 2048 * 4,
          { quality: 80, enableStreaming: true },
          cancellingCallback
        );
        
        // Should handle cancellation gracefully
        expect(success).to.be.false; // Cancelled operations return false
        expect(callbackCount).to.be.at.most(3);
        
        console.log(`Callback cancellation handled after ${callbackCount} updates`);
      } else {
        this.skip();
      }
    });
  });

  describe('Performance and Scalability Validation', function() {
    it('should scale efficiently with image size', function() {
      const testSizes = [
        { name: 'Small', width: 512, height: 512 },
        { name: 'Medium', width: 1024, height: 1024 },
        { name: 'Large', width: 2048, height: 2048 },
        { name: 'XLarge', width: 4096, height: 2160 }
      ];

      const results = [];

      testSizes.forEach(({ name, width, height }) => {
        const testImage = createLargeTestImage(width, height);
        const pixelCount = width * height;
        
        const startTime = process.hrtime.bigint();
        
        let encodedData;
        if (addon.encodeWebPStreaming) {
          encodedData = addon.encodeWebPStreaming(testImage, width, height, width * 4, {
            quality: 80,
            enableStreaming: pixelCount > 1000000, // Stream for >1MP
            enableMultithreading: true
          });
        } else {
          encodedData = addon.encodeWebP(testImage, width, height, width * 4, {
            quality: 80,
            enableMultithreading: true
          });
        }
        
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        const throughputMPPS = (pixelCount / 1000000) / (durationMs / 1000);
        
        results.push({
          name,
          width,
          height,
          pixelCount,
          durationMs,
          throughputMPPS,
          compressionRatio: testImage.length / encodedData.length
        });
        
        console.log(`${name} (${width}x${height}): ${durationMs.toFixed(2)}ms, ${throughputMPPS.toFixed(2)} MP/s`);
      });

      // Verify throughput remains reasonable as size increases
      results.forEach(result => {
        expect(result.throughputMPPS).to.be.above(1); // At least 1 MP/s
        expect(result.compressionRatio).to.be.above(3); // At least 3:1 compression
      });

      // Check that very large images don't have dramatically worse throughput
      const smallResult = results.find(r => r.name === 'Small');
      const largeResult = results.find(r => r.name === 'XLarge');
      
      if (smallResult && largeResult) {
        const throughputRatio = smallResult.throughputMPPS / largeResult.throughputMPPS;
        expect(throughputRatio).to.be.below(5); // Large images shouldn't be >5x slower per pixel
      }
    });

    it('should demonstrate memory efficiency under streaming', function() {
      if (!addon.getUltraStreamingStats) {
        this.skip();
        return;
      }

      // Configure reasonable streaming parameters
      addon.configureUltraStreaming(256, 256, 512, 6);
      
      const initialStats = addon.getUltraStreamingStats();
      const largeImage = createLargeTestImage(3840, 2160); // 4K image
      
      const result = addon.encodeWebPStreaming(largeImage, 3840, 2160, 3840 * 4, {
        quality: 80,
        enableStreaming: true,
        enableMultithreading: true
      });
      
      const finalStats = addon.getUltraStreamingStats();
      
      expect(result).to.be.instanceOf(Buffer);
      expect(finalStats.peakMemoryUsageMb).to.be.below(600); // Should stay under 600MB
      expect(finalStats.totalPixelsProcessed).to.be.above(initialStats.totalPixelsProcessed);
      
      console.log(`Streaming memory usage: ${finalStats.peakMemoryUsageMb}MB peak`);
    });
  });

  describe('Error Handling and Recovery', function() {
    it('should handle invalid streaming parameters gracefully', function() {
      if (!addon.configureUltraStreaming) {
        this.skip();
        return;
      }

      // Test invalid configurations
      expect(() => addon.configureUltraStreaming(0, 0, 0, 0)).to.not.throw();
      expect(() => addon.configureUltraStreaming(-1, -1, -1, -1)).to.not.throw();
      expect(() => addon.configureUltraStreaming(1000000, 1000000, 1, 10)).to.not.throw();
    });

    it('should recover from streaming failures', function() {
      const invalidImage = Buffer.alloc(100); // Too small for dimensions
      
      if (addon.encodeWebPStreaming) {
        expect(() => {
          addon.encodeWebPStreaming(invalidImage, 1920, 1080, 1920 * 4, {
            quality: 80,
            enableStreaming: true
          });
        }).to.throw();
        
        // Should still be able to process valid images after error
        const validImage = createLargeTestImage(256, 256);
        const result = addon.encodeWebPStreaming(validImage, 256, 256, 256 * 4, {
          quality: 80,
          enableStreaming: true
        });
        
        expect(result).to.be.instanceOf(Buffer);
      } else {
        this.skip();
      }
    });
  });

  after(function() {
    // Clean up streaming pipeline resources
    if (addon.getUltraStreamingStats) {
      const finalStats = addon.getUltraStreamingStats();
      console.log('\n=== ULTRA-STREAMING PIPELINE STATS ===');
      console.log(`Total pixels processed: ${finalStats.totalPixelsProcessed}`);
      console.log(`Total chunks processed: ${finalStats.totalChunksProcessed}`);
      console.log(`Peak memory usage: ${finalStats.peakMemoryUsageMb}MB`);
      console.log(`Average throughput: ${finalStats.averageThroughputMpixelsPerSec.toFixed(2)} MP/s`);
    }
  });

  // Helper function to create large test images
  function createLargeTestImage(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    
    // Create a complex pattern that exercises the streaming pipeline
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        // Create zones with different characteristics
        const zoneX = Math.floor(x / 256);
        const zoneY = Math.floor(y / 256);
        const zone = (zoneX + zoneY) % 4;
        
        let r, g, b;
        
        switch (zone) {
          case 0: // Gradient zone
            r = (x * 255) / width;
            g = (y * 255) / height;
            b = ((x + y) * 255) / (width + height);
            break;
          case 1: // High frequency zone
            r = (Math.sin(x * 0.1) + 1) * 127;
            g = (Math.cos(y * 0.1) + 1) * 127;
            b = (Math.sin((x + y) * 0.05) + 1) * 127;
            break;
          case 2: // Solid color zone
            r = (zoneX * 63) % 256;
            g = (zoneY * 63) % 256;
            b = ((zoneX + zoneY) * 63) % 256;
            break;
          case 3: // Noise zone
            r = Math.random() * 255;
            g = Math.random() * 255;
            b = Math.random() * 255;
            break;
        }
        
        buffer[offset] = Math.floor(r);
        buffer[offset + 1] = Math.floor(g);
        buffer[offset + 2] = Math.floor(b);
        buffer[offset + 3] = 255;
      }
    }
    
    return buffer;
  }
});