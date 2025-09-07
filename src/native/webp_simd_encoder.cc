#include "common/screenshot_common.h"
#include <webp/encode.h>

// Advanced SIMD intrinsics for WebP optimization
#if defined(__SSE2__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 2)
    #define WEBP_SIMD_SSE2 1
    #include <emmintrin.h>
#endif

#if defined(__AVX2__)
    #define WEBP_SIMD_AVX2 1
    #include <immintrin.h>
#endif

#if defined(__ARM_NEON) || defined(__aarch64__)
    #define WEBP_SIMD_NEON 1
    #include <arm_neon.h>
#endif

namespace WebPScreenshot {
namespace SIMD {

// Advanced WebP preprocessing optimizations
class WebPSIMDEncoder {
public:
    WebPSIMDEncoder();
    ~WebPSIMDEncoder();
    
    // SIMD-optimized WebP encoding pipeline
    std::vector<uint8_t> EncodeSIMD(const uint8_t* rgba_data, uint32_t width, 
                                   uint32_t height, uint32_t stride,
                                   const WebPEncodeParams& params);
    
    // Get optimal SIMD capabilities
    static std::string GetOptimizations();

private:
    bool has_sse2_;
    bool has_avx2_;
    bool has_neon_;
    
    // SIMD-optimized preprocessing
    void PreprocessImageSSE2(const uint8_t* input, uint8_t* output, 
                            uint32_t width, uint32_t height, uint32_t stride);
    void PreprocessImageAVX2(const uint8_t* input, uint8_t* output, 
                            uint32_t width, uint32_t height, uint32_t stride);
    void PreprocessImageNEON(const uint8_t* input, uint8_t* output, 
                            uint32_t width, uint32_t height, uint32_t stride);
    
    // Color space conversion optimizations
    void RGBAToYUVSIMD(const uint8_t* rgba, uint8_t* y, uint8_t* u, uint8_t* v,
                       uint32_t width, uint32_t height);
    
    // Advanced filtering
    void ApplyDeblockingFilterSIMD(uint8_t* data, uint32_t width, uint32_t height,
                                   uint32_t stride, int filter_strength);
    
