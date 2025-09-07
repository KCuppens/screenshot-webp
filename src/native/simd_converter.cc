#include "common/screenshot_common.h"

// SIMD intrinsics headers
#if defined(__SSE2__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 2)
    #define WEBP_USE_SSE2 1
    #include <emmintrin.h>
#endif

#if defined(__SSE4_1__) || (defined(_MSC_VER) && _MSC_VER >= 1500)
    #define WEBP_USE_SSE41 1
    #include <smmintrin.h>
#endif

#if defined(__AVX2__)
    #define WEBP_USE_AVX2 1
    #include <immintrin.h>
#endif

#if defined(__ARM_NEON) || defined(__aarch64__)
    #define WEBP_USE_NEON 1
    #include <arm_neon.h>
#endif

namespace WebPScreenshot {
namespace SIMD {

// Check CPU capabilities at runtime
struct CPUInfo {
    bool has_sse2 = false;
    bool has_sse41 = false;
    bool has_avx2 = false;
    bool has_neon = false;
    
    CPUInfo() {
        DetectCPUFeatures();
    }
    
private:
    void DetectCPUFeatures();
};

static CPUInfo g_cpu_info;

void CPUInfo::DetectCPUFeatures() {
#if defined(_MSC_VER)
    // Microsoft Visual C++
    int cpu_info[4];
    __cpuid(cpu_info, 1);
    
    has_sse2 = (cpu_info[3] & (1 << 26)) != 0;
    has_sse41 = (cpu_info[2] & (1 << 19)) != 0;
    
    // Check for AVX2
    __cpuid(cpu_info, 7);
    has_avx2 = (cpu_info[1] & (1 << 5)) != 0;
    
#elif defined(__GNUC__) || defined(__clang__)
    // GCC/Clang
    #ifdef WEBP_USE_SSE2
    has_sse2 = __builtin_cpu_supports("sse2");
    #endif
    
    #ifdef WEBP_USE_SSE41
    has_sse41 = __builtin_cpu_supports("sse4.1");
    #endif
    
    #ifdef WEBP_USE_AVX2
    has_avx2 = __builtin_cpu_supports("avx2");
    #endif
    
#endif

#ifdef WEBP_USE_NEON
    has_neon = true; // Assume NEON is available if compiled for ARM with NEON
#endif
}

// BGRA to RGBA conversion functions

void ConvertBGRAToRGBA_C(const uint8_t* bgra, uint8_t* rgba, uint32_t pixel_count) {
    for (uint32_t i = 0; i < pixel_count; ++i) {
        rgba[i * 4 + 0] = bgra[i * 4 + 2]; // R
        rgba[i * 4 + 1] = bgra[i * 4 + 1]; // G
        rgba[i * 4 + 2] = bgra[i * 4 + 0]; // B
        rgba[i * 4 + 3] = bgra[i * 4 + 3]; // A
    }
}

#ifdef WEBP_USE_SSE2
void ConvertBGRAToRGBA_SSE2(const uint8_t* bgra, uint8_t* rgba, uint32_t pixel_count) {
    const uint32_t simd_pixels = pixel_count & ~3; // Process 4 pixels at a time
    
    // Shuffle mask for BGRA -> RGBA conversion
    const __m128i shuffle_mask = _mm_setr_epi8(
        2, 1, 0, 3,  // First pixel: B->R, G->G, R->B, A->A
        6, 5, 4, 7,  // Second pixel
        10, 9, 8, 11, // Third pixel
        14, 13, 12, 15 // Fourth pixel
    );
    
    for (uint32_t i = 0; i < simd_pixels; i += 4) {
        __m128i pixels = _mm_loadu_si128(reinterpret_cast<const __m128i*>(bgra + i * 4));
        __m128i converted = _mm_shuffle_epi8(pixels, shuffle_mask);
        _mm_storeu_si128(reinterpret_cast<__m128i*>(rgba + i * 4), converted);
    }
    
    // Handle remaining pixels with scalar code
    for (uint32_t i = simd_pixels; i < pixel_count; ++i) {
        rgba[i * 4 + 0] = bgra[i * 4 + 2];
        rgba[i * 4 + 1] = bgra[i * 4 + 1];
        rgba[i * 4 + 2] = bgra[i * 4 + 0];
        rgba[i * 4 + 3] = bgra[i * 4 + 3];
    }
}
#endif

#ifdef WEBP_USE_AVX2
void ConvertBGRAToRGBA_AVX2(const uint8_t* bgra, uint8_t* rgba, uint32_t pixel_count) {
    const uint32_t simd_pixels = pixel_count & ~7; // Process 8 pixels at a time
    
    // Shuffle mask for BGRA -> RGBA conversion (32 bytes for 8 pixels)
    const __m256i shuffle_mask = _mm256_setr_epi8(
        2, 1, 0, 3, 6, 5, 4, 7, 10, 9, 8, 11, 14, 13, 12, 15, // First 4 pixels
        2, 1, 0, 3, 6, 5, 4, 7, 10, 9, 8, 11, 14, 13, 12, 15  // Second 4 pixels
    );
    
    for (uint32_t i = 0; i < simd_pixels; i += 8) {
        __m256i pixels = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(bgra + i * 4));
        __m256i converted = _mm256_shuffle_epi8(pixels, shuffle_mask);
        _mm256_storeu_si256(reinterpret_cast<__m256i*>(rgba + i * 4), converted);
    }
    
