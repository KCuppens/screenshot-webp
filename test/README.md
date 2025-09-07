# Advanced Testing Suite - Screenshot WebP Library

This directory contains a comprehensive testing framework designed to validate all performance optimizations, functionality, and edge cases for the Screenshot WebP Library.

## 🎯 Testing Overview

The testing suite implements a 5-tier testing pyramid covering:

1. **Unit Tests** - Individual component validation
2. **Integration Tests** - Cross-component interaction testing
3. **Performance Tests** - Benchmarking and optimization validation
4. **Stress Tests** - Endurance and resource exhaustion testing
5. **Security Tests** - Memory safety and privilege validation

## 🚀 Quick Start

```bash
# Install test dependencies
cd test && npm install

# Run all tests (recommended)
npm test

# Run specific test categories
npm run test:unit          # Unit tests only (fast)
npm run test:performance   # Performance benchmarks
npm run test:integration   # Integration tests
npm run test:stress        # Long-running stress tests
npm run test:ci            # CI-optimized test run
```

## 📁 Directory Structure

```
test/
├── unit/                    # Unit tests for individual components
│   ├── memory-pool.test.js     # Memory pool functionality
│   ├── simd-converter.test.js  # SIMD optimization validation
│   ├── webp-encoder.test.js    # WebP encoding logic
│   └── platform/               # Platform-specific tests
├── integration/             # Cross-component integration tests
│   ├── streaming-pipeline.test.js  # Ultra-streaming pipeline
│   ├── memory-simd.test.js         # Memory + SIMD integration
│   └── gpu-zerocopy.test.js        # GPU + Zero-copy integration
├── performance/             # Performance benchmarking
│   ├── core-benchmarks.test.js     # Core performance metrics
│   ├── memory-performance.test.js  # Memory efficiency tests
│   └── scalability.test.js         # Threading scalability
├── stress/                  # Stress and endurance tests
│   ├── endurance.test.js           # 24+ hour testing
│   ├── memory-pressure.test.js     # Low memory conditions
│   └── high-frequency.test.js      # Rapid capture cycles
├── quality/                 # Image quality validation
│   ├── webp-quality.test.js        # Compression quality metrics
│   └── pixel-accuracy.test.js      # Lossless accuracy
├── security/                # Security and stability
│   ├── buffer-safety.test.js       # Buffer overflow protection
│   └── privilege.test.js           # Permission handling
├── fixtures/                # Test data and images
│   ├── images/                      # Synthetic test images
│   └── baselines/                   # Performance baselines
├── reports/                 # Generated test reports
└── results/                 # Test execution results
```

## 🧪 Test Categories

### Unit Tests (`npm run test:unit`)
- **Memory Pool**: Buffer allocation, reuse, thread safety
- **SIMD Converter**: CPU detection, pixel format conversion, performance
- **WebP Encoder**: Multi-threading, tile combination, quality settings
- **Platform Modules**: Windows, macOS, Linux capture implementations

### Integration Tests (`npm run test:integration`)
- **Streaming Pipeline**: 8K+ image processing, chunked encoding
- **Memory + SIMD**: Pooled buffer usage in SIMD operations
- **GPU + Zero-Copy**: DirectX texture sharing, memory mapping
- **Multi-Display**: Simultaneous capture validation

### Performance Tests (`npm run test:performance`)
- **Core Benchmarks**: Capture and encoding performance across resolutions
- **Memory Efficiency**: Pool reuse, zero-copy optimization benefits
- **Threading Scalability**: Performance scaling with thread count
- **GPU Acceleration**: Hardware acceleration validation

### Stress Tests (`npm run test:stress`)
- **Endurance Testing**: 24+ hour continuous operation
- **Memory Pressure**: Low memory condition handling
- **Resource Exhaustion**: CPU/GPU/Memory limit testing
- **High Frequency**: Rapid successive captures (60+ FPS)

### Quality Tests (`npm run test:quality`)
- **WebP Quality**: PSNR/SSIM validation across quality settings
- **Pixel Accuracy**: Lossless capture verification
- **Compression Efficiency**: Ratio validation across image types
- **Visual Quality**: Subjective quality assessment

### Security Tests (`npm run test:security`)
- **Buffer Safety**: Overflow protection, boundary conditions
- **Privilege Validation**: Screen recording permissions
- **Memory Safety**: RAII patterns, smart pointer usage
- **Input Validation**: Malformed input handling

## 📊 Test Execution

