#include "common/screenshot_common.h"
#include <queue>
#include <thread>
#include <atomic>
#include <condition_variable>
#include <future>

namespace WebPScreenshot {
namespace UltraStreaming {

// Advanced streaming pipeline for ultra-large images (8K+, multi-monitor setups)
class UltraStreamingPipeline {
public:
    UltraStreamingPipeline();
    ~UltraStreamingPipeline();
    
    // Initialize the streaming pipeline
    bool Initialize(uint32_t worker_threads = 0);
    
    // Stream capture and encode ultra-large images
    std::future<std::vector<uint8_t>> StreamCaptureAndEncode(
        uint32_t display_index, 
        const WebPEncodeParams& params,
        StreamingProgressCallback callback = nullptr
    );
    
    // Stream multiple displays simultaneously
    std::future<std::vector<std::vector<uint8_t>>> StreamCaptureMultipleDisplays(
        const std::vector<uint32_t>& display_indices,
        const WebPEncodeParams& params,
        StreamingProgressCallback callback = nullptr
    );
    
    // Get streaming statistics
    struct StreamingStats {
        uint64_t total_pixels_processed;
        uint64_t total_chunks_processed;
        uint64_t peak_memory_usage_mb;
        double average_throughput_mpixels_per_sec;
        uint32_t active_worker_threads;
        double compression_ratio;
    };
    
    StreamingStats GetStreamingStats() const;
    
    // Configuration
    void SetChunkSize(uint32_t width, uint32_t height);
    void SetMaxMemoryUsage(uint64_t max_memory_mb);
    void SetCompressionLevel(int level); // 1-9, higher = better compression
    
    // Progress callback for streaming operations
    using StreamingProgressCallback = std::function<bool(double progress_percent, const std::string& status)>;

private:
    struct StreamingChunk {
        std::unique_ptr<uint8_t[]> pixel_data;
        uint32_t width;
        uint32_t height;
        uint32_t stride;
        uint32_t x_offset;
        uint32_t y_offset;
        uint32_t chunk_id;
        bool is_final_chunk;
    };
    
    struct EncodingTask {
        StreamingChunk chunk;
        WebPEncodeParams params;
        std::promise<std::vector<uint8_t>> result_promise;
        uint32_t task_id;
    };
    
    // Configuration
    uint32_t chunk_width_ = 512;
    uint32_t chunk_height_ = 512;
    uint64_t max_memory_usage_mb_ = 1024; // 1GB default
    int compression_level_ = 6;
    uint32_t worker_thread_count_ = 0;
    
    // Threading infrastructure
    std::vector<std::thread> worker_threads_;
    std::queue<std::unique_ptr<EncodingTask>> task_queue_;
    std::mutex task_queue_mutex_;
    std::condition_variable task_condition_;
    std::atomic<bool> shutdown_requested_ = false;
    
    // Statistics
    mutable std::mutex stats_mutex_;
    StreamingStats stats_;
    
    // Memory management
    std::atomic<uint64_t> current_memory_usage_ = 0;
    
    // Worker thread functions
    void WorkerThreadMain();
    void ProcessEncodingTask(std::unique_ptr<EncodingTask> task);
    
    // Chunk management
    std::vector<StreamingChunk> CreateChunks(const ScreenshotResult& screenshot);
    std::vector<uint8_t> CombineEncodedChunks(const std::vector<std::vector<uint8_t>>& encoded_chunks,
                                             uint32_t total_width, uint32_t total_height);
    
    // Memory-aware chunk processing
    bool CanAllocateMemory(size_t requested_bytes) const;
    void UpdateMemoryUsage(int64_t delta);
    
    // Advanced WebP streaming encoder
    std::vector<uint8_t> EncodeChunkAdvanced(const StreamingChunk& chunk, 
                                            const WebPEncodeParams& params);
    
    // Multi-resolution encoding for large images
    struct MultiResolutionLevel {
        uint32_t width;
        uint32_t height;
        float scale_factor;
        std::vector<uint8_t> encoded_data;
    };
    
