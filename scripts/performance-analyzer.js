#!/usr/bin/env node

/**
 * WebP Screenshot Performance Analyzer
 * Analyzes code complexity, performance patterns, and optimization opportunities
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceAnalyzer {
    constructor() {
        this.results = {
            complexity: {},
            patterns: {},
            optimizations: [],
            metrics: {}
        };
    }

    /**
     * Analyze the entire codebase
     */
    async analyze() {
        console.log('🔍 Starting WebP Screenshot Performance Analysis...\n');
        
        await this.analyzeCodeComplexity();
        await this.analyzeMemoryPatterns();
        await this.analyzePerformancePatterns();
        await this.identifyOptimizations();
        
        this.generateReport();
    }

    /**
     * Analyze algorithmic complexity of key functions
     */
    async analyzeCodeComplexity() {
        console.log('📊 Analyzing Code Complexity...');
        
        const cppFiles = this.findFiles('src/native', ['.cc', '.cpp', '.mm']);
        const jsFiles = this.findFiles('src', ['.js']);
        
        for (const file of [...cppFiles, ...jsFiles]) {
            await this.analyzeFileComplexity(file);
        }
        
        console.log(`   ✅ Analyzed ${cppFiles.length + jsFiles.length} files\n`);
    }

    /**
     * Analyze complexity of a single file
     */
    async analyzeFileComplexity(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const fileName = path.basename(filePath);
            
            this.results.complexity[fileName] = {
                cyclomaticComplexity: this.calculateCyclomaticComplexity(content),
                nestedLoops: this.findNestedLoops(content),
                recursiveCalls: this.findRecursiveCalls(content),
                algorithmicComplexity: this.estimateAlgorithmicComplexity(content),
                memoryAllocations: this.findMemoryAllocations(content),
                performanceCriticalSections: this.findPerformanceCriticalSections(content)
            };
            
        } catch (error) {
            console.warn(`   ⚠️  Could not analyze ${filePath}: ${error.message}`);
        }
    }

    /**
     * Calculate cyclomatic complexity
     */
    calculateCyclomaticComplexity(content) {
        // Count decision points: if, while, for, switch, catch, &&, ||, ?:
        const patterns = [
            /\bif\s*\(/g,
            /\bwhile\s*\(/g,
            /\bfor\s*\(/g,
            /\bswitch\s*\(/g,
            /\bcatch\s*\(/g,
            /&&/g,
            /\|\|/g,
            /\?.*:/g
        ];
        
        let complexity = 1; // Base complexity
        
        for (const pattern of patterns) {
            const matches = content.match(pattern);
            complexity += matches ? matches.length : 0;
        }
        
        return complexity;
    }

    /**
     * Find nested loops (potential O(n²) or worse complexity)
     */
    findNestedLoops(content) {
        const lines = content.split('\n');
        const nestedLoops = [];
        let loopDepth = 0;
        let maxDepth = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Count loop starts
            if (/\b(for|while)\s*\(/.test(line)) {
                loopDepth++;
                maxDepth = Math.max(maxDepth, loopDepth);
                
                if (loopDepth > 1) {
                    nestedLoops.push({
                        line: i + 1,
                        depth: loopDepth,
                        code: line.trim()
                    });
                }
            }
            
            // Count loop ends (simplified - count closing braces)
            if (line.includes('}')) {
                loopDepth = Math.max(0, loopDepth - 1);
            }
        }
        
        return { maxDepth, instances: nestedLoops };
    }

    /**
     * Find recursive function calls
     */
    findRecursiveCalls(content) {
        const functionNames = content.match(/(?:function\s+|^\s*\w+\s*(?:\w+::)?)?(\w+)\s*\(/gm);
        const recursiveCalls = [];
        
        if (functionNames) {
            for (const funcMatch of functionNames) {
                const funcName = funcMatch.match(/(\w+)\s*\(/);
                if (funcName && funcName[1]) {
                    const name = funcName[1];
                    const occurrences = (content.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;
                    
                    if (occurrences > 1) {
                        recursiveCalls.push({ function: name, calls: occurrences });
                    }
                }
            }
        }
        
        return recursiveCalls;
    }

    /**
     * Estimate algorithmic complexity based on code patterns
     */
    estimateAlgorithmicComplexity(content) {
        const complexityIndicators = {
            'O(1)': [/\bconstant\b/, /\bO\(1\)/],
            'O(log n)': [/binary.?search/, /\blog\s*\w+/, /\bO\(log\s*n\)/],
            'O(n)': [/\blinear\b/, /single.?loop/, /\bO\(n\)/],
            'O(n log n)': [/\bsort\b/, /merge/, /\bO\(n\s*log\s*n\)/],
            'O(n²)': [/nested.*loop/, /double.*loop/, /\bO\(n\^?2\)/],
            'O(2^n)': [/recursive.*fibonacci/, /\bO\(2\^n\)/]
        };
        
        const results = {};
        
        for (const [complexity, patterns] of Object.entries(complexityIndicators)) {
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    results[complexity] = (results[complexity] || 0) + 1;
                }
            }
        }
        
        return results;
    }

    /**
     * Find memory allocation patterns
     */
    findMemoryAllocations(content) {
        const patterns = {
            'new': /\bnew\s+\w+/g,
            'malloc': /\bmalloc\s*\(/g,
            'make_unique': /make_unique\s*</g,
            'make_shared': /make_shared\s*</g,
            'Buffer allocation': /Buffer::(New|Alloc)/g,
            'Array allocation': /new\s+\w+\s*\[/g
        };
        
        const allocations = {};
        
        for (const [type, pattern] of Object.entries(patterns)) {
            const matches = content.match(pattern);
            if (matches) {
                allocations[type] = matches.length;
            }
        }
        
        return allocations;
    }

    /**
     * Find performance-critical code sections
     */
    findPerformanceCriticalSections(content) {
        const criticalPatterns = [
            { pattern: /for.*width.*height/, type: 'Pixel iteration', impact: 'high' },
            { pattern: /memcpy|memmove/, type: 'Memory copy', impact: 'medium' },
            { pattern: /XGetImage|CGWindowListCreateImage/, type: 'Screen capture', impact: 'high' },
            { pattern: /WebPEncode/, type: 'WebP encoding', impact: 'high' },
            { pattern: /ConvertPixelFormat/, type: 'Format conversion', impact: 'medium' },
            { pattern: /shared_memory|XShm/, type: 'Shared memory', impact: 'medium' }
        ];
        
        const criticalSections = [];
        
        for (const { pattern, type, impact } of criticalPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                criticalSections.push({
                    type,
                    impact,
                    occurrences: matches.length
                });
            }
        }
        
        return criticalSections;
    }

    /**
     * Analyze memory usage patterns
     */
    async analyzeMemoryPatterns() {
        console.log('🧠 Analyzing Memory Patterns...');
        
        const patterns = {
            smartPointers: 0,
            rawPointers: 0,
            memoryLeakRisks: 0,
            raii: 0,
            memoryPools: 0
        };
        
        const files = this.findFiles('src/native', ['.cc', '.cpp', '.mm', '.h']);
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            
            // Count smart pointers (good)
            patterns.smartPointers += (content.match(/std::(unique_ptr|shared_ptr)/g) || []).length;
            
            // Count raw pointers (potential risk)
            patterns.rawPointers += (content.match(/\w+\s*\*/g) || []).length;
            
            // Memory leak risks
            patterns.memoryLeakRisks += (content.match(/new\s+\w+(?!.*delete)/g) || []).length;
            
            // RAII patterns
            patterns.raii += (content.match(/class.*\{[\s\S]*?~\w+\(\)/g) || []).length;
            
            // Memory pools
            patterns.memoryPools += (content.match(/pool|Pool/g) || []).length;
        }
        
        this.results.patterns.memory = patterns;
        console.log('   ✅ Memory pattern analysis complete\n');
    }

    /**
     * Analyze performance patterns in the code
     */
    async analyzePerformancePatterns() {
        console.log('⚡ Analyzing Performance Patterns...');
        
        const patterns = {
            caching: 0,
            precomputation: 0,
            lazyLoading: 0,
            vectorization: 0,
            multithreading: 0,
            asyncOperations: 0
        };
        
        const files = this.findFiles('src', ['.js', '.cc', '.cpp', '.mm']);
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            
            patterns.caching += (content.match(/cache|Cache/g) || []).length;
            patterns.precomputation += (content.match(/precompute|precalculate/g) || []).length;
            patterns.lazyLoading += (content.match(/lazy|Lazy/g) || []).length;
            patterns.vectorization += (content.match(/SIMD|AVX|NEON/g) || []).length;
            patterns.multithreading += (content.match(/thread|Thread|async|await/g) || []).length;
            patterns.asyncOperations += (content.match(/Promise|async|await|uv_queue_work/g) || []).length;
        }
        
        this.results.patterns.performance = patterns;
        console.log('   ✅ Performance pattern analysis complete\n');
    }

    /**
     * Identify optimization opportunities
     */
    async identifyOptimizations() {
        console.log('🎯 Identifying Optimization Opportunities...');
        
        const optimizations = [];
        
        // Analyze complexity results for high-impact optimizations
        for (const [file, analysis] of Object.entries(this.results.complexity)) {
            if (analysis.nestedLoops.maxDepth > 2) {
                optimizations.push({
                    type: 'Algorithm Optimization',
                    priority: 'High',
                    file: file,
                    issue: `Nested loops (depth: ${analysis.nestedLoops.maxDepth})`,
                    suggestion: 'Consider vectorization or algorithm restructuring',
                    impact: 'O(n²) → O(n) potential improvement'
                });
            }
            
            if (analysis.cyclomaticComplexity > 15) {
                optimizations.push({
                    type: 'Code Complexity',
                    priority: 'Medium',
                    file: file,
                    issue: `High cyclomatic complexity (${analysis.cyclomaticComplexity})`,
                    suggestion: 'Refactor into smaller functions',
                    impact: 'Better maintainability and potential performance'
                });
            }
            
            if (analysis.memoryAllocations.new > 10) {
                optimizations.push({
                    type: 'Memory Optimization',
                    priority: 'Medium',
                    file: file,
                    issue: 'High number of dynamic allocations',
                    suggestion: 'Consider memory pooling or stack allocation',
                    impact: '15-25% reduction in allocation overhead'
                });
            }
        }
        
        // Memory pattern optimizations
        const memoryPatterns = this.results.patterns.memory;
        if (memoryPatterns.memoryPools === 0 && memoryPatterns.smartPointers > 20) {
            optimizations.push({
                type: 'Memory Pool Implementation',
                priority: 'High',
                file: 'Architecture',
                issue: 'No memory pools detected with high allocation activity',
                suggestion: 'Implement memory pools for frequent allocations',
                impact: '20-30% reduction in allocation overhead'
            });
        }
        
        // Performance pattern optimizations  
        const perfPatterns = this.results.patterns.performance;
        if (perfPatterns.vectorization === 0) {
            optimizations.push({
                type: 'SIMD Optimization',
                priority: 'High',
                file: 'Pixel conversion functions',
                issue: 'No vectorization detected in pixel processing',
                suggestion: 'Implement SIMD instructions for pixel format conversion',
                impact: '25-50% improvement in conversion speed'
            });
        }
        
        if (perfPatterns.multithreading < 5) {
            optimizations.push({
                type: 'Parallel Processing',
                priority: 'Medium',
                file: 'WebP encoding',
                issue: 'Limited multithreading in encoding pipeline',
                suggestion: 'Implement tiled parallel encoding for large images',
                impact: '50-200% improvement for 4K+ images'
            });
        }
        
        this.results.optimizations = optimizations;
        console.log(`   ✅ Found ${optimizations.length} optimization opportunities\n`);
    }

    /**
     * Generate comprehensive performance report
     */
    generateReport() {
        console.log('📋 Generating Performance Report...\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: this.generateSummary(),
            complexity: this.results.complexity,
            patterns: this.results.patterns,
            optimizations: this.results.optimizations,
            recommendations: this.generateRecommendations()
        };
        
        // Save detailed report
        const reportPath = path.join(__dirname, '../tests/results', 'performance-analysis.json');
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.printSummary(report);
        
        console.log(`\n📄 Detailed report saved: ${reportPath}`);
    }

    /**
     * Generate analysis summary
     */
    generateSummary() {
        const complexityFiles = Object.keys(this.results.complexity).length;
        const avgComplexity = Object.values(this.results.complexity)
            .reduce((sum, file) => sum + file.cyclomaticComplexity, 0) / complexityFiles;
        
        const highComplexityFiles = Object.values(this.results.complexity)
            .filter(file => file.cyclomaticComplexity > 15).length;
        
        const totalOptimizations = this.results.optimizations.length;
        const highPriorityOptimizations = this.results.optimizations
            .filter(opt => opt.priority === 'High').length;
        
        return {
            filesAnalyzed: complexityFiles,
            averageComplexity: Math.round(avgComplexity * 10) / 10,
            highComplexityFiles,
            totalOptimizations,
            highPriorityOptimizations,
            overallGrade: this.calculateOverallGrade()
        };
    }

    /**
     * Calculate overall performance grade
     */
    calculateOverallGrade() {
        let score = 100;
        
        // Deduct for high complexity
        const avgComplexity = Object.values(this.results.complexity)
            .reduce((sum, file) => sum + file.cyclomaticComplexity, 0) / 
            Object.keys(this.results.complexity).length;
        
        if (avgComplexity > 20) score -= 15;
        else if (avgComplexity > 15) score -= 10;
        else if (avgComplexity > 10) score -= 5;
        
        // Deduct for nested loops
        const maxNestedDepth = Math.max(...Object.values(this.results.complexity)
            .map(file => file.nestedLoops.maxDepth));
        
        if (maxNestedDepth > 3) score -= 15;
        else if (maxNestedDepth > 2) score -= 10;
        
        // Add points for good patterns
        const memoryPatterns = this.results.patterns.memory;
        if (memoryPatterns.smartPointers > memoryPatterns.rawPointers) score += 5;
        if (memoryPatterns.raii > 5) score += 5;
        
        const perfPatterns = this.results.patterns.performance;
        if (perfPatterns.asyncOperations > 10) score += 5;
        if (perfPatterns.caching > 5) score += 3;
        
        score = Math.max(0, Math.min(100, score));
        
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate specific recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        
        // High priority recommendations
        const highPriorityOpts = this.results.optimizations
            .filter(opt => opt.priority === 'High');
        
        if (highPriorityOpts.length > 0) {
            recommendations.push({
                category: 'Immediate Action Required',
                items: highPriorityOpts.map(opt => ({
                    action: opt.suggestion,
                    impact: opt.impact,
                    effort: this.estimateEffort(opt.type)
                }))
            });
        }
        
        // Memory optimizations
        if (this.results.patterns.memory.memoryPools === 0) {
            recommendations.push({
                category: 'Memory Optimization',
                items: [{
                    action: 'Implement memory pools for screenshot buffers',
                    impact: '20-30% reduction in allocation overhead',
                    effort: '1-2 weeks'
                }]
            });
        }
        
        // Performance optimizations
        if (this.results.patterns.performance.vectorization === 0) {
            recommendations.push({
                category: 'CPU Optimization',
                items: [{
                    action: 'Add SIMD instructions for pixel format conversion',
                    impact: '25-50% faster pixel processing',
                    effort: '2-3 weeks'
                }]
            });
        }
        
        return recommendations;
    }

    /**
     * Estimate implementation effort
     */
    estimateEffort(optimizationType) {
        const effortMap = {
            'Algorithm Optimization': '2-4 weeks',
            'Memory Optimization': '1-2 weeks',
            'SIMD Optimization': '2-3 weeks',
            'Parallel Processing': '3-5 weeks',
            'Code Complexity': '1-2 weeks'
        };
        
        return effortMap[optimizationType] || '1-3 weeks';
    }

    /**
     * Print summary to console
     */
    printSummary(report) {
        const summary = report.summary;
        
        console.log('=' .repeat(60));
        console.log('📊 WEBP SCREENSHOT PERFORMANCE ANALYSIS SUMMARY');
        console.log('=' .repeat(60));
        
        console.log(`\n📁 Files Analyzed: ${summary.filesAnalyzed}`);
        console.log(`📈 Average Complexity: ${summary.averageComplexity}`);
        console.log(`⚠️  High Complexity Files: ${summary.highComplexityFiles}`);
        console.log(`🎯 Total Optimizations: ${summary.totalOptimizations}`);
        console.log(`🚨 High Priority: ${summary.highPriorityOptimizations}`);
        console.log(`\n🏆 Overall Grade: ${summary.overallGrade}`);
        
        console.log('\n📋 TOP OPTIMIZATION OPPORTUNITIES:');
        console.log('-' .repeat(40));
        
        const topOpts = this.results.optimizations
            .filter(opt => opt.priority === 'High')
            .slice(0, 5);
            
        if (topOpts.length === 0) {
            console.log('✅ No high-priority optimizations needed!');
        } else {
            topOpts.forEach((opt, index) => {
                console.log(`${index + 1}. ${opt.type}: ${opt.suggestion}`);
                console.log(`   Impact: ${opt.impact}`);
                console.log(`   Effort: ${this.estimateEffort(opt.type)}\n`);
            });
        }
        
        console.log('\n💡 PATTERN ANALYSIS:');
        console.log('-' .repeat(40));
        console.log(`Smart Pointers: ${this.results.patterns.memory.smartPointers}`);
        console.log(`Async Operations: ${this.results.patterns.performance.asyncOperations}`);
        console.log(`Caching Usage: ${this.results.patterns.performance.caching}`);
        console.log(`Vectorization: ${this.results.patterns.performance.vectorization}`);
    }

    /**
     * Find files with specific extensions
     */
    findFiles(directory, extensions) {
        const files = [];
        
        if (!fs.existsSync(directory)) {
            return files;
        }
        
        const scan = (dir) => {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scan(fullPath);
                } else if (extensions.some(ext => fullPath.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        };
        
        scan(directory);
        return files;
    }
}

// Run analysis if called directly
if (require.main === module) {
    const analyzer = new PerformanceAnalyzer();
    analyzer.analyze().catch(console.error);
}

module.exports = PerformanceAnalyzer;