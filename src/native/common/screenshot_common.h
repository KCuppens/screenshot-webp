#pragma once

#include <memory>
#include <string>
#include <vector>
#include <cstdint>
#include <mutex>
#include <chrono>

namespace WebPScreenshot {

// Memory pool for efficient buffer management
class ScreenshotMemoryPool {
public:
    ScreenshotMemoryPool();
    ~ScreenshotMemoryPool();
    
    // Get a buffer of specified size (reuses existing buffer if available)
    std::unique_ptr<uint8_t[]> GetBuffer(size_t size);
    
    // Return a buffer to the pool for reuse
    void ReturnBuffer(std::unique_ptr<uint8_t[]> buffer, size_t size);
    
    // Clear all pooled buffers
    void Clear();
    
    // Get pool statistics
    struct PoolStats {
        size_t available_buffers;
        size_t total_buffers_created;
        size_t total_memory_allocated;
        size_t peak_memory_usage;
        size_t memory_reuse_count;
    };
    
    PoolStats GetStats() const;

private:
    struct BufferInfo {
        std::unique_ptr<uint8_t[]> buffer;
        size_t size;
        uint64_t last_used_time;
        
        BufferInfo(std::unique_ptr<uint8_t[]> buf, size_t sz) 
            : buffer(std::move(buf)), size(sz), last_used_time(0) {}
    };
    
    mutable std::mutex mutex_;
    std::vector<BufferInfo> available_buffers_;
    
    // Statistics
    mutable PoolStats stats_;
    
    // Pool configuration
    static constexpr size_t MAX_POOL_SIZE = 10;  // Maximum buffers to keep
    static constexpr uint64_t BUFFER_TIMEOUT_MS = 60000;  // 1 minute timeout
    
    void CleanupExpiredBuffers();
    size_t FindBestFitBuffer(size_t required_size) const;
};

// Global memory pool instance
extern ScreenshotMemoryPool* GetGlobalMemoryPool();

// Screenshot capture result structure
struct ScreenshotResult {
    std::unique_ptr<uint8_t[]> data;
    uint32_t width;
    uint32_t height;
    uint32_t stride;
    uint32_t bytes_per_pixel;
    uint32_t data_size;
    bool success;
    std::string error_message;
    std::string format;          // "RGBA", "RGB", "BGRA", etc.
    std::string implementation;  // Implementation used for capture
    
    ScreenshotResult() : data(nullptr), width(0), height(0), stride(0), 
                        bytes_per_pixel(0), data_size(0), success(false) {}
    
    // Move constructor that preserves pool-allocated memory
    ScreenshotResult(ScreenshotResult&& other) noexcept 
        : data(std::move(other.data)), width(other.width), height(other.height),
          stride(other.stride), bytes_per_pixel(other.bytes_per_pixel), 
          data_size(other.data_size), success(other.success),
          error_message(std::move(other.error_message)),
          format(std::move(other.format)), implementation(std::move(other.implementation)) {
        other.width = other.height = other.stride = other.bytes_per_pixel = other.data_size = 0;
        other.success = false;
    }
    
    // Move assignment operator
    ScreenshotResult& operator=(ScreenshotResult&& other) noexcept {
        if (this != &other) {
            data = std::move(other.data);
            width = other.width;
            height = other.height;
            stride = other.stride;
            bytes_per_pixel = other.bytes_per_pixel;
            data_size = other.data_size;
            success = other.success;
            error_message = std::move(other.error_message);
            format = std::move(other.format);
            implementation = std::move(other.implementation);
            
            other.width = other.height = other.stride = other.bytes_per_pixel = other.data_size = 0;
            other.success = false;
        }
        return *this;
    }
    
