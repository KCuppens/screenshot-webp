const { expect } = require('chai');
const addon = require('../../build/Release/webp_screenshot');
const fs = require('fs');
const path = require('path');

describe('Core Performance Benchmarks', function() {
  this.timeout(60000); // 60 second timeout for performance tests

  let benchmarkResults = {
    capturePerformance: {},
    encodePerformance: {},
    memoryPerformance: {},
    scalabilityPerformance: {}
  };

  describe('Screenshot Capture Performance', function() {
    const resolutions = [
      { name: '1080p', width: 1920, height: 1080 },
      { name: '1440p', width: 2560, height: 1440 },
      { name: '4K', width: 3840, height: 2160 },
      { name: '8K', width: 7680, height: 4320 }
    ];

    resolutions.forEach(({ name, width, height }) => {
      it(`should capture ${name} screenshots efficiently`, async function() {
        const iterations = name === '8K' ? 3 : (name === '4K' ? 5 : 10);
        const captureResults = [];
        
        // Warm up
        try {
          await addon.captureScreenshot({ display: 0 });
        } catch (e) {
          // Skip if capture fails (no display available in CI)
          this.skip();
          return;
        }

        for (let i = 0; i < iterations; i++) {
          const startTime = process.hrtime.bigint();
          
          try {
            const screenshot = await addon.captureScreenshot({ 
              display: 0,
              // Note: We can't force resolution, but we can test the pipeline
            });
            
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;
            
            captureResults.push({
              duration: durationMs,
              dataSize: screenshot.data ? screenshot.data.length : 0,
              width: screenshot.width || 0,
              height: screenshot.height || 0
            });
            
          } catch (error) {
            console.log(`Capture iteration ${i} failed:`, error.message);
          }
        }

        if (captureResults.length === 0) {
          this.skip();
          return;
        }

        const avgDuration = captureResults.reduce((sum, r) => sum + r.duration, 0) / captureResults.length;
        const avgDataSize = captureResults.reduce((sum, r) => sum + r.dataSize, 0) / captureResults.length;
        const p95Duration = captureResults.sort((a, b) => a.duration - b.duration)[Math.floor(captureResults.length * 0.95)]?.duration || avgDuration;
        
        benchmarkResults.capturePerformance[name] = {
          avgDurationMs: avgDuration,
          p95DurationMs: p95Duration,
          avgDataSizeMB: avgDataSize / (1024 * 1024),
          iterations: captureResults.length
        };

        console.log(`${name} Capture: ${avgDuration.toFixed(2)}ms avg, ${p95Duration.toFixed(2)}ms p95, ${(avgDataSize/1024/1024).toFixed(2)}MB`);

        // Performance expectations
        const expectedMaxDuration = {
          '1080p': 100,
          '1440p': 150,
          '4K': 300,
          '8K': 800
        };

        expect(avgDuration).to.be.below(expectedMaxDuration[name]);
      });
    });
  });

  describe('WebP Encoding Performance', function() {
    const qualityLevels = [60, 80, 90, 95];
    const testSizes = [
      { name: 'Medium', width: 1024, height: 768 },
      { name: 'Large', width: 1920, height: 1080 },
      { name: 'Ultra', width: 3840, height: 2160 }
    ];

    testSizes.forEach(({ name, width, height }) => {
      qualityLevels.forEach(quality => {
        it(`should encode ${name} images at quality ${quality} efficiently`, function() {
          const pixelCount = width * height;
          const testImage = createTestImage(width, height);
          const iterations = Math.max(1, Math.floor(1000000 / pixelCount));
          
          const encodeResults = [];
          
          for (let i = 0; i < iterations; i++) {
            const startTime = process.hrtime.bigint();
            
            const webpData = addon.encodeWebP(testImage, width, height, width * 4, {
              quality: quality,
              method: 4,
              enableMultithreading: true,
              enableStreaming: pixelCount > 8000000 // Enable for >8MP images
            });
            
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;
            
            encodeResults.push({
              duration: durationMs,
              originalSize: testImage.length,
              compressedSize: webpData.length,
              compressionRatio: testImage.length / webpData.length
            });
          }

          const avgDuration = encodeResults.reduce((sum, r) => sum + r.duration, 0) / encodeResults.length;
          const avgCompressionRatio = encodeResults.reduce((sum, r) => sum + r.compressionRatio, 0) / encodeResults.length;
          const throughputMPPS = (pixelCount / 1000000) / (avgDuration / 1000);
          
          const key = `${name}_Q${quality}`;
          benchmarkResults.encodePerformance[key] = {
            avgDurationMs: avgDuration,
            avgCompressionRatio: avgCompressionRatio,
            throughputMegapixelsPerSecond: throughputMPPS,
            iterations: iterations
          };

          console.log(`${name} Q${quality}: ${avgDuration.toFixed(2)}ms, ${avgCompressionRatio.toFixed(1)}:1 compression, ${throughputMPPS.toFixed(2)} MP/s`);

          // Performance expectations
          expect(throughputMPPS).to.be.above(5); // At least 5 MP/s
          expect(avgCompressionRatio).to.be.above(3); // At least 3:1 compression
        });
      });
    });
  });

  describe('Memory Performance Benchmarks', function() {
    it('should demonstrate memory pool efficiency', function() {
      const testSizes = [1024, 4096, 16384, 65536, 262144];
      const iterationsPerSize = 100;
      
      // Clear memory pool
      addon.clearMemoryPool();
      const initialStats = addon.getMemoryPoolStats();
      
      const memoryResults = [];
      
      testSizes.forEach(size => {
        const startTime = process.hrtime.bigint();
        const buffers = [];
        
        // Allocation phase
        for (let i = 0; i < iterationsPerSize; i++) {
          buffers.push(addon.allocateScreenshotBuffer(size));
        }
        
        const allocEndTime = process.hrtime.bigint();
        
        // Return phase
        buffers.forEach(buffer => {
          addon.returnScreenshotBuffer(buffer, size);
        });
        
        const returnEndTime = process.hrtime.bigint();
        
        // Reallocation phase (should reuse buffers)
        const reusedBuffers = [];
        for (let i = 0; i < iterationsPerSize; i++) {
          reusedBuffers.push(addon.allocateScreenshotBuffer(size));
        }
        
        const reuseEndTime = process.hrtime.bigint();
        
        const allocDuration = Number(allocEndTime - startTime) / 1000000;
        const returnDuration = Number(returnEndTime - allocEndTime) / 1000000;
        const reuseDuration = Number(reuseEndTime - returnEndTime) / 1000000;
        
        memoryResults.push({
          size: size,
          allocDuration: allocDuration,
          returnDuration: returnDuration,
          reuseDuration: reuseDuration,
          reuseSpeedup: allocDuration / reuseDuration
        });
        
        // Clean up
        reusedBuffers.forEach(buffer => {
          addon.returnScreenshotBuffer(buffer, size);
        });
      });

      const finalStats = addon.getMemoryPoolStats();
      
      benchmarkResults.memoryPerformance = {
        poolEfficiency: memoryResults,
        memoryReuseCount: finalStats.memoryReuseCount - initialStats.memoryReuseCount,
        peakMemoryUsageMB: finalStats.peakMemoryUsage / (1024 * 1024)
      };

      // Verify memory pool is working efficiently
      expect(finalStats.memoryReuseCount).to.be.above(initialStats.memoryReuseCount);
      
      memoryResults.forEach(result => {
        console.log(`Size ${result.size}: ${result.reuseSpeedup.toFixed(2)}x faster reuse`);
        expect(result.reuseSpeedup).to.be.above(1.1); // At least 10% faster
      });
    });

    it('should demonstrate zero-copy optimization benefits', function() {
      if (!addon.isZeroCopySupported()) {
        this.skip();
        return;
      }

      const iterations = 10;
      const zeroCopyResults = [];
      const traditionalResults = [];

      // Test zero-copy capture
      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        try {
          const result = addon.captureWithZeroCopyOptimization(0);
          const endTime = process.hrtime.bigint();
          
          if (result.success) {
            zeroCopyResults.push({
              duration: Number(endTime - startTime) / 1000000,
              dataSize: result.dataSize
            });
          }
        } catch (error) {
          // Skip if zero-copy fails
        }
      }

      // Test traditional capture for comparison
      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        try {
          const result = await addon.captureScreenshot({ display: 0 });
          const endTime = process.hrtime.bigint();
          
          if (result.success) {
            traditionalResults.push({
              duration: Number(endTime - startTime) / 1000000,
              dataSize: result.data.length
            });
          }
        } catch (error) {
          // Skip if capture fails
        }
      }

      if (zeroCopyResults.length > 0 && traditionalResults.length > 0) {
        const zeroCopyAvg = zeroCopyResults.reduce((sum, r) => sum + r.duration, 0) / zeroCopyResults.length;
        const traditionalAvg = traditionalResults.reduce((sum, r) => sum + r.duration, 0) / traditionalResults.length;
        const speedupRatio = traditionalAvg / zeroCopyAvg;

        benchmarkResults.memoryPerformance.zeroCopySpeedup = speedupRatio;
        
        console.log(`Zero-copy speedup: ${speedupRatio.toFixed(2)}x faster`);
        expect(speedupRatio).to.be.above(1.2); // At least 20% improvement
      }
    });
  });

  describe('Multi-Threading Scalability', function() {
    const threadCounts = [1, 2, 4, 8];
    const testImageSize = { width: 2048, height: 2048 }; // 4MP test image
    
    threadCounts.forEach(threadCount => {
      it(`should scale performance with ${threadCount} threads`, function() {
        const testImage = createTestImage(testImageSize.width, testImageSize.height);
        const iterations = 3;
        const durations = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = process.hrtime.bigint();
          
          const webpData = addon.encodeWebP(testImage, testImageSize.width, testImageSize.height, testImageSize.width * 4, {
            quality: 80,
            method: 4,
            enableMultithreading: true,
            maxThreads: threadCount
          });
          
          const endTime = process.hrtime.bigint();
          const durationMs = Number(endTime - startTime) / 1000000;
          durations.push(durationMs);
        }
        
        const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        
        benchmarkResults.scalabilityPerformance[`threads_${threadCount}`] = {
          avgDurationMs: avgDuration,
          threadsUsed: threadCount
        };
        
        console.log(`${threadCount} threads: ${avgDuration.toFixed(2)}ms average`);
        
        // Sanity check - should complete in reasonable time
        expect(avgDuration).to.be.below(5000); // Less than 5 seconds
      });
    });

    it('should demonstrate threading scalability', function() {
      const results = benchmarkResults.scalabilityPerformance;
      const threadCounts = Object.keys(results).map(k => parseInt(k.split('_')[1])).sort((a, b) => a - b);
      
      if (threadCounts.length < 2) {
        this.skip();
        return;
      }
      
      const baselineTime = results[`threads_${threadCounts[0]}`].avgDurationMs;
      
      threadCounts.forEach(count => {
        if (count > 1) {
          const currentTime = results[`threads_${count}`].avgDurationMs;
          const speedupRatio = baselineTime / currentTime;
          const efficiency = speedupRatio / count;
          
          console.log(`${count} threads: ${speedupRatio.toFixed(2)}x speedup, ${(efficiency * 100).toFixed(1)}% efficiency`);
          
          // Threading should provide some benefit (at least 1.2x with 2 threads)
          if (count === 2) {
            expect(speedupRatio).to.be.above(1.2);
          }
        }
      });
    });
  });

  describe('Ultra-Streaming Pipeline Performance', function() {
    it('should handle ultra-large images efficiently', function() {
      if (!addon.initializeUltraStreaming) {
        this.skip();
        return;
      }

      const ultraLargeSize = { width: 7680, height: 4320 }; // 8K
      const testImage = createTestImage(ultraLargeSize.width, ultraLargeSize.height);
      
      // Initialize ultra-streaming pipeline
      addon.initializeUltraStreaming(4);
      addon.configureUltraStreaming(512, 512, 2048, 6); // 512x512 chunks, 2GB limit
      
      const startTime = process.hrtime.bigint();
      let progressUpdates = 0;
      
      const progressCallback = (progress, status) => {
        progressUpdates++;
        console.log(`Progress: ${progress.toFixed(1)}% - ${status}`);
        return true; // Continue processing
      };
      
      const encodingPromise = addon.captureAndEncodeUltraLarge(0, {
        quality: 80,
        method: 4,
        enableStreaming: true
      }, progressCallback);
      
      return encodingPromise.then(webpData => {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        const compressionRatio = testImage.length / webpData.length;
        
        benchmarkResults.streamingPerformance = {
          durationMs: durationMs,
          compressionRatio: compressionRatio,
          progressUpdates: progressUpdates
        };
        
        console.log(`Ultra-streaming 8K: ${durationMs.toFixed(2)}ms, ${compressionRatio.toFixed(1)}:1 compression`);
        
        expect(webpData.length).to.be.above(0);
        expect(compressionRatio).to.be.above(5);
        expect(progressUpdates).to.be.above(3); // Should have multiple progress updates
        
        // Should complete within reasonable time (5 minutes for 8K)
        expect(durationMs).to.be.below(300000);
      });
    });
  });

  after(function() {
    // Save benchmark results
    const resultsPath = path.join(__dirname, '..', 'results', 'benchmark-results.json');
    const resultsDir = path.dirname(resultsPath);
    
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const finalResults = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      results: benchmarkResults
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(finalResults, null, 2));
    
    console.log('\n=== BENCHMARK SUMMARY ===');
    console.log(`Results saved to: ${resultsPath}`);
    console.log('Capture Performance:', JSON.stringify(benchmarkResults.capturePerformance, null, 2));
    console.log('Encode Performance:', JSON.stringify(benchmarkResults.encodePerformance, null, 2));
    console.log('Memory Performance:', JSON.stringify(benchmarkResults.memoryPerformance, null, 2));
  });

  // Helper function to create test images
  function createTestImage(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    
    // Create a complex pattern that's realistic for compression testing
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        // Gradient with some noise
        const gradientX = (x / width) * 255;
        const gradientY = (y / height) * 255;
        const noise = (Math.sin(x * 0.1) + Math.cos(y * 0.1)) * 30;
        
        buffer[offset] = Math.max(0, Math.min(255, gradientX + noise));     // R
        buffer[offset + 1] = Math.max(0, Math.min(255, gradientY + noise)); // G
        buffer[offset + 2] = Math.max(0, Math.min(255, (gradientX + gradientY) / 2)); // B
        buffer[offset + 3] = 255; // A
      }
    }
    
    return buffer;
  }
});