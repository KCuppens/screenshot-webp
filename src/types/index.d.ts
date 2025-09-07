declare module 'webp-screenshot' {
    /**
     * Display information
     */
    export interface DisplayInfo {
        /** Display index */
        index: number;
        /** Display width in pixels */
        width: number;
        /** Display height in pixels */
        height: number;
        /** Display X offset */
        x: number;
        /** Display Y offset */
        y: number;
        /** Display scale factor (DPI scaling) */
        scaleFactor: number;
        /** Whether this is the primary display */
        isPrimary: boolean;
        /** Display name/identifier */
        name: string;
    }

    /**
     * Screenshot capture and WebP encoding options
     */
    export interface CaptureOptions {
        /** WebP quality (0-100) */
        quality?: number;
        /** Compression method (0-6, 0=fast, 6=slow/better) */
        method?: number;
        /** Target size in bytes (0=disabled) */
        targetSize?: number;
        /** Target PSNR (0=disabled) */
        targetPsnr?: number;
        /** Number of segments (1-4) */
        segments?: number;
        /** Spatial noise shaping strength (0-100) */
        snsStrength?: number;
        /** Filter strength (0-100) */
        filterStrength?: number;
        /** Filter sharpness (0-7) */
        filterSharpness?: number;
        /** Filter type (0=simple, 1=strong) */
        filterType?: number;
        /** Auto adjust filter strength (0-1) */
        autofilter?: number;
        /** Alpha plane compression (0-1) */
        alphaCompression?: number;
        /** Alpha plane filtering (0-2) */
        alphaFiltering?: number;
        /** Alpha quality (0-100) */
        alphaQuality?: number;
        /** Number of entropy passes (1-10) */
        pass?: number;
        /** Export compressed for analysis (0-1) */
        showCompressed?: number;
        /** Preprocessing (0-4) */
        preprocessing?: number;
        /** Log2 of partitions (0-3) */
        partitions?: number;
        /** Quality degradation limit (0-100) */
        partitionLimit?: number;
        /** Emulate JPEG compression (0-1) */
        emulateJpegSize?: number;
        /** Threading level (0-1) */
        threadLevel?: number;
        /** Low memory mode (0-1) */
        lowMemory?: number;
        /** Near lossless threshold (0-100) */
        nearLossless?: number;
        /** Preserve RGB under transparency (0-1) */
        exact?: number;
        /** Use delta palettes (0-1) */
        useDeltaPalette?: number;
        /** Use sharp RGB->YUV conversion (0-1) */
        useSharpYuv?: number;
    }

    /**
     * Performance metrics for a single capture
     */
    export interface CapturePerformance {
        /** Time taken for capture in milliseconds */
        captureTime: number;
        /** Implementation used for capture */
        implementation: string;
        /** Memory usage in bytes */
        memoryUsage: number;
    }

    /**
     * Screenshot capture result
     */
    export interface ScreenshotResult {
        /** WebP encoded screenshot data */
        data: Buffer;
        /** Screenshot width in pixels */
        width: number;
        /** Screenshot height in pixels */
        height: number;
        /** Image format (always 'webp') */
        format: 'webp';
        /** Whether capture was successful */
        success: boolean;
        /** Error message if failed */
        error?: string;
        /** Performance metrics for this capture */
        performance?: CapturePerformance;
    }

    /**
     * Failed screenshot result
     */
    export interface FailedScreenshotResult {
        /** Error message */
        error: string;
        /** Display index that failed */
        displayIndex: number;
        /** Success flag (always false) */
        success: false;
    }

    /**
     * Implementation information
     */
    export interface ImplementationInfo {
        /** Implementation name */
        implementation: string;
        /** Platform identifier */
        platform: string;
        /** Whether implementation is supported */
        supported: boolean;
        /** Whether running in fallback mode */
        fallbackMode: boolean;
    }

    /**
     * Overall performance metrics
     */
    export interface PerformanceMetrics {
        /** Total number of captures attempted */
        captureCount: number;
        /** Total time spent capturing */
        totalCaptureTime: number;
        /** Number of fallback captures */
        fallbackUsage: number;
        /** Number of successful captures */
        successfulCaptures: number;
        /** Number of failed captures */
        failedCaptures: number;
        /** Average capture time */
        averageCaptureTime: number;
        /** Success rate percentage */
        successRate: number;
        /** Fallback usage percentage */
        fallbackUsagePercent: number;
    }

    /**
     * Main WebP Screenshot class
     */
    export class WebPScreenshot {
        /** Whether the instance is running in fallback mode */
        readonly fallbackMode: boolean;

        constructor();

        /**
         * Get information about available displays
         */
        getDisplays(): Promise<DisplayInfo[]>;

        /**
         * Capture a screenshot from a specific display
         * @param displayIndex - Index of the display to capture (default: 0)
         * @param options - Capture and encoding options
         */
        captureDisplay(displayIndex?: number, options?: CaptureOptions): Promise<ScreenshotResult>;

        /**
         * Capture screenshots from all available displays
         * @param options - Capture and encoding options
         */
        captureAllDisplays(options?: CaptureOptions): Promise<(ScreenshotResult | FailedScreenshotResult)[]>;

        /**
         * Check if native WebP screenshot capture is supported
         */
        isNativeSupported(): boolean;

        /**
         * Get implementation information
         */
        getImplementationInfo(): ImplementationInfo;

        /**
         * Get performance metrics
         */
        getPerformanceMetrics(): PerformanceMetrics;

        /**
         * Reset performance metrics
         */
        resetPerformanceMetrics(): void;
    }

    /**
     * Module interface
     */
    export interface WebPScreenshotModule {
        /** WebPScreenshot class */
        WebPScreenshot: typeof WebPScreenshot;

        /**
         * Convenience function to create a new instance
         */
        create(): WebPScreenshot;

        /**
         * Static method to check if native support is available
         */
        isNativeSupported(): boolean;

        /**
         * Get version information
         */
        getVersion(): string;
    }

    const webpScreenshot: WebPScreenshotModule;
    export = webpScreenshot;
}

/**
 * Ambient module declaration for direct import
 */
declare module 'webp-screenshot' {
    export * from 'webp-screenshot';
}