    // Disable copy constructor and assignment
    ScreenshotResult(const ScreenshotResult&) = delete;
    ScreenshotResult& operator=(const ScreenshotResult&) = delete;
};

// WebP encoding parameters
struct WebPEncodeParams {
    float quality = 80.0f;        // 0.0 - 100.0
    int method = 4;               // 0 = fast, 6 = slower/better
    int target_size = 0;          // If non-zero, try to achieve target size
    float target_psnr = 0.0f;     // If non-zero, try to achieve target PSNR
    int segments = 4;             // Number of segments (1-4)
    int sns_strength = 50;        // Spatial Noise Shaping strength (0-100)
    int filter_strength = 60;     // Filter strength (0-100)
    int filter_sharpness = 0;     // Filter sharpness (0-7)
    int filter_type = 1;          // Filtering type: 0=simple, 1=strong
    int autofilter = 0;           // Auto adjust filter's strength
    int alpha_compression = 1;    // Algorithm for encoding alpha plane (0-1)
    int alpha_filtering = 1;      // Predictive filtering for alpha plane
    int alpha_quality = 100;      // Between 0-100, 100=lossless
    int pass = 1;                 // Number of entropy-analysis passes (1-10)
    int show_compressed = 0;      // Export compressed picture for analysis
    int preprocessing = 0;        // 0=none, 1=segment-smooth, 2=pseudo-random dithering
    int partitions = 0;           // Log2(number of token partitions) in [0..3]
    int partition_limit = 0;      // Quality degradation allowed to fit 512k/partition
    int emulate_jpeg_size = 0;    // Use similar compression as JPEG
    int thread_level = 0;         // Multi-threading level (0 or 1)
    int low_memory = 0;           // Reduce memory usage
    int near_lossless = 100;      // Near lossless encoding threshold (0-100)
    int exact = 0;                // Preserve RGB values under transparent area
    int use_delta_palette = 0;    // Use delta-palettes
    int use_sharp_yuv = 0;        // Use sharp (accurate) RGB to YUV conversion
    
    // Multi-threading parameters
    bool enable_multithreading = true;  // Enable multi-threaded encoding for large images
    uint32_t max_threads = 0;          // Max threads to use (0 = auto-detect)
    
    // Streaming parameters
    bool enable_streaming = true;      // Enable streaming encoding for large images
    uint32_t stream_buffer_size = 64 * 1024;  // Stream buffer size in bytes
};

// Display information structure
struct DisplayInfo {
    uint32_t index;
    uint32_t width;
    uint32_t height;
    int32_t x;
    int32_t y;
    float scale_factor;
    bool is_primary;
    std::string name;
};

// Abstract base class for platform-specific screenshot implementations
class ScreenshotCapture {
public:
    virtual ~ScreenshotCapture() = default;
    
    // Get list of available displays
    virtual std::vector<DisplayInfo> GetDisplays() = 0;
    
    // Capture screenshot from specific display
    virtual ScreenshotResult CaptureDisplay(uint32_t display_index) = 0;
    
    // Capture screenshot from all displays
    virtual std::vector<ScreenshotResult> CaptureAllDisplays() = 0;
    
    // Check if the implementation is available on current system
    virtual bool IsSupported() = 0;
    
    // Get implementation name for logging/debugging
    virtual std::string GetImplementationName() = 0;

protected:
    // Helper function to convert RGBA to RGB
    static void ConvertRGBAToRGB(const uint8_t* rgba_data, uint8_t* rgb_data, 
                                uint32_t pixel_count);
    
    // Helper function to flip image vertically if needed
    static void FlipImageVertically(uint8_t* data, uint32_t width, uint32_t height, 
                                  uint32_t bytes_per_pixel);
};

// WebP encoder wrapper
class WebPEncoder {
public:
    WebPEncoder();
    ~WebPEncoder();
    
    // Encode RGBA data to WebP
    std::vector<uint8_t> EncodeRGBA(const uint8_t* rgba_data, uint32_t width, 
                                   uint32_t height, uint32_t stride,
                                   const WebPEncodeParams& params);
    
    // Encode RGB data to WebP
    std::vector<uint8_t> EncodeRGB(const uint8_t* rgb_data, uint32_t width, 
                                  uint32_t height, uint32_t stride,
                                  const WebPEncodeParams& params);
    
    // Get last error message
    const std::string& GetLastError() const { return last_error_; }

private:
    std::string last_error_;
    
    // Internal encoding implementation
    std::vector<uint8_t> EncodeInternal(const uint8_t* data, uint32_t width, 
                                       uint32_t height, uint32_t stride,
                                       bool has_alpha, const WebPEncodeParams& params);
    
    // Multi-threaded encoding for large images
    std::vector<uint8_t> EncodeMultiThreaded(const uint8_t* data, uint32_t width,
                                            uint32_t height, uint32_t stride,
                                            bool has_alpha, const WebPEncodeParams& params);
    
    // Single-threaded encoding implementation
    std::vector<uint8_t> EncodeSingleThreaded(const uint8_t* data, uint32_t width,
                                             uint32_t height, uint32_t stride,
                                             bool has_alpha, const WebPEncodeParams& params);
    
    // Encode individual tile for multi-threaded processing
    std::vector<uint8_t> EncodeTile(const uint8_t* data, uint32_t width, uint32_t height,
                                   uint32_t stride, bool has_alpha, const WebPEncodeParams& params);
    
    // Streaming encoding for memory efficiency
    std::vector<uint8_t> EncodeStreaming(const uint8_t* data, uint32_t width,
                                        uint32_t height, uint32_t stride,
                                        bool has_alpha, const WebPEncodeParams& params);
    
