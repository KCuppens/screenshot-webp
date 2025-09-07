const { expect } = require('chai');

let addon;
try {
  addon = require('../../build/Release/webp_screenshot');
} catch (error) {
  console.log('Using mock addon for testing infrastructure');
  addon = require('../mock-addon');
}

describe('Memory Pool Unit Tests', function() {
  this.timeout(10000);

  describe('Buffer Allocation and Deallocation', function() {
    it('should allocate buffers from the pool', function() {
      const bufferSizes = [1024, 4096, 16384, 65536];
      
      bufferSizes.forEach(size => {
        const startStats = addon.getMemoryPoolStats();
        const buffer = addon.allocateScreenshotBuffer(size);
        const endStats = addon.getMemoryPoolStats();
        
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer.length).to.equal(size);
        expect(endStats.totalBuffersCreated).to.be.at.least(startStats.totalBuffersCreated);
      });
    });

    it('should reuse buffers of the same size', function() {
      const testSize = 8192;
      
      // Allocate and return buffer
      const buffer1 = addon.allocateScreenshotBuffer(testSize);
      const initialStats = addon.getMemoryPoolStats();
      addon.returnScreenshotBuffer(buffer1, testSize);
      
      // Allocate another buffer of same size
      const buffer2 = addon.allocateScreenshotBuffer(testSize);
      const finalStats = addon.getMemoryPoolStats();
      
      expect(finalStats.memoryReuseCount).to.be.above(initialStats.memoryReuseCount);
    });

    it('should handle pool size limits correctly', function() {
      const poolSizeLimit = 10;
      const testSize = 4096;
      const buffers = [];
      
      // Allocate more buffers than pool limit
      for (let i = 0; i < poolSizeLimit + 5; i++) {
        buffers.push(addon.allocateScreenshotBuffer(testSize));
      }
      
      // Return all buffers
      buffers.forEach(buffer => {
        addon.returnScreenshotBuffer(buffer, testSize);
      });
      
      const stats = addon.getMemoryPoolStats();
      expect(stats.availableBuffers).to.be.at.most(poolSizeLimit);
    });
  });

  describe('Thread Safety Validation', function() {
    it('should handle concurrent allocations safely', async function() {
      const concurrentRequests = 50;
      const bufferSize = 2048;
      
      const allocateBuffer = () => {
        return new Promise((resolve, reject) => {
          try {
            const buffer = addon.allocateScreenshotBuffer(bufferSize);
            // Simulate some work
            setTimeout(() => {
              addon.returnScreenshotBuffer(buffer, bufferSize);
              resolve(buffer.length);
            }, Math.random() * 10);
          } catch (error) {
            reject(error);
          }
        });
      };

      const promises = Array(concurrentRequests).fill().map(() => allocateBuffer());
      const results = await Promise.all(promises);
      
      expect(results).to.have.length(concurrentRequests);
      results.forEach(size => {
        expect(size).to.equal(bufferSize);
      });
    });
  });

  describe('Memory Leak Detection', function() {
    it('should not leak memory over multiple allocation cycles', function() {
      const initialStats = addon.getMemoryPoolStats();
      const testSize = 1024;
      const cycles = 1000;
      
      for (let i = 0; i < cycles; i++) {
        const buffer = addon.allocateScreenshotBuffer(testSize);
        addon.returnScreenshotBuffer(buffer, testSize);
      }
      
      // Force cleanup of expired buffers
      addon.clearMemoryPool();
      
      const finalStats = addon.getMemoryPoolStats();
      
      // Memory usage should not grow significantly
      expect(finalStats.totalMemoryAllocated)
        .to.be.lessThan(initialStats.totalMemoryAllocated + testSize * 10);
    });

    it('should clean up expired buffers', function(done) {
      const testSize = 2048;
      const buffer = addon.allocateScreenshotBuffer(testSize);
      addon.returnScreenshotBuffer(buffer, testSize);
      
      const initialStats = addon.getMemoryPoolStats();
      
      // Wait for buffer timeout (1 minute in production, reduced for testing)
      setTimeout(() => {
        addon.clearMemoryPool(); // Force cleanup
        const finalStats = addon.getMemoryPoolStats();
        
        expect(finalStats.availableBuffers)
          .to.be.lessThan(initialStats.availableBuffers);
        done();
      }, 100); // Reduced timeout for testing
    });
  });

  describe('Pool Statistics Accuracy', function() {
    it('should track buffer creation statistics accurately', function() {
      const initialStats = addon.getMemoryPoolStats();
      const testSize = 4096;
      const bufferCount = 5;
      
      for (let i = 0; i < bufferCount; i++) {
        addon.allocateScreenshotBuffer(testSize);
      }
      
      const finalStats = addon.getMemoryPoolStats();
      
      expect(finalStats.totalBuffersCreated)
        .to.equal(initialStats.totalBuffersCreated + bufferCount);
      expect(finalStats.totalMemoryAllocated)
        .to.be.at.least(initialStats.totalMemoryAllocated + (testSize * bufferCount));
    });

    it('should track peak memory usage correctly', function() {
      const initialStats = addon.getMemoryPoolStats();
      const largeBufferSize = 1024 * 1024; // 1MB
      
      const buffer = addon.allocateScreenshotBuffer(largeBufferSize);
      const peakStats = addon.getMemoryPoolStats();
      
      addon.returnScreenshotBuffer(buffer, largeBufferSize);
      const finalStats = addon.getMemoryPoolStats();
      
      expect(peakStats.peakMemoryUsage).to.be.above(initialStats.peakMemoryUsage);
      expect(finalStats.peakMemoryUsage).to.equal(peakStats.peakMemoryUsage);
    });
  });

  describe('Error Handling', function() {
    it('should handle invalid buffer sizes gracefully', function() {
      expect(() => addon.allocateScreenshotBuffer(0)).to.throw();
      expect(() => addon.allocateScreenshotBuffer(-1)).to.throw();
      expect(() => addon.allocateScreenshotBuffer(null)).to.throw();
    });

    it('should handle buffer return errors gracefully', function() {
      const buffer = Buffer.alloc(1024);
      
      // Should not crash when returning invalid buffer
      expect(() => addon.returnScreenshotBuffer(null, 1024)).to.not.throw();
      expect(() => addon.returnScreenshotBuffer(buffer, 0)).to.not.throw();
    });
  });

  after(function() {
    // Clean up memory pool after tests
    addon.clearMemoryPool();
  });
});