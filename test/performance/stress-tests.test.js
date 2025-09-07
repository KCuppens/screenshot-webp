const addon = require('../../build/Release/webp_screenshot');

describe('Extended Performance Stress Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('High-Load Stress Tests', () => {
        test('should handle rapid consecutive captures (burst mode)', async () => {
            const burstCount = 50;
            const maxBurstTime = 100; // Max time between captures in ms
            const results = [];
            
            console.log(`Starting burst capture test: ${burstCount} captures`);
            
            for (let i = 0; i < burstCount; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const captureTime = Number(process.hrtime.bigint() - startTime) / 1000000;
                        results.push({
                            index: i,
                            captureTime: captureTime,
                            width: screenshot.width,
                            height: screenshot.height,
                            dataSize: screenshot.data.length
                        });
                        
                        // Verify data consistency
                        expect(screenshot.data.length).toBe(screenshot.width * screenshot.height * 4);
                    }
                } catch (error) {
                    console.warn(`Burst capture ${i} failed:`, error.message);
                }
            }
            
            expect(results.length).toBeGreaterThan(burstCount * 0.8); // 80% success rate minimum
            
            if (results.length > 0) {
                const avgCaptureTime = results.reduce((sum, r) => sum + r.captureTime, 0) / results.length;
                const maxCaptureTime = Math.max(...results.map(r => r.captureTime));
                const minCaptureTime = Math.min(...results.map(r => r.captureTime));
                
                console.log(`Burst test results: ${results.length}/${burstCount} successful`);
                console.log(`Average capture time: ${avgCaptureTime.toFixed(2)}ms`);
                console.log(`Min/Max capture time: ${minCaptureTime.toFixed(2)}ms / ${maxCaptureTime.toFixed(2)}ms`);
                
                // Performance expectations for burst mode
                expect(avgCaptureTime).toBeLessThan(maxBurstTime);
                expect(maxCaptureTime).toBeLessThan(maxBurstTime * 3); // Allow some outliers
            }
        }, 60000);

        test('should handle extended duration capture (endurance test)', async () => {
            const testDuration = 30000; // 30 seconds
            const captureInterval = 500; // 500ms between captures
            const startTime = Date.now();
            
            let captureCount = 0;
            let successfulCaptures = 0;
            let totalDataProcessed = 0;
            const performanceMetrics = [];
            
            console.log(`Starting endurance test: ${testDuration}ms duration`);
            
            while (Date.now() - startTime < testDuration) {
                captureCount++;
                const iterationStart = Date.now();
                
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            75
                        );
                        
                        const iterationTime = Date.now() - iterationStart;
                        const pixels = screenshot.width * screenshot.height;
                        const throughput = (pixels / 1000000) / (iterationTime / 1000);
                        
                        successfulCaptures++;
                        totalDataProcessed += screenshot.data.length;
                        
                        performanceMetrics.push({
                            iteration: captureCount,
                            time: iterationTime,
                            throughput: throughput,
                            compressionRatio: screenshot.data.length / webpData.length
                        });
                        
                        // Verify WebP output
                        expect(webpData.length).toBeGreaterThan(0);
                        expect(webpData.length).toBeLessThan(screenshot.data.length);
                    }
                } catch (error) {
                    console.warn(`Endurance capture ${captureCount} failed:`, error.message);
                }
                
                // Maintain capture interval
                const elapsed = Date.now() - iterationStart;
                if (elapsed < captureInterval) {
                    await new Promise(resolve => setTimeout(resolve, captureInterval - elapsed));
                }
            }
            
            // Analyze endurance performance
            const successRate = successfulCaptures / captureCount;
            const avgThroughput = performanceMetrics.length > 0 
                ? performanceMetrics.reduce((sum, m) => sum + m.throughput, 0) / performanceMetrics.length
                : 0;
            
            console.log(`Endurance test completed: ${successfulCaptures}/${captureCount} captures successful (${(successRate * 100).toFixed(1)}%)`);
            console.log(`Total data processed: ${(totalDataProcessed / 1024 / 1024).toFixed(1)} MB`);
            console.log(`Average throughput: ${avgThroughput.toFixed(1)} MP/s`);
            
            // Endurance test expectations
            expect(successRate).toBeGreaterThan(0.7); // 70% success rate minimum
            if (avgThroughput > 0) {
                expect(avgThroughput).toBeGreaterThan(10); // Maintain reasonable throughput
            }
        }, 45000);

        test('should handle memory pressure scenarios', async () => {
            const initialMemory = process.memoryUsage();
            const largeAllocationTest = 100; // Number of large captures to test
            let allocatedBuffers = [];
            
            console.log(`Starting memory pressure test with ${largeAllocationTest} large allocations`);
            
            for (let i = 0; i < largeAllocationTest; i++) {
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        // Keep some buffers in memory to create pressure
                        if (i % 10 === 0) {
                            allocatedBuffers.push({
                                iteration: i,
                                data: new Uint8Array(screenshot.data),
                                size: screenshot.data.length
                            });
                        }
                        
                        // Encode to WebP to test full pipeline under pressure
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            60
                        );
                        
                        expect(webpData.length).toBeGreaterThan(0);
                    }
                } catch (error) {
                    console.warn(`Memory pressure test iteration ${i} failed:`, error.message);
                    // Should not fail due to memory pressure in normal scenarios
                    expect(error.message).not.toMatch(/out of memory/i);
                }
                
                // Check memory usage periodically
                if (i % 20 === 0) {
                    const currentMemory = process.memoryUsage();
                    const heapGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
                    
                    // Memory growth should be reasonable
                    expect(heapGrowth).toBeLessThan(200 * 1024 * 1024); // <200MB growth
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalMemory = process.memoryUsage();
            const totalHeapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const totalExternalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`Memory pressure test completed:`);
            console.log(`  Buffers allocated: ${allocatedBuffers.length}`);
            console.log(`  Heap growth: ${(totalHeapGrowth / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  External growth: ${(totalExternalGrowth / 1024 / 1024).toFixed(1)} MB`);
            
            // Memory should be manageable even under pressure
            expect(totalHeapGrowth).toBeLessThan(150 * 1024 * 1024); // <150MB final growth
            
            // Clean up allocated buffers
            allocatedBuffers = null;
        }, 60000);
    });

    describe('Performance Consistency Tests', () => {
        test('should maintain consistent performance across multiple sessions', async () => {
            const sessionCount = 5;
            const capturesPerSession = 10;
            const sessionResults = [];
            
            for (let session = 0; session < sessionCount; session++) {
                const sessionStart = Date.now();
                const captures = [];
                
                for (let capture = 0; capture < capturesPerSession; capture++) {
                    try {
                        const startTime = process.hrtime.bigint();
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                80
                            );
                            
                            const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
                            const pixels = screenshot.width * screenshot.height;
                            const throughput = (pixels / 1000000) / (totalTime / 1000);
                            
                            captures.push({
                                totalTime: totalTime,
                                throughput: throughput,
                                compressionRatio: screenshot.data.length / webpData.length
                            });
                        }
                    } catch (error) {
                        console.warn(`Session ${session}, capture ${capture} failed:`, error.message);
                    }
                }
                
                if (captures.length > 0) {
                    const avgThroughput = captures.reduce((sum, c) => sum + c.throughput, 0) / captures.length;
                    const avgTime = captures.reduce((sum, c) => sum + c.totalTime, 0) / captures.length;
                    const avgCompression = captures.reduce((sum, c) => sum + c.compressionRatio, 0) / captures.length;
                    
                    sessionResults.push({
                        session: session,
                        successfulCaptures: captures.length,
                        avgThroughput: avgThroughput,
                        avgTime: avgTime,
                        avgCompression: avgCompression,
                        sessionDuration: Date.now() - sessionStart
                    });
                }
                
                // Brief pause between sessions
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            expect(sessionResults.length).toBeGreaterThan(sessionCount * 0.8); // 80% of sessions should succeed
            
            if (sessionResults.length > 1) {
                const throughputs = sessionResults.map(s => s.avgThroughput);
                const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;
                const minThroughput = Math.min(...throughputs);
                const maxThroughput = Math.max(...throughputs);
                const variation = (maxThroughput - minThroughput) / avgThroughput;
                
                console.log(`Session consistency test:`);
                console.log(`  Sessions completed: ${sessionResults.length}/${sessionCount}`);
                console.log(`  Average throughput: ${avgThroughput.toFixed(1)} MP/s`);
                console.log(`  Throughput range: ${minThroughput.toFixed(1)} - ${maxThroughput.toFixed(1)} MP/s`);
                console.log(`  Performance variation: ${(variation * 100).toFixed(1)}%`);
                
                // Performance should be consistent across sessions
                expect(variation).toBeLessThan(0.3); // <30% variation
                expect(avgThroughput).toBeGreaterThan(15); // Maintain good performance
            }
        }, 90000);

        test('should handle varying display resolutions efficiently', async () => {
            const displays = addon.getDisplays();
            const resolutionTests = [];
            
            // Test different virtual resolutions if only one display
            const testResolutions = displays.length > 1 ? 
                displays.map((d, i) => ({ display: i, width: d.width, height: d.height })) :
                [
                    { display: 0, width: displays[0].width, height: displays[0].height },
                    // Could add virtual resolution tests here if needed
                ];
            
            for (const testRes of testResolutions) {
                try {
                    const iterations = 5;
                    const results = [];
                    
                    for (let i = 0; i < iterations; i++) {
                        const startTime = process.hrtime.bigint();
                        const screenshot = addon.captureScreenshot({ display: testRes.display });
                        
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                75
                            );
                            
                            const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
                            const pixels = screenshot.width * screenshot.height;
                            const throughput = (pixels / 1000000) / (totalTime / 1000);
                            
                            results.push({
                                width: screenshot.width,
                                height: screenshot.height,
                                totalTime: totalTime,
                                throughput: throughput,
                                pixelCount: pixels,
                                webpSize: webpData.length,
                                compressionRatio: screenshot.data.length / webpData.length
                            });
                        }
                    }
                    
                    if (results.length > 0) {
                        const avgResult = {
                            display: testRes.display,
                            width: results[0].width,
                            height: results[0].height,
                            avgThroughput: results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
                            avgTime: results.reduce((sum, r) => sum + r.totalTime, 0) / results.length,
                            avgCompression: results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length,
                            pixelCount: results[0].pixelCount
                        };
                        
                        resolutionTests.push(avgResult);
                        
                        console.log(`Resolution test ${testRes.display}: ${avgResult.width}x${avgResult.height} - ${avgResult.avgThroughput.toFixed(1)} MP/s`);
                    }
                } catch (error) {
                    console.warn(`Resolution test for display ${testRes.display} failed:`, error.message);
                }
            }
            
            expect(resolutionTests.length).toBeGreaterThan(0);
            
            // All resolutions should achieve reasonable performance
            resolutionTests.forEach(test => {
                expect(test.avgThroughput).toBeGreaterThan(10); // >10 MP/s minimum
                expect(test.avgTime).toBeLessThan(200); // <200ms total time
                expect(test.avgCompression).toBeGreaterThan(2); // >2:1 compression
            });
            
            // Performance scaling should be reasonable for different resolutions
            if (resolutionTests.length > 1) {
                const throughputPerPixel = resolutionTests.map(t => t.avgThroughput / (t.pixelCount / 1000000));
                const avgThroughputPerPixel = throughputPerPixel.reduce((a, b) => a + b) / throughputPerPixel.length;
                const maxVariation = Math.max(...throughputPerPixel) - Math.min(...throughputPerPixel);
                const variationPercent = maxVariation / avgThroughputPerPixel;
                
                console.log(`Throughput per megapixel variation: ${(variationPercent * 100).toFixed(1)}%`);
                expect(variationPercent).toBeLessThan(0.5); // <50% variation in efficiency
            }
        }, 60000);
    });
});