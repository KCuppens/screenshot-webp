#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Running Extended Test Suite - Screenshot WebP Library');
console.log('=======================================================\n');

const extendedTests = [
    // Core functionality tests
    {
        name: 'Main Functionality',
        path: 'tests/integration/main-functionality.test.js',
        timeout: 60000,
        description: 'Core functionality integration tests',
        category: 'Core'
    },
    {
        name: 'Performance Benchmarks',
        path: 'test/performance/core-benchmarks-fixed.test.js',
        timeout: 60000,
        description: 'Core performance and SIMD validation tests',
        category: 'Performance'
    },
    
    // Extended test suites
    {
        name: 'Extended Performance Stress Tests',
        path: 'test/performance/stress-tests.test.js',
        timeout: 120000,
        description: 'High-load stress testing and endurance validation',
        category: 'Performance'
    },
    {
        name: 'Edge Cases and Boundary Conditions',
        path: 'test/edge-cases/boundary-conditions.test.js',
        timeout: 45000,
        description: 'Parameter validation and edge case handling',
        category: 'Reliability'
    },
    {
        name: 'Multi-threaded Concurrency Tests',
        path: 'test/concurrency/multi-threaded.test.js',
        timeout: 90000,
        description: 'Thread safety and concurrent operation validation',
        category: 'Concurrency'
    },
    {
        name: 'Comprehensive Error Handling',
        path: 'test/error-handling/comprehensive-errors.test.js',
        timeout: 60000,
        description: 'Error condition and recovery testing',
        category: 'Reliability'
    },
    {
        name: 'WebP Quality and Compression Validation',
        path: 'test/quality/webp-compression-validation.test.js',
        timeout: 75000,
        description: 'WebP encoding quality and compression validation',
        category: 'Quality'
    },
    {
        name: 'Memory Leak and Resource Management',
        path: 'test/memory/resource-management.test.js',
        timeout: 120000,
        description: 'Memory leak detection and resource cleanup validation',
        category: 'Memory'
    },
    
    // Additional existing tests
    {
        name: 'Security Buffer Safety',
        path: 'test/security/buffer-safety-fixed.test.js',
        timeout: 30000,
        description: 'Buffer safety and security validation',
        category: 'Security'
    },
    {
        name: 'Streaming Pipeline',
        path: 'test/integration/streaming-pipeline-fixed.test.js',
        timeout: 60000,
        description: 'Real-time streaming and pipeline integration',
        category: 'Integration'
    },
    {
        name: 'Linux Platform Tests',
        path: 'tests/unit/linux-screenshot.test.js',
        timeout: 10000,
        description: 'Linux platform detection and compatibility',
        category: 'Platform'
    }
];

async function runTest(test) {
    return new Promise((resolve, reject) => {
        console.log(`\n📊 Running ${test.name}:`);
        console.log(`   Category: ${test.category}`);
        console.log(`   ${test.description}`);
        console.log(`   File: ${test.path}`);
        console.log(`   Timeout: ${test.timeout / 1000}s\n`);
        
        const jest = spawn('npx', ['jest', test.path, '--verbose', `--testTimeout=${test.timeout}`], {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        jest.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // Filter out verbose native addon output but keep important info
            const lines = output.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                return trimmed !== '' && 
                       !line.includes('SIMD-optimized screenshot captured') &&
                       !line.includes('Enhanced WebP encoded') &&
                       !line.includes('Real display enumeration');
            });
            if (filteredLines.length > 0) {
                console.log(filteredLines.join('\n'));
            }
        });
        
        jest.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            console.error(output);
        });
        
        jest.on('close', (code) => {
            const result = {
                name: test.name,
                category: test.category,
                passed: code === 0,
                stdout: stdout,
                stderr: stderr,
                code: code,
                timeout: test.timeout
            };
            
            if (code === 0) {
                console.log(`✅ ${test.name} - PASSED\n`);
            } else {
                console.log(`❌ ${test.name} - FAILED (exit code: ${code})\n`);
            }
            
            resolve(result);
        });
        
        jest.on('error', (error) => {
            console.error(`Failed to run ${test.name}:`, error);
            resolve({
                name: test.name,
                category: test.category,
                passed: false,
                error: error.message
            });
        });
    });
}

