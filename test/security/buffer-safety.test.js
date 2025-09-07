const { expect } = require('chai');
const addon = require('../../build/Release/webp_screenshot');

describe('Buffer Safety and Security Tests', function() {
  this.timeout(30000);

  describe('Buffer Overflow Protection', function() {
    it('should handle buffer size mismatches safely', function() {
      const testCases = [
        { bufferSize: 100, width: 100, height: 100, expectedError: true },
        { bufferSize: 40000, width: 100, height: 100, expectedError: false },
        { bufferSize: 39999, width: 100, height: 100, expectedError: true },
        { bufferSize: 0, width: 100, height: 100, expectedError: true }
      ];

      testCases.forEach(({ bufferSize, width, height, expectedError }, index) => {
        const buffer = Buffer.alloc(bufferSize);
        
        if (expectedError) {
          expect(() => {
            addon.convertBGRAToRGBA(buffer, width, height);
          }, `Test case ${index + 1} should throw`).to.throw();
        } else {
          expect(() => {
            addon.convertBGRAToRGBA(buffer, width, height);
          }, `Test case ${index + 1} should not throw`).to.not.throw();
        }
      });
    });

    it('should validate image dimensions against buffer size', function() {
      const validBuffer = Buffer.alloc(1920 * 1080 * 4); // 1080p RGBA
      
      // Valid cases
      expect(() => addon.convertBGRAToRGBA(validBuffer, 1920, 1080)).to.not.throw();
      expect(() => addon.convertBGRAToRGBA(validBuffer, 960, 2160)).to.not.throw(); // Same total pixels
      
      // Invalid cases - dimensions too large for buffer
      expect(() => addon.convertBGRAToRGBA(validBuffer, 1921, 1080)).to.throw();
      expect(() => addon.convertBGRAToRGBA(validBuffer, 1920, 1081)).to.throw();
      expect(() => addon.convertBGRAToRGBA(validBuffer, 3840, 2160)).to.throw(); // 4K requires larger buffer
    });

    it('should handle edge case dimensions safely', function() {
      // Test zero dimensions
      expect(() => addon.convertBGRAToRGBA(Buffer.alloc(0), 0, 0)).to.throw();
      expect(() => addon.convertBGRAToRGBA(Buffer.alloc(100), 0, 100)).to.throw();
      expect(() => addon.convertBGRAToRGBA(Buffer.alloc(100), 100, 0)).to.throw();
      
      // Test very small dimensions
      const tinyBuffer = Buffer.alloc(4); // 1 pixel
      expect(() => addon.convertBGRAToRGBA(tinyBuffer, 1, 1)).to.not.throw();
      
      // Test large dimensions with insufficient buffer
      const smallBuffer = Buffer.alloc(1000);
      expect(() => addon.convertBGRAToRGBA(smallBuffer, 1000, 1000)).to.throw();
    });

    it('should prevent integer overflow in size calculations', function() {
      const testCases = [
        { width: 2147483647, height: 2, desc: 'Width near INT_MAX' },
        { width: 65536, height: 65536, desc: 'Large square dimensions' },
        { width: 4294967295, height: 1, desc: 'Width at UINT_MAX' }
      ];
      
      testCases.forEach(({ width, height, desc }) => {
        // These should fail safely without crashing
        expect(() => {
          addon.convertBGRAToRGBA(Buffer.alloc(1000), width, height);
        }, desc).to.throw();
      });
    });
  });

  describe('Memory Boundary Validation', function() {
    it('should detect out-of-bounds memory access attempts', function() {
      const buffer = Buffer.alloc(1000);
      
      // Fill buffer with known pattern
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = i % 256;
      }
      
      // Create guard patterns before and after
      const guardPattern = 0xDEADBEEF;
      const guardBuffer = Buffer.alloc(buffer.length + 16);
      guardBuffer.writeUInt32BE(guardPattern, 0);
      guardBuffer.writeUInt32BE(guardPattern, 4);
      buffer.copy(guardBuffer, 8);
      guardBuffer.writeUInt32BE(guardPattern, buffer.length + 8);
      guardBuffer.writeUInt32BE(guardPattern, buffer.length + 12);
      
      // Use the middle section for conversion
      const workingBuffer = guardBuffer.subarray(8, 8 + buffer.length);
      
      // This should work without corrupting guards
      if (workingBuffer.length >= 100 * 4) { // Minimum size for 100x1 image
        try {
          addon.convertBGRAToRGBA(workingBuffer, 25, 10); // 25x10 = 250 pixels = 1000 bytes
        } catch (error) {
          // Expected if function validates buffer size
        }
      }
      
      // Check guard patterns are intact
      expect(guardBuffer.readUInt32BE(0)).to.equal(guardPattern);
      expect(guardBuffer.readUInt32BE(4)).to.equal(guardPattern);
      expect(guardBuffer.readUInt32BE(buffer.length + 8)).to.equal(guardPattern);
      expect(guardBuffer.readUInt32BE(buffer.length + 12)).to.equal(guardPattern);
    });

    it('should handle null and undefined buffer inputs safely', function() {
      expect(() => addon.convertBGRAToRGBA(null, 100, 100)).to.throw();
      expect(() => addon.convertBGRAToRGBA(undefined, 100, 100)).to.throw();
      expect(() => addon.convertBGRAToRGBA('not a buffer', 100, 100)).to.throw();
      expect(() => addon.convertBGRAToRGBA({}, 100, 100)).to.throw();
    });

    it('should validate stride parameters correctly', function() {
      const width = 100;
      const height = 100;
      const buffer = Buffer.alloc(width * height * 4);
      
      // Valid stride (matches width * 4)
      if (addon.encodeWebP) {
        expect(() => {
          addon.encodeWebP(buffer, width, height, width * 4, { quality: 80 });
        }).to.not.throw();
        
        // Invalid stride (too small)
        expect(() => {
          addon.encodeWebP(buffer, width, height, width * 3, { quality: 80 });
        }).to.throw();
        
        // Invalid stride (zero)
        expect(() => {
          addon.encodeWebP(buffer, width, height, 0, { quality: 80 });
        }).to.throw();
      }
    });
  });

  describe('Input Validation and Sanitization', function() {
    it('should validate WebP encoding parameters', function() {
      const testImage = Buffer.alloc(100 * 100 * 4);
      
      if (addon.encodeWebP) {
        // Valid parameters
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 80 });
        }).to.not.throw();
        
        // Invalid quality values
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: -1 });
        }).to.throw();
        
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 101 });
        }).to.throw();
        
        // Invalid method values
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 80, method: -1 });
        }).to.throw();
        
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 80, method: 7 });
        }).to.throw();
      }
    });

    it('should handle malformed parameter objects', function() {
      const testImage = Buffer.alloc(100 * 100 * 4);
      
      if (addon.encodeWebP) {
        // Null parameters
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, null);
        }).to.not.throw(); // Should use defaults
        
        // String instead of number
        expect(() => {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 'high' });
        }).to.throw();
        
        // Object with circular reference
        const circularObj = { quality: 80 };
        circularObj.self = circularObj;
        
        // Should not crash, may throw or ignore
        try {
          addon.encodeWebP(testImage, 100, 100, 400, circularObj);
        } catch (error) {
          // Expected behavior - either works or throws cleanly
          expect(error).to.be.instanceOf(Error);
        }
      }
    });

    it('should handle extreme numeric inputs safely', function() {
      const buffer = Buffer.alloc(1000);
      
      const extremeValues = [
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        NaN
      ];
      
      extremeValues.forEach(extremeValue => {
        expect(() => {
          addon.convertBGRAToRGBA(buffer, extremeValue, 100);
        }, `Should handle ${extremeValue} safely`).to.throw();
        
        expect(() => {
          addon.convertBGRAToRGBA(buffer, 100, extremeValue);
        }, `Should handle ${extremeValue} safely`).to.throw();
      });
    });
  });

  describe('Resource Exhaustion Protection', function() {
    it('should handle memory allocation failures gracefully', function() {
      // Try to allocate extremely large buffers
      const hugeSizes = [
        1024 * 1024 * 1024, // 1GB
        2 * 1024 * 1024 * 1024, // 2GB (may exceed limits)
        10 * 1024 * 1024 * 1024 // 10GB (should definitely fail)
      ];
      
      hugeSizes.forEach(size => {
        try {
          const hugeBuffer = addon.allocateScreenshotBuffer(size);
          console.log(`Successfully allocated ${size / 1024 / 1024}MB buffer`);
          
          // If allocation succeeds, return it immediately
          addon.returnScreenshotBuffer(hugeBuffer, size);
        } catch (error) {
          // Expected for very large allocations
          expect(error).to.be.instanceOf(Error);
          console.log(`Allocation of ${size / 1024 / 1024}MB failed as expected: ${error.message}`);
        }
      });
    });

    it('should limit concurrent buffer allocations', function() {
      const buffers = [];
      const bufferSize = 10 * 1024 * 1024; // 10MB each
      const maxBuffers = 100; // Try to allocate 1GB total
      
      let successfulAllocations = 0;
      let failedAllocations = 0;
      
      for (let i = 0; i < maxBuffers; i++) {
        try {
          const buffer = addon.allocateScreenshotBuffer(bufferSize);
          buffers.push({ buffer, size: bufferSize });
          successfulAllocations++;
        } catch (error) {
          failedAllocations++;
          break; // Stop on first failure
        }
      }
      
      console.log(`Allocated ${successfulAllocations} buffers (${successfulAllocations * bufferSize / 1024 / 1024}MB total)`);
      
      // Clean up allocated buffers
      buffers.forEach(({ buffer, size }) => {
        try {
          addon.returnScreenshotBuffer(buffer, size);
        } catch (error) {
          // Ignore cleanup errors
        }
      });
      
      // Should have allocated some buffers but hit reasonable limits
      expect(successfulAllocations).to.be.above(0);
      expect(successfulAllocations).to.be.below(maxBuffers); // Should hit limits before allocating all
    });

    it('should handle rapid allocation/deallocation cycles', function() {
      const iterations = 1000;
      const bufferSize = 1024 * 1024; // 1MB
      
      let errors = 0;
      
      for (let i = 0; i < iterations; i++) {
        try {
          const buffer = addon.allocateScreenshotBuffer(bufferSize);
          addon.returnScreenshotBuffer(buffer, bufferSize);
        } catch (error) {
          errors++;
          if (errors > iterations * 0.1) { // More than 10% failure rate
            break; // Stop if too many errors
          }
        }
      }
      
      console.log(`Completed ${iterations - errors} allocation cycles with ${errors} errors`);
      
      // Should complete most cycles successfully
      expect(errors).to.be.below(iterations * 0.05); // Less than 5% error rate
    });
  });

  describe('Thread Safety Validation', function() {
    it('should handle concurrent buffer operations safely', async function() {
      const concurrentOperations = 20;
      const bufferSize = 1024 * 1024;
      
      const operations = Array(concurrentOperations).fill().map(async (_, index) => {
        return new Promise((resolve, reject) => {
          try {
            const buffer = addon.allocateScreenshotBuffer(bufferSize);
            
            // Hold buffer for random time
            setTimeout(() => {
              try {
                addon.returnScreenshotBuffer(buffer, bufferSize);
                resolve(index);
              } catch (error) {
                reject(error);
              }
            }, Math.random() * 100);
            
          } catch (error) {
            reject(error);
          }
        });
      });
      
      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Concurrent operations: ${successful} successful, ${failed} failed`);
      
      // Most operations should succeed
      expect(successful).to.be.above(concurrentOperations * 0.8);
    });

    it('should maintain data integrity under concurrent access', async function() {
      const testData = Buffer.alloc(256 * 256 * 4);
      
      // Fill with test pattern
      for (let i = 0; i < testData.length; i += 4) {
        testData[i] = i % 256;         // R
        testData[i + 1] = (i + 1) % 256; // G  
        testData[i + 2] = (i + 2) % 256; // B
        testData[i + 3] = 255;         // A
      }
      
      const concurrentConversions = 10;
      const conversions = Array(concurrentConversions).fill().map(async (_, index) => {
        try {
          const result = addon.convertBGRAToRGBA(testData, 256, 256);
          
          // Verify first few pixels converted correctly
          const isValid = result[0] === testData[2] && // R should be original B
                         result[1] === testData[1] && // G should be same
                         result[2] === testData[0] && // B should be original R
                         result[3] === testData[3];   // A should be same
          
          return { index, valid: isValid };
        } catch (error) {
          return { index, error: error.message };
        }
      });
      
      const results = await Promise.all(conversions);
      const validResults = results.filter(r => r.valid).length;
      
      console.log(`Concurrent conversions: ${validResults}/${concurrentConversions} valid`);
      
      // All conversions should maintain data integrity
      expect(validResults).to.equal(concurrentConversions);
    });
  });

  describe('Error Recovery and Cleanup', function() {
    it('should recover from errors without resource leaks', function() {
      const initialStats = addon.getMemoryPoolStats();
      
      // Cause various errors
      const errorCauses = [
        () => addon.convertBGRAToRGBA(null, 100, 100),
        () => addon.convertBGRAToRGBA(Buffer.alloc(10), 1000, 1000),
        () => addon.allocateScreenshotBuffer(0),
        () => addon.allocateScreenshotBuffer(-1)
      ];
      
      errorCauses.forEach((causeError, index) => {
        try {
          causeError();
        } catch (error) {
          // Expected
        }
      });
      
      const finalStats = addon.getMemoryPoolStats();
      
      // Memory pool stats should not indicate leaks
      expect(finalStats.totalMemoryAllocated).to.equal(initialStats.totalMemoryAllocated);
    });

    it('should clean up partial operations on failure', function() {
      // Test encoding with invalid parameters after valid start
      const testImage = Buffer.alloc(100 * 100 * 4);
      
      if (addon.encodeWebP) {
        // Start with valid parameters, then invalid
        try {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: 80 });
        } catch (error) {
          // Should not fail with valid params
        }
        
        // Now try invalid parameters
        try {
          addon.encodeWebP(testImage, 100, 100, 400, { quality: -50 });
        } catch (error) {
          // Expected to fail
        }
        
        // System should still work after failure
        try {
          const result = addon.encodeWebP(testImage, 100, 100, 400, { quality: 80 });
          expect(result).to.be.instanceOf(Buffer);
        } catch (error) {
          throw new Error('System not recovered after error: ' + error.message);
        }
      }
    });
  });

  after(function() {
    // Final cleanup
    addon.clearMemoryPool();
    console.log('🔒 Buffer safety tests completed');
  });
});