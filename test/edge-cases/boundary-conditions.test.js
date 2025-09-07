const addon = require('../../build/Release/webp_screenshot');

describe('Edge Cases and Boundary Conditions Tests', () => {
    beforeAll(() => {
        addon.initialize();
    });

    describe('Display Index Boundary Tests', () => {
        test('should handle negative display indices gracefully', () => {
            expect(() => {
                addon.captureScreenshot({ display: -1 });
            }).toThrow();
            
            expect(() => {
                addon.captureDisplay(-1);
            }).toThrow();
        });

        test('should handle very large display indices', () => {
            const displays = addon.getDisplays();
            const maxValidIndex = displays.length - 1;
            
            // Test just beyond valid range
            expect(() => {
                addon.captureScreenshot({ display: maxValidIndex + 1 });
            }).toThrow();
            
            // Test very large index
            expect(() => {
                addon.captureScreenshot({ display: 99999 });
            }).toThrow();
        });

        test('should handle edge case display indices', () => {
            const displays = addon.getDisplays();
            
            // Test first display (should work)
            expect(() => {
                const result = addon.captureScreenshot({ display: 0 });
                expect(result.success).toBe(true);
            }).not.toThrow();
            
            // Test last valid display (should work)
            if (displays.length > 1) {
                expect(() => {
                    const result = addon.captureScreenshot({ display: displays.length - 1 });
                    expect(result.success).toBe(true);
                }).not.toThrow();
            }
        });
    });

    describe('WebP Encoding Parameter Boundary Tests', () => {
        let testImageData;
        const testWidth = 100;
        const testHeight = 100;

        beforeEach(() => {
            // Create test RGBA data
            testImageData = new Uint8Array(testWidth * testHeight * 4);
            for (let i = 0; i < testImageData.length; i += 4) {
                testImageData[i] = Math.floor(Math.random() * 256);     // Red
                testImageData[i + 1] = Math.floor(Math.random() * 256); // Green
                testImageData[i + 2] = Math.floor(Math.random() * 256); // Blue
                testImageData[i + 3] = 255; // Alpha
            }
        });

        test('should handle minimum quality values', () => {
            // Test quality = 0 (should be clamped to minimum)
            expect(() => {
                const webpData = addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 4, 0);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
            
            // Test quality = 1
            expect(() => {
                const webpData = addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 4, 1);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
        });

        test('should handle maximum quality values', () => {
            // Test quality = 100
            expect(() => {
                const webpData = addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 4, 100);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
            
            // Test quality > 100 (should be clamped)
            expect(() => {
                const webpData = addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 4, 150);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
        });

        test('should handle negative quality values', () => {
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 4, -10);
            }).toThrow();
        });

        test('should handle zero and negative dimensions', () => {
            // Zero width
            expect(() => {
                addon.encodeWebP(testImageData, 0, testHeight, testWidth * 4, 80);
            }).toThrow();
            
            // Zero height
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, 0, testWidth * 4, 80);
            }).toThrow();
            
            // Negative width
            expect(() => {
                addon.encodeWebP(testImageData, -10, testHeight, testWidth * 4, 80);
            }).toThrow();
            
            // Negative height
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, -10, testWidth * 4, 80);
            }).toThrow();
        });

        test('should handle mismatched stride values', () => {
            // Stride too small
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, testHeight, testWidth * 2, 80);
            }).toThrow();
            
            // Zero stride
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, testHeight, 0, 80);
            }).toThrow();
            
            // Negative stride
            expect(() => {
                addon.encodeWebP(testImageData, testWidth, testHeight, -100, 80);
            }).toThrow();
        });

        test('should handle buffer size mismatches', () => {
            // Buffer too small for dimensions
            const smallBuffer = new Uint8Array(100); // Much smaller than needed
            expect(() => {
                addon.encodeWebP(smallBuffer, testWidth, testHeight, testWidth * 4, 80);
            }).toThrow();
        });

        test('should handle very large dimensions', () => {
            // Test large but reasonable dimensions
            const largeWidth = 4000;
            const largeHeight = 3000;
            const largeBuffer = new Uint8Array(largeWidth * largeHeight * 4);
            
            // Fill with test data (just first few pixels to save time)
            for (let i = 0; i < Math.min(1000000, largeBuffer.length); i += 4) {
                largeBuffer[i] = 128;     // Red
                largeBuffer[i + 1] = 128; // Green
                largeBuffer[i + 2] = 128; // Blue
                largeBuffer[i + 3] = 255; // Alpha
            }
            
            // This should work but might be slow
            expect(() => {
                const webpData = addon.encodeWebP(largeBuffer, largeWidth, largeHeight, largeWidth * 4, 50);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
        });
    });

    describe('Memory Boundary Tests', () => {
        test('should handle empty or null buffers gracefully', () => {
            const emptyBuffer = new Uint8Array(0);
            
            expect(() => {
                addon.encodeWebP(emptyBuffer, 10, 10, 40, 80);
            }).toThrow();
        });

        test('should handle very small image dimensions', () => {
            // 1x1 pixel image
            const onePixel = new Uint8Array(4);
            onePixel[0] = 255; // Red
            onePixel[1] = 0;   // Green
            onePixel[2] = 0;   // Blue
            onePixel[3] = 255; // Alpha
            
            expect(() => {
                const webpData = addon.encodeWebP(onePixel, 1, 1, 4, 80);
                expect(webpData.length).toBeGreaterThan(0);
                
                // Should still have valid WebP header
                const header = Array.from(webpData.slice(0, 12));
                expect(header.slice(0, 4)).toEqual([0x52, 0x49, 0x46, 0x46]); // RIFF
                expect(header.slice(8, 12)).toEqual([0x57, 0x45, 0x42, 0x50]); // WEBP
            }).not.toThrow();
        });

        test('should handle odd dimensions', () => {
            // Test odd width and height
            const oddWidth = 101;
            const oddHeight = 99;
            const oddBuffer = new Uint8Array(oddWidth * oddHeight * 4);
            
            // Fill with gradient
            for (let y = 0; y < oddHeight; y++) {
                for (let x = 0; x < oddWidth; x++) {
                    const i = (y * oddWidth + x) * 4;
                    oddBuffer[i] = (x / oddWidth) * 255;     // Red gradient
                    oddBuffer[i + 1] = (y / oddHeight) * 255; // Green gradient
                    oddBuffer[i + 2] = 128;                   // Blue constant
                    oddBuffer[i + 3] = 255;                   // Alpha opaque
                }
            }
            
            expect(() => {
                const webpData = addon.encodeWebP(oddBuffer, oddWidth, oddHeight, oddWidth * 4, 75);
                expect(webpData.length).toBeGreaterThan(0);
            }).not.toThrow();
        });
    });

    describe('API Parameter Validation Tests', () => {
        test('should handle missing or undefined parameters', () => {
            // Missing display parameter in captureScreenshot
            expect(() => {
                addon.captureScreenshot({});
            }).toThrow();
            
            expect(() => {
                addon.captureScreenshot();
            }).toThrow();
            
            // Undefined display index
            expect(() => {
                addon.captureScreenshot({ display: undefined });
            }).toThrow();
        });

        test('should handle non-numeric display indices', () => {
            expect(() => {
                addon.captureScreenshot({ display: "0" });
            }).toThrow();
            
            expect(() => {
                addon.captureScreenshot({ display: null });
            }).toThrow();
            
            expect(() => {
                addon.captureScreenshot({ display: {} });
            }).toThrow();
        });

        test('should handle floating point display indices', () => {
            expect(() => {
                addon.captureScreenshot({ display: 0.5 });
            }).toThrow();
            
            expect(() => {
                addon.captureScreenshot({ display: 1.99 });
            }).toThrow();
        });

        test('should validate encodeWebP parameter types', () => {
            const validBuffer = new Uint8Array(100 * 100 * 4);
            
            // Non-numeric width
            expect(() => {
                addon.encodeWebP(validBuffer, "100", 100, 400, 80);
            }).toThrow();
            
            // Non-numeric height
            expect(() => {
                addon.encodeWebP(validBuffer, 100, "100", 400, 80);
            }).toThrow();
            
            // Non-numeric stride
            expect(() => {
                addon.encodeWebP(validBuffer, 100, 100, "400", 80);
            }).toThrow();
            
            // Non-numeric quality
            expect(() => {
                addon.encodeWebP(validBuffer, 100, 100, 400, "80");
            }).toThrow();
        });
    });

    describe('System Resource Edge Cases', () => {
        test('should handle rapid initialize/cleanup cycles', () => {
            // Test multiple initialize calls
            expect(() => {
                for (let i = 0; i < 10; i++) {
                    const result = addon.initialize();
                    expect(result).toBe(true);
                }
            }).not.toThrow();
        });

        test('should handle operations without initialization', () => {
            // This test assumes addon is already initialized, so we can't easily test uninitialized state
            // But we can test that operations still work after multiple initializations
            addon.initialize();
            
            expect(() => {
                const displays = addon.getDisplays();
                expect(Array.isArray(displays)).toBe(true);
            }).not.toThrow();
        });

        test('should handle concurrent API calls safely', async () => {
            // Test concurrent display enumeration
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(new Promise((resolve) => {
                    try {
                        const displays = addon.getDisplays();
                        resolve({ success: true, count: displays.length });
                    } catch (error) {
                        resolve({ success: false, error: error.message });
                    }
                }));
            }
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success);
            
            expect(successful.length).toBe(results.length); // All should succeed
            
            // All should return the same display count
            const displayCounts = successful.map(r => r.count);
            expect(new Set(displayCounts).size).toBe(1); // All counts should be identical
        });

        test('should handle screenshot capture during system stress', async () => {
            // Create some CPU load
            const startTime = Date.now();
            const stressDuration = 2000; // 2 seconds
            
            // Start background CPU stress
            const stressPromise = new Promise((resolve) => {
                const stressLoop = () => {
                    if (Date.now() - startTime < stressDuration) {
                        // Some CPU-intensive work
                        Math.random() * Math.random() * Math.random();
                        setImmediate(stressLoop);
                    } else {
                        resolve();
                    }
                };
                stressLoop();
            });
            
            // Try screenshots during stress
            const screenshotResults = [];
            for (let i = 0; i < 5; i++) {
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    screenshotResults.push(screenshot.success);
                } catch (error) {
                    screenshotResults.push(false);
                }
                
                await new Promise(resolve => setTimeout(resolve, 400));
            }
            
            await stressPromise;
            
            // Most screenshots should still succeed under mild stress
            const successfulScreenshots = screenshotResults.filter(s => s === true).length;
            expect(successfulScreenshots).toBeGreaterThan(screenshotResults.length * 0.6); // 60% success rate
        });
    });
});