    // Handle remaining pixels with scalar code
    for (uint32_t i = simd_pixels; i < pixel_count; ++i) {
        rgba[i * 4 + 0] = bgra[i * 4 + 2];
        rgba[i * 4 + 1] = bgra[i * 4 + 1];
        rgba[i * 4 + 2] = bgra[i * 4 + 0];
        rgba[i * 4 + 3] = bgra[i * 4 + 3];
    }
}
#endif

#ifdef WEBP_USE_NEON
void ConvertBGRAToRGBA_NEON(const uint8_t* bgra, uint8_t* rgba, uint32_t pixel_count) {
    const uint32_t simd_pixels = pixel_count & ~3; // Process 4 pixels at a time
    
    for (uint32_t i = 0; i < simd_pixels; i += 4) {
        uint8x16_t pixels = vld1q_u8(bgra + i * 4);
        
        // Extract color channels
        uint8x16_t b = vqtbl1q_u8(pixels, (uint8x16_t){0, 4, 8, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        uint8x16_t g = vqtbl1q_u8(pixels, (uint8x16_t){1, 5, 9, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        uint8x16_t r = vqtbl1q_u8(pixels, (uint8x16_t){2, 6, 10, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        uint8x16_t a = vqtbl1q_u8(pixels, (uint8x16_t){3, 7, 11, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        
        // Reconstruct as RGBA
        uint8x16_t result;
        result = vqtbl1q_u8(r, (uint8x16_t){0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3});
        result = vqtbl1q_u8(g, (uint8x16_t){0, 1, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3}) | result;
        result = vqtbl1q_u8(b, (uint8x16_t){0, 0, 2, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3}) | result;
        result = vqtbl1q_u8(a, (uint8x16_t){0, 0, 0, 3, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3}) | result;
        
        vst1q_u8(rgba + i * 4, result);
    }
    
    // Handle remaining pixels with scalar code
    for (uint32_t i = simd_pixels; i < pixel_count; ++i) {
        rgba[i * 4 + 0] = bgra[i * 4 + 2];
        rgba[i * 4 + 1] = bgra[i * 4 + 1];
        rgba[i * 4 + 2] = bgra[i * 4 + 0];
        rgba[i * 4 + 3] = bgra[i * 4 + 3];
    }
}
#endif

// RGBA to RGB conversion functions

void ConvertRGBAToRGB_C(const uint8_t* rgba, uint8_t* rgb, uint32_t pixel_count) {
    for (uint32_t i = 0; i < pixel_count; ++i) {
        rgb[i * 3 + 0] = rgba[i * 4 + 0]; // R
        rgb[i * 3 + 1] = rgba[i * 4 + 1]; // G
        rgb[i * 3 + 2] = rgba[i * 4 + 2]; // B
        // Skip alpha channel
    }
}

#ifdef WEBP_USE_SSE2
void ConvertRGBAToRGB_SSE2(const uint8_t* rgba, uint8_t* rgb, uint32_t pixel_count) {
    const uint32_t simd_pixels = pixel_count & ~3; // Process 4 pixels at a time
    
    // Shuffle masks to pack RGBA to RGB
    const __m128i shuffle_mask1 = _mm_setr_epi8(0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, -1, -1, -1, -1);
    
    for (uint32_t i = 0; i < simd_pixels; i += 4) {
        __m128i pixels = _mm_loadu_si128(reinterpret_cast<const __m128i*>(rgba + i * 4));
        __m128i packed = _mm_shuffle_epi8(pixels, shuffle_mask1);
        
        // Store 12 bytes (3 pixels * 4 bytes each = 12 bytes)
        _mm_storel_epi64(reinterpret_cast<__m128i*>(rgb + i * 3), packed);
        uint32_t last4 = _mm_extract_epi32(packed, 2);
        *reinterpret_cast<uint32_t*>(rgb + i * 3 + 8) = last4;
    }
    
    // Handle remaining pixels with scalar code
    for (uint32_t i = simd_pixels; i < pixel_count; ++i) {
        rgb[i * 3 + 0] = rgba[i * 4 + 0];
        rgb[i * 3 + 1] = rgba[i * 4 + 1];
        rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
}
#endif

#ifdef WEBP_USE_AVX2
void ConvertRGBAToRGB_AVX2(const uint8_t* rgba, uint8_t* rgb, uint32_t pixel_count) {
    const uint32_t simd_pixels = pixel_count & ~7; // Process 8 pixels at a time
    
    for (uint32_t i = 0; i < simd_pixels; i += 8) {
        __m256i pixels = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(rgba + i * 4));
        
        // Complex shuffle to pack 8 RGBA pixels to RGB format
        // This is simplified - a full implementation would be more optimized
        alignas(32) uint8_t temp[32];
        _mm256_store_si256(reinterpret_cast<__m256i*>(temp), pixels);
        
        for (int j = 0; j < 8; ++j) {
            rgb[(i + j) * 3 + 0] = temp[j * 4 + 0];
            rgb[(i + j) * 3 + 1] = temp[j * 4 + 1];
            rgb[(i + j) * 3 + 2] = temp[j * 4 + 2];
        }
    }
    
    // Handle remaining pixels
    for (uint32_t i = simd_pixels; i < pixel_count; ++i) {
        rgb[i * 3 + 0] = rgba[i * 4 + 0];
        rgb[i * 3 + 1] = rgba[i * 4 + 1];
        rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
}
#endif

// Public interface functions

void ConvertBGRAToRGBA(const uint8_t* bgra_data, uint8_t* rgba_data, uint32_t pixel_count) {
    if (!bgra_data || !rgba_data || pixel_count == 0) {
        return;
    }
    
    // Choose the best available SIMD implementation
    #ifdef WEBP_USE_AVX2
    if (g_cpu_info.has_avx2) {
        ConvertBGRAToRGBA_AVX2(bgra_data, rgba_data, pixel_count);
        return;
    }
    #endif
    
    #ifdef WEBP_USE_SSE2
    if (g_cpu_info.has_sse2) {
        ConvertBGRAToRGBA_SSE2(bgra_data, rgba_data, pixel_count);
        return;
    }
    #endif
    
    #ifdef WEBP_USE_NEON
    if (g_cpu_info.has_neon) {
        ConvertBGRAToRGBA_NEON(bgra_data, rgba_data, pixel_count);
        return;
    }
    #endif
    
    // Fallback to scalar implementation
    ConvertBGRAToRGBA_C(bgra_data, rgba_data, pixel_count);
}

void ConvertRGBAToRGB(const uint8_t* rgba_data, uint8_t* rgb_data, uint32_t pixel_count) {
    if (!rgba_data || !rgb_data || pixel_count == 0) {
        return;
    }
    
    // Choose the best available SIMD implementation
    #ifdef WEBP_USE_AVX2
    if (g_cpu_info.has_avx2) {
        ConvertRGBAToRGB_AVX2(rgba_data, rgb_data, pixel_count);
        return;
    }
    #endif
    
    #ifdef WEBP_USE_SSE2
    if (g_cpu_info.has_sse2) {
        ConvertRGBAToRGB_SSE2(rgba_data, rgb_data, pixel_count);
        return;
    }
    #endif
    
    // Fallback to scalar implementation
    ConvertRGBAToRGB_C(rgba_data, rgb_data, pixel_count);
}

// In-place pixel format conversion
void ConvertBGRAToRGBAInPlace(uint8_t* data, uint32_t pixel_count) {
    if (!data || pixel_count == 0) {
        return;
    }
    
    // For in-place conversion, we need to be careful with SIMD
    // For now, use simple scalar implementation
    for (uint32_t i = 0; i < pixel_count; ++i) {
        std::swap(data[i * 4 + 0], data[i * 4 + 2]); // Swap R and B channels
    }
}

// Get SIMD capabilities info
std::string GetSIMDCapabilities() {
    std::string caps;
    
    #ifdef WEBP_USE_SSE2
    if (g_cpu_info.has_sse2) caps += "SSE2 ";
    #endif
    
    #ifdef WEBP_USE_SSE41
    if (g_cpu_info.has_sse41) caps += "SSE4.1 ";
    #endif
    
    #ifdef WEBP_USE_AVX2
    if (g_cpu_info.has_avx2) caps += "AVX2 ";
    #endif
    
    #ifdef WEBP_USE_NEON
    if (g_cpu_info.has_neon) caps += "NEON ";
    #endif
    
    return caps.empty() ? "None" : caps;
}

} // namespace SIMD
} // namespace WebPScreenshot