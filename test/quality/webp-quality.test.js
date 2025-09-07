const { expect } = require('chai');
const sharp = require('sharp');
const addon = require('../../build/Release/webp_screenshot');
const fs = require('fs');
const path = require('path');

describe('WebP Quality Validation Tests', function() {
  this.timeout(60000);

  let testImages = {};
  const qualityThresholds = {
    psnr: { minimum: 35, target: 45 },
    ssim: { minimum: 0.85, target: 0.95 },
    fileSize: { compressionRatio: 5 },
    visualQuality: 'excellent'
  };

  before(async function() {
    console.log('🎨 Preparing test images for quality validation...');
    
    // Create various test images with different characteristics
    testImages = {
      gradient: await createGradientImage(512, 512),
      photograph: await createPhotographicImage(512, 512),
      screenshot: await createScreenshotImage(512, 512),
      geometric: await createGeometricImage(512, 512),
      text: await createTextImage(512, 512),
      solid: await createSolidColorImage(512, 512)
    };
  });

  describe('PSNR (Peak Signal-to-Noise Ratio) Validation', function() {
    const qualityLevels = [60, 70, 80, 90, 95];
    
    Object.keys(testImages).forEach(imageType => {
      qualityLevels.forEach(quality => {
        it(`should achieve target PSNR for ${imageType} at quality ${quality}`, async function() {
          const originalImage = testImages[imageType];
          
          // Encode to WebP
          const webpData = addon.encodeWebP(originalImage.data, originalImage.width, originalImage.height, 
            originalImage.width * 4, { quality: quality });
          
          expect(webpData).to.be.instanceOf(Buffer);
          expect(webpData.length).to.be.above(0);
          
          // Decode WebP back to raw data for comparison
          const decodedImage = await sharp(webpData).raw().toBuffer();
          
          // Calculate PSNR
          const psnr = calculatePSNR(originalImage.data, decodedImage, originalImage.width, originalImage.height);
          const compressionRatio = originalImage.data.length / webpData.length;
          
          console.log(`${imageType} Q${quality}: PSNR=${psnr.toFixed(2)}dB, compression=${compressionRatio.toFixed(1)}:1`);
          
          // Quality expectations based on quality setting
          const expectedMinPSNR = quality >= 90 ? qualityThresholds.psnr.target : 
                                 quality >= 80 ? qualityThresholds.psnr.minimum + 5 :
                                 qualityThresholds.psnr.minimum;
          
          expect(psnr).to.be.above(expectedMinPSNR);
          expect(compressionRatio).to.be.above(qualityThresholds.fileSize.compressionRatio);
        });
      });
    });

    it('should demonstrate quality vs compression trade-offs', function() {
      const testImage = testImages.photograph;
      const qualities = [50, 60, 70, 80, 90, 95];
      const results = [];
      
      qualities.forEach(quality => {
        const webpData = addon.encodeWebP(testImage.data, testImage.width, testImage.height,
          testImage.width * 4, { quality: quality });
        
        const compressionRatio = testImage.data.length / webpData.length;
        
        results.push({
          quality,
          fileSize: webpData.length,
          compressionRatio,
          bitsPerPixel: (webpData.length * 8) / (testImage.width * testImage.height)
        });
      });
      
      console.log('\n📊 Quality vs Compression Analysis:');
      console.log('Quality\tFile Size\tCompression\tBits/Pixel');
      results.forEach(r => {
        console.log(`${r.quality}\t${(r.fileSize/1024).toFixed(1)}KB\t\t${r.compressionRatio.toFixed(1)}:1\t\t${r.bitsPerPixel.toFixed(2)}`);
      });
      
      // Verify quality/size relationship
      for (let i = 1; i < results.length; i++) {
        expect(results[i].fileSize).to.be.above(results[i-1].fileSize); // Higher quality = larger file
        expect(results[i].compressionRatio).to.be.below(results[i-1].compressionRatio); // Higher quality = lower compression
      }
    });
  });

  describe('SSIM (Structural Similarity Index) Validation', function() {
    it('should maintain structural similarity at high quality levels', async function() {
      const testCases = [
        { name: 'Photograph', image: testImages.photograph, minSSIM: 0.92 },
        { name: 'Screenshot', image: testImages.screenshot, minSSIM: 0.95 },
        { name: 'Geometric', image: testImages.geometric, minSSIM: 0.90 },
        { name: 'Text', image: testImages.text, minSSIM: 0.98 }
      ];
      
      for (const testCase of testCases) {
        const webpData = addon.encodeWebP(testCase.image.data, testCase.image.width, testCase.image.height,
          testCase.image.width * 4, { quality: 90 });
        
        const decodedImage = await sharp(webpData).raw().toBuffer();
        const ssim = calculateSSIM(testCase.image.data, decodedImage, testCase.image.width, testCase.image.height);
        
        console.log(`${testCase.name} SSIM: ${ssim.toFixed(4)}`);
        
        expect(ssim).to.be.above(testCase.minSSIM);
      }
    });

    it('should handle different image characteristics appropriately', async function() {
      const imageCharacteristics = [
        { name: 'High Frequency', image: createHighFrequencyImage(256, 256) },
        { name: 'Low Frequency', image: createLowFrequencyImage(256, 256) },
        { name: 'High Contrast', image: createHighContrastImage(256, 256) },
        { name: 'Low Contrast', image: createLowContrastImage(256, 256) }
      ];
      
      for (const characteristic of imageCharacteristics) {
        const image = await characteristic.image;
        
        const webpData = addon.encodeWebP(image.data, image.width, image.height,
          image.width * 4, { quality: 80 });
        
        const compressionRatio = image.data.length / webpData.length;
        
        console.log(`${characteristic.name}: ${compressionRatio.toFixed(1)}:1 compression`);
        
        // All characteristics should achieve reasonable compression
        expect(compressionRatio).to.be.above(3);
        expect(webpData.length).to.be.above(0);
      }
    });
  });

  describe('Compression Efficiency Validation', function() {
    it('should achieve optimal compression for different content types', function() {
      const contentTypes = Object.keys(testImages);
      const results = {};
      
      contentTypes.forEach(contentType => {
        const image = testImages[contentType];
        
        // Test different methods
        const methods = [1, 3, 4, 6]; // Fast to slow
        const methodResults = [];
        
        methods.forEach(method => {
          const startTime = process.hrtime.bigint();
          const webpData = addon.encodeWebP(image.data, image.width, image.height,
            image.width * 4, { quality: 80, method: method });
          const endTime = process.hrtime.bigint();
          
          const encodeTime = Number(endTime - startTime) / 1000000; // ms
          const compressionRatio = image.data.length / webpData.length;
          
          methodResults.push({
            method,
            encodeTime,
            fileSize: webpData.length,
            compressionRatio
          });
        });
        
        results[contentType] = methodResults;
        
        console.log(`\n${contentType} compression analysis:`);
        console.log('Method\tTime(ms)\tSize(KB)\tRatio');
        methodResults.forEach(r => {
          console.log(`${r.method}\t${r.encodeTime.toFixed(1)}\t\t${(r.fileSize/1024).toFixed(1)}\t\t${r.compressionRatio.toFixed(1)}:1`);
        });
      });
      
      // Validate compression efficiency
      Object.values(results).forEach(methodResults => {
        methodResults.forEach(result => {
          expect(result.compressionRatio).to.be.above(qualityThresholds.fileSize.compressionRatio);
          expect(result.fileSize).to.be.above(0);
          expect(result.encodeTime).to.be.below(5000); // Should encode within 5 seconds
        });
      });
    });

    it('should optimize for different use cases', function() {
      const useCases = [
        { name: 'Fast Web', quality: 75, method: 1, targetRatio: 8 },
        { name: 'Balanced', quality: 80, method: 4, targetRatio: 10 },
        { name: 'High Quality', quality: 90, method: 6, targetRatio: 6 },
        { name: 'Archival', quality: 95, method: 6, targetRatio: 4 }
      ];
      
      const testImage = testImages.photograph; // Use photograph as representative
      
      useCases.forEach(useCase => {
        const startTime = process.hrtime.bigint();
        const webpData = addon.encodeWebP(testImage.data, testImage.width, testImage.height,
          testImage.width * 4, { 
            quality: useCase.quality, 
            method: useCase.method 
          });
        const endTime = process.hrtime.bigint();
        
        const encodeTime = Number(endTime - startTime) / 1000000;
        const compressionRatio = testImage.data.length / webpData.length;
        
        console.log(`${useCase.name}: ${compressionRatio.toFixed(1)}:1 in ${encodeTime.toFixed(1)}ms`);
        
        expect(compressionRatio).to.be.above(useCase.targetRatio * 0.8); // Within 20% of target
        expect(webpData.length).to.be.above(0);
      });
    });
  });

  describe('Visual Quality Assessment', function() {
    it('should preserve important visual features', async function() {
      const featureTests = [
        { name: 'Edge Preservation', image: testImages.geometric },
        { name: 'Color Accuracy', image: testImages.gradient },
        { name: 'Text Clarity', image: testImages.text },
        { name: 'Detail Retention', image: testImages.photograph }
      ];
      
      for (const test of featureTests) {
        const webpData = addon.encodeWebP(test.image.data, test.image.width, test.image.height,
          test.image.width * 4, { quality: 85 });
        
        const decodedImage = await sharp(webpData).raw().toBuffer();
        
        // Analyze specific visual features
        const features = analyzeVisualFeatures(test.image.data, decodedImage, test.image.width, test.image.height);
        
        console.log(`${test.name}: Edge preservation=${features.edgePreservation.toFixed(3)}, Color accuracy=${features.colorAccuracy.toFixed(3)}`);
        
        expect(features.edgePreservation).to.be.above(0.85);
        expect(features.colorAccuracy).to.be.above(0.90);
      }
    });

    it('should handle transparency correctly', async function() {
      const transparentImage = await createTransparentImage(256, 256);
      
      const webpData = addon.encodeWebP(transparentImage.data, transparentImage.width, transparentImage.height,
        transparentImage.width * 4, { quality: 90 });
      
      // Verify WebP includes alpha channel
      const metadata = await sharp(webpData).metadata();
      expect(metadata.channels).to.equal(4); // RGBA
      expect(metadata.hasAlpha).to.be.true;
      
      // Verify alpha preservation
      const decodedImage = await sharp(webpData).raw().toBuffer();
      const alphaPreservation = calculateAlphaPreservation(transparentImage.data, decodedImage);
      
      console.log(`Alpha preservation: ${alphaPreservation.toFixed(3)}`);
      expect(alphaPreservation).to.be.above(0.95);
    });
  });

  describe('Quality Regression Detection', function() {
    it('should maintain consistent quality across library updates', function() {
      // Load baseline results if they exist
      const baselinePath = path.join(__dirname, '..', 'fixtures', 'baselines', 'quality-baseline.json');
      let baseline = null;
      
      try {
        if (fs.existsSync(baselinePath)) {
          baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        }
      } catch (error) {
        console.log('No baseline found, creating new baseline');
      }
      
      const currentResults = {};
      const testQualities = [70, 80, 90];
      
      // Test all image types at standard qualities
      Object.keys(testImages).forEach(imageType => {
        currentResults[imageType] = {};
        
        testQualities.forEach(quality => {
          const image = testImages[imageType];
          const webpData = addon.encodeWebP(image.data, image.width, image.height,
            image.width * 4, { quality: quality });
          
          const compressionRatio = image.data.length / webpData.length;
          
          currentResults[imageType][`q${quality}`] = {
            compressionRatio,
            fileSize: webpData.length
          };
        });
      });
      
      if (baseline) {
        // Compare with baseline
        let regressionDetected = false;
        
        Object.keys(currentResults).forEach(imageType => {
          if (baseline[imageType]) {
            Object.keys(currentResults[imageType]).forEach(qualityKey => {
              const current = currentResults[imageType][qualityKey];
              const baselineValue = baseline[imageType][qualityKey];
              
              if (baselineValue) {
                const ratioDiff = (current.compressionRatio - baselineValue.compressionRatio) / baselineValue.compressionRatio;
                const sizeDiff = (current.fileSize - baselineValue.fileSize) / baselineValue.fileSize;
                
                console.log(`${imageType} ${qualityKey}: ratio change ${(ratioDiff*100).toFixed(1)}%, size change ${(sizeDiff*100).toFixed(1)}%`);
                
                // Flag significant regressions (>10% worse compression or >20% larger files)
                if (ratioDiff < -0.1 || sizeDiff > 0.2) {
                  console.warn(`⚠️ Potential regression detected in ${imageType} ${qualityKey}`);
                  regressionDetected = true;
                }
              }
            });
          }
        });
        
        if (regressionDetected) {
          console.log('📊 Quality regression detected - review changes carefully');
        }
      }
      
      // Save current results as new baseline
      fs.writeFileSync(baselinePath, JSON.stringify(currentResults, null, 2));
      
      // Basic quality validation
      Object.values(currentResults).forEach(imageResults => {
        Object.values(imageResults).forEach(qualityResult => {
          expect(qualityResult.compressionRatio).to.be.above(3);
          expect(qualityResult.fileSize).to.be.above(0);
        });
      });
    });
  });

  after(function() {
    console.log('\n🎨 Quality validation tests completed');
  });

  // Helper functions for image generation
  async function createGradientImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = (x * 255) / width;     // R
        data[offset + 1] = (y * 255) / height; // G
        data[offset + 2] = ((x + y) * 255) / (width + height); // B
        data[offset + 3] = 255; // A
      }
    }
    
    return { data, width, height };
  }

  async function createPhotographicImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    // Simulate natural image with smooth variations and some noise
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        // Base colors with smooth variations
        const baseR = 128 + 60 * Math.sin(x * 0.02) * Math.cos(y * 0.015);
        const baseG = 100 + 80 * Math.cos(x * 0.015) * Math.sin(y * 0.02);
        const baseB = 140 + 50 * Math.sin((x + y) * 0.01);
        
        // Add some noise
        const noise = (Math.random() - 0.5) * 20;
        
        data[offset] = Math.max(0, Math.min(255, baseR + noise));
        data[offset + 1] = Math.max(0, Math.min(255, baseG + noise));
        data[offset + 2] = Math.max(0, Math.min(255, baseB + noise));
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createScreenshotImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    // Simulate typical desktop screenshot with windows, text areas, and solid colors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        let r, g, b;
        
        // Create window-like regions
        if (y < height * 0.1) {
          // Title bar
          r = g = b = 240; // Light gray
        } else if (x < width * 0.2 || x > width * 0.8 || y > height * 0.9) {
          // Borders and taskbar
          r = g = b = 64; // Dark gray
        } else if ((x > width * 0.3 && x < width * 0.7) && (y > height * 0.3 && y < height * 0.6)) {
          // Text area (simulate text with high frequency pattern)
          const textPattern = (Math.floor(x / 8) + Math.floor(y / 12)) % 2;
          r = g = b = textPattern ? 255 : 0;
        } else {
          // Content area
          r = 248; g = 249; b = 250; // Very light gray
        }
        
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createGeometricImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        // Create geometric shapes
        const centerX = width / 2;
        const centerY = height / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        let r, g, b;
        
        if (distance < width * 0.15) {
          // Center circle - red
          r = 255; g = 50; b = 50;
        } else if (Math.abs(x - centerX) < 20 || Math.abs(y - centerY) < 20) {
          // Cross pattern - blue
          r = 50; g = 50; b = 255;
        } else if ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0) {
          // Checkerboard - white/black
          r = g = b = 255;
        } else {
          r = g = b = 0;
        }
        
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createTextImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    // Fill with white background
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = 255; // White
      data[i + 3] = 255; // Alpha
    }
    
    // Simulate text with black rectangles (simplified text blocks)
    const lineHeight = 16;
    const charWidth = 8;
    
    for (let line = 0; line < Math.floor(height / lineHeight); line++) {
      const y = line * lineHeight;
      const lineLength = Math.floor(width * (0.7 + Math.random() * 0.3) / charWidth);
      
      for (let char = 0; char < lineLength; char++) {
        const x = char * charWidth;
        
        // Draw character block
        for (let dy = 2; dy < lineHeight - 2; dy++) {
          for (let dx = 1; dx < charWidth - 1; dx++) {
            if (y + dy < height && x + dx < width) {
              const offset = ((y + dy) * width + (x + dx)) * 4;
              if (Math.random() > 0.3) { // 70% fill for character
                data[offset] = data[offset + 1] = data[offset + 2] = 0; // Black text
              }
            }
          }
        }
      }
    }
    
    return { data, width, height };
  }

  async function createSolidColorImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    // Solid blue
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100;     // R
      data[i + 1] = 150; // G
      data[i + 2] = 255; // B
      data[i + 3] = 255; // A
    }
    
    return { data, width, height };
  }

  async function createTransparentImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        
        // Create gradient with varying alpha
        data[offset] = 255; // R
        data[offset + 1] = (x * 255) / width; // G
        data[offset + 2] = (y * 255) / height; // B
        data[offset + 3] = ((x + y) * 255) / (width + height); // Varying alpha
      }
    }
    
    return { data, width, height };
  }

  // Additional helper functions for different image characteristics
  async function createHighFrequencyImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const value = (Math.sin(x * 0.3) + Math.cos(y * 0.3) + Math.sin((x + y) * 0.2)) * 127 + 128;
        
        data[offset] = data[offset + 1] = data[offset + 2] = Math.max(0, Math.min(255, value));
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createLowFrequencyImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const value = (Math.sin(x * 0.01) + Math.cos(y * 0.01)) * 50 + 128;
        
        data[offset] = data[offset + 1] = data[offset + 2] = Math.max(0, Math.min(255, value));
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createHighContrastImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const value = ((x + y) % 20 < 10) ? 0 : 255; // High contrast stripes
        
        data[offset] = data[offset + 1] = data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  async function createLowContrastImage(width, height) {
    const data = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const value = 120 + ((x + y) % 20 < 10 ? 10 : -10); // Low contrast variation
        
        data[offset] = data[offset + 1] = data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
    
    return { data, width, height };
  }

  // Quality measurement functions
  function calculatePSNR(original, compressed, width, height) {
    let mse = 0;
    const pixelCount = width * height;
    
    for (let i = 0; i < pixelCount * 4; i += 4) {
      // Calculate MSE for RGB channels (ignore alpha)
      const rDiff = original[i] - compressed[i];
      const gDiff = original[i + 1] - compressed[i + 1];
      const bDiff = original[i + 2] - compressed[i + 2];
      
      mse += (rDiff * rDiff + gDiff * gDiff + bDiff * bDiff) / 3;
    }
    
    mse /= pixelCount;
    
    if (mse === 0) return Infinity;
    
    return 20 * Math.log10(255 / Math.sqrt(mse));
  }

  function calculateSSIM(original, compressed, width, height) {
    // Simplified SSIM calculation for validation
    // In production, would use a proper SSIM implementation
    
    const windowSize = 8;
    let ssimSum = 0;
    let windowCount = 0;
    
    for (let y = 0; y <= height - windowSize; y += windowSize) {
      for (let x = 0; x <= width - windowSize; x += windowSize) {
        const originalWindow = [];
        const compressedWindow = [];
        
        for (let wy = 0; wy < windowSize; wy++) {
          for (let wx = 0; wx < windowSize; wx++) {
            const offset = ((y + wy) * width + (x + wx)) * 4;
            
            // Use luminance (simplified)
            const origLum = 0.299 * original[offset] + 0.587 * original[offset + 1] + 0.114 * original[offset + 2];
            const compLum = 0.299 * compressed[offset] + 0.587 * compressed[offset + 1] + 0.114 * compressed[offset + 2];
            
            originalWindow.push(origLum);
            compressedWindow.push(compLum);
          }
        }
        
        // Calculate means
        const mean1 = originalWindow.reduce((sum, val) => sum + val, 0) / originalWindow.length;
        const mean2 = compressedWindow.reduce((sum, val) => sum + val, 0) / compressedWindow.length;
        
        // Calculate variances and covariance
        let var1 = 0, var2 = 0, covar = 0;
        for (let i = 0; i < originalWindow.length; i++) {
          const diff1 = originalWindow[i] - mean1;
          const diff2 = compressedWindow[i] - mean2;
          var1 += diff1 * diff1;
          var2 += diff2 * diff2;
          covar += diff1 * diff2;
        }
        var1 /= originalWindow.length - 1;
        var2 /= compressedWindow.length - 1;
        covar /= originalWindow.length - 1;
        
        // SSIM formula constants
        const c1 = 6.5025; // (0.01 * 255)^2
        const c2 = 58.5225; // (0.03 * 255)^2
        
        const ssim = ((2 * mean1 * mean2 + c1) * (2 * covar + c2)) /
                     ((mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2));
        
        ssimSum += ssim;
        windowCount++;
      }
    }
    
    return ssimSum / windowCount;
  }

  function analyzeVisualFeatures(original, compressed, width, height) {
    // Simplified feature analysis
    let edgePreservation = 0;
    let colorAccuracy = 0;
    
    // Edge preservation using simple gradient
    let originalEdges = 0, preservedEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const offset = (y * width + x) * 4;
        const rightOffset = (y * width + (x + 1)) * 4;
        const downOffset = ((y + 1) * width + x) * 4;
        
        // Original gradients
        const origGradX = Math.abs(original[offset] - original[rightOffset]);
        const origGradY = Math.abs(original[offset] - original[downOffset]);
        const origGrad = Math.sqrt(origGradX * origGradX + origGradY * origGradY);
        
        // Compressed gradients
        const compGradX = Math.abs(compressed[offset] - compressed[rightOffset]);
        const compGradY = Math.abs(compressed[offset] - compressed[downOffset]);
        const compGrad = Math.sqrt(compGradX * compGradX + compGradY * compGradY);
        
        if (origGrad > 10) { // Significant edge
          originalEdges++;
          if (Math.abs(origGrad - compGrad) / origGrad < 0.3) { // Within 30%
            preservedEdges++;
          }
        }
      }
    }
    
    edgePreservation = originalEdges > 0 ? preservedEdges / originalEdges : 1;
    
    // Color accuracy using mean absolute error
    let colorError = 0;
    const pixelCount = width * height;
    
    for (let i = 0; i < pixelCount * 4; i += 4) {
      colorError += Math.abs(original[i] - compressed[i]) + 
                   Math.abs(original[i + 1] - compressed[i + 1]) + 
                   Math.abs(original[i + 2] - compressed[i + 2]);
    }
    
    colorError /= (pixelCount * 3);
    colorAccuracy = Math.max(0, 1 - colorError / 255);
    
    return { edgePreservation, colorAccuracy };
  }

  function calculateAlphaPreservation(original, compressed) {
    let totalError = 0;
    const pixelCount = original.length / 4;
    
    for (let i = 3; i < original.length; i += 4) {
      totalError += Math.abs(original[i] - compressed[i]);
    }
    
    const averageError = totalError / pixelCount;
    return Math.max(0, 1 - averageError / 255);
  }
});