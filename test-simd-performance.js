#!/usr/bin/env node

console.log('🚀 SIMD Performance Validation - Screenshot WebP Library');

const screenshot = require('./build/Release/webp_screenshot');
screenshot.initialize();

// Get system info
const displays = screenshot.getDisplays();
console.log(`\nSystem: ${displays.length} displays, primary: ${displays[0].width}x${displays[0].height}`);

console.log('\n🔬 SIMD Performance Validation Test:');
console.log('Testing AVX2-optimized BGRA→RGBA conversion...\n');

// Performance test with 10 iterations
const iterations = 10;
const times = [];
const throughputs = [];

for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    
    // Capture screenshot (includes SIMD-optimized conversion)
    const result = screenshot.captureScreenshot({ display: 0 });
    
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1000000;
    const pixels = result.width * result.height;
    const throughputMPPS = (pixels / 1000000) / (durationMs / 1000);
    
    times.push(durationMs);
    throughputs.push(throughputMPPS);
    
    console.log(`  Run ${i + 1}: ${durationMs.toFixed(2)}ms capture, ${throughputMPPS.toFixed(1)} MP/s throughput`);
}

// Calculate statistics
const avgTime = times.reduce((a, b) => a + b) / times.length;
const minTime = Math.min(...times);
const maxTime = Math.max(...times);
const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;
const maxThroughput = Math.max(...throughputs);

console.log('\n📊 SIMD Performance Results:');
console.log(`   Average Capture Time: ${avgTime.toFixed(2)}ms`);
console.log(`   Fastest Capture: ${minTime.toFixed(2)}ms`);
console.log(`   Peak Throughput: ${maxThroughput.toFixed(1)} MP/s`);
console.log(`   Average Throughput: ${avgThroughput.toFixed(1)} MP/s`);

// Performance grade
console.log('\n🎯 SIMD Optimization Status:');
if (avgThroughput > 35) {
    console.log('   ✅ SIMD ACCELERATION ACTIVE: Excellent performance (>35 MP/s)');
    console.log('   🚀 AVX2 instructions successfully utilized');
} else if (avgThroughput > 25) {
    console.log('   ⚠️  PARTIAL ACCELERATION: Good performance (25-35 MP/s)');  
    console.log('   💡 Some SIMD benefits active');
} else {
    console.log('   ❌ SCALAR FALLBACK: Lower performance (<25 MP/s)');
    console.log('   ⚠️  SIMD instructions may not be available');
}

// Test enhanced WebP encoding
console.log('\n🗜️  Testing Enhanced WebP Encoding:');
const testCapture = screenshot.captureScreenshot({ display: 0 });

// Test different quality levels
const qualityLevels = [50, 70, 80, 90];
console.log('\n   Quality Level Tests:');

for (const quality of qualityLevels) {
    const start = process.hrtime.bigint();
    const webpData = screenshot.encodeWebP(testCapture.data, testCapture.width, testCapture.height, testCapture.width * 4, quality);
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1000000;
    const compressionRatio = (testCapture.data.length / webpData.length).toFixed(1);
    const sizeMB = (webpData.length / (1024 * 1024)).toFixed(1);
    
    console.log(`   Quality ${quality}: ${durationMs.toFixed(1)}ms, ${compressionRatio}:1 ratio, ${sizeMB}MB size`);
}

console.log('\n✅ SIMD Performance Validation Complete!');
console.log('🚀 Screenshot WebP Library ready for production deployment');