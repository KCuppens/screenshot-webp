#!/usr/bin/env node

const { WebPScreenshot } = require('../../src/index');
const fs = require('fs').promises;
const path = require('path');

/**
 * Performance benchmarking suite for WebP screenshot capture
 */
class PerformanceBenchmark {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                memory: process.memoryUsage()
            },
            benchmarks: []
        };
        
        this.screenshot = new WebPScreenshot();
    }

    /**
     * Run all benchmarks
     */
    async runAll() {
        console.log('🚀 Starting WebP Screenshot Performance Benchmark');
        console.log(`Platform: ${process.platform} ${process.arch}`);
        console.log(`Node.js: ${process.version}`);
        console.log(`Implementation: ${this.screenshot.getImplementationInfo().implementation}`);
        console.log(`Fallback Mode: ${this.screenshot.fallbackMode ? 'Yes' : 'No'}`);
        console.log('─'.repeat(60));

        try {
            await this.benchmarkBasicCapture();
            await this.benchmarkQualitySettings();
            await this.benchmarkMultipleDisplays();
            await this.benchmarkMemoryUsage();
            await this.benchmarkRepeatedCaptures();
            
            await this.generateReport();
            
        } catch (error) {
            console.error('❌ Benchmark failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Benchmark basic screenshot capture
     */
    async benchmarkBasicCapture() {
        console.log('\n📸 Benchmarking Basic Capture...');
        
        const iterations = 5;
        const times = [];
        const sizes = [];
        
        for (let i = 0; i < iterations; i++) {
            try {
                const start = process.hrtime.bigint();
                const result = await this.screenshot.captureDisplay(0);
                const end = process.hrtime.bigint();
                
                const timeMs = Number(end - start) / 1000000;
                times.push(timeMs);
                sizes.push(result.data.length);
                
                console.log(`  Iteration ${i + 1}: ${timeMs.toFixed(2)}ms, ${(result.data.length / 1024).toFixed(1)}KB`);
                
            } catch (error) {
                console.log(`  Iteration ${i + 1}: Failed - ${error.message}`);
                times.push(null);
                sizes.push(null);
            }
        }
        
        const validTimes = times.filter(t => t !== null);
        const validSizes = sizes.filter(s => s !== null);
        
        if (validTimes.length > 0) {
            const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
            const avgSize = validSizes.reduce((a, b) => a + b, 0) / validSizes.length;
            const minTime = Math.min(...validTimes);
            const maxTime = Math.max(...validTimes);
            
            console.log(`  Average: ${avgTime.toFixed(2)}ms, ${(avgSize / 1024).toFixed(1)}KB`);
            console.log(`  Range: ${minTime.toFixed(2)}ms - ${maxTime.toFixed(2)}ms`);
            
            this.results.benchmarks.push({
                name: 'Basic Capture',
                iterations: iterations,
                successful: validTimes.length,
                averageTimeMs: avgTime,
                minTimeMs: minTime,
                maxTimeMs: maxTime,
                averageSizeBytes: avgSize,
                times: times,
                sizes: sizes
            });
        } else {
            console.log('  ❌ All captures failed');
        }
    }

    /**
     * Benchmark different quality settings
     */
    async benchmarkQualitySettings() {
        console.log('\n🎛️  Benchmarking Quality Settings...');
        
        const qualityTests = [
            { quality: 50, name: 'Low Quality' },
            { quality: 80, name: 'Default Quality' },
            { quality: 95, name: 'High Quality' }
        ];
        
        const qualityResults = [];
        
        for (const test of qualityTests) {
            try {
                const start = process.hrtime.bigint();
                const result = await this.screenshot.captureDisplay(0, { quality: test.quality });
                const end = process.hrtime.bigint();
                
                const timeMs = Number(end - start) / 1000000;
                
                console.log(`  ${test.name} (${test.quality}%): ${timeMs.toFixed(2)}ms, ${(result.data.length / 1024).toFixed(1)}KB`);
                
                qualityResults.push({
                    quality: test.quality,
                    name: test.name,
                    timeMs: timeMs,
                    sizeBytes: result.data.length,
                    success: true
                });
                
            } catch (error) {
                console.log(`  ${test.name} (${test.quality}%): Failed - ${error.message}`);
                qualityResults.push({
                    quality: test.quality,
                    name: test.name,
                    error: error.message,
                    success: false
                });
            }
        }
        
        this.results.benchmarks.push({
            name: 'Quality Settings',
            results: qualityResults
        });
    }

    /**
     * Benchmark multiple display capture
     */
    async benchmarkMultipleDisplays() {
        console.log('\n🖥️  Benchmarking Multiple Displays...');
        
        try {
            const displays = await this.screenshot.getDisplays();
            console.log(`  Found ${displays.length} display(s)`);
            
            const start = process.hrtime.bigint();
            const results = await this.screenshot.captureAllDisplays();
            const end = process.hrtime.bigint();
            
            const timeMs = Number(end - start) / 1000000;
            const successful = results.filter(r => r.success).length;
            const totalSize = results.reduce((sum, r) => sum + (r.data ? r.data.length : 0), 0);
            
            console.log(`  Captured ${successful}/${displays.length} displays in ${timeMs.toFixed(2)}ms`);
            console.log(`  Total size: ${(totalSize / 1024).toFixed(1)}KB`);
            console.log(`  Average per display: ${(timeMs / displays.length).toFixed(2)}ms`);
            
            this.results.benchmarks.push({
                name: 'Multiple Displays',
                displayCount: displays.length,
                successful: successful,
                totalTimeMs: timeMs,
                averageTimePerDisplay: timeMs / displays.length,
                totalSizeBytes: totalSize
            });
            
        } catch (error) {
            console.log(`  ❌ Multiple display capture failed: ${error.message}`);
        }
    }

    /**
     * Benchmark memory usage during capture
     */
    async benchmarkMemoryUsage() {
        console.log('\n💾 Benchmarking Memory Usage...');
        
        const initialMemory = process.memoryUsage();
        const memorySnapshots = [initialMemory];
        
        try {
            // Capture several screenshots and track memory
            for (let i = 0; i < 3; i++) {
                await this.screenshot.captureDisplay(0);
                const memory = process.memoryUsage();
                memorySnapshots.push(memory);
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
                
                console.log(`  After capture ${i + 1}: Heap ${(memory.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
                           `RSS ${(memory.rss / 1024 / 1024).toFixed(1)}MB`);
            }
            
            const finalMemory = process.memoryUsage();
            const heapDiff = finalMemory.heapUsed - initialMemory.heapUsed;
            const rssDiff = finalMemory.rss - initialMemory.rss;
            
            console.log(`  Memory change: Heap ${(heapDiff / 1024 / 1024).toFixed(1)}MB, ` +
                       `RSS ${(rssDiff / 1024 / 1024).toFixed(1)}MB`);
            
            this.results.benchmarks.push({
                name: 'Memory Usage',
                initialMemory: initialMemory,
                finalMemory: finalMemory,
                heapDiffMB: heapDiff / 1024 / 1024,
                rssDiffMB: rssDiff / 1024 / 1024,
                snapshots: memorySnapshots
            });
            
        } catch (error) {
            console.log(`  ❌ Memory benchmark failed: ${error.message}`);
        }
    }

    /**
     * Benchmark repeated captures to test for memory leaks and performance degradation
     */
    async benchmarkRepeatedCaptures() {
        console.log('\n🔄 Benchmarking Repeated Captures...');
        
        const iterations = 10;
        const times = [];
        const memoryUsage = [];
        
        for (let i = 0; i < iterations; i++) {
            try {
                const memBefore = process.memoryUsage();
                const start = process.hrtime.bigint();
                
                await this.screenshot.captureDisplay(0);
                
                const end = process.hrtime.bigint();
                const memAfter = process.memoryUsage();
                
                const timeMs = Number(end - start) / 1000000;
                times.push(timeMs);
                memoryUsage.push({
                    before: memBefore.heapUsed,
                    after: memAfter.heapUsed,
                    diff: memAfter.heapUsed - memBefore.heapUsed
                });
                
                if (i % 2 === 1 || i === iterations - 1) {
                    console.log(`  Capture ${i + 1}: ${timeMs.toFixed(2)}ms`);
                }
                
                // Small delay to allow garbage collection
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log(`  Capture ${i + 1}: Failed - ${error.message}`);
                times.push(null);
            }
        }
        
        const validTimes = times.filter(t => t !== null);
        
        if (validTimes.length > 0) {
            const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
            const firstHalf = validTimes.slice(0, Math.floor(validTimes.length / 2));
            const secondHalf = validTimes.slice(Math.floor(validTimes.length / 2));
            
            const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
            
            console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
            console.log(`  First half avg: ${firstHalfAvg.toFixed(2)}ms`);
            console.log(`  Second half avg: ${secondHalfAvg.toFixed(2)}ms`);
            console.log(`  Performance change: ${((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1)}%`);
            
            this.results.benchmarks.push({
                name: 'Repeated Captures',
                iterations: iterations,
                successful: validTimes.length,
                averageTimeMs: avgTime,
                firstHalfAvg: firstHalfAvg,
                secondHalfAvg: secondHalfAvg,
                performanceChange: ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100),
                times: times,
                memoryUsage: memoryUsage
            });
        }
    }

    /**
     * Generate and save benchmark report
     */
    async generateReport() {
        console.log('\n📊 Generating Report...');
        
        // Add final performance metrics
        this.results.finalMetrics = this.screenshot.getPerformanceMetrics();
        this.results.implementationInfo = this.screenshot.getImplementationInfo();
        
        // Save results to file
        const reportDir = path.join(__dirname, '../results');
        try {
            await fs.mkdir(reportDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `benchmark-${timestamp}.json`;
        const filepath = path.join(reportDir, filename);
        
        await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
        
        console.log(`✅ Report saved to: ${filepath}`);
        console.log('\n📋 Summary:');
        console.log(`  Total captures: ${this.results.finalMetrics.captureCount}`);
        console.log(`  Successful captures: ${this.results.finalMetrics.successfulCaptures}`);
        console.log(`  Success rate: ${this.results.finalMetrics.successRate.toFixed(1)}%`);
        console.log(`  Average capture time: ${this.results.finalMetrics.averageCaptureTime.toFixed(2)}ms`);
        console.log(`  Fallback usage: ${this.results.finalMetrics.fallbackUsagePercent.toFixed(1)}%`);
    }
}

// Run benchmark if this file is executed directly
if (require.main === module) {
    const benchmark = new PerformanceBenchmark();
    
    benchmark.runAll().catch(error => {
        console.error('Benchmark failed:', error);
        process.exit(1);
    });
}

module.exports = PerformanceBenchmark;