### Local Testing
```bash
# Full test suite (recommended for development)
npm test

# Fast feedback loop (unit tests only)
npm run test:unit

# Performance validation
npm run test:performance

# Memory profiling
npm run test:memory-profile

# CPU profiling  
npm run test:cpu-profile
```

### Continuous Integration
The test suite automatically runs on:
- **Pull Requests**: Quick validation (unit + integration)
- **Main Branch**: Full test suite including performance
- **Daily Schedule**: Complete suite including stress tests

### Test Configuration

Environment variables for test customization:
```bash
# Skip long-running tests
SKIP_STRESS_TESTS=true
SKIP_PERFORMANCE_TESTS=true

# Control parallelization
MAX_PARALLEL_JOBS=4

# Output format
OUTPUT_FORMAT=json|detailed

# Reporting
GENERATE_REPORTS=true|false
FAIL_FAST=true|false
```

## 📈 Performance Baselines

The test suite maintains performance baselines for regression detection:

### Capture Performance (Expected)
- **1080p**: 15-35ms average
- **1440p**: 25-60ms average  
- **4K**: 50-150ms average
- **8K**: 150-400ms average

### Encoding Performance (Expected)
- **Quality 80**: 5+ MP/s throughput
- **Compression**: 8:1+ ratio for typical screenshots
- **Memory Usage**: <1GB for 4K encoding

### SIMD Performance (Expected)
- **AVX2**: 4-8x speedup over scalar
- **SSE2**: 2-4x speedup over scalar
- **Format Conversion**: 25+ MP/s processing

## 🔍 Test Reports

Generated reports include:
- **HTML Dashboard**: Visual performance metrics and trends
- **JSON Results**: Machine-readable test outcomes
- **Coverage Report**: Code coverage across all components
- **Performance Graphs**: Throughput and latency visualizations

Reports are automatically generated in:
- `test/reports/` - HTML and detailed reports
- `test/results/` - JSON data and benchmarks
- `test/coverage/` - Code coverage reports

## 🚨 Debugging Failed Tests

### Common Issues

1. **Display Not Available** (CI environments)
   ```bash
   # Setup virtual display for headless testing
   export DISPLAY=:99
   Xvfb :99 -screen 0 1920x1080x24 &
   ```

2. **Memory Pool Failures**
   ```bash
   # Check memory limits
   ulimit -m
   # Increase if needed
   ulimit -m 4194304  # 4GB
   ```

3. **GPU Tests Failing**
   ```bash
   # Verify GPU support
   node -e "console.log(require('../build/Release/webp_screenshot').isGPUSupported())"
   ```

4. **Performance Regression**
   ```bash
   # Compare with baseline
   npm run benchmark
   # Check performance reports in test/reports/
   ```

### Debug Commands
```bash
# Run with detailed logging
DEBUG=webp:* npm test

# Profile memory usage
npm run test:memory-profile

# Profile CPU usage  
npm run test:cpu-profile

# Run single test file
npx mocha test/unit/memory-pool.test.js --timeout 60000
```

## 🎛️ Advanced Configuration

### Custom Test Configuration (`test-config.json`)
```json
{
  "skipStressTests": false,
  "skipPerformanceTests": false,
  "maxParallelJobs": 4,
  "testTimeout": 300000,
  "outputFormat": "detailed",
  "generateReports": true,
  "failFast": false,
  "performanceThresholds": {
    "captureLatency": 100,
    "encodeThroughput": 5,
    "memoryEfficiency": 0.8
  }
}
```

### Platform-Specific Setup

#### Windows
```powershell
# Install Visual Studio Build Tools
npm install --global windows-build-tools

# Run tests
npm test
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Grant screen recording permissions
# System Preferences > Security & Privacy > Privacy > Screen Recording
npm test
```

#### Linux
```bash
# Install system dependencies
sudo apt-get install libx11-dev libxrandr-dev libxfixes-dev libxext-dev

# For Wayland support
sudo apt-get install libwayland-dev

# Setup virtual display for headless testing
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 &

npm test
```

## 🏆 Success Criteria

Tests pass when:
- ✅ **Functionality**: All features work across platforms
- ✅ **Performance**: Meets or exceeds baseline metrics
- ✅ **Quality**: Images meet PSNR/SSIM thresholds
- ✅ **Stability**: No crashes or memory leaks
- ✅ **Security**: Proper error handling and validation

## 📞 Support

For test-related issues:
1. Check the troubleshooting section above
2. Review test logs in `test/reports/`
3. Run individual test files for isolation
4. Verify system dependencies are installed
5. Check platform-specific requirements

The testing framework is designed to provide comprehensive validation of all optimization layers while remaining maintainable and efficient for continuous integration.