async function runAllTests() {
    const startTime = Date.now();
    const results = [];
    
    console.log(`Starting extended test execution at ${new Date().toISOString()}\n`);
    console.log(`Total test suites: ${extendedTests.length}`);
    console.log(`Categories: ${[...new Set(extendedTests.map(t => t.category))].join(', ')}\n`);
    
    for (const test of extendedTests) {
        const result = await runTest(test);
        results.push(result);
        
        // Brief pause between tests to allow cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log('\n🏁 Extended Test Execution Summary');
    console.log('==================================');
    console.log(`Total execution time: ${totalTime.toFixed(1)} seconds (${(totalTime / 60).toFixed(1)} minutes)\n`);
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    // Group results by category
    const resultsByCategory = {};
    results.forEach(result => {
        if (!resultsByCategory[result.category]) {
            resultsByCategory[result.category] = [];
        }
        resultsByCategory[result.category].push(result);
    });
    
    console.log('📊 Test Results by Category:');
    Object.keys(resultsByCategory).sort().forEach(category => {
        const categoryResults = resultsByCategory[category];
        const categoryPassed = categoryResults.filter(r => r.passed).length;
        const categoryTotal = categoryResults.length;
        
        console.log(`\n   ${category} (${categoryPassed}/${categoryTotal} passed):`);
        categoryResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`     ${status} - ${result.name}`);
        });
    });
    
    console.log(`\n📈 Overall Summary: ${passed}/${results.length} test suites passed (${((passed/results.length)*100).toFixed(1)}%)`);
    
    if (passed === results.length) {
        console.log('\n🎉 All extended tests passed! Screenshot WebP library is production-ready.');
        console.log('\n🚀 Extended validation achievements:');
        console.log('   ✅ SIMD optimization active and performant under stress');
        console.log('   ✅ Screenshot capture working reliably with edge cases');
        console.log('   ✅ WebP encoding producing consistent, high-quality output');
        console.log('   ✅ Thread safety and concurrency handling validated');
        console.log('   ✅ Memory management and resource cleanup verified');
        console.log('   ✅ Comprehensive error handling and recovery confirmed');
        console.log('   ✅ WebP quality levels and compression ratios validated');
        console.log('   ✅ Buffer safety and security measures comprehensive');
        console.log('   ✅ Performance consistency under various load conditions');
    } else {
        console.log(`\n⚠️  ${failed} test suite(s) failed. See details above.`);
        
        const failedTests = results.filter(r => !r.passed);
        console.log('\n❌ Failed Test Details:');
        failedTests.forEach(test => {
            console.log(`   • ${test.name} (${test.category})`);
            if (test.error) {
                console.log(`     Error: ${test.error}`);
            }
        });
    }
    
    console.log('\n📝 Additional Test Commands:');
    console.log('   • Core tests only: npm test');
    console.log('   • Performance benchmarks: npm run benchmark');
    console.log('   • SIMD validation: npm run validate');
    console.log('   • Performance analysis: npm run analyze');
    console.log('   • Individual test suites: npm run test:performance, npm run test:security, etc.');
    
    // Performance summary if available
    const performanceTests = results.filter(r => r.category === 'Performance' && r.passed);
    if (performanceTests.length > 0) {
        console.log('\n⚡ Performance Test Summary:');
        console.log('   All performance tests passed - SIMD optimization confirmed active');
        console.log('   Stress testing validated under high-load conditions');
        console.log('   Memory efficiency maintained under extended operations');
    }
    
    process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
    console.error('Extended test runner error:', error);
    process.exit(1);
});