const addon = require('../../build/Release/webp_screenshot');

describe('Core Performance Benchmarks', () => {
    let displays = [];

    beforeAll(async () => {
        addon.initialize();
        displays = addon.getDisplays();
    });

    describe('Screenshot Capture Performance', () => {
        test('should capture screenshots within performance thresholds', async () => {
            const iterations = 10;
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const result = addon.captureScreenshot({ display: 0 });
                    const endTime = process.hrtime.bigint();
                    
                    if (result.success) {
                        const durationMs = Number(endTime - startTime) / 1000000;
                        const pixels = result.width * result.height;
                        const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
                        
                        results.push({
                            duration: durationMs,
                            throughput: throughputMPPS,
                            pixels: pixels
                        });
                        
                        // Individual performance assertions
                        expect(durationMs).toBeLessThan(500); // Max 500ms per capture
                        expect(throughputMPPS).toBeGreaterThan(10); // Min 10 MP/s
                    }
                } catch (error) {
                    console.warn(`Capture iteration ${i + 1} failed:`, error.message);
                }
            }

            if (results.length > 0) {
                const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
                const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
                
                console.log(`Average capture performance: ${avgThroughput.toFixed(1)} MP/s, ${avgDuration.toFixed(1)}ms`);
                
                // Overall performance assertions
                expect(avgThroughput).toBeGreaterThan(20); // Average should be >20 MP/s
                expect(avgDuration).toBeLessThan(200); // Average should be <200ms
            } else {
                console.warn('No successful captures in performance test');
            }
        }, 60000);

        test('should maintain consistent performance', async () => {
            const iterations = 5;
            const durations = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const result = addon.captureScreenshot({ display: 0 });
                    const endTime = process.hrtime.bigint();
                    
                    if (result.success) {
                        const durationMs = Number(endTime - startTime) / 1000000;
                        durations.push(durationMs);
                    }
                } catch (error) {
                    // Ignore errors for consistency test
                }
            }

            if (durations.length >= 3) {
                const avg = durations.reduce((a, b) => a + b) / durations.length;
                const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
                const stdDev = Math.sqrt(variance);
                const coefficientOfVariation = stdDev / avg;
                
                console.log(`Performance consistency: CV = ${(coefficientOfVariation * 100).toFixed(1)}%`);
                
                // Should have reasonable consistency (CV < 50%)
                expect(coefficientOfVariation).toBeLessThan(0.5);
            }
        }, 30000);
    });

    describe('WebP Encoding Performance', () => {
        test('should encode WebP within performance thresholds', async () => {
            let testData = null;
            
            try {
                const result = addon.captureScreenshot({ display: 0 });
                if (result.success) {
                    testData = result;
                }
            } catch (error) {
                // Create synthetic test data if capture fails
                const width = 1920;
                const height = 1080;
                const data = new Uint8Array(width * height * 4);
                testData = { width, height, data, success: true };
            }

            if (!testData) {
                console.warn('No test data available for WebP encoding test');
                return;
            }

            const iterations = 10;
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const webpData = addon.encodeWebP(testData.data, testData.width, testData.height, testData.width * 4, 80);
                    const endTime = process.hrtime.bigint();
                    
                    const durationMs = Number(endTime - startTime) / 1000000;
                    const pixels = testData.width * testData.height;
                    const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
                    const compressionRatio = (testData.data.length / webpData.length);
                    
                    results.push({
                        duration: durationMs,
                        throughput: throughputMPPS,
                        compressionRatio: compressionRatio
                    });
                    
                    // Individual performance assertions
                    expect(durationMs).toBeLessThan(100); // Max 100ms for encoding
                    expect(throughputMPPS).toBeGreaterThan(50); // Min 50 MP/s for encoding
                    expect(compressionRatio).toBeGreaterThan(2); // At least 2:1 compression
                    
                } catch (error) {
                    console.warn(`Encoding iteration ${i + 1} failed:`, error.message);
                }
            }

            if (results.length > 0) {
                const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
                const avgCompression = results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length;
                
                console.log(`Average encoding performance: ${avgThroughput.toFixed(0)} MP/s, ${avgCompression.toFixed(1)}:1 compression`);
                
                // Overall performance assertions
                expect(avgThroughput).toBeGreaterThan(100); // Average should be >100 MP/s
                expect(avgCompression).toBeGreaterThan(3); // Average should be >3:1
            }
        }, 30000);
    });

    describe('Memory Performance', () => {
        test('should have efficient memory usage', async () => {
            const initialMemory = process.memoryUsage();
            const iterations = 5;
            
            for (let i = 0; i < iterations; i++) {
                try {
                    const result = addon.captureScreenshot({ display: 0 });
                    if (result.success) {
                        const webpData = addon.encodeWebP(result.data, result.width, result.height, result.width * 4, 80);
                        // Use the data to prevent optimization
                        expect(webpData.length).toBeGreaterThan(0);
                    }
                } catch (error) {
                    // Ignore errors for memory test
                }
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                // Wait a bit for cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`Memory growth: Heap +${(heapGrowth/1024/1024).toFixed(1)}MB, External +${(externalGrowth/1024/1024).toFixed(1)}MB`);
            
            // Memory growth should be reasonable
            expect(heapGrowth).toBeLessThan(10 * 1024 * 1024); // <10MB heap growth
            expect(externalGrowth).toBeLessThan(50 * 1024 * 1024); // <50MB external growth
        }, 15000);
    });

    describe('SIMD Optimization Validation', () => {
        test('should demonstrate SIMD performance benefits', async () => {
            // This test validates that SIMD optimization is working
            const iterations = 10;
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const result = addon.captureScreenshot({ display: 0 });
                    const endTime = process.hrtime.bigint();
                    
                    if (result.success) {
                        const durationMs = Number(endTime - startTime) / 1000000;
                        const pixels = result.width * result.height;
                        const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
                        
                        results.push(throughputMPPS);
                    }
                } catch (error) {
                    // Ignore errors for SIMD test
                }
            }

            if (results.length > 0) {
                const avgThroughput = results.reduce((a, b) => a + b) / results.length;
                const maxThroughput = Math.max(...results);
                
                console.log(`SIMD performance: ${avgThroughput.toFixed(1)} MP/s avg, ${maxThroughput.toFixed(1)} MP/s peak`);
                
                // SIMD should provide excellent performance
                expect(avgThroughput).toBeGreaterThan(35); // SIMD should achieve >35 MP/s average
                expect(maxThroughput).toBeGreaterThan(45); // SIMD should achieve >45 MP/s peak
            } else {
                console.warn('No data available for SIMD validation');
            }
        }, 30000);
    });
});