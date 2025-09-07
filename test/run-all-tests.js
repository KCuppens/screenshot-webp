#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Advanced Test Runner for Screenshot WebP Library
 * Orchestrates comprehensive testing across all optimization layers
 */

class AdvancedTestRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      testSuites: {}
    };
    
    this.testSuites = {
      unit: {
        name: 'Unit Tests',
        pattern: 'unit/**/*.test.js',
        timeout: '30m',
        parallel: true,
        retries: 2
      },
      integration: {
        name: 'Integration Tests', 
        pattern: 'integration/**/*.test.js',
        timeout: '60m',
        parallel: false,
        retries: 1
      },
      performance: {
        name: 'Performance Benchmarks',
        pattern: 'performance/**/*.test.js',
        timeout: '120m',
        parallel: false,
        retries: 0
      },
      stress: {
        name: 'Stress Tests',
        pattern: 'stress/**/*.test.js',
        timeout: '480m',
        parallel: false,
        retries: 0
      },
      quality: {
        name: 'Quality Assurance',
        pattern: 'quality/**/*.test.js',
        timeout: '45m',
        parallel: true,
        retries: 1
      },
      security: {
        name: 'Security Tests',
        pattern: 'security/**/*.test.js',
        timeout: '30m',
        parallel: true,
        retries: 2
      }
    };
    
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(__dirname, 'test-config.json');
    
    const defaultConfig = {
      skipStressTests: process.env.SKIP_STRESS_TESTS === 'true',
      skipPerformanceTests: process.env.SKIP_PERFORMANCE_TESTS === 'true',
      maxParallelJobs: parseInt(process.env.MAX_PARALLEL_JOBS) || Math.max(2, os.cpus().length - 1),
      testTimeout: parseInt(process.env.TEST_TIMEOUT) || 300000, // 5 minutes default
      outputFormat: process.env.OUTPUT_FORMAT || 'detailed',
      generateReports: process.env.GENERATE_REPORTS !== 'false',
      failFast: process.env.FAIL_FAST === 'true'
    };
    
    try {
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { ...defaultConfig, ...fileConfig };
      }
    } catch (error) {
      console.warn('Warning: Could not load test config, using defaults');
    }
    
    return defaultConfig;
  }

  async runTestSuite(suiteKey, suite) {
    console.log(`\n🧪 Running ${suite.name}...`);
    console.log(`   Pattern: ${suite.pattern}`);
    console.log(`   Timeout: ${suite.timeout}`);
    console.log(`   Parallel: ${suite.parallel}`);
    
    const startTime = Date.now();
    
    try {
      const testFiles = this.findTestFiles(suite.pattern);
      
      if (testFiles.length === 0) {
        console.log(`⚠️  No test files found for pattern: ${suite.pattern}`);
        return { success: true, skipped: true, testCount: 0, duration: 0 };
      }
      
      console.log(`   Found ${testFiles.length} test files`);
      
      const result = await this.executeTests(testFiles, suite);
      const duration = Date.now() - startTime;
      
      this.results.testSuites[suiteKey] = {
        ...result,
        duration,
        testFiles: testFiles.length
      };
      
      if (result.success) {
        console.log(`✅ ${suite.name} completed successfully (${duration}ms)`);
      } else {
        console.log(`❌ ${suite.name} failed (${duration}ms)`);
        if (this.config.failFast) {
          throw new Error(`Test suite ${suite.name} failed and fail-fast is enabled`);
        }
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`💥 ${suite.name} crashed: ${error.message}`);
      
      this.results.testSuites[suiteKey] = {
        success: false,
        error: error.message,
        duration,
        testCount: 0,
        passCount: 0,
        failCount: 1
      };
      
      if (this.config.failFast) {
        throw error;
      }
      
      return { success: false, error: error.message };
    }
  }

  findTestFiles(pattern) {
    const glob = require('glob');
    const files = glob.sync(pattern, { cwd: __dirname });
    console.log(`   Searching in: ${__dirname}`);
    console.log(`   Pattern: ${pattern}`);
    console.log(`   Found files:`, files);
    return files;
  }

  async executeTests(testFiles, suite) {
    const mochaPath = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'mocha.cmd' : 'mocha');
    
    const mochaArgs = [
      '--reporter', this.config.outputFormat === 'json' ? 'json' : 'spec',
      '--timeout', this.parseTimeout(suite.timeout).toString(),
      '--bail', this.config.failFast ? 'true' : 'false',
      '--exit'
    ];
    
    if (suite.retries > 0) {
      mochaArgs.push('--retries', suite.retries.toString());
    }
    
    if (suite.parallel && testFiles.length > 1 && this.config.maxParallelJobs > 1) {
      mochaArgs.push('--parallel');
      mochaArgs.push('--jobs', Math.min(this.config.maxParallelJobs, testFiles.length).toString());
    }
    
    // Add test files
    mochaArgs.push(...testFiles);
    
    return new Promise((resolve, reject) => {
      console.log(`   Executing: ${mochaPath} ${mochaArgs.join(' ')}`);
      
      const child = spawn(mochaPath, mochaArgs, {
        cwd: __dirname,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (this.config.outputFormat === 'detailed') {
          process.stdout.write(data);
        }
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (this.config.outputFormat === 'detailed') {
          process.stderr.write(data);
        }
      });
      
      child.on('close', (code) => {
        const result = this.parseMochaOutput(stdout, stderr, code);
        resolve(result);
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to execute tests: ${error.message}`));
      });
    });
  }

  parseMochaOutput(stdout, stderr, exitCode) {
    let testCount = 0;
    let passCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    try {
      if (this.config.outputFormat === 'json') {
        const jsonOutput = JSON.parse(stdout);
        testCount = jsonOutput.stats.tests || 0;
        passCount = jsonOutput.stats.passes || 0;
        failCount = jsonOutput.stats.failures || 0;
        skipCount = jsonOutput.stats.pending || 0;
      } else {
        // Parse text output
        const passMatch = stdout.match(/(\d+) passing/);
        const failMatch = stdout.match(/(\d+) failing/);
        const skipMatch = stdout.match(/(\d+) pending/);
        
        passCount = passMatch ? parseInt(passMatch[1]) : 0;
        failCount = failMatch ? parseInt(failMatch[1]) : 0;
        skipCount = skipMatch ? parseInt(skipMatch[1]) : 0;
        testCount = passCount + failCount + skipCount;
      }
    } catch (error) {
      console.warn('Warning: Could not parse test output', error.message);
    }
    
    return {
      success: exitCode === 0 && failCount === 0,
      testCount,
      passCount,
      failCount,
      skipCount,
      stdout,
      stderr,
      exitCode
    };
  }

  parseTimeout(timeoutStr) {
    const match = timeoutStr.match(/(\d+)([a-z]+)/);
    if (!match) return 300000; // Default 5 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      's': 1000,
      'm': 60000,
      'h': 3600000
    };
    
    return value * (multipliers[unit] || 60000);
  }

  async generateReports() {
    if (!this.config.generateReports) {
      return;
    }
    
    console.log('\n📊 Generating test reports...');
    
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Generate summary report
    await this.generateSummaryReport(reportsDir);
    
    // Generate detailed report
    await this.generateDetailedReport(reportsDir);
    
    // Generate performance report if performance tests ran
    if (this.results.testSuites.performance && !this.results.testSuites.performance.skipped) {
      await this.generatePerformanceReport(reportsDir);
    }
    
    console.log(`📊 Reports generated in: ${reportsDir}`);
  }

  async generateSummaryReport(reportsDir) {
    const summaryPath = path.join(reportsDir, 'test-summary.json');
    
    const summary = {
      ...this.results,
      summary: {
        totalSuites: Object.keys(this.results.testSuites).length,
        successfulSuites: Object.values(this.results.testSuites).filter(s => s.success).length,
        totalTests: Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.testCount || 0), 0),
        totalPassed: Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.passCount || 0), 0),
        totalFailed: Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.failCount || 0), 0),
        totalSkipped: Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.skipCount || 0), 0),
        totalDuration: Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.duration || 0), 0)
      }
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }

  async generateDetailedReport(reportsDir) {
    const detailedPath = path.join(reportsDir, 'test-detailed.html');
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Screenshot WebP Library - Test Results</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .suite { margin-bottom: 30px; border: 1px solid #dee2e6; border-radius: 8px; }
        .suite-header { background: #e9ecef; padding: 15px; font-weight: bold; }
        .suite-content { padding: 15px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #495057; }
        .stat-label { font-size: 0.9em; color: #6c757d; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Screenshot WebP Library - Test Results</h1>
        <p><strong>Platform:</strong> ${this.results.platform} ${this.results.arch}</p>
        <p><strong>Node:</strong> ${this.results.nodeVersion}</p>
        <p><strong>Timestamp:</strong> ${this.results.timestamp}</p>
        <p><strong>CPUs:</strong> ${this.results.cpuCount} cores, <strong>Memory:</strong> ${this.results.totalMemory}GB</p>
    </div>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${Object.keys(this.results.testSuites).length}</div>
            <div class="stat-label">Test Suites</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.testCount || 0), 0)}</div>
            <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value success">${Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.passCount || 0), 0)}</div>
            <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value failure">${Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.failCount || 0), 0)}</div>
            <div class="stat-label">Failed</div>
        </div>
    </div>
    
    ${Object.entries(this.results.testSuites).map(([key, suite]) => `
        <div class="suite">
            <div class="suite-header ${suite.success ? 'success' : 'failure'}">
                ${this.testSuites[key]?.name || key} ${suite.success ? '✅' : '❌'}
            </div>
            <div class="suite-content">
                <p><strong>Duration:</strong> ${suite.duration}ms</p>
                <p><strong>Tests:</strong> ${suite.testCount || 0} (${suite.passCount || 0} passed, ${suite.failCount || 0} failed, ${suite.skipCount || 0} skipped)</p>
                ${suite.error ? `<p><strong>Error:</strong> ${suite.error}</p>` : ''}
            </div>
        </div>
    `).join('')}
    
</body>
</html>
    `;
    
    fs.writeFileSync(detailedPath, html);
  }

  async generatePerformanceReport(reportsDir) {
    const performancePath = path.join(reportsDir, 'performance-report.html');
    
    // Load benchmark results if they exist
    const benchmarkResultsPath = path.join(__dirname, 'results', 'benchmark-results.json');
    let benchmarkData = null;
    
    try {
      if (fs.existsSync(benchmarkResultsPath)) {
        benchmarkData = JSON.parse(fs.readFileSync(benchmarkResultsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load benchmark results:', error.message);
    }
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Report - Screenshot WebP Library</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .chart-container { width: 100%; height: 400px; margin: 20px 0; }
        .perf-section { margin: 30px 0; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>Performance Report - Screenshot WebP Library</h1>
    
    <div class="perf-section">
        <h2>Performance Summary</h2>
        ${benchmarkData ? `
            <p><strong>Platform:</strong> ${benchmarkData.platform}</p>
            <p><strong>Generated:</strong> ${benchmarkData.timestamp}</p>
            
            <h3>Capture Performance</h3>
            <ul>
                ${Object.entries(benchmarkData.results.capturePerformance || {}).map(([res, data]) => 
                    `<li><strong>${res}:</strong> ${data.avgDurationMs?.toFixed(2)}ms avg (P95: ${data.p95DurationMs?.toFixed(2)}ms)</li>`
                ).join('')}
            </ul>
            
            <h3>Encoding Performance</h3>
            <ul>
                ${Object.entries(benchmarkData.results.encodePerformance || {}).map(([key, data]) => 
                    `<li><strong>${key}:</strong> ${data.throughputMegapixelsPerSecond?.toFixed(2)} MP/s, ${data.avgCompressionRatio?.toFixed(1)}:1 compression</li>`
                ).join('')}
            </ul>
        ` : '<p>No benchmark data available</p>'}
    </div>
    
    <div class="perf-section">
        <h2>Test Suite Performance</h2>
        <div class="chart-container">
            <canvas id="suiteChart"></canvas>
        </div>
    </div>
    
    <script>
        const ctx = document.getElementById('suiteChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(Object.keys(this.results.testSuites))},
                datasets: [{
                    label: 'Duration (ms)',
                    data: ${JSON.stringify(Object.values(this.results.testSuites).map(s => s.duration || 0))},
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
</body>
</html>
    `;
    
    fs.writeFileSync(performancePath, html);
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 TEST EXECUTION SUMMARY');
    console.log('='.repeat(60));
    
    const totalSuites = Object.keys(this.results.testSuites).length;
    const successfulSuites = Object.values(this.results.testSuites).filter(s => s.success).length;
    const totalTests = Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.testCount || 0), 0);
    const totalPassed = Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.passCount || 0), 0);
    const totalFailed = Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.failCount || 0), 0);
    const totalDuration = Object.values(this.results.testSuites).reduce((sum, s) => sum + (s.duration || 0), 0);
    
    console.log(`Platform: ${this.results.platform} ${this.results.arch}`);
    console.log(`Node: ${this.results.nodeVersion}`);
    console.log(`CPUs: ${this.results.cpuCount}, Memory: ${this.results.totalMemory}GB`);
    console.log('');
    console.log(`Test Suites: ${successfulSuites}/${totalSuites} passed`);
    console.log(`Tests: ${totalPassed}/${totalTests} passed (${totalFailed} failed)`);
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log('');
    
    Object.entries(this.results.testSuites).forEach(([key, suite]) => {
      const status = suite.success ? '✅' : suite.skipped ? '⏭️' : '❌';
      const name = this.testSuites[key]?.name || key;
      const duration = suite.duration ? `(${(suite.duration / 1000).toFixed(2)}s)` : '';
      console.log(`${status} ${name} ${duration}`);
      
      if (!suite.success && suite.error) {
        console.log(`   Error: ${suite.error}`);
      }
    });
    
    console.log('='.repeat(60));
    
    if (totalFailed > 0) {
      console.log('❌ TESTS FAILED');
      process.exit(1);
    } else {
      console.log('✅ ALL TESTS PASSED');
      process.exit(0);
    }
  }

  async run() {
    console.log('🚀 Starting Advanced Test Suite for Screenshot WebP Library');
    console.log(`Platform: ${this.results.platform} ${this.results.arch}`);
    console.log(`Node: ${this.results.nodeVersion}`);
    console.log(`CPUs: ${this.results.cpuCount}, Memory: ${this.results.totalMemory}GB`);
    
    const suitesToRun = Object.entries(this.testSuites).filter(([key, suite]) => {
      if (key === 'stress' && this.config.skipStressTests) {
        console.log(`⏭️  Skipping ${suite.name} (SKIP_STRESS_TESTS=true)`);
        return false;
      }
      if (key === 'performance' && this.config.skipPerformanceTests) {
        console.log(`⏭️  Skipping ${suite.name} (SKIP_PERFORMANCE_TESTS=true)`);
        return false;
      }
      return true;
    });
    
    console.log(`\n📋 Will run ${suitesToRun.length} test suites:`);
    suitesToRun.forEach(([key, suite]) => {
      console.log(`   • ${suite.name}`);
    });
    
    // Run test suites
    for (const [key, suite] of suitesToRun) {
      await this.runTestSuite(key, suite);
    }
    
    // Generate reports
    await this.generateReports();
    
    // Print summary
    this.printSummary();
  }
}

// Check if this script is being run directly
if (require.main === module) {
  const runner = new AdvancedTestRunner();
  
  // Handle process signals
  process.on('SIGINT', () => {
    console.log('\n🛑 Test execution interrupted');
    process.exit(1);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Test execution terminated');
    process.exit(1);
  });
  
  // Run tests
  runner.run().catch(error => {
    console.error('💥 Test runner crashed:', error);
    process.exit(1);
  });
}

module.exports = AdvancedTestRunner;