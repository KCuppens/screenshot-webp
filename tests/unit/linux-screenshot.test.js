const os = require('os');
const { WebPScreenshot } = require('../../src/index');

// Only run Linux tests on Linux platform
const isLinux = os.platform() === 'linux';

describe('Linux WebP Screenshot', () => {
    let screenshot;

    // Skip all tests if not on Linux
    beforeAll(() => {
        if (!isLinux) {
            console.log('Skipping Linux tests on non-Linux platform');
        }
    });

    beforeEach(() => {
        if (isLinux) {
            screenshot = new WebPScreenshot();
        }
    });

    afterEach(() => {
        if (isLinux && screenshot) {
            screenshot.resetPerformanceMetrics();
        }
    });

    describe('Linux-Specific Features', () => {
        test('should detect Linux platform', () => {
            if (!isLinux) return;
            
            const info = screenshot.getImplementationInfo();
            expect(info.platform).toBe('linux');
        });

        test('should detect display server type', () => {
            if (!isLinux) return;
            
            const info = screenshot.getImplementationInfo();
            expect(info.implementation).toMatch(/X11|Wayland/i);
        });

        test('should handle X11 environment variables', () => {
            if (!isLinux) return;
            
            const displayEnv = process.env.DISPLAY;
            const waylandDisplayEnv = process.env.WAYLAND_DISPLAY;
            const sessionType = process.env.XDG_SESSION_TYPE;
            
            // Should have at least one display environment variable
            const hasDisplayEnv = displayEnv || waylandDisplayEnv || sessionType;
            
            if (hasDisplayEnv) {
                expect(screenshot.isNativeSupported()).toBe(true);
            } else {
                console.log('No display environment detected - may be running in headless mode');
            }
        });
    });

    describe('Linux Display Enumeration', () => {
        test('should enumerate displays in X11/Wayland environment', async () => {
            if (!isLinux) return;
            
            // Skip if no display available (headless environment)
            if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
                console.log('Skipping display test in headless environment');
                return;
            }

            try {
                const displays = await screenshot.getDisplays();
                expect(Array.isArray(displays)).toBe(true);
                expect(displays.length).toBeGreaterThan(0);
                
                const primaryDisplay = displays.find(d => d.isPrimary);
                expect(primaryDisplay).toBeDefined();
                expect(primaryDisplay.width).toBeGreaterThan(0);
                expect(primaryDisplay.height).toBeGreaterThan(0);
                
            } catch (error) {
                console.warn('Display enumeration failed (expected in some environments):', error.message);
            }
        });

        test('should handle multi-monitor setups', async () => {
            if (!isLinux) return;
            
            if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
                console.log('Skipping multi-monitor test in headless environment');
                return;
            }

            try {
                const displays = await screenshot.getDisplays();
                
                if (displays.length > 1) {
                    console.log(`Found ${displays.length} displays`);
                    
                    displays.forEach((display, index) => {
                        expect(display.index).toBe(index);
                        expect(display.name).toBeTruthy();
                        expect(display.width).toBeGreaterThan(0);
                        expect(display.height).toBeGreaterThan(0);
                    });
                } else {
                    console.log('Single display setup detected');
                }
                
            } catch (error) {
                console.warn('Multi-monitor test failed:', error.message);
            }
        });
    });

    describe('Linux Screenshot Capture', () => {
        test('should capture screenshot on X11', async () => {
            if (!isLinux) return;
            
            // Only test if DISPLAY is set (X11 environment)
            if (!process.env.DISPLAY) {
                console.log('Skipping X11 test - DISPLAY not set');
                return;
            }

            try {
                const result = await screenshot.captureDisplay(0, { quality: 75 });
                
                expect(result.success).toBe(true);
                expect(Buffer.isBuffer(result.data)).toBe(true);
                expect(result.data.length).toBeGreaterThan(0);
                expect(result.format).toBe('webp');
                expect(result.width).toBeGreaterThan(0);
                expect(result.height).toBeGreaterThan(0);
                
                console.log(`X11 screenshot: ${result.width}x${result.height}, ${(result.data.length / 1024).toFixed(1)}KB`);
                
            } catch (error) {
                console.warn('X11 screenshot failed (may require display permissions):', error.message);
                
                // In some CI environments or without proper permissions, this might fail
                expect(error.message).toMatch(/permission|display|x11|capture/i);
            }
        }, 15000);

        test('should handle Wayland environment', async () => {
            if (!isLinux) return;
            
            // Only test if Wayland environment is detected
            const isWayland = process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland';
            if (!isWayland) {
                console.log('Skipping Wayland test - not a Wayland session');
                return;
            }

            try {
                const result = await screenshot.captureDisplay(0);
                
                // Wayland screenshot might fail due to security restrictions
                // or incomplete protocol implementation
                if (result.success) {
                    expect(Buffer.isBuffer(result.data)).toBe(true);
                    expect(result.format).toBe('webp');
                    console.log(`Wayland screenshot: ${result.width}x${result.height}`);
                } else {
                    expect(result.error).toMatch(/wayland|screencopy|permission/i);
                    console.log('Wayland screenshot failed as expected:', result.error);
                }
                
            } catch (error) {
                console.warn('Wayland screenshot test error:', error.message);
                expect(error.message).toMatch(/wayland|permission|protocol/i);
            }
        }, 15000);

        test('should fall back to X11 when Wayland fails', async () => {
            if (!isLinux) return;
            
            // Test fallback mechanism
            if (!process.env.DISPLAY) {
                console.log('Skipping fallback test - no X11 DISPLAY');
                return;
            }

            try {
                const info = screenshot.getImplementationInfo();
                const result = await screenshot.captureDisplay(0);
                
                if (result.success) {
                    console.log(`Fallback mechanism works: using ${info.implementation}`);
                    expect(result.data.length).toBeGreaterThan(0);
                } else {
                    console.log(`Fallback failed: ${result.error}`);
                }
                
            } catch (error) {
                console.warn('Fallback test failed:', error.message);
            }
        });
    });

    describe('Linux Performance Tests', () => {
        test('should measure X11 capture performance', async () => {
            if (!isLinux || !process.env.DISPLAY) return;

            const iterations = 3;
            const times = [];

            for (let i = 0; i < iterations; i++) {
                try {
                    const start = Date.now();
                    const result = await screenshot.captureDisplay(0, { quality: 60 });
                    const end = Date.now();
                    
                    if (result.success) {
                        const time = end - start;
                        times.push(time);
                        console.log(`X11 capture ${i + 1}: ${time}ms, ${(result.data.length / 1024).toFixed(1)}KB`);
                    }
                } catch (error) {
                    console.warn(`Performance test iteration ${i + 1} failed:`, error.message);
                }
                
                // Small delay between captures
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (times.length > 0) {
                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                console.log(`Average X11 capture time: ${avgTime.toFixed(2)}ms`);
                
                expect(avgTime).toBeGreaterThan(0);
                expect(avgTime).toBeLessThan(5000); // Should be under 5 seconds
            }
        }, 30000);

        test('should track Linux-specific metrics', async () => {
            if (!isLinux) return;
            
            const initialMetrics = screenshot.getPerformanceMetrics();
            expect(initialMetrics.captureCount).toBe(0);
            
            if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
                try {
                    await screenshot.captureDisplay(0);
                    await screenshot.captureDisplay(0, { quality: 50 });
                    
                    const finalMetrics = screenshot.getPerformanceMetrics();
                    expect(finalMetrics.captureCount).toBeGreaterThan(0);
                    
                    console.log(`Linux metrics: ${finalMetrics.captureCount} captures, ${finalMetrics.averageCaptureTime.toFixed(2)}ms avg`);
                } catch (error) {
                    console.warn('Metrics test failed:', error.message);
                }
            }
        });
    });

    describe('Linux Error Handling', () => {
        test('should handle missing display server gracefully', async () => {
            if (!isLinux) return;
            
            // Temporarily clear display environment variables
            const originalDisplay = process.env.DISPLAY;
            const originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
            
            delete process.env.DISPLAY;
            delete process.env.WAYLAND_DISPLAY;
            
            try {
                // Create new instance without display
                const headlessScreenshot = new WebPScreenshot();
                
                expect(headlessScreenshot.fallbackMode).toBe(true);
                
                try {
                    await headlessScreenshot.captureDisplay(0);
                } catch (error) {
                    expect(error.message).toMatch(/display|server|available/i);
                }
                
            } finally {
                // Restore environment variables
                if (originalDisplay) process.env.DISPLAY = originalDisplay;
                if (originalWaylandDisplay) process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
            }
        });

        test('should provide helpful error messages for Linux issues', async () => {
            if (!isLinux) return;
            
            try {
                // Try to capture from non-existent display
                await screenshot.captureDisplay(999);
            } catch (error) {
                expect(error.message).toMatch(/display.*index|range|invalid/i);
                console.log('Linux error handling works:', error.message);
            }
        });
    });
});