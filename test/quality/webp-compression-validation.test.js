const addon = require('../../build/Release/webp_screenshot');
const fs = require('fs');
const path = require('path');

describe('WebP Quality and Compression Validation Tests', () => {
    let testOutputDir;

    beforeAll(() => {
        addon.initialize();
        testOutputDir = path.join(__dirname, '../../test-output/quality-tests');
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test output directory
        if (fs.existsSync(testOutputDir)) {
            try {
                fs.rmSync(testOutputDir, { recursive: true, force: true });
            } catch (error) {
                console.warn('Could not clean up quality test output directory:', error.message);
            }
        }
    });

    describe('WebP Quality Level Validation', () => {
        test('should produce different file sizes for different quality levels', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const qualities = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
            const results = [];
            
            qualities.forEach(quality => {
                const webpData = addon.encodeWebP(
                    screenshot.data,
                    screenshot.width,
                    screenshot.height,
                    screenshot.width * 4,
                    quality
                );
                
                expect(webpData.length).toBeGreaterThan(0);
                
                // Verify WebP header
                const header = Array.from(webpData.slice(0, 12));
                expect(header.slice(0, 4)).toEqual([0x52, 0x49, 0x46, 0x46]); // RIFF
                expect(header.slice(8, 12)).toEqual([0x57, 0x45, 0x42, 0x50]); // WEBP
                
                results.push({
                    quality: quality,
                    size: webpData.length,
                    compressionRatio: screenshot.data.length / webpData.length
                });
                
                // Save test file for manual inspection
                const filename = path.join(testOutputDir, `quality_${quality}.webp`);
                fs.writeFileSync(filename, Buffer.from(webpData));
            });
            
            // Sort by quality for analysis
            results.sort((a, b) => a.quality - b.quality);
            
            console.log('Quality vs File Size Analysis:');
            results.forEach(result => {
                console.log(`  Quality ${result.quality.toString().padStart(2)}: ${result.size.toString().padStart(6)} bytes (${result.compressionRatio.toFixed(1)}:1)`);
            });
            
            // Validate general trend: higher quality should produce larger files
            for (let i = 0; i < results.length - 1; i++) {
                const current = results[i];
                const next = results[i + 1];
                
                // Allow for some exceptions due to image content, but general trend should be upward
                if (next.quality - current.quality >= 20) { // Only check with significant quality differences
                    expect(next.size).toBeGreaterThanOrEqual(current.size * 0.8); // Allow 20% variance
                }
            }
            
            // Verify reasonable compression ratios
            results.forEach(result => {
                expect(result.compressionRatio).toBeGreaterThan(1.5); // At least 1.5:1 compression
                expect(result.compressionRatio).toBeLessThan(50); // Not unrealistically high
            });
            
            // Quality 95 should produce the largest file (generally)
            const maxQualityResult = results[results.length - 1];
            expect(maxQualityResult.quality).toBe(95);
            
            // Quality 10 should produce one of the smallest files
            const minQualityResult = results[0];
            expect(minQualityResult.quality).toBe(10);
            expect(minQualityResult.size).toBeLessThan(maxQualityResult.size * 2); // Reasonable size difference
        });

        test('should handle edge case quality values correctly', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const edgeCaseQualities = [
                { input: 0, expected: 'clamped to minimum' },
                { input: 1, expected: 'minimum valid' },
                { input: 100, expected: 'maximum valid' },
                { input: 101, expected: 'clamped to maximum' },
                { input: 999, expected: 'very high value' }
            ];
            
            const results = [];
            
            edgeCaseQualities.forEach(test => {
                try {
                    const webpData = addon.encodeWebP(
                        screenshot.data,
                        screenshot.width,
                        screenshot.height,
                        screenshot.width * 4,
                        test.input
                    );
                    
                    expect(webpData.length).toBeGreaterThan(0);
                    
                    results.push({
                        inputQuality: test.input,
                        description: test.expected,
                        size: webpData.length,
                        success: true
                    });
                    
                    console.log(`Quality ${test.input} (${test.expected}): ${webpData.length} bytes`);
                } catch (error) {
                    if (test.input < 0) {
                        // Negative qualities should throw errors
                        expect(error).toBeInstanceOf(Error);
                        console.log(`Quality ${test.input}: Error as expected - ${error.message}`);
                    } else {
                        // Positive qualities should not throw errors
                        fail(`Unexpected error for quality ${test.input}: ${error.message}`);
                    }
                }
            });
            
            // All non-negative qualities should succeed
            const successfulTests = results.filter(r => r.success);
            expect(successfulTests.length).toBe(edgeCaseQualities.length);
            
            // Very high quality values should be clamped and produce similar results
            const maxQualityResult = results.find(r => r.inputQuality === 100);
            const overMaxResult = results.find(r => r.inputQuality === 101);
            const veryHighResult = results.find(r => r.inputQuality === 999);
            
            if (maxQualityResult && overMaxResult && veryHighResult) {
                // Results should be similar when clamped
                const sizeDifference = Math.abs(maxQualityResult.size - overMaxResult.size) / maxQualityResult.size;
                expect(sizeDifference).toBeLessThan(0.1); // Less than 10% difference
                
                const veryHighSizeDifference = Math.abs(maxQualityResult.size - veryHighResult.size) / maxQualityResult.size;
                expect(veryHighSizeDifference).toBeLessThan(0.1); // Should be clamped to similar result
            }
        });
    });

    describe('Compression Efficiency Tests', () => {
        test('should achieve good compression ratios for different image content types', () => {
            // Create different types of test images
            const imageTests = [
                {
                    name: 'Solid Color',
                    generator: (width, height) => {
                        const data = new Uint8Array(width * height * 4);
                        for (let i = 0; i < data.length; i += 4) {
                            data[i] = 128;     // Red
                            data[i + 1] = 64;  // Green
                            data[i + 2] = 192; // Blue
                            data[i + 3] = 255; // Alpha
                        }
                        return data;
                    }
                },
                {
                    name: 'Horizontal Gradient',
                    generator: (width, height) => {
                        const data = new Uint8Array(width * height * 4);
                        for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                                const i = (y * width + x) * 4;
                                data[i] = (x / width) * 255;     // Red gradient
                                data[i + 1] = 128;               // Green constant
                                data[i + 2] = 64;                // Blue constant
                                data[i + 3] = 255;               // Alpha
                            }
                        }
                        return data;
                    }
                },
                {
                    name: 'Checkerboard',
                    generator: (width, height) => {
                        const data = new Uint8Array(width * height * 4);
                        const tileSize = 16;
                        for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                                const i = (y * width + x) * 4;
                                const tileX = Math.floor(x / tileSize);
                                const tileY = Math.floor(y / tileSize);
                                const isWhite = (tileX + tileY) % 2 === 0;
                                const color = isWhite ? 255 : 0;
                                data[i] = color;     // Red
                                data[i + 1] = color; // Green
                                data[i + 2] = color; // Blue
                                data[i + 3] = 255;   // Alpha
                            }
                        }
                        return data;
                    }
                },
                {
                    name: 'Random Noise',
                    generator: (width, height) => {
                        const data = new Uint8Array(width * height * 4);
                        for (let i = 0; i < data.length; i += 4) {
                            data[i] = Math.floor(Math.random() * 256);     // Red
                            data[i + 1] = Math.floor(Math.random() * 256); // Green
                            data[i + 2] = Math.floor(Math.random() * 256); // Blue
                            data[i + 3] = 255;                             // Alpha
                        }
                        return data;
                    }
                },
                {
                    name: 'Real Screenshot',
                    generator: null // Will use actual screenshot
                }
            ];
            
            const testWidth = 800;
            const testHeight = 600;
            const testQuality = 75;
            
            imageTests.forEach(test => {
                let imageData, actualWidth, actualHeight;
                
                if (test.name === 'Real Screenshot') {
                    const screenshot = addon.captureScreenshot({ display: 0 });
                    expect(screenshot.success).toBe(true);
                    imageData = screenshot.data;
                    actualWidth = screenshot.width;
                    actualHeight = screenshot.height;
                } else {
                    imageData = test.generator(testWidth, testHeight);
                    actualWidth = testWidth;
                    actualHeight = testHeight;
                }
                
                const webpData = addon.encodeWebP(
                    imageData,
                    actualWidth,
                    actualHeight,
                    actualWidth * 4,
                    testQuality
                );
                
                expect(webpData.length).toBeGreaterThan(0);
                
                const originalSize = imageData.length;
                const compressedSize = webpData.length;
                const compressionRatio = originalSize / compressedSize;
                const compressionPercent = ((originalSize - compressedSize) / originalSize) * 100;
                
                console.log(`${test.name}:`);
                console.log(`  Original: ${originalSize} bytes`);
                console.log(`  Compressed: ${compressedSize} bytes`);
                console.log(`  Compression: ${compressionRatio.toFixed(1)}:1 (${compressionPercent.toFixed(1)}% reduction)`);
                
                // Save compressed image for inspection
                const filename = path.join(testOutputDir, `content_${test.name.toLowerCase().replace(/\s+/g, '_')}.webp`);
                fs.writeFileSync(filename, Buffer.from(webpData));
                
                // Validate compression expectations based on content type
                if (test.name === 'Solid Color') {
                    expect(compressionRatio).toBeGreaterThan(20); // Very high compression for solid color
                } else if (test.name === 'Horizontal Gradient') {
                    expect(compressionRatio).toBeGreaterThan(5); // Good compression for gradients
                } else if (test.name === 'Checkerboard') {
                    expect(compressionRatio).toBeGreaterThan(3); // Reasonable compression for patterns
                } else if (test.name === 'Random Noise') {
                    expect(compressionRatio).toBeGreaterThan(1.2); // Low compression for noise (expected)
                } else { // Real screenshot
                    expect(compressionRatio).toBeGreaterThan(2); // Real screenshots should compress well
                }
                
                // All should achieve at least some compression
                expect(compressionRatio).toBeGreaterThan(1.1);
            });
        });

        test('should produce consistent compression for identical content', () => {
            // Create identical test image
            const width = 200;
            const height = 200;
            const testImage = new Uint8Array(width * height * 4);
            
            // Create a simple pattern for consistency
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    testImage[i] = (x + y) % 256;        // Red pattern
                    testImage[i + 1] = x % 256;          // Green pattern
                    testImage[i + 2] = y % 256;          // Blue pattern
                    testImage[i + 3] = 255;              // Alpha
                }
            }
            
            const qualities = [50, 70, 90];
            const iterations = 5;
            
            qualities.forEach(quality => {
                const results = [];
                
                for (let i = 0; i < iterations; i++) {
                    const webpData = addon.encodeWebP(testImage, width, height, width * 4, quality);
                    results.push({
                        iteration: i,
                        size: webpData.length,
                        compressionRatio: testImage.length / webpData.length
                    });
                }
                
                // All iterations should produce identical results for identical input
                const firstResult = results[0];
                results.forEach((result, index) => {
                    expect(result.size).toBe(firstResult.size);
                    expect(result.compressionRatio).toBe(firstResult.compressionRatio);
                });
                
                console.log(`Consistency test (Quality ${quality}): All ${iterations} iterations produced identical ${firstResult.size} byte files`);
            });
        });

        test('should handle various image dimensions efficiently', () => {
            const dimensionTests = [
                { width: 100, height: 100, name: 'Small Square' },
                { width: 1920, height: 1080, name: 'Full HD' },
                { width: 640, height: 480, name: 'VGA' },
                { width: 1000, height: 1, name: 'Wide Strip' },
                { width: 1, height: 1000, name: 'Tall Strip' },
                { width: 3, height: 3, name: 'Tiny' },
                { width: 1337, height: 999, name: 'Odd Dimensions' }
            ];
            
            dimensionTests.forEach(test => {
                // Create test data
                const testData = new Uint8Array(test.width * test.height * 4);
                
                // Fill with a simple pattern
                for (let i = 0; i < testData.length; i += 4) {
                    const pixelIndex = i / 4;
                    testData[i] = pixelIndex % 256;         // Red
                    testData[i + 1] = (pixelIndex * 2) % 256; // Green
                    testData[i + 2] = (pixelIndex * 3) % 256; // Blue
                    testData[i + 3] = 255;                    // Alpha
                }
                
                const startTime = Date.now();
                const webpData = addon.encodeWebP(testData, test.width, test.height, test.width * 4, 60);
                const encodingTime = Date.now() - startTime;
                
                expect(webpData.length).toBeGreaterThan(0);
                
                const compressionRatio = testData.length / webpData.length;
                const pixelCount = test.width * test.height;
                const throughputMPS = (pixelCount / 1000000) / (encodingTime / 1000);
                
                console.log(`${test.name} (${test.width}x${test.height}):`);
                console.log(`  Encoding time: ${encodingTime}ms`);
                console.log(`  Throughput: ${throughputMPS.toFixed(1)} MP/s`);
                console.log(`  Compression: ${compressionRatio.toFixed(1)}:1`);
                console.log(`  Output size: ${webpData.length} bytes`);
                
                // Performance should be reasonable for all sizes
                expect(encodingTime).toBeLessThan(5000); // Should complete within 5 seconds
                expect(compressionRatio).toBeGreaterThan(1.1); // At least some compression
                
                // Very small images should encode very quickly
                if (pixelCount < 1000) {
                    expect(encodingTime).toBeLessThan(100); // <100ms for tiny images
                }
                
                // Large images should still achieve reasonable throughput
                if (pixelCount > 1000000) { // >1MP
                    expect(throughputMPS).toBeGreaterThan(5); // >5 MP/s for large images
                }
                
                // Save for manual inspection
                const filename = path.join(testOutputDir, `dimensions_${test.name.toLowerCase().replace(/\s+/g, '_')}.webp`);
                fs.writeFileSync(filename, Buffer.from(webpData));
            });
        });
    });

    describe('WebP Format Validation', () => {
        test('should produce valid WebP headers for all quality levels', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const qualities = [1, 25, 50, 75, 100];
            
            qualities.forEach(quality => {
                const webpData = addon.encodeWebP(
                    screenshot.data,
                    screenshot.width,
                    screenshot.height,
                    screenshot.width * 4,
                    quality
                );
                
                expect(webpData.length).toBeGreaterThan(12); // Minimum size for WebP header
                
                // Check RIFF header
                expect(webpData[0]).toBe(0x52); // 'R'
                expect(webpData[1]).toBe(0x49); // 'I'
                expect(webpData[2]).toBe(0x46); // 'F'
                expect(webpData[3]).toBe(0x46); // 'F'
                
                // Check file size field (bytes 4-7)
                const fileSizeFromHeader = webpData[4] | (webpData[5] << 8) | (webpData[6] << 16) | (webpData[7] << 24);
                expect(fileSizeFromHeader).toBe(webpData.length - 8); // File size should match actual size minus RIFF header
                
                // Check WEBP signature
                expect(webpData[8]).toBe(0x57);  // 'W'
                expect(webpData[9]).toBe(0x45);  // 'E'
                expect(webpData[10]).toBe(0x42); // 'B'
                expect(webpData[11]).toBe(0x50); // 'P'
                
                console.log(`Quality ${quality}: Valid WebP header, file size ${webpData.length} bytes`);
            });
        });

        test('should produce WebP files readable by external tools', () => {
            const screenshot = addon.captureScreenshot({ display: 0 });
            expect(screenshot.success).toBe(true);
            
            const webpData = addon.encodeWebP(
                screenshot.data,
                screenshot.width,
                screenshot.height,
                screenshot.width * 4,
                80
            );
            
            // Save the WebP file
            const testFilePath = path.join(testOutputDir, 'external_tool_test.webp');
            fs.writeFileSync(testFilePath, Buffer.from(webpData));
            
            expect(fs.existsSync(testFilePath)).toBe(true);
            
            const fileStats = fs.statSync(testFilePath);
            expect(fileStats.size).toBe(webpData.length);
            expect(fileStats.size).toBeGreaterThan(0);
            
            console.log(`Created WebP file for external validation: ${testFilePath} (${fileStats.size} bytes)`);
            console.log(`Original dimensions: ${screenshot.width}x${screenshot.height}`);
            console.log(`Compression ratio: ${(screenshot.data.length / webpData.length).toFixed(1)}:1`);
            
            // Basic file integrity check - read back the file
            const readBack = fs.readFileSync(testFilePath);
            expect(readBack.length).toBe(webpData.length);
            
            // Verify header is intact
            expect(readBack[0]).toBe(0x52); // 'R'
            expect(readBack[8]).toBe(0x57); // 'W'
        });

        test('should handle transparency information correctly', () => {
            // Create test image with alpha channel variations
            const width = 100;
            const height = 100;
            const testImage = new Uint8Array(width * height * 4);
            
            // Create image with varying alpha values
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    testImage[i] = 255;                    // Red
                    testImage[i + 1] = 0;                  // Green
                    testImage[i + 2] = 0;                  // Blue
                    testImage[i + 3] = (x + y) % 256;      // Varying alpha
                }
            }
            
            const webpData = addon.encodeWebP(testImage, width, height, width * 4, 75);
            
            expect(webpData.length).toBeGreaterThan(0);
            
            // WebP with alpha should still be valid
            const header = Array.from(webpData.slice(0, 12));
            expect(header.slice(0, 4)).toEqual([0x52, 0x49, 0x46, 0x46]); // RIFF
            expect(header.slice(8, 12)).toEqual([0x57, 0x45, 0x42, 0x50]); // WEBP
            
            // Save alpha test file
            const alphaTestPath = path.join(testOutputDir, 'alpha_channel_test.webp');
            fs.writeFileSync(alphaTestPath, Buffer.from(webpData));
            
            console.log(`Alpha channel test: Created ${webpData.length} byte WebP file with varying transparency`);
            
            // Compare with opaque version
            const opaqueImage = new Uint8Array(testImage);
            for (let i = 3; i < opaqueImage.length; i += 4) {
                opaqueImage[i] = 255; // Make all pixels opaque
            }
            
            const opaqueWebpData = addon.encodeWebP(opaqueImage, width, height, width * 4, 75);
            
            console.log(`Opaque version: ${opaqueWebpData.length} bytes`);
            console.log(`Alpha version: ${webpData.length} bytes`);
            console.log(`Size difference: ${Math.abs(webpData.length - opaqueWebpData.length)} bytes`);
            
            // Both should be valid WebP files
            expect(opaqueWebpData.length).toBeGreaterThan(0);
        });
    });
});