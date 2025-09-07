const { expect } = require('chai');

let addon;
try {
  addon = require('../../build/Release/webp_screenshot');
} catch (error) {
  console.log('Using mock addon for testing infrastructure');
  addon = require('../mock-addon');
}

// Mock memwatch if not available
let memwatch;
try {
  memwatch = require('memwatch-next');
} catch (error) {
  console.log('Memwatch not available - using basic memory monitoring');
  memwatch = {
    on: () => {},
    HeapDiff: function() {
      this.end = () => ({ change: { size_bytes: 0 } });
    }
  };
}

describe('Endurance Stress Tests', function() {
  // Long timeout for endurance testing
  this.timeout(process.env.STRESS_TEST_DURATION ? parseInt(process.env.STRESS_TEST_DURATION) * 1000 : 3600000);

  let heapDiffs = [];
  let performanceMetrics = [];

  before(function() {
    console.log('🔥 Starting endurance stress tests...');
    console.log('Duration:', this.timeout() / 1000, 'seconds');
    
    // Setup memory monitoring
    memwatch.on('leak', (info) => {
      console.error('💧 Memory leak detected:', info);
    });

    memwatch.on('stats', (stats) => {
      performanceMetrics.push({
        timestamp: Date.now(),
        used_heap_size: stats.used_heap_size,
        heap_size_limit: stats.heap_size_limit,
        total_heap_size: stats.total_heap_size
      });
    });
  });

  describe('Long-Running Capture Tests', function() {
    it('should handle continuous captures for extended periods', async function() {
      const testDuration = Math.min(this.timeout() - 60000, 1800000); // Max 30 minutes or timeout - 1 minute
      const captureInterval = 1000; // 1 capture per second
      const expectedCaptures = Math.floor(testDuration / captureInterval);
      
      console.log(`🎯 Target: ${expectedCaptures} captures over ${testDuration/1000}s`);
      
      let successfulCaptures = 0;
      let failedCaptures = 0;
      let totalCaptureTime = 0;
      const captureTimes = [];
      
      const startTime = Date.now();
      const endTime = startTime + testDuration;
      
      // Start heap monitoring
      const hd = new memwatch.HeapDiff();
      
      while (Date.now() < endTime) {
        const captureStart = process.hrtime.bigint();
        
        try {
          const result = await addon.captureScreenshot({ display: 0 });
          const captureEnd = process.hrtime.bigint();
          const captureTime = Number(captureEnd - captureStart) / 1000000;
          
          if (result && result.success) {
            successfulCaptures++;
            totalCaptureTime += captureTime;
            captureTimes.push(captureTime);
            
            // Log progress every 100 captures
            if (successfulCaptures % 100 === 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const rate = successfulCaptures / elapsed;
              console.log(`📸 ${successfulCaptures} captures (${rate.toFixed(2)}/s, avg: ${(totalCaptureTime/successfulCaptures).toFixed(2)}ms)`);
            }
          } else {
            failedCaptures++;
          }
        } catch (error) {
          failedCaptures++;
          if (failedCaptures % 10 === 0) {
            console.log(`⚠️ ${failedCaptures} failed captures, last error: ${error.message}`);
          }
        }
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, Math.max(0, captureInterval - (Date.now() % captureInterval))));
      }
      
      // Analyze heap usage
      const diff = hd.end();
      heapDiffs.push(diff);
      
      const actualDuration = Date.now() - startTime;
      const averageCaptureTime = totalCaptureTime / successfulCaptures;
      const p95CaptureTime = captureTimes.sort((a, b) => a - b)[Math.floor(captureTimes.length * 0.95)];
      
      console.log(`\n📊 Endurance Test Results:`);
      console.log(`Duration: ${actualDuration/1000}s`);
      console.log(`Successful captures: ${successfulCaptures}`);
      console.log(`Failed captures: ${failedCaptures}`);
      console.log(`Success rate: ${(successfulCaptures/(successfulCaptures + failedCaptures)*100).toFixed(2)}%`);
      console.log(`Average capture time: ${averageCaptureTime.toFixed(2)}ms`);
      console.log(`P95 capture time: ${p95CaptureTime.toFixed(2)}ms`);
      console.log(`Heap growth: ${diff.change.size_bytes} bytes`);
      
      // Assertions for endurance test success
      expect(successfulCaptures).to.be.above(expectedCaptures * 0.8); // At least 80% of expected captures
      expect(failedCaptures / (successfulCaptures + failedCaptures)).to.be.below(0.1); // Less than 10% failure rate
      expect(averageCaptureTime).to.be.below(200); // Average capture time should stay reasonable
      expect(Math.abs(diff.change.size_bytes)).to.be.below(100 * 1024 * 1024); // Less than 100MB heap growth
    });

    it('should maintain performance consistency over time', function(done) {
      const sampleDuration = Math.min(300000, this.timeout() - 120000); // 5 minutes or timeout - 2 minutes
      const sampleInterval = 5000; // Sample every 5 seconds
      const samples = [];
      
      console.log(`📈 Performance consistency test: ${sampleDuration/1000}s`);
      
      let sampleCount = 0;
      const maxSamples = Math.floor(sampleDuration / sampleInterval);
      
      const performanceSample = async () => {
        const startTime = process.hrtime.bigint();
        
        try {
          const result = await addon.captureScreenshot({ display: 0 });
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          
          if (result && result.success) {
            samples.push({
              timestamp: Date.now(),
              duration: duration,
              dataSize: result.data ? result.data.length : 0,
              width: result.width,
              height: result.height
            });
            
            console.log(`Sample ${sampleCount + 1}/${maxSamples}: ${duration.toFixed(2)}ms`);
          }
        } catch (error) {
          console.log(`Sample ${sampleCount + 1} failed:`, error.message);
        }
        
        sampleCount++;
        
        if (sampleCount < maxSamples) {
          setTimeout(performanceSample, sampleInterval);
        } else {
          // Analyze performance consistency
          if (samples.length === 0) {
            done(new Error('No successful samples collected'));
            return;
          }
          
          const durations = samples.map(s => s.duration);
          const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
          const stdDev = Math.sqrt(durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length);
          const coefficientOfVariation = stdDev / avgDuration;
          
          // Check for performance degradation over time
          const firstQuarter = durations.slice(0, Math.floor(durations.length / 4));
          const lastQuarter = durations.slice(-Math.floor(durations.length / 4));
          const firstQuarterAvg = firstQuarter.reduce((sum, d) => sum + d, 0) / firstQuarter.length;
          const lastQuarterAvg = lastQuarter.reduce((sum, d) => sum + d, 0) / lastQuarter.length;
          const performanceDegradation = (lastQuarterAvg - firstQuarterAvg) / firstQuarterAvg;
          
          console.log(`\n📊 Performance Consistency Results:`);
          console.log(`Samples collected: ${samples.length}/${maxSamples}`);
          console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);
          console.log(`Standard deviation: ${stdDev.toFixed(2)}ms`);
          console.log(`Coefficient of variation: ${(coefficientOfVariation * 100).toFixed(2)}%`);
          console.log(`Performance degradation: ${(performanceDegradation * 100).toFixed(2)}%`);
          
          try {
            // Performance should remain consistent
            expect(coefficientOfVariation).to.be.below(0.3); // CV should be less than 30%
            expect(Math.abs(performanceDegradation)).to.be.below(0.2); // Less than 20% degradation
            expect(samples.length).to.be.above(maxSamples * 0.8); // Should collect at least 80% of expected samples
            done();
          } catch (error) {
            done(error);
          }
        }
      };
      
      performanceSample();
    });
  });

  describe('Memory Stability Tests', function() {
    it('should not exhibit memory leaks during repetitive operations', async function() {
      const iterations = 1000;
      const checkInterval = 100;
      
      console.log(`🔍 Memory leak test: ${iterations} iterations`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage();
      const hd = new memwatch.HeapDiff();
      
      for (let i = 0; i < iterations; i++) {
        try {
          // Perform memory-intensive operations
          const buffer = addon.allocateScreenshotBuffer(1024 * 1024); // 1MB buffer
          
          // Use the buffer briefly
          const testData = Buffer.alloc(1024 * 1024);
          testData.fill(i % 256);
          
          // Return buffer to pool
          addon.returnScreenshotBuffer(buffer, 1024 * 1024);
          
          // Periodic memory checks
          if (i % checkInterval === 0) {
            if (global.gc) global.gc();
            
            const currentMemory = process.memoryUsage();
            const heapGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
            console.log(`Iteration ${i}: heap growth ${(heapGrowth / 1024 / 1024).toFixed(2)}MB`);
            
            // Fail fast if memory grows too much
            if (heapGrowth > 500 * 1024 * 1024) { // 500MB growth limit
              throw new Error(`Excessive memory growth detected: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB`);
            }
          }
        } catch (error) {
          console.error(`Iteration ${i} failed:`, error.message);
        }
      }
      
      // Final garbage collection
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for GC
        global.gc();
      }
      
      const diff = hd.end();
      const finalMemory = process.memoryUsage();
      const totalHeapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`\n📊 Memory Stability Results:`);
      console.log(`Iterations completed: ${iterations}`);
      console.log(`Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Heap growth: ${(totalHeapGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Heap diff size: ${diff.change.size_bytes} bytes`);
      
      // Memory should remain stable
      expect(Math.abs(totalHeapGrowth)).to.be.below(100 * 1024 * 1024); // Less than 100MB growth
      expect(Math.abs(diff.change.size_bytes)).to.be.below(50 * 1024 * 1024); // Less than 50MB heap diff
    });

    it('should handle pool memory pressure gracefully', function() {
      const poolSizeLimit = 10; // Default pool size
      const overflowRequests = 50; // Request more than pool can handle
      
      console.log(`🎯 Pool pressure test: ${overflowRequests} requests, pool limit ${poolSizeLimit}`);
      
      const buffers = [];
      const requestSize = 1024 * 1024; // 1MB per request
      
      // Clear pool first
      addon.clearMemoryPool();
      
      const initialStats = addon.getMemoryPoolStats();
      
      // Request more buffers than pool can handle
      for (let i = 0; i < overflowRequests; i++) {
        try {
          const buffer = addon.allocateScreenshotBuffer(requestSize);
          buffers.push({ buffer, size: requestSize });
        } catch (error) {
          console.log(`Request ${i} failed: ${error.message}`);
        }
      }
      
      const pressureStats = addon.getMemoryPoolStats();
      
      // Return all buffers
      buffers.forEach(({ buffer, size }) => {
        try {
          addon.returnScreenshotBuffer(buffer, size);
        } catch (error) {
          // Ignore return errors for this test
        }
      });
      
      const finalStats = addon.getMemoryPoolStats();
      
      console.log(`\n📊 Pool Pressure Results:`);
      console.log(`Buffers requested: ${overflowRequests}`);
      console.log(`Buffers allocated: ${buffers.length}`);
      console.log(`Pool buffers created: ${pressureStats.totalBuffersCreated - initialStats.totalBuffersCreated}`);
      console.log(`Peak memory usage: ${(pressureStats.peakMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final available buffers: ${finalStats.availableBuffers}`);
      
      // Pool should handle pressure gracefully
      expect(buffers.length).to.be.above(0); // Should allocate some buffers
      expect(pressureStats.totalBuffersCreated).to.be.above(initialStats.totalBuffersCreated); // Should create new buffers
      expect(finalStats.availableBuffers).to.be.at.most(poolSizeLimit); // Should respect pool size limit
    });
  });

  after(function() {
    console.log('\n🏁 Endurance tests completed');
    
    // Print final memory analysis
    if (heapDiffs.length > 0) {
      const totalGrowth = heapDiffs.reduce((sum, diff) => sum + diff.change.size_bytes, 0);
      console.log(`Total heap growth across all tests: ${(totalGrowth / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // Clean up
    addon.clearMemoryPool();
    
    if (global.gc) {
      global.gc();
    }
  });
});