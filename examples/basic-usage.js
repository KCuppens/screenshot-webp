#!/usr/bin/env node

const { WebPScreenshot } = require('../src/index');
const fs = require('fs').promises;
const path = require('path');

/**
 * Basic usage example for WebP Screenshot
 */
async function basicExample() {
    console.log('🖼️  WebP Screenshot - Basic Usage Example');
    console.log('═'.repeat(50));

    // Create a new WebP screenshot instance
    const screenshot = new WebPScreenshot();

    try {
        // Get implementation information
        const info = screenshot.getImplementationInfo();
        console.log('\n📋 Implementation Info:');
        console.log(`  Platform: ${info.platform}`);
        console.log(`  Implementation: ${info.implementation}`);
        console.log(`  Fallback Mode: ${info.fallbackMode ? 'Yes' : 'No'}`);
        console.log(`  Native Supported: ${info.supported ? 'Yes' : 'No'}`);

        // Get available displays
        console.log('\n🖥️  Available Displays:');
        const displays = await screenshot.getDisplays();
        
        displays.forEach((display, index) => {
            console.log(`  Display ${index}:`);
            console.log(`    Name: ${display.name}`);
            console.log(`    Resolution: ${display.width}x${display.height}`);
            console.log(`    Position: (${display.x}, ${display.y})`);
            console.log(`    Scale Factor: ${display.scaleFactor}x`);
            console.log(`    Primary: ${display.isPrimary ? 'Yes' : 'No'}`);
        });

        // Capture screenshot from primary display with default settings
        console.log('\n📸 Capturing Primary Display (Default Quality)...');
        
        const startTime = Date.now();
        const result = await screenshot.captureDisplay(0);
        const endTime = Date.now();
        
        if (result.success) {
            console.log(`✅ Capture successful!`);
            console.log(`  Resolution: ${result.width}x${result.height}`);
            console.log(`  Format: ${result.format}`);
            console.log(`  File Size: ${(result.data.length / 1024).toFixed(1)} KB`);
            console.log(`  Capture Time: ${endTime - startTime}ms`);
            
            if (result.performance) {
                console.log(`  Implementation: ${result.performance.implementation}`);
                console.log(`  Memory Used: ${(result.performance.memoryUsage / 1024 / 1024).toFixed(1)} MB`);
            }

            // Save to file
            const outputPath = path.join(__dirname, 'output', 'screenshot-default.webp');
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, result.data);
            console.log(`  Saved to: ${outputPath}`);
        } else {
            console.log(`❌ Capture failed: ${result.error}`);
        }

    } catch (error) {
        console.error(`❌ Example failed: ${error.message}`);
        return;
    }

    // Demonstrate different quality settings
    console.log('\n🎛️  Quality Comparison...');
    
    const qualityTests = [
        { quality: 50, suffix: 'low' },
        { quality: 80, suffix: 'medium' }, 
        { quality: 95, suffix: 'high' }
    ];

    for (const test of qualityTests) {
        try {
            const startTime = Date.now();
            const result = await screenshot.captureDisplay(0, { 
                quality: test.quality,
                method: 4  // Balanced compression method
            });
            const endTime = Date.now();

            if (result.success) {
                console.log(`  Quality ${test.quality}%: ${(result.data.length / 1024).toFixed(1)} KB, ${endTime - startTime}ms`);
                
                const outputPath = path.join(__dirname, 'output', `screenshot-${test.suffix}-q${test.quality}.webp`);
                await fs.writeFile(outputPath, result.data);
            } else {
                console.log(`  Quality ${test.quality}%: Failed - ${result.error}`);
            }
        } catch (error) {
            console.log(`  Quality ${test.quality}%: Error - ${error.message}`);
        }
    }

    // Show performance metrics
    console.log('\n📊 Performance Metrics:');
    const metrics = screenshot.getPerformanceMetrics();
    console.log(`  Total Captures: ${metrics.captureCount}`);
    console.log(`  Successful: ${metrics.successfulCaptures}`);
    console.log(`  Failed: ${metrics.failedCaptures}`);
    console.log(`  Success Rate: ${metrics.successRate.toFixed(1)}%`);
    console.log(`  Average Time: ${metrics.averageCaptureTime.toFixed(2)}ms`);
    console.log(`  Fallback Usage: ${metrics.fallbackUsagePercent.toFixed(1)}%`);

    console.log('\n✅ Example completed successfully!');
    console.log('\n📁 Check the examples/output/ directory for generated WebP files');
}

// Run the example
if (require.main === module) {
    basicExample().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
}

module.exports = { basicExample };