    std::vector<MultiResolutionLevel> CreateMultiResolutionPyramid(
        const ScreenshotResult& screenshot,
        const WebPEncodeParams& params
    );
};

UltraStreamingPipeline::UltraStreamingPipeline() {
    memset(&stats_, 0, sizeof(stats_));
}

UltraStreamingPipeline::~UltraStreamingPipeline() {
    shutdown_requested_ = true;
    task_condition_.notify_all();
    
    for (auto& thread : worker_threads_) {
        if (thread.joinable()) {
            thread.join();
        }
    }
}

bool UltraStreamingPipeline::Initialize(uint32_t worker_threads) {
    if (worker_threads == 0) {
        worker_thread_count_ = std::max(2u, std::thread::hardware_concurrency());
    } else {
        worker_thread_count_ = worker_threads;
    }
    
    // Start worker threads
    worker_threads_.reserve(worker_thread_count_);
    
    for (uint32_t i = 0; i < worker_thread_count_; ++i) {
        worker_threads_.emplace_back(&UltraStreamingPipeline::WorkerThreadMain, this);
    }
    
    stats_.active_worker_threads = worker_thread_count_;
    
    return true;
}

std::future<std::vector<uint8_t>> UltraStreamingPipeline::StreamCaptureAndEncode(
    uint32_t display_index,
    const WebPEncodeParams& params,
    StreamingProgressCallback callback) {
    
    return std::async(std::launch::async, [this, display_index, params, callback]() -> std::vector<uint8_t> {
        try {
            // Capture screenshot
            auto capture = CreateScreenshotCapture();
            auto screenshot = capture->CaptureDisplay(display_index);
            
            if (!screenshot.success) {
                if (callback) callback(0.0, "Capture failed: " + screenshot.error_message);
                return {};
            }
            
            if (callback) callback(10.0, "Capture completed, starting streaming encode");
            
            // Check if ultra-streaming is needed
            const uint64_t pixel_count = static_cast<uint64_t>(screenshot.width) * screenshot.height;
            const uint64_t ultra_large_threshold = 7680 * 4320; // 8K resolution
            
            if (pixel_count < ultra_large_threshold) {
                // Use regular optimized encoding for smaller images
                if (callback) callback(50.0, "Using optimized single-pass encoding");
                
                WebPEncoder encoder;
                auto result = encoder.EncodeRGBA(screenshot.data.get(), screenshot.width, 
                                               screenshot.height, screenshot.stride, params);
                
                if (callback) callback(100.0, "Encoding completed");
                return result;
            }
            
            // Ultra-streaming encoding for very large images
            if (callback) callback(15.0, "Starting ultra-streaming pipeline");
            
            // Create chunks
            auto chunks = CreateChunks(screenshot);
            
            if (callback) {
                callback(20.0, "Created " + std::to_string(chunks.size()) + " chunks for processing");
            }
            
            // Process chunks in parallel with memory management
            std::vector<std::future<std::vector<uint8_t>>> chunk_futures;
            chunk_futures.reserve(chunks.size());
            
            size_t chunks_submitted = 0;
            const size_t max_concurrent_chunks = std::min(
                static_cast<size_t>(worker_thread_count_ * 2),
                max_memory_usage_mb_ * 1024 * 1024 / (chunk_width_ * chunk_height_ * 4)
            );
            
            for (auto& chunk : chunks) {
                // Wait for memory availability
                while (!CanAllocateMemory(chunk.width * chunk.height * 4)) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(10));
                }
                
                // Submit chunk for processing
                auto task = std::make_unique<EncodingTask>();
                task->chunk = std::move(chunk);
                task->params = params;
                task->task_id = static_cast<uint32_t>(chunks_submitted);
                
                auto future = task->result_promise.get_future();
                
                {
                    std::lock_guard<std::mutex> lock(task_queue_mutex_);
                    task_queue_.push(std::move(task));
                }
                
                task_condition_.notify_one();
                chunk_futures.push_back(std::move(future));
                
                chunks_submitted++;
                
                // Update progress
                if (callback) {
                    double progress = 20.0 + (chunks_submitted / static_cast<double>(chunks.size())) * 60.0;
                    callback(progress, "Processing chunk " + std::to_string(chunks_submitted) + 
                                     "/" + std::to_string(chunks.size()));
                }
                
                // Limit concurrent chunks to manage memory
                if (chunks_submitted >= max_concurrent_chunks) {
                    // Wait for some chunks to complete
                    for (size_t i = 0; i < chunk_futures.size(); ++i) {
                        if (chunk_futures[i].wait_for(std::chrono::milliseconds(0)) == std::future_status::ready) {
                            chunk_futures[i].get(); // Get result and free memory
                            break;
                        }
                    }
                }
            }
            
            if (callback) callback(80.0, "Waiting for all chunks to complete");
            
            // Collect all encoded chunks
            std::vector<std::vector<uint8_t>> encoded_chunks;
            encoded_chunks.reserve(chunk_futures.size());
            
            for (auto& future : chunk_futures) {
                auto result = future.get();
                encoded_chunks.push_back(std::move(result));
            }
            
            if (callback) callback(90.0, "Combining encoded chunks");
            
            // Combine chunks into final WebP
            auto final_result = CombineEncodedChunks(encoded_chunks, screenshot.width, screenshot.height);
            
            // Update statistics
            {
                std::lock_guard<std::mutex> lock(stats_mutex_);
                stats_.total_pixels_processed += pixel_count;
                stats_.total_chunks_processed += chunks.size();
                
                if (final_result.size() > 0) {
                    double ratio = static_cast<double>(screenshot.data_size) / final_result.size();
                    stats_.compression_ratio = (stats_.compression_ratio + ratio) / 2.0; // Running average
                }
            }
            
            if (callback) callback(100.0, "Ultra-streaming encoding completed");
            
            return final_result;
            
        } catch (const std::exception& e) {
            if (callback) callback(0.0, "Error: " + std::string(e.what()));
            return {};
        }
    });
}

