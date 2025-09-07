const addon = require('../../build/Release/webp_screenshot');

describe('Streaming Pipeline Integration Tests', () => {
    let displays = [];

    beforeAll(() => {
        addon.initialize();
        displays = addon.getDisplays();
    });

    describe('Continuous Capture Pipeline', () => {
        test('should handle continuous screenshot capture', async () => {
            const captureCount = 10;
            const results = [];
            const interval = 100; // 100ms between captures
            
            for (let i = 0; i < captureCount; i++) {
                try {
                    const startTime = Date.now();
                    const result = addon.captureScreenshot({ display: 0 });
                    const endTime = Date.now();
                    
                    if (result.success) {
                        results.push({
                            index: i,
                            width: result.width,
                            height: result.height,
                            dataSize: result.data.length,
                            captureTime: endTime - startTime
                        });
                    }
                } catch (error) {
                    console.warn(`Capture ${i} failed:`, error.message);
                }
                
                // Wait before next capture
                if (i < captureCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, interval));
                }
            }
            
            expect(results.length).toBeGreaterThan(captureCount / 2); // At least 50% success rate
            
            if (results.length > 0) {
                // Validate consistency
                const firstResult = results[0];
                results.forEach(result => {
                    expect(result.width).toBe(firstResult.width);
                    expect(result.height).toBe(firstResult.height);
                    expect(result.dataSize).toBe(firstResult.dataSize);
                    expect(result.captureTime).toBeLessThan(500); // Max 500ms per capture
                });
                
                console.log(`Streaming test: ${results.length}/${captureCount} captures successful`);
                console.log(`Average capture time: ${results.reduce((sum, r) => sum + r.captureTime, 0) / results.length}ms`);
            }
        }, 60000);

        test('should maintain performance under load', async () => {
            const batchSize = 5;
            const batchCount = 3;
            const allResults = [];
            
            for (let batch = 0; batch < batchCount; batch++) {
                const batchResults = [];
                const batchStartTime = Date.now();
                
                // Capture batch
                for (let i = 0; i < batchSize; i++) {
                    try {
                        const result = addon.captureScreenshot({ display: 0 });
                        if (result.success) {
                            batchResults.push(result);
                        }
                    } catch (error) {
                        console.warn(`Batch ${batch}, capture ${i} failed:`, error.message);
                    }
                }
                
                const batchTime = Date.now() - batchStartTime;
                const batchThroughput = batchResults.length / (batchTime / 1000);
                
                allResults.push({
                    batch: batch,
                    captures: batchResults.length,
                    time: batchTime,
                    throughput: batchThroughput
                });
                
                console.log(`Batch ${batch}: ${batchResults.length}/${batchSize} captures in ${batchTime}ms (${batchThroughput.toFixed(1)} captures/sec)`);
                
                // Brief pause between batches
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Performance should remain consistent across batches
            const throughputs = allResults.map(r => r.throughput).filter(t => t > 0);
            if (throughputs.length > 1) {
                const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;
                const maxVariation = Math.max(...throughputs) - Math.min(...throughputs);
                const variationPercent = maxVariation / avgThroughput;
                
                console.log(`Throughput consistency: ${(variationPercent * 100).toFixed(1)}% variation`);
                expect(variationPercent).toBeLessThan(0.5); // Less than 50% variation
            }
        }, 45000);
    });

    describe('Real-time Encoding Pipeline', () => {
        test('should encode captures in real-time', async () => {
            const frameCount = 5;
            const targetFPS = 10; // 10 FPS target
            const frameInterval = 1000 / targetFPS;
            
            const pipeline = [];
            
            for (let frame = 0; frame < frameCount; frame++) {
                const frameStart = Date.now();
                
                try {
                    // Capture
                    const captureStart = Date.now();
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    const captureTime = Date.now() - captureStart;
                    
                    if (screenshot.success) {
                        // Encode
                        const encodeStart = Date.now();
                        const webpData = addon.encodeWebP(screenshot.data, screenshot.width, screenshot.height, screenshot.width * 4, 60);
                        const encodeTime = Date.now() - encodeStart;
                        
                        const totalTime = Date.now() - frameStart;
                        
                        pipeline.push({
                            frame: frame,
                            captureTime: captureTime,
                            encodeTime: encodeTime,
                            totalTime: totalTime,
                            dataSize: webpData.length,
                            compressionRatio: screenshot.data.length / webpData.length
                        });
                        
                        // Check if we can maintain target FPS
                        expect(totalTime).toBeLessThan(frameInterval); // Should complete within frame budget
                    }
                } catch (error) {
                    console.warn(`Frame ${frame} failed:`, error.message);
                }
                
                // Wait for next frame
                const elapsed = Date.now() - frameStart;
                if (elapsed < frameInterval) {
                    await new Promise(resolve => setTimeout(resolve, frameInterval - elapsed));
                }
            }
            
            expect(pipeline.length).toBeGreaterThan(frameCount / 2);
            
            if (pipeline.length > 0) {
                const avgCaptureTime = pipeline.reduce((sum, p) => sum + p.captureTime, 0) / pipeline.length;
                const avgEncodeTime = pipeline.reduce((sum, p) => sum + p.encodeTime, 0) / pipeline.length;
                const avgTotalTime = pipeline.reduce((sum, p) => sum + p.totalTime, 0) / pipeline.length;
                const avgCompression = pipeline.reduce((sum, p) => sum + p.compressionRatio, 0) / pipeline.length;
                
                console.log(`Real-time pipeline performance:`);
                console.log(`  Capture: ${avgCaptureTime.toFixed(1)}ms avg`);
                console.log(`  Encode: ${avgEncodeTime.toFixed(1)}ms avg`);
                console.log(`  Total: ${avgTotalTime.toFixed(1)}ms avg`);
                console.log(`  Compression: ${avgCompression.toFixed(1)}:1 avg`);
                console.log(`  Achievable FPS: ${(1000 / avgTotalTime).toFixed(1)}`);
                
                // Real-time performance expectations
                expect(avgTotalTime).toBeLessThan(100); // Should complete in <100ms for real-time
                expect(avgCompression).toBeGreaterThan(2); // Should achieve at least 2:1 compression
            }
        }, 30000);
    });

    describe('Memory Management in Pipeline', () => {
        test('should manage memory efficiently during streaming', async () => {
            const initialMemory = process.memoryUsage();
            const streamDuration = 5000; // 5 seconds
            const frameInterval = 200; // 5 FPS
            const startTime = Date.now();
            
            let frameCount = 0;
            let successfulFrames = 0;
            
            while (Date.now() - startTime < streamDuration) {
                frameCount++;
                
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const webpData = addon.encodeWebP(screenshot.data, screenshot.width, screenshot.height, screenshot.width * 4, 70);
                        expect(webpData.length).toBeGreaterThan(0);
                        successfulFrames++;
                    }
                } catch (error) {
                    // Ignore individual frame failures
                }
                
                // Trigger GC periodically if available
                if (frameCount % 10 === 0 && global.gc) {
                    global.gc();
                }
                
                await new Promise(resolve => setTimeout(resolve, frameInterval));
            }
            
            // Final GC
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`Streaming memory test: ${successfulFrames}/${frameCount} frames successful`);
            console.log(`Memory growth: Heap +${(heapGrowth/1024/1024).toFixed(1)}MB, External +${(externalGrowth/1024/1024).toFixed(1)}MB`);
            
            // Memory should not grow excessively
            expect(heapGrowth).toBeLessThan(50 * 1024 * 1024); // <50MB heap growth
            expect(externalGrowth).toBeLessThan(100 * 1024 * 1024); // <100MB external growth
            expect(successfulFrames).toBeGreaterThan(frameCount / 3); // At least 33% success rate
        }, 30000);
    });

    describe('Error Recovery in Pipeline', () => {
        test('should recover from individual frame failures', async () => {
            const testDuration = 3000; // 3 seconds
            const frameInterval = 150; // ~6.7 FPS
            const startTime = Date.now();
            
            let totalFrames = 0;
            let successfulFrames = 0;
            let errorFrames = 0;
            let consecutiveErrors = 0;
            let maxConsecutiveErrors = 0;
            
            while (Date.now() - startTime < testDuration) {
                totalFrames++;
                
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const webpData = addon.encodeWebP(screenshot.data, screenshot.width, screenshot.height, screenshot.width * 4, 75);
                        expect(webpData.length).toBeGreaterThan(0);
                        successfulFrames++;
                        consecutiveErrors = 0; // Reset error counter
                    } else {
                        throw new Error('Capture failed');
                    }
                } catch (error) {
                    errorFrames++;
                    consecutiveErrors++;
                    maxConsecutiveErrors = Math.max(maxConsecutiveErrors, consecutiveErrors);
                    
                    // Should not have too many consecutive errors
                    expect(consecutiveErrors).toBeLessThan(10);
                }
                
                await new Promise(resolve => setTimeout(resolve, frameInterval));
            }
            
            const successRate = successfulFrames / totalFrames;
            
            console.log(`Error recovery test: ${successfulFrames}/${totalFrames} frames successful (${(successRate * 100).toFixed(1)}%)`);
            console.log(`Max consecutive errors: ${maxConsecutiveErrors}`);
            
            // Should maintain reasonable success rate and recover from errors
            expect(successRate).toBeGreaterThan(0.1); // At least 10% success rate
            expect(maxConsecutiveErrors).toBeLessThan(totalFrames / 2); // Should recover relatively quickly
        }, 15000);
    });
});