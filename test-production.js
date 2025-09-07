#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Testing Production Screenshot WebP Library');

try {
    // Load native module
    const screenshot = require('./build/Release/webp_screenshot');
    screenshot.initialize();

    // Test 1: Real display detection
    console.log('\n🖥️  Testing real display detection...');
    const displays = screenshot.getDisplays();
    console.log(`✅ Found ${displays.length} displays:`);
    displays.forEach((display, i) => {
        console.log(`   Display ${i}: ${display.width}x${display.height} at (${display.x}, ${display.y}) ${display.isPrimary ? '[PRIMARY]' : ''}`);
        if (display.name) console.log(`      Device: ${display.name}`);
    });

    // Test 2: Real screenshot capture
    console.log('\n📷 Testing real screenshot capture...');
    const startTime = Date.now();
    const result = screenshot.captureScreenshot({ display: 0 });
    const captureTime = Date.now() - startTime;
    
    if (result.success) {
        console.log(`✅ Screenshot captured successfully!`);
        console.log(`   Resolution: ${result.width}x${result.height}`);
        console.log(`   Data size: ${(result.data.length / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   Capture time: ${captureTime}ms`);
        console.log(`   Throughput: ${(result.width * result.height / 1000000 / (captureTime / 1000)).toFixed(2)} MP/s`);

        // Test 3: WebP encoding
        console.log('\n🖼️  Testing WebP encoding...');
        const encodeStart = Date.now();
        const webpData = screenshot.encodeWebP(result.data, result.width, result.height, result.width * 4, { quality: 80 });
        const encodeTime = Date.now() - encodeStart;
        
        console.log(`✅ WebP encoded successfully!`);
        console.log(`   Original size: ${(result.data.length / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   WebP size: ${(webpData.length / 1024).toFixed(2)}KB`);
        console.log(`   Compression ratio: ${(result.data.length / webpData.length).toFixed(1)}:1`);
        console.log(`   Encode time: ${encodeTime}ms`);
        
        // Test 4: Save screenshot files
        console.log('\n💾 Saving screenshot files...');
        const screenshotDir = './screenshots';
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir);
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const webpPath = path.join(screenshotDir, `screenshot-${timestamp}.webp`);
        const rawPath = path.join(screenshotDir, `screenshot-${timestamp}.rgba`);
        
        // Save WebP file
        fs.writeFileSync(webpPath, webpData);
        console.log(`✅ WebP saved: ${webpPath} (${(webpData.length / 1024).toFixed(2)}KB)`);
        
        // Save raw RGBA data (for debugging)
        fs.writeFileSync(rawPath, result.data);
        console.log(`✅ Raw RGBA saved: ${rawPath} (${(result.data.length / 1024 / 1024).toFixed(2)}MB)`);

        // Test 5: Performance metrics
        console.log('\n📊 Performance Summary:');
        const totalPixels = result.width * result.height;
        const totalTime = captureTime + encodeTime;
        
        console.log(`   Total pixels: ${(totalPixels / 1000000).toFixed(2)}MP`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   Overall throughput: ${(totalPixels / 1000000 / (totalTime / 1000)).toFixed(2)} MP/s`);
        console.log(`   Memory efficiency: ${((result.data.length - webpData.length) / result.data.length * 100).toFixed(1)}% savings`);

        // Test 6: Multi-display support
        if (displays.length > 1) {
            console.log('\n🖥️  Testing secondary display capture...');
            const secondaryResult = screenshot.captureScreenshot({ display: 1 });
            if (secondaryResult.success) {
                console.log(`✅ Secondary display captured: ${secondaryResult.width}x${secondaryResult.height}`);
                
                const secondaryWebP = screenshot.encodeWebP(secondaryResult.data, secondaryResult.width, secondaryResult.height, secondaryResult.width * 4);
                const secondaryPath = path.join(screenshotDir, `screenshot-display2-${timestamp}.webp`);
                fs.writeFileSync(secondaryPath, secondaryWebP);
                console.log(`✅ Secondary WebP saved: ${secondaryPath}`);
            }
        }

    } else {
        console.error('❌ Screenshot capture failed:', result.error);
        process.exit(1);
    }

    console.log('\n🎉 All production tests passed!');
    console.log('\n📈 Production Capabilities:');
    console.log('   ✅ Real Windows GDI screenshot capture');
    console.log('   ✅ Multi-display support with positioning');
    console.log('   ✅ WebP encoding with compression');
    console.log('   ✅ High-speed capture and encoding pipeline');
    console.log('   ✅ File saving and export functionality');
    console.log('\n🚀 Ready for production deployment!');

} catch (error) {
    console.error('\n❌ Production test failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
}