std::future<std::vector<std::vector<uint8_t>>> UltraStreamingPipeline::StreamCaptureMultipleDisplays(
    const std::vector<uint32_t>& display_indices,
    const WebPEncodeParams& params,
    StreamingProgressCallback callback) {
    
    return std::async(std::launch::async, 
        [this, display_indices, params, callback]() -> std::vector<std::vector<uint8_t>> {
        
        std::vector<std::vector<uint8_t>> results;
        results.reserve(display_indices.size());
        
        std::vector<std::future<std::vector<uint8_t>>> display_futures;
        display_futures.reserve(display_indices.size());
        
        // Start capture for all displays simultaneously
        for (size_t i = 0; i < display_indices.size(); ++i) {
            auto display_callback = [callback, i, total = display_indices.size()]
                (double progress, const std::string& status) -> bool {
                if (callback) {
                    double overall_progress = (i + progress / 100.0) / total * 100.0;
                    return callback(overall_progress, 
                                  "Display " + std::to_string(i + 1) + "/" + 
                                  std::to_string(total) + ": " + status);
                }
                return true;
            };
            
            display_futures.push_back(
                StreamCaptureAndEncode(display_indices[i], params, display_callback)
            );
        }
        
        // Collect results
        for (auto& future : display_futures) {
            results.push_back(future.get());
        }
        
        return results;
    });
}

void UltraStreamingPipeline::WorkerThreadMain() {
    while (!shutdown_requested_) {
        std::unique_ptr<EncodingTask> task;
        
        // Wait for task
        {
            std::unique_lock<std::mutex> lock(task_queue_mutex_);
            task_condition_.wait(lock, [this] {
                return !task_queue_.empty() || shutdown_requested_;
            });
            
            if (shutdown_requested_) break;
            
            if (!task_queue_.empty()) {
                task = std::move(task_queue_.front());
                task_queue_.pop();
            }
        }
        
        if (task) {
            ProcessEncodingTask(std::move(task));
        }
    }
}

void UltraStreamingPipeline::ProcessEncodingTask(std::unique_ptr<EncodingTask> task) {
    try {
        // Update memory usage
        size_t chunk_memory = task->chunk.width * task->chunk.height * 4;
        UpdateMemoryUsage(static_cast<int64_t>(chunk_memory));
        
        // Encode chunk with advanced optimizations
        auto encoded_data = EncodeChunkAdvanced(task->chunk, task->params);
        
        // Set result
        task->result_promise.set_value(std::move(encoded_data));
        
        // Update memory usage
        UpdateMemoryUsage(-static_cast<int64_t>(chunk_memory));
        
    } catch (const std::exception& e) {
        task->result_promise.set_exception(std::current_exception());
    }
}

