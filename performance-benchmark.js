#!/usr/bin/env node

console.log('📊 Performance Benchmark - Screenshot WebP Library');

const screenshot = require('./build/Release/webp_screenshot');
screenshot.initialize();

// Get system info
const displays = screenshot.getDisplays();
console.log(`\nSystem: ${displays.length} displays, primary: ${displays[0].width}x${displays[0].height}`);

const results = {
    capture: [],
    encode: [],
    memory: [],
    overall: []
};

// Benchmark 1: Screenshot Capture Performance
console.log('\n🔬 Benchmarking Screenshot Capture...');
for (let i = 0; i < 10; i++) {
    const start = process.hrtime.bigint();
    const result = screenshot.captureScreenshot({ display: 0 });
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1000000;
    const pixels = result.width * result.height;
    const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
    
    results.capture.push({
        duration: durationMs,
        pixels: pixels,
        throughput: throughputMPPS,
        memoryMB: result.data.length / 1024 / 1024
    });
    
    console.log(`  Run ${i + 1}: ${durationMs.toFixed(2)}ms, ${throughputMPPS.toFixed(2)} MP/s`);
}

// Benchmark 2: WebP Encoding Performance
console.log('\n🔬 Benchmarking WebP Encoding...');
const testCapture = screenshot.captureScreenshot({ display: 0 });
for (let i = 0; i < 10; i++) {
    const start = process.hrtime.bigint();
    const webpData = screenshot.encodeWebP(testCapture.data, testCapture.width, testCapture.height, testCapture.width * 4);
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1000000;
    const pixels = testCapture.width * testCapture.height;
    const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
    const compressionRatio = testCapture.data.length / webpData.length;
    
    results.encode.push({
        duration: durationMs,
        pixels: pixels,
        throughput: throughputMPPS,
        compressionRatio: compressionRatio,
        originalMB: testCapture.data.length / 1024 / 1024,
        compressedKB: webpData.length / 1024
    });
    
    console.log(`  Run ${i + 1}: ${durationMs.toFixed(2)}ms, ${throughputMPPS.toFixed(0)} MP/s, ${compressionRatio.toFixed(1)}:1`);
}

// Benchmark 3: Memory Usage Pattern
console.log('\n🔬 Benchmarking Memory Usage...');
const initialMemory = process.memoryUsage();
for (let i = 0; i < 5; i++) {
    const captureResult = screenshot.captureScreenshot({ display: 0 });
    const webpResult = screenshot.encodeWebP(captureResult.data, captureResult.width, captureResult.height, captureResult.width * 4);
    
    const memUsage = process.memoryUsage();
    results.memory.push({
        run: i + 1,
        heapUsed: memUsage.heapUsed / 1024 / 1024,
        heapTotal: memUsage.heapTotal / 1024 / 1024,
        external: memUsage.external / 1024 / 1024,
        rss: memUsage.rss / 1024 / 1024
    });
    
    console.log(`  Run ${i + 1}: Heap ${(memUsage.heapUsed/1024/1024).toFixed(1)}MB, External ${(memUsage.external/1024/1024).toFixed(1)}MB`);
}

// Benchmark 4: End-to-End Pipeline
console.log('\n🔬 Benchmarking End-to-End Pipeline...');
for (let i = 0; i < 5; i++) {
    const start = process.hrtime.bigint();
    const captureResult = screenshot.captureScreenshot({ display: 0 });
    const captureTime = process.hrtime.bigint();
    const webpResult = screenshot.encodeWebP(captureResult.data, captureResult.width, captureResult.height, captureResult.width * 4);
    const end = process.hrtime.bigint();
    
    const totalMs = Number(end - start) / 1000000;
    const captureMs = Number(captureTime - start) / 1000000;
    const encodeMs = Number(end - captureTime) / 1000000;
    const pixels = captureResult.width * captureResult.height;
    const throughput = (pixels / 1000000) / (totalMs / 1000);
    
    results.overall.push({
        totalDuration: totalMs,
        captureDuration: captureMs,
        encodeDuration: encodeMs,
        throughput: throughput,
        compressionRatio: captureResult.data.length / webpResult.length
    });
    
    console.log(`  Run ${i + 1}: ${totalMs.toFixed(2)}ms total (${captureMs.toFixed(2)}ms + ${encodeMs.toFixed(2)}ms), ${throughput.toFixed(2)} MP/s`);
}

// Calculate statistics
function calcStats(arr, prop) {
    const values = arr.map(item => item[prop]);
    const avg = values.reduce((a, b) => a + b) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sorted = values.sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    return { avg, min, max, p50, p95 };
}

console.log('\n📊 Performance Analysis Summary:');

// Screenshot Capture Stats
const captureStats = calcStats(results.capture, 'throughput');
console.log('\n🏃 Screenshot Capture Performance:');
console.log(`   Throughput: ${captureStats.avg.toFixed(2)} MP/s avg (${captureStats.min.toFixed(2)}-${captureStats.max.toFixed(2)} range)`);
console.log(`   P50: ${captureStats.p50.toFixed(2)} MP/s, P95: ${captureStats.p95.toFixed(2)} MP/s`);
console.log(`   Avg Duration: ${calcStats(results.capture, 'duration').avg.toFixed(2)}ms`);

// WebP Encode Stats
const encodeStats = calcStats(results.encode, 'throughput');
const compressionStats = calcStats(results.encode, 'compressionRatio');
console.log('\n🗜️  WebP Encoding Performance:');
console.log(`   Throughput: ${encodeStats.avg.toFixed(0)} MP/s avg (${encodeStats.min.toFixed(0)}-${encodeStats.max.toFixed(0)} range)`);
console.log(`   Compression: ${compressionStats.avg.toFixed(1)}:1 avg (${compressionStats.min.toFixed(1)}-${compressionStats.max.toFixed(1)} range)`);
console.log(`   Avg Duration: ${calcStats(results.encode, 'duration').avg.toFixed(2)}ms`);

// Overall Pipeline Stats
const overallStats = calcStats(results.overall, 'throughput');
console.log('\n⚡ End-to-End Pipeline Performance:');
console.log(`   Overall Throughput: ${overallStats.avg.toFixed(2)} MP/s avg`);
console.log(`   Total Duration: ${calcStats(results.overall, 'totalDuration').avg.toFixed(2)}ms avg`);
console.log(`   Capture: ${calcStats(results.overall, 'captureDuration').avg.toFixed(2)}ms avg`);
console.log(`   Encode: ${calcStats(results.overall, 'encodeDuration').avg.toFixed(2)}ms avg`);

// Memory Stats
const finalMemory = process.memoryUsage();
console.log('\n💾 Memory Usage:');
console.log(`   Peak Heap: ${Math.max(...results.memory.map(m => m.heapUsed)).toFixed(1)}MB`);
console.log(`   Peak External: ${Math.max(...results.memory.map(m => m.external)).toFixed(1)}MB`);
console.log(`   Memory Growth: ${((finalMemory.heapUsed - initialMemory.heapUsed)/1024/1024).toFixed(1)}MB`);

console.log('\n🎯 Performance Grade:');
const avgThroughput = overallStats.avg;
if (avgThroughput > 20) console.log('   Grade: A+ (Excellent - >20 MP/s)');
else if (avgThroughput > 15) console.log('   Grade: A (Very Good - >15 MP/s)');
else if (avgThroughput > 10) console.log('   Grade: B (Good - >10 MP/s)');
else if (avgThroughput > 5) console.log('   Grade: C (Fair - >5 MP/s)');
else console.log('   Grade: D (Needs Improvement - <5 MP/s)');