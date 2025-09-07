const addon = require('../../build/Release/webp_screenshot');

describe('Comprehensive Error Condition Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('Native Module Error Handling', () => {
        test('should provide meaningful error messages for invalid display indices', () => {
            const invalidIndices = [-1, 999, -999, 1000000];
            
            invalidIndices.forEach(index => {
                try {
                    addon.captureScreenshot({ display: index });
                    fail(`Expected error for display index ${index}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message).toContain('Invalid display');
                    expect(error.message).not.toBe(''); // Should have a meaningful message
                    console.log(`Display index ${index}: ${error.message}`);
                }
            });
        });

        test('should handle malformed captureScreenshot parameters', () => {
            const malformedParams = [
                null,
                undefined,
                "invalid",
                123,
                [],
                { wrongParam: 0 },
                { display: null },
                { display: "0" },
                { display: {} },
                { display: [] }
            ];
            
            malformedParams.forEach((param, index) => {
                try {
                    addon.captureScreenshot(param);
                    fail(`Expected error for malformed parameter: ${JSON.stringify(param)}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message.length).toBeGreaterThan(0);
                    console.log(`Malformed param ${index}: ${error.message}`);
                }
            });
        });

        test('should validate WebP encoding parameters thoroughly', () => {
            const testBuffer = new Uint8Array(100 * 100 * 4);
            
            // Test invalid buffer types
            const invalidBuffers = [null, undefined, "string", 123, {}, []];
            invalidBuffers.forEach((buffer, index) => {
                try {
                    addon.encodeWebP(buffer, 100, 100, 400, 80);
                    fail(`Expected error for invalid buffer: ${typeof buffer}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message).toMatch(/buffer|data/i);
                    console.log(`Invalid buffer ${index}: ${error.message}`);
                }
            });
            
            // Test invalid dimension combinations
            const invalidDimensions = [
                { width: 0, height: 100, stride: 400 },
                { width: 100, height: 0, stride: 400 },
                { width: -10, height: 100, stride: 400 },
                { width: 100, height: -10, stride: 400 },
                { width: null, height: 100, stride: 400 },
                { width: 100, height: null, stride: 400 },
                { width: "100", height: 100, stride: 400 },
                { width: 100, height: "100", stride: 400 }
            ];
            
            invalidDimensions.forEach((dims, index) => {
                try {
                    addon.encodeWebP(testBuffer, dims.width, dims.height, dims.stride, 80);
                    fail(`Expected error for invalid dimensions: ${JSON.stringify(dims)}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    console.log(`Invalid dimensions ${index}: ${error.message}`);
                }
            });
            
            // Test invalid stride values
            const invalidStrides = [0, -1, -400, null, undefined, "400", {}];
            invalidStrides.forEach((stride, index) => {
                try {
                    addon.encodeWebP(testBuffer, 100, 100, stride, 80);
                    fail(`Expected error for invalid stride: ${stride}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message).toMatch(/stride|width/i);
                    console.log(`Invalid stride ${index}: ${error.message}`);
                }
            });
            
            // Test invalid quality values
            const invalidQualities = [-1, -10, null, undefined, "80", {}, []];
            invalidQualities.forEach((quality, index) => {
                try {
                    addon.encodeWebP(testBuffer, 100, 100, 400, quality);
                    fail(`Expected error for invalid quality: ${quality}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    console.log(`Invalid quality ${index}: ${error.message}`);
                }
            });
        });

        test('should handle buffer size mismatches gracefully', () => {
            const testCases = [
                { buffer: new Uint8Array(100), width: 100, height: 100, stride: 400, description: "buffer too small" },
                { buffer: new Uint8Array(0), width: 10, height: 10, stride: 40, description: "empty buffer" },
                { buffer: new Uint8Array(1000), width: 100, height: 100, stride: 400, description: "buffer much too small" }
            ];
            
            testCases.forEach((testCase, index) => {
                try {
                    addon.encodeWebP(testCase.buffer, testCase.width, testCase.height, testCase.stride, 80);
                    fail(`Expected error for ${testCase.description}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message).toMatch(/buffer|size|data/i);
                    console.log(`Buffer mismatch ${index} (${testCase.description}): ${error.message}`);
                }
            });
        });
    });

    describe('System-level Error Scenarios', () => {
        test('should handle rapid error-inducing operations without crashing', () => {
            const errorOperations = 50;
            let errorsCaught = 0;
            let unexpectedSuccesses = 0;
            
            for (let i = 0; i < errorOperations; i++) {
                try {
                    // Alternate between different types of invalid operations
                    if (i % 3 === 0) {
                        addon.captureScreenshot({ display: 999 }); // Invalid display
                        unexpectedSuccesses++;
                    } else if (i % 3 === 1) {
                        addon.encodeWebP(new Uint8Array(10), 100, 100, 400, 80); // Buffer too small
                        unexpectedSuccesses++;
                    } else {
                        addon.encodeWebP(null, 100, 100, 400, 80); // Null buffer
                        unexpectedSuccesses++;
                    }
                } catch (error) {
                    errorsCaught++;
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message.length).toBeGreaterThan(0);
                }
            }
            
            console.log(`Rapid error test: ${errorsCaught}/${errorOperations} errors caught, ${unexpectedSuccesses} unexpected successes`);
            
            // All operations should fail (since they're intentionally invalid)
            expect(errorsCaught).toBe(errorOperations);
            expect(unexpectedSuccesses).toBe(0);
            
            // After many errors, normal operations should still work
            expect(() => {
                const result = addon.captureScreenshot({ display: 0 });
                expect(result.success).toBe(true);
            }).not.toThrow();
        });

        test('should recover from errors and continue normal operation', () => {
            const testSequence = [
                // Normal operation
                () => {
                    const result = addon.captureScreenshot({ display: 0 });
                    expect(result.success).toBe(true);
                    return { type: 'normal', success: true };
                },
                // Error operation 1
                () => {
                    try {
                        addon.captureScreenshot({ display: -1 });
                        return { type: 'error1', success: true, unexpected: true };
                    } catch (error) {
                        return { type: 'error1', success: false, error: error.message };
                    }
                },
                // Normal operation (should still work)
                () => {
                    const result = addon.captureScreenshot({ display: 0 });
                    expect(result.success).toBe(true);
                    return { type: 'normal', success: true };
                },
                // Error operation 2
                () => {
                    try {
                        addon.encodeWebP(new Uint8Array(0), 10, 10, 40, 80);
                        return { type: 'error2', success: true, unexpected: true };
                    } catch (error) {
                        return { type: 'error2', success: false, error: error.message };
                    }
                },
                // Normal operation (should still work)
                () => {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            75
                        );
                        expect(webpData.length).toBeGreaterThan(0);
                        return { type: 'normal_with_encode', success: true };
                    } else {
                        return { type: 'normal_with_encode', success: false };
                    }
                }
            ];
            
            const results = testSequence.map((operation, index) => {
                try {
                    const result = operation();
                    console.log(`Recovery test ${index}: ${result.type} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
                    return result;
                } catch (error) {
                    console.log(`Recovery test ${index}: EXCEPTION - ${error.message}`);
                    return { type: 'exception', success: false, error: error.message };
                }
            });
            
            const normalOps = results.filter(r => r.type.includes('normal'));
            const errorOps = results.filter(r => r.type.includes('error'));
            const exceptions = results.filter(r => r.type === 'exception');
            
            // Normal operations should all succeed
            normalOps.forEach(op => {
                expect(op.success).toBe(true);
            });
            
            // Error operations should fail as expected
            errorOps.forEach(op => {
                expect(op.success).toBe(false);
                expect(op.unexpected).toBeUndefined(); // Should not succeed unexpectedly
            });
            
            // No unexpected exceptions should occur
            expect(exceptions.length).toBe(0);
            
            console.log(`Recovery test summary: ${normalOps.length} normal ops, ${errorOps.length} error ops, ${exceptions.length} exceptions`);
        });

        test('should provide consistent error behavior across multiple attempts', () => {
            const consistencyTests = [
                {
                    name: 'Invalid display index',
                    operation: () => addon.captureScreenshot({ display: 888 }),
                    expectedErrorPattern: /invalid|display/i
                },
                {
                    name: 'Null buffer encoding',
                    operation: () => addon.encodeWebP(null, 100, 100, 400, 80),
                    expectedErrorPattern: /buffer|null/i
                },
                {
                    name: 'Zero dimensions',
                    operation: () => addon.encodeWebP(new Uint8Array(1000), 0, 100, 400, 80),
                    expectedErrorPattern: /width|dimension/i
                },
                {
                    name: 'Negative quality',
                    operation: () => addon.encodeWebP(new Uint8Array(1000), 10, 10, 40, -5),
                    expectedErrorPattern: /quality/i
                }
            ];
            
            consistencyTests.forEach(test => {
                const attempts = 5;
                const errorMessages = [];
                
                for (let attempt = 0; attempt < attempts; attempt++) {
                    try {
                        test.operation();
                        fail(`${test.name} attempt ${attempt} should have failed`);
                    } catch (error) {
                        expect(error).toBeInstanceOf(Error);
                        expect(error.message).toMatch(test.expectedErrorPattern);
                        errorMessages.push(error.message);
                    }
                }
                
                // All error messages should be consistent
                const uniqueMessages = new Set(errorMessages);
                console.log(`${test.name}: ${uniqueMessages.size} unique error messages across ${attempts} attempts`);
                errorMessages.forEach((msg, index) => {
                    console.log(`  Attempt ${index}: ${msg}`);
                });
                
                // Error messages should be consistent (ideally identical)
                expect(uniqueMessages.size).toBeLessThanOrEqual(2); // Allow minor variations
            });
        });
    });

    describe('Resource Exhaustion Error Handling', () => {
        test('should handle repeated operations without resource leaks causing errors', async () => {
            const repetitions = 100;
            let consecutiveErrors = 0;
            let maxConsecutiveErrors = 0;
            let totalErrors = 0;
            
            for (let i = 0; i < repetitions; i++) {
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    
                    if (screenshot.success) {
                        // Try to encode the screenshot
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            60
                        );
                        
                        expect(webpData.length).toBeGreaterThan(0);
                        consecutiveErrors = 0; // Reset consecutive error counter
                    } else {
                        throw new Error('Screenshot capture failed');
                    }
                } catch (error) {
                    totalErrors++;
                    consecutiveErrors++;
                    maxConsecutiveErrors = Math.max(maxConsecutiveErrors, consecutiveErrors);
                    
                    console.warn(`Repetition ${i} failed: ${error.message}`);
                    
                    // Should not have too many consecutive errors due to resource exhaustion
                    expect(consecutiveErrors).toBeLessThan(10);
                }
                
                // Small delay to prevent overwhelming the system
                if (i % 20 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            const errorRate = totalErrors / repetitions;
            console.log(`Resource exhaustion test: ${totalErrors}/${repetitions} errors (${(errorRate * 100).toFixed(1)}% error rate)`);
            console.log(`Max consecutive errors: ${maxConsecutiveErrors}`);
            
            // Should have a low error rate (most operations should succeed)
            expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate
            expect(maxConsecutiveErrors).toBeLessThan(5); // Should recover quickly
        }, 30000);

        test('should handle operations during memory pressure without fatal errors', async () => {
            // Create some memory pressure
            const memoryPressureArrays = [];
            const initialMemory = process.memoryUsage();
            
            try {
                // Allocate some memory to create pressure
                for (let i = 0; i < 20; i++) {
                    memoryPressureArrays.push(new Uint8Array(1024 * 1024)); // 1MB each
                }
                
                const pressureMemory = process.memoryUsage();
                console.log(`Memory pressure created: ${((pressureMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(1)} MB additional`);
                
                // Try operations under memory pressure
                const operationsUnderPressure = 10;
                let successfulOperations = 0;
                let memoryRelatedErrors = 0;
                
                for (let i = 0; i < operationsUnderPressure; i++) {
                    try {
                        const screenshot = addon.captureScreenshot({ display: 0 });
                        
                        if (screenshot.success) {
                            const webpData = addon.encodeWebP(
                                screenshot.data,
                                screenshot.width,
                                screenshot.height,
                                screenshot.width * 4,
                                50 // Lower quality to save memory
                            );
                            
                            expect(webpData.length).toBeGreaterThan(0);
                            successfulOperations++;
                        }
                    } catch (error) {
                        console.warn(`Operation ${i} under memory pressure failed: ${error.message}`);
                        
                        if (error.message.toLowerCase().includes('memory')) {
                            memoryRelatedErrors++;
                        }
                        
                        // Should not crash with fatal errors
                        expect(error).toBeInstanceOf(Error);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                console.log(`Memory pressure test: ${successfulOperations}/${operationsUnderPressure} operations successful`);
                console.log(`Memory-related errors: ${memoryRelatedErrors}`);
                
                // Should handle some operations successfully even under memory pressure
                expect(successfulOperations).toBeGreaterThan(operationsUnderPressure * 0.3); // At least 30%
                
            } finally {
                // Clean up memory pressure
                memoryPressureArrays.length = 0;
                
                if (global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // After cleanup, operations should work normally again
                expect(() => {
                    const result = addon.captureScreenshot({ display: 0 });
                    expect(result.success).toBe(true);
                }).not.toThrow();
            }
        }, 20000);
    });

    describe('Error Message Quality and Debugging', () => {
        test('should provide helpful error messages with context', () => {
            const errorTestCases = [
                {
                    operation: () => addon.captureScreenshot({ display: -5 }),
                    expectedContext: ['display', 'index', 'invalid'],
                    description: 'negative display index'
                },
                {
                    operation: () => addon.captureScreenshot({ display: 99999 }),
                    expectedContext: ['display', 'index', 'range'],
                    description: 'out of range display index'
                },
                {
                    operation: () => addon.encodeWebP(new Uint8Array(100), 0, 100, 400, 80),
                    expectedContext: ['width', 'zero', 'invalid'],
                    description: 'zero width encoding'
                },
                {
                    operation: () => addon.encodeWebP(new Uint8Array(100), 100, 100, 50, 80),
                    expectedContext: ['stride', 'buffer', 'size'],
                    description: 'insufficient stride'
                }
            ];
            
            errorTestCases.forEach(testCase => {
                try {
                    testCase.operation();
                    fail(`Expected error for ${testCase.description}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message.length).toBeGreaterThan(10); // Should be reasonably detailed
                    
                    // Check if error message contains expected context words
                    const lowerMessage = error.message.toLowerCase();
                    const contextFound = testCase.expectedContext.some(context => 
                        lowerMessage.includes(context.toLowerCase())
                    );
                    
                    console.log(`${testCase.description}: "${error.message}"`);
                    console.log(`  Expected context: ${testCase.expectedContext.join(', ')}`);
                    console.log(`  Context found: ${contextFound}`);
                    
                    expect(contextFound).toBe(true);
                }
            });
        });

        test('should maintain error context across different parameter types', () => {
            // Test the same error type with different invalid parameter types
            const parameterTypes = [
                { value: null, type: 'null' },
                { value: undefined, type: 'undefined' },
                { value: "invalid", type: 'string' },
                { value: {}, type: 'object' },
                { value: [], type: 'array' },
                { value: -1, type: 'negative number' }
            ];
            
            parameterTypes.forEach(param => {
                try {
                    addon.captureScreenshot({ display: param.value });
                    fail(`Expected error for display parameter type: ${param.type}`);
                } catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.message.length).toBeGreaterThan(5);
                    
                    // Error should mention the parameter issue
                    const lowerMessage = error.message.toLowerCase();
                    const hasDisplayContext = lowerMessage.includes('display');
                    const hasTypeOrValueContext = lowerMessage.includes('invalid') || 
                                                  lowerMessage.includes('type') || 
                                                  lowerMessage.includes('parameter');
                    
                    console.log(`${param.type} parameter: "${error.message}"`);
                    
                    expect(hasDisplayContext || hasTypeOrValueContext).toBe(true);
                }
            });
        });
    });
});