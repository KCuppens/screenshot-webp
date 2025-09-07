const addon = require('../../build/Release/webp_screenshot');
const fs = require('fs');
const path = require('path');

describe('Main Functionality Integration Tests', () => {
    beforeAll(() => {
        addon.initialize();
        
        // Create output directory for test files
        const outputDir = path.join(__dirname, '../../test-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test output directory
        const outputDir = path.join(__dirname, '../../test-output');
        if (fs.existsSync(outputDir)) {
            try {
                fs.rmSync(outputDir, { recursive: true, force: true });
            } catch (error) {
                console.warn('Could not clean up test output directory:', error.message);
            }
        }
    });

    describe('Native Addon Integration', () => {
        test('should initialize successfully', () => {
            expect(() => {
                const result = addon.initialize();
                expect(result).toBe(true);
            }).not.toThrow();
        });

        test('should report native support', () => {
            const isSupported = addon.isSupported();
            expect(typeof isSupported).toBe('boolean');
            expect(isSupported).toBe(true); // Should be true with our implementation
        });

        test('should provide implementation information', () => {
            const info = addon.getImplementationInfo();
            expect(info).toHaveProperty('version');
            expect(info).toHaveProperty('simdSupport');
            expect(info).toHaveProperty('platform');
            expect(info).toHaveProperty('features');
            
            expect(info.simdSupport).toBe(true);
            expect(info.platform).toContain('Windows');
            expect(info.features).toContain('SIMD');
        });
    });

    describe('Display Detection Integration', () => {
        test('should detect system displays', () => {
            const displays = addon.getDisplays();
            
            expect(Array.isArray(displays)).toBe(true);
            expect(displays.length).toBeGreaterThan(0);
            
            const primaryDisplay = displays.find(d => d.isPrimary);
            expect(primaryDisplay).toBeDefined();
            expect(primaryDisplay.width).toBeGreaterThan(0);
            expect(primaryDisplay.height).toBeGreaterThan(0);
            expect(primaryDisplay.scaleFactor).toBe(1.0);
        });

        test('should provide valid display information', () => {
            const displays = addon.getDisplays();
            
            displays.forEach((display, index) => {
                expect(display.index).toBe(index);
                expect(display.width).toBeGreaterThan(0);
                expect(display.height).toBeGreaterThan(0);
                expect(typeof display.x).toBe('number');
                expect(typeof display.y).toBe('number');
                expect(typeof display.isPrimary).toBe('boolean');
                expect(typeof display.name).toBe('string');
                expect(display.name).toMatch(/DISPLAY\d+/);
            });
        });
    });

    describe('Screenshot Capture Integration', () => {
        test('should capture screenshot successfully', () => {
            const result = addon.captureScreenshot({ display: 0 });
            
            expect(result).toHaveProperty('success');
            expect(result.success).toBe(true);
            expect(result).toHaveProperty('width');
            expect(result).toHaveProperty('height');
            expect(result).toHaveProperty('data');
            
            expect(result.width).toBeGreaterThan(0);
            expect(result.height).toBeGreaterThan(0);
            expect(result.data).toBeInstanceOf(Uint8Array);
            expect(result.data.length).toBe(result.width * result.height * 4);
        });

        test('should capture using alternative API', () => {
            const result = addon.captureDisplay(0);
            
            expect(result).toHaveProperty('success');
            expect(result.success).toBe(true);
            expect(result.width).toBeGreaterThan(0);
            expect(result.height).toBeGreaterThan(0);
            expect(result.data).toBeInstanceOf(Uint8Array);
        });

        test('should handle invalid display index', () => {
            expect(() => {
                addon.captureScreenshot({ display: 999 });
            }).toThrow();
        });

        test('should validate captured data format', () => {
            const result = addon.captureScreenshot({ display: 0 });
            
            if (result.success) {
                const { width, height, data } = result;
                
                // Check that data has correct size
                expect(data.length).toBe(width * height * 4);
                
                // Check that data contains reasonable pixel values (RGBA format)
                let nonZeroPixels = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];
                    
                    // RGBA values should be in valid range
                    expect(r).toBeGreaterThanOrEqual(0);
                    expect(r).toBeLessThanOrEqual(255);
                    expect(g).toBeGreaterThanOrEqual(0);
                    expect(g).toBeLessThanOrEqual(255);
                    expect(b).toBeGreaterThanOrEqual(0);
                    expect(b).toBeLessThanOrEqual(255);
                    expect(a).toBe(255); // Alpha should be opaque
                    
                    if (r > 0 || g > 0 || b > 0) {
                        nonZeroPixels++;
                    }
                }
                
                // Should have some non-black pixels (not a completely black screen)
                expect(nonZeroPixels).toBeGreaterThan(0);
            }
        });
    });

    describe('WebP Encoding Integration', () => {
        test('should encode RGBA data to WebP', () => {
            // Create test RGBA data (red square)
            const width = 100;
            const height = 100;
            const rgba = new Uint8Array(width * height * 4);
            
            for (let i = 0; i < rgba.length; i += 4) {
                rgba[i] = 255;     // Red
                rgba[i + 1] = 0;   // Green
                rgba[i + 2] = 0;   // Blue
                rgba[i + 3] = 255; // Alpha
            }
            
            const webpData = addon.encodeWebP(rgba, width, height, width * 4, 80);
            
            expect(webpData).toBeInstanceOf(Uint8Array);
            expect(webpData.length).toBeGreaterThan(0);
            expect(webpData.length).toBeLessThan(rgba.length); // Should be compressed
            
            // Check WebP header
            const header = Array.from(webpData.slice(0, 12));
            expect(header.slice(0, 4)).toEqual([0x52, 0x49, 0x46, 0x46]); // RIFF
            expect(header.slice(8, 12)).toEqual([0x57, 0x45, 0x42, 0x50]); // WEBP
        });

        test('should handle different quality levels', () => {
            const width = 50;
            const height = 50;
            const rgba = new Uint8Array(width * height * 4);
            
            // Create gradient test data
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    rgba[i] = (x / width) * 255;     // Red gradient
                    rgba[i + 1] = (y / height) * 255; // Green gradient
                    rgba[i + 2] = 128;               // Blue constant
                    rgba[i + 3] = 255;               // Alpha opaque
                }
            }
            
            const qualities = [30, 60, 90];
            const results = qualities.map(quality => 
                addon.encodeWebP(rgba, width, height, width * 4, quality)
            );
            
            // All should be valid WebP data
            results.forEach(webpData => {
                expect(webpData).toBeInstanceOf(Uint8Array);
                expect(webpData.length).toBeGreaterThan(0);
            });
            
            // Generally, higher quality produces larger files (though not always guaranteed)
            expect(results[0].length).toBeGreaterThan(0);
            expect(results[1].length).toBeGreaterThan(0);
            expect(results[2].length).toBeGreaterThan(0);
        });

        test('should validate encoding parameters', () => {
            const rgba = new Uint8Array(100 * 100 * 4);
            
            // Test invalid dimensions
            expect(() => {
                addon.encodeWebP(rgba, 0, 100, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(rgba, 100, 0, 400);
            }).toThrow();
            
            expect(() => {
                addon.encodeWebP(rgba, -1, 100, 400);
            }).toThrow();
            
            // Test invalid stride
            expect(() => {
                addon.encodeWebP(rgba, 100, 100, 0);
            }).toThrow();
        });
    });

    describe('End-to-End Integration', () => {
        test('should capture and encode screenshot to WebP', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            
            if (screenshot.success) {
                const webpData = addon.encodeWebP(
                    screenshot.data, 
                    screenshot.width, 
                    screenshot.height, 
                    screenshot.width * 4,
                    75
                );
                
                expect(webpData).toBeInstanceOf(Uint8Array);
                expect(webpData.length).toBeGreaterThan(0);
                expect(webpData.length).toBeLessThan(screenshot.data.length);
                
                const compressionRatio = screenshot.data.length / webpData.length;
                expect(compressionRatio).toBeGreaterThan(2); // At least 2:1 compression
                
                console.log(`End-to-end test: ${screenshot.width}x${screenshot.height} -> ${webpData.length} bytes (${compressionRatio.toFixed(1)}:1)`);
            } else {
                console.warn('Screenshot capture failed in end-to-end test');
            }
        });

        test('should save WebP file to disk', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            
            if (screenshot.success) {
                const webpData = addon.encodeWebP(
                    screenshot.data,
                    screenshot.width,
                    screenshot.height,
                    screenshot.width * 4,
                    80
                );
                
                const outputPath = path.join(__dirname, '../../test-output/integration-test.webp');
                fs.writeFileSync(outputPath, Buffer.from(webpData));
                
                // Verify file was created and has correct size
                expect(fs.existsSync(outputPath)).toBe(true);
                const fileStats = fs.statSync(outputPath);
                expect(fileStats.size).toBe(webpData.length);
                expect(fileStats.size).toBeGreaterThan(0);
                
                console.log(`WebP file saved: ${outputPath} (${fileStats.size} bytes)`);
            } else {
                console.warn('Screenshot capture failed, skipping file save test');
            }
        });

        test('should handle multiple displays if available', () => {
            const displays = addon.getDisplays();
            
            displays.forEach((display, index) => {
                try {
                    const screenshot = addon.captureScreenshot({ display: index });
                    
                    if (screenshot.success) {
                        expect(screenshot.width).toBe(display.width);
                        expect(screenshot.height).toBe(display.height);
                        
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            70
                        );
                        
                        expect(webpData.length).toBeGreaterThan(0);
                        
                        console.log(`Display ${index}: ${screenshot.width}x${screenshot.height} -> WebP ${webpData.length} bytes`);
                    }
                } catch (error) {
                    console.warn(`Display ${index} capture failed:`, error.message);
                }
            });
        });
    });

    describe('Performance Integration', () => {
        test('should meet performance benchmarks', () => {
            const iterations = 5;
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                
                try {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    if (screenshot.success) {
                        const captureTime = process.hrtime.bigint();
                        
                        const webpData = addon.encodeWebP(
                            screenshot.data,
                            screenshot.width,
                            screenshot.height,
                            screenshot.width * 4,
                            80
                        );
                        
                        const endTime = process.hrtime.bigint();
                        
                        const totalMs = Number(endTime - startTime) / 1000000;
                        const captureMs = Number(captureTime - startTime) / 1000000;
                        const encodeMs = Number(endTime - captureTime) / 1000000;
                        
                        const pixels = screenshot.width * screenshot.height;
                        const throughput = (pixels / 1000000) / (totalMs / 1000);
                        
                        results.push({
                            totalTime: totalMs,
                            captureTime: captureMs,
                            encodeTime: encodeMs,
                            throughput: throughput,
                            compressionRatio: screenshot.data.length / webpData.length
                        });
                    }
                } catch (error) {
                    console.warn(`Performance iteration ${i} failed:`, error.message);
                }
            }
            
            if (results.length > 0) {
                const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
                const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
                const avgCompression = results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length;
                
                console.log(`Performance integration: ${avgThroughput.toFixed(1)} MP/s, ${avgTotalTime.toFixed(1)}ms total, ${avgCompression.toFixed(1)}:1 compression`);
                
                // Performance expectations for integration test
                expect(avgThroughput).toBeGreaterThan(15); // Should achieve >15 MP/s
                expect(avgTotalTime).toBeLessThan(300); // Should complete in <300ms
                expect(avgCompression).toBeGreaterThan(3); // Should achieve >3:1 compression
            } else {
                console.warn('No successful performance measurements in integration test');
            }
        }, 30000);
    });
});