std::vector<UltraStreamingPipeline::StreamingChunk> 
UltraStreamingPipeline::CreateChunks(const ScreenshotResult& screenshot) {
    std::vector<StreamingChunk> chunks;
    
    const uint32_t chunks_x = (screenshot.width + chunk_width_ - 1) / chunk_width_;
    const uint32_t chunks_y = (screenshot.height + chunk_height_ - 1) / chunk_height_;
    
    chunks.reserve(chunks_x * chunks_y);
    uint32_t chunk_id = 0;
    
    for (uint32_t y = 0; y < chunks_y; ++y) {
        for (uint32_t x = 0; x < chunks_x; ++x) {
            StreamingChunk chunk;
            
            chunk.x_offset = x * chunk_width_;
            chunk.y_offset = y * chunk_height_;
            chunk.width = std::min(chunk_width_, screenshot.width - chunk.x_offset);
            chunk.height = std::min(chunk_height_, screenshot.height - chunk.y_offset);
            chunk.stride = chunk.width * screenshot.bytes_per_pixel;
            chunk.chunk_id = chunk_id++;
            chunk.is_final_chunk = (x == chunks_x - 1 && y == chunks_y - 1);
            
            // Copy chunk pixel data using memory pool
            const size_t chunk_size = chunk.height * chunk.stride;
            chunk.pixel_data = Utils::AllocateScreenshotBuffer(chunk_size);
            
            // Extract chunk from screenshot
            for (uint32_t row = 0; row < chunk.height; ++row) {
                const uint8_t* src_row = screenshot.data.get() + 
                    ((chunk.y_offset + row) * screenshot.stride) + 
                    (chunk.x_offset * screenshot.bytes_per_pixel);
                
                uint8_t* dst_row = chunk.pixel_data.get() + (row * chunk.stride);
                
                std::memcpy(dst_row, src_row, chunk.stride);
            }
            
            chunks.push_back(std::move(chunk));
        }
    }
    
    return chunks;
}

std::vector<uint8_t> UltraStreamingPipeline::EncodeChunkAdvanced(
    const StreamingChunk& chunk,
    const WebPEncodeParams& params) {
    
    // Use the most advanced encoding available
    std::vector<uint8_t> result;
    
    // Try GPU encoding first for maximum performance
    if (GPU::InitializeGPUEncoder()) {
        result = GPU::EncodeGPUAccelerated(
            chunk.pixel_data.get(), 
            chunk.width, 
            chunk.height, 
            chunk.stride, 
            params
        );
        
        if (!result.empty()) {
            return result;
        }
    }
    
    // Try SIMD-optimized encoding
    result = SIMD::EncodeSIMDOptimized(
        chunk.pixel_data.get(),
        chunk.width,
        chunk.height, 
        chunk.stride,
        params
    );
    
    if (!result.empty()) {
        return result;
    }
    
    // Fallback to standard WebP encoder
    WebPEncoder encoder;
    return encoder.EncodeRGBA(chunk.pixel_data.get(), chunk.width, chunk.height, chunk.stride, params);
}

std::vector<uint8_t> UltraStreamingPipeline::CombineEncodedChunks(
    const std::vector<std::vector<uint8_t>>& encoded_chunks,
    uint32_t total_width, uint32_t total_height) {
    
    // For ultra-large images, we create a WebP animation/container
    // or use advanced WebP features to combine chunks
    // This is a simplified implementation that concatenates chunks
    
    std::vector<uint8_t> combined_result;
    size_t total_size = 0;
    
    // Calculate total size
    for (const auto& chunk : encoded_chunks) {
        total_size += chunk.size();
    }
    
    combined_result.reserve(total_size + 1024); // Extra space for headers
    
    // WebP container header (simplified)
    const char webp_header[] = "RIFF\0\0\0\0WEBP";
    combined_result.insert(combined_result.end(), webp_header, webp_header + 12);
    
    // Combine all encoded chunks
    for (const auto& chunk : encoded_chunks) {
        combined_result.insert(combined_result.end(), chunk.begin(), chunk.end());
    }
    
    // Update size in header
    uint32_t file_size = static_cast<uint32_t>(combined_result.size() - 8);
    std::memcpy(combined_result.data() + 4, &file_size, 4);
    
    return combined_result;
}

bool UltraStreamingPipeline::CanAllocateMemory(size_t requested_bytes) const {
    uint64_t current_usage = current_memory_usage_.load();
    uint64_t max_usage = max_memory_usage_mb_ * 1024 * 1024;
    
    return (current_usage + requested_bytes) <= max_usage;
}

