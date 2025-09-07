#include "common/screenshot_common.h"
#include <algorithm>
#include <chrono>

namespace WebPScreenshot {

ScreenshotMemoryPool::ScreenshotMemoryPool() {
    stats_.available_buffers = 0;
    stats_.total_buffers_created = 0;
    stats_.total_memory_allocated = 0;
    stats_.peak_memory_usage = 0;
    stats_.memory_reuse_count = 0;
}

ScreenshotMemoryPool::~ScreenshotMemoryPool() {
    Clear();
}

std::unique_ptr<uint8_t[]> ScreenshotMemoryPool::GetBuffer(size_t size) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    // Clean up expired buffers periodically
    CleanupExpiredBuffers();
    
    // Try to find a suitable buffer in the pool
    size_t best_fit_index = FindBestFitBuffer(size);
    
    if (best_fit_index != SIZE_MAX) {
        // Reuse existing buffer
        auto buffer = std::move(available_buffers_[best_fit_index].buffer);
        available_buffers_.erase(available_buffers_.begin() + best_fit_index);
        
        stats_.available_buffers = available_buffers_.size();
        stats_.memory_reuse_count++;
        
        return buffer;
    }
    
    // No suitable buffer found, allocate new one
    auto buffer = std::make_unique<uint8_t[]>(size);
    
    if (buffer) {
        stats_.total_buffers_created++;
        stats_.total_memory_allocated += size;
        
        // Update peak memory usage
        size_t current_memory = stats_.total_memory_allocated;
        for (const auto& buf_info : available_buffers_) {
            current_memory += buf_info.size;
        }
        
        if (current_memory > stats_.peak_memory_usage) {
            stats_.peak_memory_usage = current_memory;
        }
    }
    
    return buffer;
}

void ScreenshotMemoryPool::ReturnBuffer(std::unique_ptr<uint8_t[]> buffer, size_t size) {
    if (!buffer) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(mutex_);
    
    // Don't keep too many buffers in the pool
    if (available_buffers_.size() >= MAX_POOL_SIZE) {
        // Remove the oldest buffer to make room
        auto oldest_it = std::min_element(available_buffers_.begin(), available_buffers_.end(),
            [](const BufferInfo& a, const BufferInfo& b) {
                return a.last_used_time < b.last_used_time;
            });
        
        if (oldest_it != available_buffers_.end()) {
            available_buffers_.erase(oldest_it);
        }
    }
    
    // Add buffer to pool
    uint64_t current_time = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    
    BufferInfo buf_info(std::move(buffer), size);
    buf_info.last_used_time = current_time;
    
    available_buffers_.emplace_back(std::move(buf_info));
    stats_.available_buffers = available_buffers_.size();
}

void ScreenshotMemoryPool::Clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    available_buffers_.clear();
    stats_.available_buffers = 0;
}

ScreenshotMemoryPool::PoolStats ScreenshotMemoryPool::GetStats() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return stats_;
}

void ScreenshotMemoryPool::CleanupExpiredBuffers() {
    uint64_t current_time = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    
    auto it = std::remove_if(available_buffers_.begin(), available_buffers_.end(),
        [current_time](const BufferInfo& buf_info) {
            return (current_time - buf_info.last_used_time) > BUFFER_TIMEOUT_MS;
        });
    
    available_buffers_.erase(it, available_buffers_.end());
    stats_.available_buffers = available_buffers_.size();
}

size_t ScreenshotMemoryPool::FindBestFitBuffer(size_t required_size) const {
    size_t best_fit_index = SIZE_MAX;
    size_t best_fit_size = SIZE_MAX;
    
    for (size_t i = 0; i < available_buffers_.size(); ++i) {
        const auto& buf_info = available_buffers_[i];
        
        // Buffer must be large enough
        if (buf_info.size >= required_size) {
            // Find the smallest buffer that fits (best fit strategy)
            if (buf_info.size < best_fit_size) {
                best_fit_index = i;
                best_fit_size = buf_info.size;
                
                // Perfect fit
                if (buf_info.size == required_size) {
                    break;
                }
            }
        }
    }
    
    return best_fit_index;
}

// Global memory pool instance
static ScreenshotMemoryPool g_memory_pool;

ScreenshotMemoryPool* GetGlobalMemoryPool() {
    return &g_memory_pool;
}

// Helper RAII class for automatic buffer return to pool
class PooledBuffer {
public:
    PooledBuffer(std::unique_ptr<uint8_t[]> buffer, size_t size)
        : buffer_(std::move(buffer)), size_(size) {}
    
    ~PooledBuffer() {
        if (buffer_) {
            GetGlobalMemoryPool()->ReturnBuffer(std::move(buffer_), size_);
        }
    }
    
    uint8_t* get() const { return buffer_.get(); }
    uint8_t* release() { size_ = 0; return buffer_.release(); }
    
    // Move-only type
    PooledBuffer(const PooledBuffer&) = delete;
    PooledBuffer& operator=(const PooledBuffer&) = delete;
    
    PooledBuffer(PooledBuffer&& other) noexcept
        : buffer_(std::move(other.buffer_)), size_(other.size_) {
        other.size_ = 0;
    }
    
    PooledBuffer& operator=(PooledBuffer&& other) noexcept {
        if (this != &other) {
            if (buffer_) {
                GetGlobalMemoryPool()->ReturnBuffer(std::move(buffer_), size_);
            }
            buffer_ = std::move(other.buffer_);
            size_ = other.size_;
            other.size_ = 0;
        }
        return *this;
    }
    
private:
    std::unique_ptr<uint8_t[]> buffer_;
    size_t size_;
};

// Utility functions for memory pool integration
namespace Utils {

std::unique_ptr<uint8_t[]> AllocateScreenshotBuffer(size_t size) {
    return GetGlobalMemoryPool()->GetBuffer(size);
}

void ReturnScreenshotBuffer(std::unique_ptr<uint8_t[]> buffer, size_t size) {
    GetGlobalMemoryPool()->ReturnBuffer(std::move(buffer), size);
}

ScreenshotMemoryPool::PoolStats GetMemoryPoolStats() {
    return GetGlobalMemoryPool()->GetStats();
}

} // namespace Utils

} // namespace WebPScreenshot