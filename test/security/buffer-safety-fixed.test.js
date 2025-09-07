const addon = require('../../build/Release/webp_screenshot');

describe('Buffer Safety and Security Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('Buffer Overflow Protection', () => {
        test('should handle buffer size mismatches safely', () => {
            const width = 100;
            const height = 100;
            const expectedSize = width * height * 4;
            
            // Test with undersized buffer
            const smallBuffer = new Uint8Array(expectedSize / 2);
            
            expect(() => {
                addon.encodeWebP(smallBuffer, width, height, width * 4);
            }).toThrow();
        }, 10000);

        test('should validate input parameters', () => {
            const validBuffer = new Uint8Array(100 * 100 * 4);
            
            // Test negative dimensions
            expect(() => {
                addon.encodeWebP(validBuffer, -1, 100, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(validBuffer, 100, -1, 400);
            }).toThrow();
            
            // Test zero dimensions
            expect(() => {
                addon.encodeWebP(validBuffer, 0, 100, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(validBuffer, 100, 0, 400);
            }).toThrow();
        });

        test('should handle null/undefined buffers safely', () => {
            expect(() => {
                addon.encodeWebP(null, 100, 100, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(undefined, 100, 100, 400);
            }).toThrow();
        });
    });

    describe('Memory Boundary Checks', () => {
        test('should not read beyond buffer boundaries', () => {
            const width = 10;
            const height = 10;
            const buffer = new Uint8Array(width * height * 4);
            
            // Fill buffer with test pattern
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = i % 256;
            }
            
            // This should work without reading past buffer end
            expect(() => {
                const result = addon.encodeWebP(buffer, width, height, width * 4);
                expect(result).toBeDefined();
                expect(result.length).toBeGreaterThan(0);
            }).not.toThrow();
        });

        test('should handle maximum reasonable buffer sizes', () => {
            const maxWidth = 4096;
            const maxHeight = 4096;
            const maxBuffer = new Uint8Array(maxWidth * maxHeight * 4);
            
            // This should work with large but reasonable sizes
            expect(() => {
                const result = addon.encodeWebP(maxBuffer, maxWidth, maxHeight, maxWidth * 4, 50);
                expect(result).toBeDefined();
            }).not.toThrow();
        }, 30000);
    });

    describe('Input Validation Security', () => {
        test('should reject malformed parameters', () => {
            const validBuffer = new Uint8Array(100 * 100 * 4);
            
            // Test extremely large dimensions that could cause integer overflow
            expect(() => {
                addon.encodeWebP(validBuffer, Number.MAX_SAFE_INTEGER, 100, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(validBuffer, 100, Number.MAX_SAFE_INTEGER, 400);
            }).toThrow();
        });

        test('should handle invalid stride values', () => {
            const validBuffer = new Uint8Array(100 * 100 * 4);
            
            // Stride smaller than expected
            expect(() => {
                addon.encodeWebP(validBuffer, 100, 100, 100); // Should be 400
            }).toThrow();
            
            // Negative stride
            expect(() => {
                addon.encodeWebP(validBuffer, 100, 100, -400);
            }).toThrow();
        });
    });

    describe('Resource Exhaustion Protection', () => {
        test('should handle multiple rapid allocations', () => {
            const width = 100;
            const height = 100;
            const buffer = new Uint8Array(width * height * 4);
            
            // Perform multiple rapid encodings
            const results = [];
            for (let i = 0; i < 10; i++) {
                const result = addon.encodeWebP(buffer, width, height, width * 4);
                results.push(result);
                expect(result).toBeDefined();
                expect(result.length).toBeGreaterThan(0);
            }
            
            expect(results).toHaveLength(10);
        }, 15000);

        test('should clean up after failed operations', () => {
            const initialMemory = process.memoryUsage();
            
            // Attempt several operations that should fail
            for (let i = 0; i < 5; i++) {
                try {
                    addon.encodeWebP(null, 100, 100, 400);
                } catch (error) {
                    // Expected to fail
                    expect(error).toBeDefined();
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            
            // Should not have significant memory growth from failed operations
            expect(heapGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
        });
    });
});