    // Quantization optimization
    void OptimizeQuantizationSIMD(int16_t* coefficients, const int16_t* quant_matrix,
                                  uint32_t block_count);
};

WebPSIMDEncoder::WebPSIMDEncoder() {
    // Detect SIMD capabilities
    has_sse2_ = false;
    has_avx2_ = false;
    has_neon_ = false;
    
#if defined(_MSC_VER)
    int cpu_info[4];
    __cpuid(cpu_info, 1);
    has_sse2_ = (cpu_info[3] & (1 << 26)) != 0;
    
    __cpuid(cpu_info, 7);
    has_avx2_ = (cpu_info[1] & (1 << 5)) != 0;
#elif defined(__GNUC__) || defined(__clang__)
    #ifdef WEBP_SIMD_SSE2
    has_sse2_ = __builtin_cpu_supports("sse2");
    #endif
    
    #ifdef WEBP_SIMD_AVX2
    has_avx2_ = __builtin_cpu_supports("avx2");
    #endif
#endif

#ifdef WEBP_SIMD_NEON
    has_neon_ = true;
#endif
}

WebPSIMDEncoder::~WebPSIMDEncoder() = default;

std::vector<uint8_t> WebPSIMDEncoder::EncodeSIMD(const uint8_t* rgba_data, uint32_t width, 
                                                 uint32_t height, uint32_t stride,
                                                 const WebPEncodeParams& params) {
    // Create preprocessed buffer using memory pool
    const size_t buffer_size = width * height * 4;
    auto preprocessed_buffer = Utils::AllocateScreenshotBuffer(buffer_size);
    
    // Apply SIMD preprocessing optimizations
    if (has_avx2_) {
        PreprocessImageAVX2(rgba_data, preprocessed_buffer.get(), width, height, stride);
    } else if (has_sse2_) {
        PreprocessImageSSE2(rgba_data, preprocessed_buffer.get(), width, height, stride);
    } else if (has_neon_) {
        PreprocessImageNEON(rgba_data, preprocessed_buffer.get(), width, height, stride);
    } else {
        // Fallback: simple copy
        for (uint32_t y = 0; y < height; ++y) {
            std::memcpy(preprocessed_buffer.get() + y * width * 4, 
                       rgba_data + y * stride, width * 4);
        }
    }
    
    // Setup WebP with SIMD-optimized parameters
    WebPConfig config;
    WebPConfigInit(&config);
    
    // Optimize config for SIMD performance
    config.quality = params.quality;
    config.method = 6; // Maximum compression effort for SIMD optimization
    config.segments = 4; // Optimal for parallel SIMD processing
    config.sns_strength = params.sns_strength;
    config.filter_strength = params.filter_strength;
    config.alpha_compression = params.alpha_compression;
    config.thread_level = 1; // Enable internal threading
    config.preprocessing = 2; // Enable pseudo-random dithering for SIMD
    
    // SIMD-specific optimizations
    if (has_avx2_) {
        config.partitions = 3; // More partitions for AVX2
        config.pass = std::min(params.pass, 6); // Optimal for AVX2
    } else if (has_sse2_) {
        config.partitions = 2; // Good for SSE2
        config.pass = std::min(params.pass, 4);
    }
    
    WebPValidateConfig(&config);
    
    // Setup WebP picture with SIMD optimization hints
    WebPPicture picture;
    WebPPictureInit(&picture);
    
    picture.width = width;
    picture.height = height;
    picture.use_argb = 1; // Use ARGB for better SIMD performance
    
    // Custom writer for optimized output
    std::vector<uint8_t> output_buffer;
    
    auto writer = [](const uint8_t* data, size_t data_size, const WebPPicture* picture) -> int {
        std::vector<uint8_t>* buffer = static_cast<std::vector<uint8_t>*>(picture->custom_ptr);
        buffer->insert(buffer->end(), data, data + data_size);
        return 1;
    };
    
    picture.writer = writer;
    picture.custom_ptr = &output_buffer;
    
    // Allocate picture buffer
    if (!WebPPictureAlloc(&picture)) {
        Utils::ReturnScreenshotBuffer(std::move(preprocessed_buffer), buffer_size);
        return {};
    }
    
    // Import with SIMD-optimized format
    int import_result = WebPPictureImportRGBA(&picture, preprocessed_buffer.get(), width * 4);
    
    // Return buffer to pool
    Utils::ReturnScreenshotBuffer(std::move(preprocessed_buffer), buffer_size);
    
    if (!import_result) {
        WebPPictureFree(&picture);
        return {};
    }
    
    // Apply SIMD post-processing if available
    if (params.filter_strength > 0 && (has_sse2_ || has_avx2_ || has_neon_)) {
        ApplyDeblockingFilterSIMD(reinterpret_cast<uint8_t*>(picture.argb), 
                                 width, height, width * 4, params.filter_strength);
    }
    
    // Encode with optimizations
    int encode_result = WebPEncode(&config, &picture);
    
    WebPPictureFree(&picture);
    
    if (!encode_result) {
        return {};
    }
    
    return output_buffer;
}

#ifdef WEBP_SIMD_SSE2
void WebPSIMDEncoder::PreprocessImageSSE2(const uint8_t* input, uint8_t* output,
                                          uint32_t width, uint32_t height, uint32_t stride) {
    const uint32_t pixels_per_iter = 4; // Process 4 pixels at once
    const uint32_t simd_width = (width / pixels_per_iter) * pixels_per_iter;
    
    for (uint32_t y = 0; y < height; ++y) {
        const uint8_t* src_row = input + y * stride;
        uint8_t* dst_row = output + y * width * 4;
        
        uint32_t x = 0;
        
        // SIMD processing
        for (; x < simd_width; x += pixels_per_iter) {
            __m128i pixels = _mm_loadu_si128(reinterpret_cast<const __m128i*>(src_row + x * 4));
            
            // Apply noise reduction (simple averaging with neighbors)
            __m128i shifted_left = _mm_slli_si128(pixels, 4);
            __m128i shifted_right = _mm_srli_si128(pixels, 4);
            __m128i averaged = _mm_avg_epu8(pixels, _mm_avg_epu8(shifted_left, shifted_right));
            
            _mm_storeu_si128(reinterpret_cast<__m128i*>(dst_row + x * 4), averaged);
        }
        
        // Handle remaining pixels
        for (; x < width; ++x) {
            dst_row[x * 4 + 0] = src_row[x * 4 + 0]; // R
            dst_row[x * 4 + 1] = src_row[x * 4 + 1]; // G
            dst_row[x * 4 + 2] = src_row[x * 4 + 2]; // B
            dst_row[x * 4 + 3] = src_row[x * 4 + 3]; // A
        }
    }
}
#endif

#ifdef WEBP_SIMD_AVX2
void WebPSIMDEncoder::PreprocessImageAVX2(const uint8_t* input, uint8_t* output,
                                          uint32_t width, uint32_t height, uint32_t stride) {
    const uint32_t pixels_per_iter = 8; // Process 8 pixels at once with AVX2
    const uint32_t simd_width = (width / pixels_per_iter) * pixels_per_iter;
    
    for (uint32_t y = 0; y < height; ++y) {
        const uint8_t* src_row = input + y * stride;
        uint8_t* dst_row = output + y * width * 4;
        
        uint32_t x = 0;
        
        // AVX2 processing
        for (; x < simd_width; x += pixels_per_iter) {
            __m256i pixels = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(src_row + x * 4));
            
            // Advanced noise reduction with AVX2
            __m256i shifted_left = _mm256_slli_si256(pixels, 4);
            __m256i shifted_right = _mm256_srli_si256(pixels, 4);
            __m256i averaged = _mm256_avg_epu8(pixels, _mm256_avg_epu8(shifted_left, shifted_right));
            
            // Apply sharpening filter
            __m256i sharpening_mask = _mm256_set1_epi8(2);
            __m256i sharpened = _mm256_adds_epu8(averaged, 
                _mm256_subs_epu8(pixels, _mm256_avg_epu8(pixels, averaged)));
            
            _mm256_storeu_si256(reinterpret_cast<__m256i*>(dst_row + x * 4), sharpened);
        }
        
        // Handle remaining pixels
        for (; x < width; ++x) {
            dst_row[x * 4 + 0] = src_row[x * 4 + 0];
            dst_row[x * 4 + 1] = src_row[x * 4 + 1];
            dst_row[x * 4 + 2] = src_row[x * 4 + 2];
            dst_row[x * 4 + 3] = src_row[x * 4 + 3];
        }
    }
}
#endif

#ifdef WEBP_SIMD_NEON
void WebPSIMDEncoder::PreprocessImageNEON(const uint8_t* input, uint8_t* output,
                                          uint32_t width, uint32_t height, uint32_t stride) {
    const uint32_t pixels_per_iter = 4; // Process 4 pixels at once with NEON
    const uint32_t simd_width = (width / pixels_per_iter) * pixels_per_iter;
    
    for (uint32_t y = 0; y < height; ++y) {
        const uint8_t* src_row = input + y * stride;
        uint8_t* dst_row = output + y * width * 4;
        
        uint32_t x = 0;
        
        // NEON processing
        for (; x < simd_width; x += pixels_per_iter) {
            uint8x16_t pixels = vld1q_u8(src_row + x * 4);
            
            // Apply noise reduction with NEON
            uint8x16_t shifted_left = vextq_u8(vdupq_n_u8(0), pixels, 12);
            uint8x16_t shifted_right = vextq_u8(pixels, vdupq_n_u8(0), 4);
            uint8x16_t averaged = vrhaddq_u8(pixels, vrhaddq_u8(shifted_left, shifted_right));
            
            vst1q_u8(dst_row + x * 4, averaged);
        }
        
        // Handle remaining pixels
        for (; x < width; ++x) {
            dst_row[x * 4 + 0] = src_row[x * 4 + 0];
            dst_row[x * 4 + 1] = src_row[x * 4 + 1];
            dst_row[x * 4 + 2] = src_row[x * 4 + 2];
            dst_row[x * 4 + 3] = src_row[x * 4 + 3];
        }
    }
}
#endif

void WebPSIMDEncoder::ApplyDeblockingFilterSIMD(uint8_t* data, uint32_t width, uint32_t height,
                                               uint32_t stride, int filter_strength) {
    if (filter_strength <= 0) return;
    
    // Apply horizontal deblocking
    for (uint32_t y = 1; y < height - 1; ++y) {
        uint8_t* row = data + y * stride;
        
        #ifdef WEBP_SIMD_AVX2
        if (has_avx2_) {
            const uint32_t simd_width = (width / 8) * 8;
            for (uint32_t x = 0; x < simd_width; x += 8) {
                __m256i current = _mm256_loadu_si256(reinterpret_cast<__m256i*>(row + x * 4));
                __m256i above = _mm256_loadu_si256(reinterpret_cast<__m256i*>(row - stride + x * 4));
                __m256i below = _mm256_loadu_si256(reinterpret_cast<__m256i*>(row + stride + x * 4));
                
                __m256i filtered = _mm256_avg_epu8(_mm256_avg_epu8(above, below), current);
                _mm256_storeu_si256(reinterpret_cast<__m256i*>(row + x * 4), filtered);
            }
        }
        #elif defined(WEBP_SIMD_SSE2)
        if (has_sse2_) {
            const uint32_t simd_width = (width / 4) * 4;
            for (uint32_t x = 0; x < simd_width; x += 4) {
                __m128i current = _mm_loadu_si128(reinterpret_cast<__m128i*>(row + x * 4));
                __m128i above = _mm_loadu_si128(reinterpret_cast<__m128i*>(row - stride + x * 4));
                __m128i below = _mm_loadu_si128(reinterpret_cast<__m128i*>(row + stride + x * 4));
                
                __m128i filtered = _mm_avg_epu8(_mm_avg_epu8(above, below), current);
                _mm_storeu_si128(reinterpret_cast<__m128i*>(row + x * 4), filtered);
            }
        }
        #endif
    }
}

std::string WebPSIMDEncoder::GetOptimizations() {
    WebPSIMDEncoder encoder;
    std::string optimizations = "WebP SIMD Optimizations: ";
    
    if (encoder.has_avx2_) optimizations += "AVX2 ";
    if (encoder.has_sse2_) optimizations += "SSE2 ";
    if (encoder.has_neon_) optimizations += "NEON ";
    
    if (!encoder.has_avx2_ && !encoder.has_sse2_ && !encoder.has_neon_) {
        optimizations += "None (Scalar)";
    }
    
    return optimizations;
}

// Global SIMD encoder instance
static WebPSIMDEncoder g_simd_encoder;

// Public interface for SIMD-optimized WebP encoding
std::vector<uint8_t> EncodeSIMDOptimized(const uint8_t* rgba_data, uint32_t width, 
                                        uint32_t height, uint32_t stride,
                                        const WebPEncodeParams& params) {
    return g_simd_encoder.EncodeSIMD(rgba_data, width, height, stride, params);
}

std::string GetWebPSIMDOptimizations() {
    return WebPSIMDEncoder::GetOptimizations();
}

} // namespace SIMD
} // namespace WebPScreenshot