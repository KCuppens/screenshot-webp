const addon = require('../../build/Release/webp_screenshot');

describe('Memory Leak and Resource Cleanup Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('Memory Leak Detection', () => {
        test('should not leak memory during repeated screenshot captures', async () => {
            // Force GC if available
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const initialMemory = process.memoryUsage();
            const iterations = 100;
            const memoryCheckInterval = 20;
            const memorySnapshots = [];
            
            console.log(`Starting memory leak test: ${iterations} screenshot captures`);
            console.log(`Initial memory - Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(1)} MB, External: ${(initialMemory.external / 1024 / 1024).toFixed(1)} MB`);
            
            for (let i = 0; i < iterations; i++) {
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    
                    if (screenshot.success) {
                        // Verify data is accessible
                        expect(screenshot.data.length).toBe(screenshot.width * screenshot.height * 4);
                        
                        // Check a few pixels to ensure data is valid
                        const pixelCount = Math.min(100, screenshot.data.length / 4);
                        for (let p = 0; p < pixelCount; p++) {
                            const idx = p * 4;
                            expect(screenshot.data[idx + 3]).toBe(255); // Alpha should be opaque
                        }
                    }
                } catch (error) {
                    console.warn(`Screenshot ${i} failed: ${error.message}`);
                }
                
                // Take memory snapshot periodically
                if (i % memoryCheckInterval === 0) {
                    const currentMemory = process.memoryUsage();
                    memorySnapshots.push({
                        iteration: i,
                        heapUsed: currentMemory.heapUsed,
                        external: currentMemory.external,
                        heapTotal: currentMemory.heapTotal,
                        rss: currentMemory.rss
                    });
                }
                
                // Force GC periodically if available
                if (i % 25 === 0 && global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            // Final GC and measurement
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`Final memory - Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(1)} MB, External: ${(finalMemory.external / 1024 / 1024).toFixed(1)} MB`);
            console.log(`Memory growth - Heap: ${(heapGrowth / 1024 / 1024).toFixed(1)} MB, External: ${(externalGrowth / 1024 / 1024).toFixed(1)} MB`);
            
            // Analyze memory trend
            if (memorySnapshots.length > 2) {
                const firstSnapshot = memorySnapshots[1]; // Skip first as it might be initialization
                const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
                
                const heapTrend = (lastSnapshot.heapUsed - firstSnapshot.heapUsed) / (lastSnapshot.iteration - firstSnapshot.iteration);
                const externalTrend = (lastSnapshot.external - firstSnapshot.external) / (lastSnapshot.iteration - firstSnapshot.iteration);
                
                console.log(`Memory trends - Heap: ${(heapTrend / 1024).toFixed(1)} KB/iteration, External: ${(externalTrend / 1024).toFixed(1)} KB/iteration`);
                
                // Memory growth should be minimal
                expect(Math.abs(heapTrend)).toBeLessThan(50 * 1024); // <50KB per iteration trend
                expect(Math.abs(externalTrend)).toBeLessThan(100 * 1024); // <100KB per iteration trend
            }
            
            // Total memory growth should be reasonable
            expect(heapGrowth).toBeLessThan(20 * 1024 * 1024); // <20MB heap growth
            expect(externalGrowth).toBeLessThan(50 * 1024 * 1024); // <50MB external growth
            
            console.log(`Memory leak test completed: ${heapGrowth > 5 * 1024 * 1024 ? 'POTENTIAL LEAK DETECTED' : 'NO SIGNIFICANT LEAKS'}`);
        }, 45000);

        test('should not leak memory during repeated WebP encoding operations', async () => {
            // Get a screenshot to use for encoding tests
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            // Force GC if available
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const initialMemory = process.memoryUsage();
            const iterations = 150;
            const qualities = [30, 50, 70, 90]; // Vary quality to test different code paths
            let successfulEncodings = 0;
            
            console.log(`Starting WebP encoding memory test: ${iterations} encoding operations`);
            console.log(`Test image: ${screenshot.width}x${screenshot.height}`);
            
            for (let i = 0; i < iterations; i++) {
                const quality = qualities[i % qualities.length];
                
                try {
                    const webpData = addon.encodeWebP(
                        screenshot.data,
                        screenshot.width,
                        screenshot.height,
                        screenshot.width * 4,
                        quality
                    );
                    
                    expect(webpData.length).toBeGreaterThan(0);
                    expect(webpData.length).toBeLessThan(screenshot.data.length); // Should be compressed
                    successfulEncodings++;
                    
                    // Verify WebP header
                    expect(webpData[0]).toBe(0x52); // 'R'
                    expect(webpData[8]).toBe(0x57); // 'W'
                    
                } catch (error) {
                    console.warn(`Encoding ${i} (quality ${quality}) failed: ${error.message}`);
                }
                
                // Force GC periodically if available
                if (i % 30 === 0 && global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
            
            // Final GC and measurement
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`WebP encoding memory test results:`);
            console.log(`  Successful encodings: ${successfulEncodings}/${iterations}`);
            console.log(`  Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  External growth: ${(externalGrowth / 1024 / 1024).toFixed(1)} MB`);
            
            // Most encodings should succeed
            expect(successfulEncodings).toBeGreaterThan(iterations * 0.95);
            
            // Memory growth should be minimal for encoding operations
            expect(heapGrowth).toBeLessThan(15 * 1024 * 1024); // <15MB heap growth
            expect(externalGrowth).toBeLessThan(30 * 1024 * 1024); // <30MB external growth
        }, 30000);

        test('should handle mixed capture and encoding operations without memory leaks', async () => {
            // Force GC if available
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const initialMemory = process.memoryUsage();
            const iterations = 80;
            let captureCount = 0;
            let encodeCount = 0;
            
            console.log(`Starting mixed operations memory test: ${iterations} mixed operations`);
            
            for (let i = 0; i < iterations; i++) {
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    
                    if (screenshot.success) {
                        captureCount++;
                        
                        // Every other successful capture, encode it
                        if (i % 2 === 0) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                60
                            );
                            
                            expect(webpData.length).toBeGreaterThan(0);
                            encodeCount++;
                        }
                        
                        // Verify data integrity occasionally
                        if (i % 10 === 0) {
                            expect(screenshot.data.length).toBe(screenshot.width * screenshot.height * 4);
                            
                            // Check some pixels
                            for (let p = 0; p < 10; p++) {
                                const idx = p * 4;
                                if (idx + 3 < screenshot.data.length) {
                                    expect(screenshot.data[idx + 3]).toBe(255); // Alpha
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Mixed operation ${i} failed: ${error.message}`);
                }
                
                // Force GC periodically if available
                if (i % 20 === 0 && global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            // Final GC and measurement
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = finalMemory.external - initialMemory.external;
            
            console.log(`Mixed operations memory test results:`);
            console.log(`  Captures: ${captureCount}/${iterations}`);
            console.log(`  Encodings: ${encodeCount}`);
            console.log(`  Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  External growth: ${(externalGrowth / 1024 / 1024).toFixed(1)} MB`);
            
            // Should have good success rates
            expect(captureCount).toBeGreaterThan(iterations * 0.8);
            expect(encodeCount).toBeGreaterThan(captureCount * 0.4); // About half should be encoded
            
            // Memory growth should be reasonable
            expect(heapGrowth).toBeLessThan(25 * 1024 * 1024); // <25MB heap growth
            expect(externalGrowth).toBeLessThan(60 * 1024 * 1024); // <60MB external growth
        }, 40000);
    });

    describe('Resource Cleanup Validation', () => {
        test('should properly clean up after failed operations', async () => {
            const initialMemory = process.memoryUsage();
            const failureOperations = 50;
            let expectedFailures = 0;
            
            console.log('Testing resource cleanup after failures...');
            
            for (let i = 0; i < failureOperations; i++) {
                try {
                    // Intentionally cause different types of failures
                    if (i % 3 === 0) {
                        addon.captureScreenshot({ display: 999 }); // Invalid display
                    } else if (i % 3 === 1) {
                        addon.encodeWebP(new Uint8Array(100), 0, 100, 400, 80); // Invalid width
                    } else {
                        addon.encodeWebP(null, 100, 100, 400, 80); // Null buffer
                    }
                } catch (error) {
                    expectedFailures++;
                    // Failures are expected - check that we get reasonable error messages
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message.length).toBeGreaterThan(0);
                }
                
                // Force GC periodically
                if (i % 15 === 0 && global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
            
            // Final GC
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const postFailureMemory = process.memoryUsage();
            const heapGrowth = postFailureMemory.heapUsed - initialMemory.heapUsed;
            const externalGrowth = postFailureMemory.external - initialMemory.external;
            
            console.log(`Failure cleanup test results:`);
            console.log(`  Expected failures: ${expectedFailures}/${failureOperations}`);
            console.log(`  Heap growth after failures: ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  External growth after failures: ${(externalGrowth / 1024 / 1024).toFixed(1)} MB`);
            
            // All operations should fail as expected
            expect(expectedFailures).toBe(failureOperations);
            
            // Memory growth should be minimal even after many failures
            expect(heapGrowth).toBeLessThan(10 * 1024 * 1024); // <10MB heap growth
            expect(Math.abs(externalGrowth)).toBeLessThan(5 * 1024 * 1024); // <5MB external change
            
            // After failures, normal operations should still work
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const webpData = addon.encodeWebP(
                screenshot.data,
                screenshot.width,
                screenshot.height,
                screenshot.width * 4,
                75
            );
            expect(webpData.length).toBeGreaterThan(0);
            
            console.log('Normal operations work correctly after failures');
        }, 20000);

        test('should handle rapid allocation and deallocation cycles', async () => {
            const cycles = 30;
            const operationsPerCycle = 5;
            const memorySnapshots = [];
            
            console.log(`Testing rapid allocation/deallocation: ${cycles} cycles`);
            
            for (let cycle = 0; cycle < cycles; cycle++) {
                // Take memory snapshot before cycle
                if (global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                const beforeMemory = process.memoryUsage();
                
                // Perform operations in this cycle
                const cycleDatas = [];
                for (let op = 0; op < operationsPerCycle; op++) {
                    try {
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                65
                            );
                            cycleDatas.push({ screenshot: screenshot, webp: webpData });
                        }
                    } catch (error) {
                        console.warn(`Cycle ${cycle}, operation ${op} failed: ${error.message}`);
                    }
                }
                
                // Clear cycle data to trigger cleanup
                cycleDatas.length = 0;
                
                // Force GC to clean up
                if (global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                const afterMemory = process.memoryUsage();
                memorySnapshots.push({
                    cycle: cycle,
                    beforeHeap: beforeMemory.heapUsed,
                    afterHeap: afterMemory.heapUsed,
                    beforeExternal: beforeMemory.external,
                    afterExternal: afterMemory.external,
                    heapDelta: afterMemory.heapUsed - beforeMemory.heapUsed,
                    externalDelta: afterMemory.external - beforeMemory.external
                });
                
                // Log every 10 cycles
                if (cycle % 10 === 0) {
                    console.log(`Cycle ${cycle}: Heap delta ${(afterMemory.heapUsed - beforeMemory.heapUsed) / 1024} KB, External delta ${(afterMemory.external - beforeMemory.external) / 1024} KB`);
                }
            }
            
            // Analyze memory behavior across cycles
            const avgHeapDelta = memorySnapshots.reduce((sum, s) => sum + s.heapDelta, 0) / memorySnapshots.length;
            const avgExternalDelta = memorySnapshots.reduce((sum, s) => sum + s.externalDelta, 0) / memorySnapshots.length;
            const maxHeapDelta = Math.max(...memorySnapshots.map(s => s.heapDelta));
            const maxExternalDelta = Math.max(...memorySnapshots.map(s => Math.abs(s.externalDelta)));
            
            console.log(`Allocation/deallocation test results:`);
            console.log(`  Average heap delta per cycle: ${(avgHeapDelta / 1024).toFixed(1)} KB`);
            console.log(`  Average external delta per cycle: ${(avgExternalDelta / 1024).toFixed(1)} KB`);
            console.log(`  Max heap delta: ${(maxHeapDelta / 1024).toFixed(1)} KB`);
            console.log(`  Max external delta: ${(maxExternalDelta / 1024).toFixed(1)} KB`);
            
            // Average memory delta per cycle should be small (close to zero)
            expect(Math.abs(avgHeapDelta)).toBeLessThan(200 * 1024); // <200KB average heap delta
            expect(Math.abs(avgExternalDelta)).toBeLessThan(500 * 1024); // <500KB average external delta
            
            // Maximum single-cycle growth should be reasonable
            expect(maxHeapDelta).toBeLessThan(5 * 1024 * 1024); // <5MB max heap growth per cycle
            expect(maxExternalDelta).toBeLessThan(10 * 1024 * 1024); // <10MB max external change per cycle
        }, 35000);

        test('should maintain performance despite repeated operations', async () => {
            const performanceTests = 3;
            const operationsPerTest = 20;
            const performanceResults = [];
            
            console.log('Testing performance consistency over repeated operations...');
            
            for (let test = 0; test < performanceTests; test++) {
                const testStart = Date.now();
                const testResults = [];
                
                for (let op = 0; op < operationsPerTest; op++) {
                    const opStart = process.hrtime.bigint();
                    
                    try {
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                70
                            );
                            
                            const opTime = Number(process.hrtime.bigint() - opStart) / 1000000; // Convert to milliseconds
                            const pixels = screenshot.width * screenshot.height;
                            const throughput = (pixels / 1000000) / (opTime / 1000); // MP/s
                            
                            testResults.push({
                                operation: op,
                                operationTime: opTime,
                                throughput: throughput,
                                compressionRatio: screenshot.data.length / webpData.length
                            });
                        }
                    } catch (error) {
                        console.warn(`Performance test ${test}, operation ${op} failed: ${error.message}`);
                    }
                }
                
                if (testResults.length > 0) {
                    const avgThroughput = testResults.reduce((sum, r) => sum + r.throughput, 0) / testResults.length;
                    const avgTime = testResults.reduce((sum, r) => sum + r.operationTime, 0) / testResults.length;
                    const minThroughput = Math.min(...testResults.map(r => r.throughput));
                    const maxThroughput = Math.max(...testResults.map(r => r.throughput));
                    
                    performanceResults.push({
                        test: test,
                        avgThroughput: avgThroughput,
                        avgTime: avgTime,
                        minThroughput: minThroughput,
                        maxThroughput: maxThroughput,
                        operations: testResults.length,
                        testDuration: Date.now() - testStart
                    });
                    
                    console.log(`Performance test ${test}: ${avgThroughput.toFixed(1)} MP/s avg, ${avgTime.toFixed(1)}ms avg, ${testResults.length} operations`);
                }
                
                // Brief pause between tests
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Analyze performance consistency
            if (performanceResults.length > 1) {
                const throughputs = performanceResults.map(r => r.avgThroughput);
                const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;
                const minThroughput = Math.min(...throughputs);
                const maxThroughput = Math.max(...throughputs);
                const variation = (maxThroughput - minThroughput) / avgThroughput;
                
                console.log(`Performance consistency results:`);
                console.log(`  Overall average throughput: ${avgThroughput.toFixed(1)} MP/s`);
                console.log(`  Throughput range: ${minThroughput.toFixed(1)} - ${maxThroughput.toFixed(1)} MP/s`);
                console.log(`  Performance variation: ${(variation * 100).toFixed(1)}%`);
                
                // Performance should remain consistent
                expect(variation).toBeLessThan(0.2); // <20% variation across tests
                expect(avgThroughput).toBeGreaterThan(10); // Should maintain good throughput
                
                // No significant performance degradation
                const firstTestThroughput = performanceResults[0].avgThroughput;
                const lastTestThroughput = performanceResults[performanceResults.length - 1].avgThroughput;
                const degradation = (firstTestThroughput - lastTestThroughput) / firstTestThroughput;
                
                console.log(`Performance degradation: ${(degradation * 100).toFixed(1)}%`);
                expect(degradation).toBeLessThan(0.15); // <15% degradation
            }
        }, 25000);
    });
});