    // Progressive encoding callback interface
    class StreamingCallback {
    public:
        virtual ~StreamingCallback() = default;
        
        // Called when encoded data chunk is ready
        virtual bool OnDataChunk(const uint8_t* data, size_t size) = 0;
        
        // Called when encoding is complete
        virtual void OnComplete(bool success, const std::string& error_message) = 0;
    };
    
    // Encode with streaming callback (for very large images)
    bool EncodeStreamingWithCallback(const uint8_t* data, uint32_t width,
                                    uint32_t height, uint32_t stride,
                                    bool has_alpha, const WebPEncodeParams& params,
                                    StreamingCallback* callback);

private:
    // Forward declaration for TileInfo structure
    struct TileInfo;
    
    // Combine multiple encoded WebP tiles into a single WebP using VP8X extended format
    std::vector<uint8_t> CombineEncodedTiles(const std::vector<TileInfo>& tiles, 
                                            uint32_t total_width, uint32_t total_height,
                                            bool has_alpha);
};

// Factory function to create platform-specific screenshot capture instance
std::unique_ptr<ScreenshotCapture> CreateScreenshotCapture();

// Utility functions
namespace Utils {
    // Get current timestamp in milliseconds
    uint64_t GetCurrentTimeMillis();
    
    // Convert error code to string
    std::string ErrorCodeToString(int error_code);
    
    // Validate WebP encoding parameters
    bool ValidateWebPParams(const WebPEncodeParams& params, std::string& error);
    
    // Calculate optimal WebP quality based on image characteristics
    float CalculateOptimalQuality(const uint8_t* data, uint32_t width, uint32_t height,
                                 uint32_t bytes_per_pixel);
    
    // Memory pool utilities
    std::unique_ptr<uint8_t[]> AllocateScreenshotBuffer(size_t size);
    void ReturnScreenshotBuffer(std::unique_ptr<uint8_t[]> buffer, size_t size);
    ScreenshotMemoryPool::PoolStats GetMemoryPoolStats();
}

// SIMD-optimized pixel format conversion functions
namespace SIMD {
    // Convert BGRA format to RGBA format
    void ConvertBGRAToRGBA(const uint8_t* bgra_data, uint8_t* rgba_data, uint32_t pixel_count);
    
    // Convert RGBA format to RGB format (removes alpha channel)
    void ConvertRGBAToRGB(const uint8_t* rgba_data, uint8_t* rgb_data, uint32_t pixel_count);
    
    // In-place BGRA to RGBA conversion (swaps R and B channels)
    void ConvertBGRAToRGBAInPlace(uint8_t* data, uint32_t pixel_count);
    
    // Get available SIMD capabilities as string
    std::string GetSIMDCapabilities();
    
    // Advanced SIMD-optimized WebP encoding
    std::vector<uint8_t> EncodeSIMDOptimized(const uint8_t* rgba_data, uint32_t width, 
                                            uint32_t height, uint32_t stride,
                                            const WebPEncodeParams& params);
    
    // Get WebP SIMD optimization capabilities
    std::string GetWebPSIMDOptimizations();
}

// GPU-accelerated WebP encoding functions
namespace GPU {
    // GPU-accelerated WebP encoding (Windows: DirectCompute, macOS: Metal)
    std::vector<uint8_t> EncodeGPUAccelerated(const uint8_t* rgba_data, uint32_t width,
                                             uint32_t height, uint32_t stride,
                                             const WebPEncodeParams& params);
    
    // Get GPU WebP encoding capabilities
    std::string GetGPUWebPCapabilities();
    
    // Initialize GPU encoder
    bool InitializeGPUEncoder();
}

// Zero-copy optimization functions
namespace ZeroCopy {
    // Initialize zero-copy optimizations
    bool InitializeZeroCopy();
    
    // Check if zero-copy is supported
    bool IsZeroCopySupported();
    
    // Enable/disable zero-copy optimizations
    void SetZeroCopyEnabled(bool enabled);
    
    // Capture with zero-copy optimization
    ScreenshotResult CaptureWithZeroCopyOptimization(uint32_t display_index);
    
    // Encode WebP with zero-copy optimization (no intermediate pixel copying)
    std::vector<uint8_t> EncodeWebPZeroCopy(uint32_t display_index, const WebPEncodeParams& params);
    
    // Zero-copy statistics
    struct ZeroCopyStats {
        uint64_t zero_copy_operations;
        uint64_t traditional_operations;
        uint64_t total_memory_saved_mb;
        double average_speed_improvement_percent;
    };
    
    ZeroCopyStats GetZeroCopyStatistics();
    std::string GetZeroCopyInfo();
}

} // namespace WebPScreenshot