const { expect } = require('chai');

let addon;
try {
  addon = require('../../build/Release/webp_screenshot');
} catch (error) {
  console.log('Using mock addon for testing infrastructure');
  addon = require('../mock-addon');
}

// Mock sharp if not available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.log('Sharp not available - some tests will be skipped');
}

describe('SIMD Converter Unit Tests', function() {
  this.timeout(15000);

  describe('CPU Feature Detection', function() {
    it('should detect SIMD capabilities correctly', function() {
      const capabilities = addon.getSIMDCapabilities();
      
      expect(capabilities).to.be.a('string');
      expect(capabilities).to.match(/SSE2|AVX2|NEON|None/);
      
      console.log('Detected SIMD capabilities:', capabilities);
    });

    it('should provide WebP SIMD optimization info', function() {
      const optimizations = addon.getWebPSIMDOptimizations();
      
      expect(optimizations).to.be.a('string');
      expect(optimizations.length).to.be.above(0);
      
      console.log('WebP SIMD optimizations:', optimizations);
    });
  });

  describe('Pixel Format Conversion', function() {
    let testImageBGRA, testImageRGBA, testImageRGB;
    const testWidth = 64;
    const testHeight = 64;

    before(async function() {
      // Create test images with known patterns
      const solidRed = Buffer.alloc(testWidth * testHeight * 4);
      for (let i = 0; i < solidRed.length; i += 4) {
        solidRed[i] = 0;     // B
        solidRed[i + 1] = 0; // G  
        solidRed[i + 2] = 255; // R
        solidRed[i + 3] = 255; // A
      }
      testImageBGRA = solidRed;

      const solidBlue = Buffer.alloc(testWidth * testHeight * 4);
      for (let i = 0; i < solidBlue.length; i += 4) {
        solidBlue[i] = 255;   // R
        solidBlue[i + 1] = 0; // G
        solidBlue[i + 2] = 0; // B
        solidBlue[i + 3] = 255; // A
      }
      testImageRGBA = solidBlue;

      const solidGreen = Buffer.alloc(testWidth * testHeight * 3);
      for (let i = 0; i < solidGreen.length; i += 3) {
        solidGreen[i] = 0;     // R
        solidGreen[i + 1] = 255; // G
        solidGreen[i + 2] = 0;   // B
      }
      testImageRGB = solidGreen;
    });

    it('should convert BGRA to RGBA correctly', function() {
      const converted = addon.convertBGRAToRGBA(testImageBGRA, testWidth, testHeight);
      
      expect(converted).to.be.instanceOf(Buffer);
      expect(converted.length).to.equal(testImageBGRA.length);
      
      // Check first pixel conversion (BGRA red -> RGBA red)
      expect(converted[0]).to.equal(255); // R
      expect(converted[1]).to.equal(0);   // G
      expect(converted[2]).to.equal(0);   // B
      expect(converted[3]).to.equal(255); // A
    });

    it('should convert RGBA to RGB correctly', function() {
      const converted = addon.convertRGBAToRGB(testImageRGBA, testWidth, testHeight);
      
      expect(converted).to.be.instanceOf(Buffer);
      expect(converted.length).to.equal(testWidth * testHeight * 3);
      
      // Check first pixel conversion (remove alpha channel)
      expect(converted[0]).to.equal(255); // R
      expect(converted[1]).to.equal(0);   // G
      expect(converted[2]).to.equal(0);   // B
    });

    it('should perform in-place BGRA to RGBA conversion', function() {
      const testData = Buffer.from(testImageBGRA);
      addon.convertBGRAToRGBAInPlace(testData, testWidth * testHeight);
      
      // Check first pixel conversion
      expect(testData[0]).to.equal(255); // R
      expect(testData[1]).to.equal(0);   // G
      expect(testData[2]).to.equal(0);   // B
      expect(testData[3]).to.equal(255); // A
    });
  });

  describe('SIMD Performance Benchmarks', function() {
    const benchmarkSizes = [
      { name: 'Small (256x256)', width: 256, height: 256 },
      { name: 'Medium (1024x768)', width: 1024, height: 768 },
      { name: 'Large (1920x1080)', width: 1920, height: 1080 },
      { name: 'Ultra (3840x2160)', width: 3840, height: 2160 }
    ];

    benchmarkSizes.forEach(({ name, width, height }) => {
      it(`should perform BGRA->RGBA conversion efficiently for ${name}`, function() {
        const pixelCount = width * height;
        const testData = Buffer.alloc(pixelCount * 4);
        
        // Fill with test pattern
        for (let i = 0; i < testData.length; i += 4) {
          testData[i] = i % 256;       // B
          testData[i + 1] = (i + 1) % 256; // G
          testData[i + 2] = (i + 2) % 256; // R
          testData[i + 3] = 255;       // A
        }
        
        const iterations = Math.max(1, Math.floor(1000000 / pixelCount));
        const startTime = process.hrtime.bigint();
        
        for (let i = 0; i < iterations; i++) {
          addon.convertBGRAToRGBA(testData, width, height);
        }
        
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        const pixelsPerSec = (pixelCount * iterations) / (durationMs / 1000);
        const megapixelsPerSec = pixelsPerSec / 1000000;
        
        console.log(`${name}: ${megapixelsPerSec.toFixed(2)} MP/s (${durationMs.toFixed(2)}ms for ${iterations} iterations)`);
        
        // Performance expectation: should process at least 10 MP/s
        expect(megapixelsPerSec).to.be.above(10);
      });
    });

    it('should demonstrate SIMD performance advantage', function() {
      const width = 1920;
      const height = 1080;
      const pixelCount = width * height;
      const testData = Buffer.alloc(pixelCount * 4);
      
      // Fill with random-ish data
      for (let i = 0; i < testData.length; i++) {
        testData[i] = (i * 17 + 13) % 256;
      }
      
      const iterations = 10;
      
      // Benchmark SIMD version
      const simdStart = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) {
        addon.convertBGRAToRGBA(testData, width, height);
      }
      const simdEnd = process.hrtime.bigint();
      const simdDuration = Number(simdEnd - simdStart) / 1000000;
      
      // Benchmark scalar version (if available)
      let scalarDuration = 0;
      if (addon.convertBGRAToRGBAScalar) {
        const scalarStart = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
          addon.convertBGRAToRGBAScalar(testData, width, height);
        }
        const scalarEnd = process.hrtime.bigint();
        scalarDuration = Number(scalarEnd - scalarStart) / 1000000;
        
        const speedupRatio = scalarDuration / simdDuration;
        console.log(`SIMD speedup: ${speedupRatio.toFixed(2)}x faster than scalar`);
        
        // SIMD should be at least 1.5x faster
        expect(speedupRatio).to.be.above(1.5);
      }
      
      console.log(`SIMD performance: ${simdDuration.toFixed(2)}ms for ${iterations} iterations`);
    });
  });

  describe('Advanced SIMD WebP Encoding', function() {
    it('should encode using SIMD-optimized WebP encoder', async function() {
      const width = 512;
      const height = 512;
      const testImage = Buffer.alloc(width * height * 4);
      
      // Create a gradient pattern
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          testImage[offset] = (x * 255) / width;     // R
          testImage[offset + 1] = (y * 255) / height; // G
          testImage[offset + 2] = 128;               // B
          testImage[offset + 3] = 255;               // A
        }
      }
      
      const encodeParams = {
        quality: 80,
        method: 4,
        enableMultithreading: true
      };
      
      const startTime = process.hrtime.bigint();
      const webpData = addon.encodeSIMDOptimized(testImage, width, height, width * 4, encodeParams);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      const compressionRatio = testImage.length / webpData.length;
      
      expect(webpData).to.be.instanceOf(Buffer);
      expect(webpData.length).to.be.above(0);
      expect(webpData.length).to.be.below(testImage.length);
      expect(compressionRatio).to.be.above(5); // Should achieve at least 5:1 compression
      
      console.log(`SIMD WebP encoding: ${durationMs.toFixed(2)}ms, ${compressionRatio.toFixed(1)}:1 compression`);
    });

    it('should handle various image formats correctly', function() {
      const testCases = [
        { name: 'Solid Color', generator: (w, h) => createSolidColor(w, h, 255, 0, 0) },
        { name: 'Gradient', generator: (w, h) => createGradient(w, h) },
        { name: 'Chess Pattern', generator: (w, h) => createChessPattern(w, h) },
        { name: 'Random Noise', generator: (w, h) => createRandomNoise(w, h) }
      ];
      
      testCases.forEach(({ name, generator }) => {
        const width = 256;
        const height = 256;
        const testImage = generator(width, height);
        
        const webpData = addon.encodeSIMDOptimized(testImage, width, height, width * 4, {
          quality: 80,
          method: 4
        });
        
        expect(webpData.length).to.be.above(0);
        console.log(`${name}: ${testImage.length / webpData.length}:1 compression ratio`);
      });
    });
  });

  describe('Error Handling and Edge Cases', function() {
    it('should handle invalid input dimensions gracefully', function() {
      const testData = Buffer.alloc(1024);
      
      expect(() => addon.convertBGRAToRGBA(testData, 0, 0)).to.throw();
      expect(() => addon.convertBGRAToRGBA(testData, -1, 100)).to.throw();
      expect(() => addon.convertBGRAToRGBA(null, 100, 100)).to.throw();
    });

    it('should handle mismatched buffer sizes', function() {
      const smallBuffer = Buffer.alloc(100);
      const width = 100;
      const height = 100; // Would require 40,000 bytes for RGBA
      
      expect(() => addon.convertBGRAToRGBA(smallBuffer, width, height)).to.throw();
    });

    it('should handle extreme image dimensions', function() {
      // Very wide image
      const wideImage = Buffer.alloc(10000 * 1 * 4);
      const wideResult = addon.convertBGRAToRGBA(wideImage, 10000, 1);
      expect(wideResult.length).to.equal(wideImage.length);
      
      // Very tall image
      const tallImage = Buffer.alloc(1 * 10000 * 4);
      const tallResult = addon.convertBGRAToRGBA(tallImage, 1, 10000);
      expect(tallResult.length).to.equal(tallImage.length);
    });
  });

  // Helper functions for test image generation
  function createSolidColor(width, height, r, g, b) {
    const buffer = Buffer.alloc(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = 255;
    }
    return buffer;
  }

  function createGradient(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        buffer[offset] = (x * 255) / width;
        buffer[offset + 1] = (y * 255) / height;
        buffer[offset + 2] = ((x + y) * 255) / (width + height);
        buffer[offset + 3] = 255;
      }
    }
    return buffer;
  }

  function createChessPattern(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    const squareSize = 8;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const squareX = Math.floor(x / squareSize);
        const squareY = Math.floor(y / squareSize);
        const color = (squareX + squareY) % 2 === 0 ? 255 : 0;
        
        buffer[offset] = color;
        buffer[offset + 1] = color;
        buffer[offset + 2] = color;
        buffer[offset + 3] = 255;
      }
    }
    return buffer;
  }

  function createRandomNoise(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = Math.floor(Math.random() * 256);
      buffer[i + 1] = Math.floor(Math.random() * 256);
      buffer[i + 2] = Math.floor(Math.random() * 256);
      buffer[i + 3] = 255;
    }
    return buffer;
  }
});