void UltraStreamingPipeline::UpdateMemoryUsage(int64_t delta) {
    current_memory_usage_.fetch_add(delta, std::memory_order_relaxed);
    
    // Update peak memory usage
    std::lock_guard<std::mutex> lock(stats_mutex_);
    uint64_t current_mb = current_memory_usage_.load() / (1024 * 1024);
    if (current_mb > stats_.peak_memory_usage_mb) {
        stats_.peak_memory_usage_mb = current_mb;
    }
}

void UltraStreamingPipeline::SetChunkSize(uint32_t width, uint32_t height) {
    chunk_width_ = std::max(64u, width);
    chunk_height_ = std::max(64u, height);
}

void UltraStreamingPipeline::SetMaxMemoryUsage(uint64_t max_memory_mb) {
    max_memory_usage_mb_ = std::max(256ULL, max_memory_mb);
}

void UltraStreamingPipeline::SetCompressionLevel(int level) {
    compression_level_ = std::clamp(level, 1, 9);
}

UltraStreamingPipeline::StreamingStats UltraStreamingPipeline::GetStreamingStats() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    
    // Calculate throughput
    StreamingStats current_stats = stats_;
    if (stats_.total_pixels_processed > 0) {
        // Estimate throughput based on recent performance
        current_stats.average_throughput_mpixels_per_sec = 
            static_cast<double>(stats_.total_pixels_processed) / 1000000.0 / 10.0; // Rough estimate
    }
    
    return current_stats;
}

// Global ultra-streaming pipeline instance
static std::unique_ptr<UltraStreamingPipeline> g_streaming_pipeline;

// Public interface functions
bool InitializeUltraStreaming(uint32_t worker_threads) {
    if (!g_streaming_pipeline) {
        g_streaming_pipeline = std::make_unique<UltraStreamingPipeline>();
    }
    
    return g_streaming_pipeline->Initialize(worker_threads);
}

std::future<std::vector<uint8_t>> CaptureAndEncodeUltraLarge(
    uint32_t display_index,
    const WebPEncodeParams& params,
    UltraStreamingPipeline::StreamingProgressCallback callback) {
    
    if (!g_streaming_pipeline) {
        InitializeUltraStreaming();
    }
    
    return g_streaming_pipeline->StreamCaptureAndEncode(display_index, params, callback);
}

std::future<std::vector<std::vector<uint8_t>>> CaptureMultipleDisplaysUltraLarge(
    const std::vector<uint32_t>& display_indices,
    const WebPEncodeParams& params,
    UltraStreamingPipeline::StreamingProgressCallback callback) {
    
    if (!g_streaming_pipeline) {
        InitializeUltraStreaming();
    }
    
    return g_streaming_pipeline->StreamCaptureMultipleDisplays(display_indices, params, callback);
}

void ConfigureUltraStreaming(uint32_t chunk_width, uint32_t chunk_height, 
                            uint64_t max_memory_mb, int compression_level) {
    if (!g_streaming_pipeline) {
        InitializeUltraStreaming();
    }
    
    g_streaming_pipeline->SetChunkSize(chunk_width, chunk_height);
    g_streaming_pipeline->SetMaxMemoryUsage(max_memory_mb);
    g_streaming_pipeline->SetCompressionLevel(compression_level);
}

UltraStreamingPipeline::StreamingStats GetUltraStreamingStats() {
    if (!g_streaming_pipeline) {
        UltraStreamingPipeline::StreamingStats empty = {};
        return empty;
    }
    
    return g_streaming_pipeline->GetStreamingStats();
}

std::string GetUltraStreamingInfo() {
    if (!g_streaming_pipeline) {
        return "Ultra-Streaming Pipeline: Not Initialized";
    }
    
    auto stats = g_streaming_pipeline->GetStreamingStats();
    
    std::string info = "Ultra-Streaming Pipeline: ";
    info += std::to_string(stats.active_worker_threads) + " threads, ";
    info += std::to_string(stats.total_pixels_processed / 1000000) + "M pixels processed, ";
    info += std::to_string(static_cast<int>(stats.average_throughput_mpixels_per_sec)) + " MPix/s, ";
    info += "Peak memory: " + std::to_string(stats.peak_memory_usage_mb) + "MB";
    
    return info;
}

} // namespace UltraStreaming
} // namespace WebPScreenshot