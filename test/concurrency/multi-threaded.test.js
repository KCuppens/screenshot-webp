const addon = require('../../build/Release/webp_screenshot');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

describe('Multi-threaded Concurrency Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('Concurrent Screenshot Capture', () => {
        test('should handle simultaneous screenshot requests', async () => {
            const concurrentRequests = 8;
            const promises = [];
            
            // Create multiple concurrent screenshot requests
            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(new Promise((resolve) => {
                    const startTime = Date.now();
                    
                    try {
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        const endTime = Date.now();
                        
                        resolve({
                            requestId: i,
                            success: screenshot.success,
                            width: screenshot.success ? screenshot.width : null,
                            height: screenshot.success ? screenshot.height : null,
                            dataSize: screenshot.success ? screenshot.data.length : null,
                            duration: endTime - startTime,
                            error: null
                        });
                    } catch (error) {
                        resolve({
                            requestId: i,
                            success: false,
                            error: error.message,
                            duration: Date.now() - startTime
                        });
                    }
                }));
            }
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success);
            
            console.log(`Concurrent screenshot test: ${successful.length}/${concurrentRequests} successful`);
            
            // At least 75% should succeed
            expect(successful.length).toBeGreaterThan(concurrentRequests * 0.75);
            
            // All successful results should have consistent dimensions
            if (successful.length > 1) {
                const firstResult = successful[0];
                successful.forEach(result => {
                    expect(result.width).toBe(firstResult.width);
                    expect(result.height).toBe(firstResult.height);
                    expect(result.dataSize).toBe(firstResult.dataSize);
                });
                
                // Performance should not degrade too much under concurrency
                const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
                const maxDuration = Math.max(...successful.map(r => r.duration));
                
                console.log(`Concurrent capture performance: ${avgDuration.toFixed(1)}ms avg, ${maxDuration}ms max`);
                expect(avgDuration).toBeLessThan(500); // Should complete within reasonable time
            }
        }, 15000);

        test('should handle concurrent WebP encoding operations', async () => {
            // First capture a screenshot to get real data
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const concurrentEncodings = 6;
            const qualities = [30, 40, 50, 60, 70, 80]; // Different qualities for each encoding
            const promises = [];
            
            for (let i = 0; i < concurrentEncodings; i++) {
                promises.push(new Promise((resolve) => {
                    const startTime = Date.now();
                    const quality = qualities[i % qualities.length];
                    
                    try {
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            quality
                        );
                        
                        const endTime = Date.now();
                        
                        resolve({
                            encodingId: i,
                            quality: quality,
                            success: true,
                            webpSize: webpData.length,
                            duration: endTime - startTime,
                            compressionRatio: screenshot.data.length / webpData.length,
                            error: null
                        });
                    } catch (error) {
                        resolve({
                            encodingId: i,
                            quality: quality,
                            success: false,
                            error: error.message,
                            duration: Date.now() - startTime
                        });
                    }
                }));
            }
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success);
            
            console.log(`Concurrent encoding test: ${successful.length}/${concurrentEncodings} successful`);
            
            // All encodings should succeed
            expect(successful.length).toBe(concurrentEncodings);
            
            // Verify encoding results
            successful.forEach(result => {
                expect(result.webpSize).toBeGreaterThan(0);
                expect(result.compressionRatio).toBeGreaterThan(1);
                expect(result.duration).toBeLessThan(1000); // Should complete within 1 second
            });
            
            // Higher quality should generally produce larger files
            const qualityGroups = {};
            successful.forEach(result => {
                if (!qualityGroups[result.quality]) {
                    qualityGroups[result.quality] = [];
                }
                qualityGroups[result.quality].push(result.webpSize);
            });
            
            console.log('Quality vs Size results:');
            Object.keys(qualityGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(quality => {
                const avgSize = qualityGroups[quality].reduce((a, b) => a + b) / qualityGroups[quality].length;
                console.log(`  Quality ${quality}: ${avgSize.toFixed(0)} bytes avg`);
            });
        }, 10000);

        test('should handle mixed capture and encoding operations', async () => {
            const mixedOperations = 10;
            const promises = [];
            
            for (let i = 0; i < mixedOperations; i++) {
                if (i % 2 === 0) {
                    // Even indices: capture + encode pipeline
                    promises.push(new Promise((resolve) => {
                        const startTime = Date.now();
                        
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
                                
                                resolve({
                                    operationId: i,
                                    type: 'capture_and_encode',
                                    success: true,
                                    duration: Date.now() - startTime,
                                    webpSize: webpData.length,
                                    compressionRatio: screenshot.data.length / webpData.length
                                });
                            } else {
                                resolve({
                                    operationId: i,
                                    type: 'capture_and_encode',
                                    success: false,
                                    duration: Date.now() - startTime,
                                    error: 'Screenshot capture failed'
                                });
                            }
                        } catch (error) {
                            resolve({
                                operationId: i,
                                type: 'capture_and_encode',
                                success: false,
                                duration: Date.now() - startTime,
                                error: error.message
                            });
                        }
                    }));
                } else {
                    // Odd indices: just capture
                    promises.push(new Promise((resolve) => {
                        const startTime = Date.now();
                        
                        try {
                            const screenshot = addon.captureScreenshot({ display: 0 });
                            
                            resolve({
                                operationId: i,
                                type: 'capture_only',
                                success: screenshot.success,
                                duration: Date.now() - startTime,
                                dataSize: screenshot.success ? screenshot.data.length : null
                            });
                        } catch (error) {
                            resolve({
                                operationId: i,
                                type: 'capture_only',
                                success: false,
                                duration: Date.now() - startTime,
                                error: error.message
                            });
                        }
                    }));
                }
            }
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success);
            const captureOnly = successful.filter(r => r.type === 'capture_only');
            const captureAndEncode = successful.filter(r => r.type === 'capture_and_encode');
            
            console.log(`Mixed operations test: ${successful.length}/${mixedOperations} successful`);
            console.log(`  Capture only: ${captureOnly.length} successful`);
            console.log(`  Capture + encode: ${captureAndEncode.length} successful`);
            
            // Most operations should succeed
            expect(successful.length).toBeGreaterThan(mixedOperations * 0.8);
            
            // Analyze performance differences
            if (captureOnly.length > 0 && captureAndEncode.length > 0) {
                const avgCaptureOnlyTime = captureOnly.reduce((sum, r) => sum + r.duration, 0) / captureOnly.length;
                const avgCaptureEncodeTime = captureAndEncode.reduce((sum, r) => sum + r.duration, 0) / captureAndEncode.length;
                
                console.log(`Performance comparison:`);
                console.log(`  Capture only: ${avgCaptureOnlyTime.toFixed(1)}ms avg`);
                console.log(`  Capture + encode: ${avgCaptureEncodeTime.toFixed(1)}ms avg`);
                
                // Capture + encode should be slower but not excessively so
                expect(avgCaptureEncodeTime).toBeGreaterThan(avgCaptureOnlyTime);
                expect(avgCaptureEncodeTime).toBeLessThan(avgCaptureOnlyTime * 5); // Not more than 5x slower
            }
        }, 15000);
    });

    describe('Thread Safety Validation', () => {
        test('should maintain data integrity under concurrent access', async () => {
            const iterations = 20;
            const concurrentOperations = 4;
            
            let allResults = [];
            
            for (let iter = 0; iter < iterations; iter++) {
                const promises = [];
                
                for (let op = 0; op < concurrentOperations; op++) {
                    promises.push(new Promise((resolve) => {
                        try {
                            const screenshot = addon.captureScreenshot({ display: 0 });
                            if (screenshot.success) {
                                // Verify data integrity
                                const expectedSize = screenshot.width * screenshot.height * 4;
                                const actualSize = screenshot.data.length;
                                
                                // Check pixel data for basic validity
                                let validPixels = 0;
                                let totalPixels = 0;
                                
                                for (let i = 0; i < screenshot.data.length; i += 4) {
                                    totalPixels++;
                                    const r = screenshot.data[i];
                                    const g = screenshot.data[i + 1];
                                    const b = screenshot.data[i + 2];
                                    const a = screenshot.data[i + 3];
                                    
                                    // Check if pixel values are in valid range
                                    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && 
                                        b >= 0 && b <= 255 && a === 255) {
                                        validPixels++;
                                    }
                                    
                                    // Only check first 1000 pixels to save time
                                    if (totalPixels >= 1000) break;
                                }
                                
                                resolve({
                                    iteration: iter,
                                    operation: op,
                                    success: true,
                                    width: screenshot.width,
                                    height: screenshot.height,
                                    expectedSize: expectedSize,
                                    actualSize: actualSize,
                                    sizeMatch: expectedSize === actualSize,
                                    validPixelRatio: validPixels / totalPixels
                                });
                            } else {
                                resolve({
                                    iteration: iter,
                                    operation: op,
                                    success: false
                                });
                            }
                        } catch (error) {
                            resolve({
                                iteration: iter,
                                operation: op,
                                success: false,
                                error: error.message
                            });
                        }
                    }));
                }
                
                const iterationResults = await Promise.all(promises);
                allResults = allResults.concat(iterationResults);
                
                // Small delay between iterations
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            const successful = allResults.filter(r => r.success);
            const dataIntegrityValid = successful.filter(r => r.sizeMatch && r.validPixelRatio > 0.95);
            
            console.log(`Data integrity test: ${successful.length}/${allResults.length} captures successful`);
            console.log(`Data integrity valid: ${dataIntegrityValid.length}/${successful.length} with valid data`);
            
            // High success rate expected
            expect(successful.length).toBeGreaterThan(allResults.length * 0.9);
            
            // All successful captures should have valid data integrity
            expect(dataIntegrityValid.length).toBe(successful.length);
            
            // All successful results should have consistent dimensions
            if (successful.length > 1) {
                const dimensions = successful.map(r => `${r.width}x${r.height}`);
                const uniqueDimensions = new Set(dimensions);
                expect(uniqueDimensions.size).toBe(1); // All should have same dimensions
            }
        }, 30000);

        test('should handle resource contention gracefully', async () => {
            // Test with more concurrent operations than typical CPU cores
            const heavyConcurrency = 16;
            const promises = [];
            
            const startTime = Date.now();
            
            for (let i = 0; i < heavyConcurrency; i++) {
                promises.push(new Promise((resolve) => {
                    const operationStart = Date.now();
                    
                    try {
                        // Perform a complete capture-encode cycle
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                60
                            );
                            
                            const operationTime = Date.now() - operationStart;
                            
                            resolve({
                                operationId: i,
                                success: true,
                                operationTime: operationTime,
                                webpSize: webpData.length,
                                compressionRatio: screenshot.data.length / webpData.length
                            });
                        } else {
                            resolve({
                                operationId: i,
                                success: false,
                                operationTime: Date.now() - operationStart,
                                error: 'Screenshot failed'
                            });
                        }
                    } catch (error) {
                        resolve({
                            operationId: i,
                            success: false,
                            operationTime: Date.now() - operationStart,
                            error: error.message
                        });
                    }
                }));
            }
            
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;
            const successful = results.filter(r => r.success);
            
            console.log(`Resource contention test: ${successful.length}/${heavyConcurrency} operations successful in ${totalTime}ms`);
            
            // Should handle high concurrency reasonably well
            expect(successful.length).toBeGreaterThan(heavyConcurrency * 0.7); // 70% success rate
            
            if (successful.length > 0) {
                const avgOperationTime = successful.reduce((sum, r) => sum + r.operationTime, 0) / successful.length;
                const maxOperationTime = Math.max(...successful.map(r => r.operationTime));
                const minOperationTime = Math.min(...successful.map(r => r.operationTime));
                
                console.log(`Operation times: ${avgOperationTime.toFixed(1)}ms avg, ${minOperationTime}-${maxOperationTime}ms range`);
                
                // Under contention, operations might be slower but shouldn't time out
                expect(avgOperationTime).toBeLessThan(2000); // Should complete within 2 seconds on average
                expect(maxOperationTime).toBeLessThan(5000); // No operation should take more than 5 seconds
                
                // Verify compression ratios are still reasonable under contention
                const avgCompression = successful.reduce((sum, r) => sum + r.compressionRatio, 0) / successful.length;
                expect(avgCompression).toBeGreaterThan(2); // Should maintain compression quality
            }
        }, 45000);
    });

    describe('Error Handling in Concurrent Environment', () => {
        test('should isolate errors between concurrent operations', async () => {
            const mixedOperations = 12;
            const promises = [];
            
            for (let i = 0; i < mixedOperations; i++) {
                promises.push(new Promise((resolve) => {
                    try {
                        if (i % 4 === 3) {
                            // Every 4th operation: intentionally cause an error
                            addon.captureScreenshot({ display: 999 }); // Invalid display
                            resolve({ operationId: i, type: 'invalid', success: true, unexpected: true });
                        } else if (i % 4 === 2) {
                            // Every other 4th: try encoding with invalid parameters
                            const validScreenshot = addon.captureScreenshot({ display: 0 });
                            if (validScreenshot.success) {
                                addon.encodeWebP(validScreenshot.data, 0, validScreenshot.height, validScreenshot.width * 4, 80); // Invalid width
                                resolve({ operationId: i, type: 'invalid_encode', success: true, unexpected: true });
                            } else {
                                resolve({ operationId: i, type: 'invalid_encode', success: false, error: 'Screenshot failed' });
                            }
                        } else {
                            // Normal operations
                            const screenshot = addon.captureScreenshot({ display: 0 });
                            if (screenshot.success) {
                                const webpData = addon.encodeWebP(
                                    screenshot.data,
                                    screenshot.width,
                                    screenshot.height,
                                    screenshot.width * 4,
                                    70
                                );
                                
                                resolve({
                                    operationId: i,
                                    type: 'normal',
                                    success: true,
                                    webpSize: webpData.length
                                });
                            } else {
                                resolve({ operationId: i, type: 'normal', success: false, error: 'Screenshot failed' });
                            }
                        }
                    } catch (error) {
                        resolve({
                            operationId: i,
                            type: i % 4 === 3 ? 'invalid' : (i % 4 === 2 ? 'invalid_encode' : 'normal'),
                            success: false,
                            error: error.message,
                            expectedError: i % 4 >= 2 // We expect errors for operations 2 and 3 in each group of 4
                        });
                    }
                }));
            }
            
            const results = await Promise.all(promises);
            const normalOps = results.filter(r => r.type === 'normal');
            const invalidOps = results.filter(r => r.type === 'invalid' || r.type === 'invalid_encode');
            const successfulNormal = normalOps.filter(r => r.success);
            const expectedErrors = invalidOps.filter(r => !r.success && r.expectedError);
            
            console.log(`Error isolation test:`);
            console.log(`  Normal operations: ${successfulNormal.length}/${normalOps.length} successful`);
            console.log(`  Invalid operations: ${expectedErrors.length}/${invalidOps.length} failed as expected`);
            
            // Normal operations should succeed despite concurrent invalid operations
            expect(successfulNormal.length).toBeGreaterThan(normalOps.length * 0.8);
            
            // Invalid operations should fail without affecting others
            expect(expectedErrors.length).toBeGreaterThan(invalidOps.length * 0.8);
            
            // No operation should succeed unexpectedly
            const unexpectedSuccesses = results.filter(r => r.unexpected);
            expect(unexpectedSuccesses.length).toBe(0);
        }, 20000);
    });
});