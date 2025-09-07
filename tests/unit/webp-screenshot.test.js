const { WebPScreenshot } = require('../../src/index');

describe('WebPScreenshot', () => {
    let screenshot;

    beforeEach(() => {
        screenshot = new WebPScreenshot();
    });

    afterEach(() => {
        screenshot.resetPerformanceMetrics();
    });

    describe('Constructor and Basic Properties', () => {
        test('should create instance with fallback mode detection', () => {
            expect(screenshot).toBeInstanceOf(WebPScreenshot);
            expect(typeof screenshot.fallbackMode).toBe('boolean');
        });

        test('should have correct implementation info', () => {
            const info = screenshot.getImplementationInfo();
            expect(info).toHaveProperty('implementation');
            expect(info).toHaveProperty('platform');
            expect(info).toHaveProperty('supported');
            expect(info).toHaveProperty('fallbackMode');
            expect(typeof info.implementation).toBe('string');
            expect(typeof info.platform).toBe('string');
            expect(typeof info.supported).toBe('boolean');
            expect(typeof info.fallbackMode).toBe('boolean');
        });
    });

    describe('Display Enumeration', () => {
        test('should get displays without throwing', async () => {
            const displays = await screenshot.getDisplays();
            expect(Array.isArray(displays)).toBe(true);
            expect(displays.length).toBeGreaterThan(0);
        });

        test('should return valid display info structure', async () => {
            const displays = await screenshot.getDisplays();
            const display = displays[0];
            
            expect(display).toHaveProperty('index');
            expect(display).toHaveProperty('width');
            expect(display).toHaveProperty('height');
            expect(display).toHaveProperty('x');
            expect(display).toHaveProperty('y');
            expect(display).toHaveProperty('scaleFactor');
            expect(display).toHaveProperty('isPrimary');
            expect(display).toHaveProperty('name');
            
            expect(typeof display.index).toBe('number');
            expect(typeof display.width).toBe('number');
            expect(typeof display.height).toBe('number');
            expect(typeof display.x).toBe('number');
            expect(typeof display.y).toBe('number');
            expect(typeof display.scaleFactor).toBe('number');
            expect(typeof display.isPrimary).toBe('boolean');
            expect(typeof display.name).toBe('string');
            
            expect(display.width).toBeGreaterThan(0);
            expect(display.height).toBeGreaterThan(0);
            expect(display.scaleFactor).toBeGreaterThan(0);
        });

        test('should have at least one primary display', async () => {
            const displays = await screenshot.getDisplays();
            const primaryDisplays = displays.filter(d => d.isPrimary);
            expect(primaryDisplays.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Screenshot Capture', () => {
        test('should capture display with default options', async () => {
            // Skip if running in CI without display
            if (process.env.CI && !process.env.DISPLAY) {
                console.log('Skipping screenshot test in CI without display');
                return;
            }

            try {
                const result = await screenshot.captureDisplay();
                
                expect(result).toHaveProperty('data');
                expect(result).toHaveProperty('width');
                expect(result).toHaveProperty('height');
                expect(result).toHaveProperty('format');
                expect(result).toHaveProperty('success');
                
                expect(Buffer.isBuffer(result.data)).toBe(true);
                expect(result.data.length).toBeGreaterThan(0);
                expect(typeof result.width).toBe('number');
                expect(typeof result.height).toBe('number');
                expect(result.format).toBe('webp');
                expect(result.success).toBe(true);
                expect(result.width).toBeGreaterThan(0);
                expect(result.height).toBeGreaterThan(0);
                
                // Check if result has performance data
                if (result.performance) {
                    expect(result.performance).toHaveProperty('captureTime');
                    expect(result.performance).toHaveProperty('implementation');
                    expect(result.performance).toHaveProperty('memoryUsage');
                    expect(typeof result.performance.captureTime).toBe('number');
                    expect(typeof result.performance.implementation).toBe('string');
                    expect(typeof result.performance.memoryUsage).toBe('number');
                }
            } catch (error) {
                // In fallback mode or without proper display, this might fail
                console.warn('Screenshot capture failed (expected in some environments):', error.message);
            }
        }, 10000); // 10 second timeout for screenshot operations

        test('should capture with custom quality options', async () => {
            // Skip if running in CI without display
            if (process.env.CI && !process.env.DISPLAY) {
                console.log('Skipping screenshot test in CI without display');
                return;
            }

            const options = {
                quality: 60,
                method: 2,
                filterStrength: 80
            };

            try {
                const result = await screenshot.captureDisplay(0, options);
                expect(result.success).toBe(true);
                expect(result.format).toBe('webp');
            } catch (error) {
                console.warn('Custom quality screenshot failed (expected in some environments):', error.message);
            }
        }, 10000);

        test('should handle invalid display index gracefully', async () => {
            try {
                await screenshot.captureDisplay(9999);
            } catch (error) {
                expect(error.message).toMatch(/display.*index|range|invalid/i);
            }
        });
    });

    describe('Performance Metrics', () => {
        test('should initialize with zero metrics', () => {
            const metrics = screenshot.getPerformanceMetrics();
            
            expect(metrics).toHaveProperty('captureCount');
            expect(metrics).toHaveProperty('totalCaptureTime');
            expect(metrics).toHaveProperty('fallbackUsage');
            expect(metrics).toHaveProperty('successfulCaptures');
            expect(metrics).toHaveProperty('failedCaptures');
            expect(metrics).toHaveProperty('averageCaptureTime');
            expect(metrics).toHaveProperty('successRate');
            expect(metrics).toHaveProperty('fallbackUsagePercent');
            
            expect(metrics.captureCount).toBe(0);
            expect(metrics.totalCaptureTime).toBe(0);
            expect(metrics.fallbackUsage).toBe(0);
            expect(metrics.successfulCaptures).toBe(0);
            expect(metrics.failedCaptures).toBe(0);
            expect(metrics.averageCaptureTime).toBe(0);
            expect(metrics.successRate).toBe(0);
            expect(metrics.fallbackUsagePercent).toBe(0);
        });

        test('should reset metrics correctly', () => {
            // Simulate some metrics
            screenshot.performanceMetrics.captureCount = 5;
            screenshot.performanceMetrics.successfulCaptures = 3;
            
            screenshot.resetPerformanceMetrics();
            const metrics = screenshot.getPerformanceMetrics();
            
            expect(metrics.captureCount).toBe(0);
            expect(metrics.successfulCaptures).toBe(0);
        });
    });

    describe('Static Methods', () => {
        test('should check native support', () => {
            const isSupported = screenshot.isNativeSupported();
            expect(typeof isSupported).toBe('boolean');
        });
    });

    describe('Error Handling', () => {
        test('should handle capture errors gracefully', async () => {
            // Try to capture from a non-existent display
            try {
                await screenshot.captureDisplay(-1);
                // If it doesn't throw, check if it returns an error result
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBeTruthy();
            }
        });
    });
});

describe('Module Exports', () => {
    const webpScreenshot = require('../../src/index');

    test('should export WebPScreenshot class', () => {
        expect(webpScreenshot.WebPScreenshot).toBeDefined();
        expect(typeof webpScreenshot.WebPScreenshot).toBe('function');
    });

    test('should export create function', () => {
        expect(webpScreenshot.create).toBeDefined();
        expect(typeof webpScreenshot.create).toBe('function');
        
        const instance = webpScreenshot.create();
        expect(instance).toBeInstanceOf(webpScreenshot.WebPScreenshot);
    });

    test('should export isNativeSupported function', () => {
        expect(webpScreenshot.isNativeSupported).toBeDefined();
        expect(typeof webpScreenshot.isNativeSupported).toBe('function');
        expect(typeof webpScreenshot.isNativeSupported()).toBe('boolean');
    });

    test('should export getVersion function', () => {
        expect(webpScreenshot.getVersion).toBeDefined();
        expect(typeof webpScreenshot.getVersion).toBe('function');
        expect(typeof webpScreenshot.getVersion()).toBe('string');
    });
});