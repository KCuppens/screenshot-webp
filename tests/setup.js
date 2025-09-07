// Global test setup
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';

// Global test configuration
global.testConfig = {
  timeout: 30000,
  retries: 2,
  skipSlowTests: process.env.SKIP_SLOW_TESTS === 'true'
};

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  if (!process.env.VERBOSE_TESTS) {
    return;
  }
  originalConsoleLog(...args);
};

console.warn = (...args) => {
  if (!process.env.VERBOSE_TESTS) {
    return;
  }
  originalConsoleWarn(...args);
};

// Global cleanup
afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});