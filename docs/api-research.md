# Cross-Platform Screenshot API Research

## Summary
This document analyzes native screenshot capture APIs across Windows, macOS, and Linux platforms, with focus on performance, raw pixel access, and compatibility.

## Windows APIs

### 1. Windows.Graphics.Capture API (Windows 10 1803+)
**Availability:** Windows 10 version 1803 (April 2018 Update) and later
**Performance:** ⭐⭐⭐⭐⭐ (Excellent)
**Raw Pixel Access:** ✅ Direct IDXGISurface access
**Hardware Acceleration:** ✅ GPU-accelerated

**Advantages:**
- Modern, efficient API with GPU acceleration
- Direct access to DXGI surfaces
- Supports HDR content capture
- Low CPU overhead
- Excellent multi-monitor support

**Disadvantages:**
- Only available on Windows 10 1803+
- Requires Windows Runtime (WinRT) initialization
- More complex implementation

**Memory Format:** BGRA (32-bit per pixel)
**Performance Characteristics:**
- Capture time: ~2-5ms for 1920x1080
- Memory usage: ~8MB for 1920x1080 (uncompressed)
- CPU usage: <5% (GPU accelerated)

### 2. GDI+ GetPixel/BitBlt (Windows 7+)
**Availability:** Windows 7 and later
**Performance:** ⭐⭐⭐ (Good)
**Raw Pixel Access:** ✅ Via GetDIBits
**Hardware Acceleration:** ❌ CPU-only

**Advantages:**
- Wide compatibility (Windows 7+)
- Simple API
- Well-documented

**Disadvantages:**
- CPU-intensive
- Slower performance
- Limited HDR support

**Memory Format:** RGB/RGBA (24/32-bit per pixel)
**Performance Characteristics:**
- Capture time: ~15-25ms for 1920x1080
- Memory usage: ~6-8MB for 1920x1080
- CPU usage: 15-25%

### 3. DirectX Desktop Duplication API (Windows 8+)
**Availability:** Windows 8 and later
**Performance:** ⭐⭐⭐⭐ (Very Good)
**Raw Pixel Access:** ✅ IDXGISurface
**Hardware Acceleration:** ✅ GPU-accelerated

**Advantages:**
- Efficient for continuous capture
- GPU acceleration
- Good for screen recording scenarios

**Disadvantages:**
- More complex than needed for single screenshots
- Windows 8+ only
- Requires DirectX knowledge

## macOS APIs

### 1. CGWindowListCreateImage (macOS 10.5+)
**Availability:** macOS 10.5 (Leopard) and later
**Performance:** ⭐⭐⭐⭐ (Very Good)
**Raw Pixel Access:** ✅ CGDataProvider/CFData
**Hardware Acceleration:** ✅ Partial (Core Graphics optimized)

**Advantages:**
- Excellent compatibility across macOS versions
- Direct CGImage access
- Optimized by Core Graphics
- Supports window-specific capture
- Built-in Retina scaling handling

**Disadvantages:**
- Requires screen recording permission (macOS 10.14+)
- Memory management considerations

**Memory Format:** RGBA (32-bit per pixel)
**Performance Characteristics:**
- Capture time: ~5-10ms for 1920x1080
- Memory usage: ~8MB for 1920x1080
- CPU usage: 8-15%

### 2. AVCaptureScreenInput (macOS 10.7-10.14)
**Availability:** macOS 10.7 to 10.14 (deprecated)
**Performance:** ⭐⭐ (Fair)
**Raw Pixel Access:** ❌ Complex video frame extraction
**Hardware Acceleration:** ✅ Video pipeline

**Advantages:**
- Built for screen recording
- Hardware acceleration

**Disadvantages:**
- Deprecated in macOS 10.14
- Complex for single screenshots
- Video-oriented API

### 3. ScreenCaptureKit (macOS 12+)
**Availability:** macOS 12 (Monterey) and later
**Performance:** ⭐⭐⭐⭐⭐ (Excellent)
**Raw Pixel Access:** ✅ CMSampleBuffer/CVPixelBuffer
**Hardware Acceleration:** ✅ Full GPU pipeline

**Advantages:**
- Modern, efficient API
- Excellent performance
- Built-in privacy controls
- HDR support

**Disadvantages:**
- Only available on macOS 12+
- Still relatively new API

## Linux APIs

### 1. X11 XGetImage
**Availability:** All X11-based Linux distributions
**Performance:** ⭐⭐⭐ (Good)
**Raw Pixel Access:** ✅ Direct XImage data
**Hardware Acceleration:** ❌ CPU-only

**Advantages:**
- Universal X11 compatibility
- Simple implementation
- Direct pixel access
- Well-established API

**Disadvantages:**
- CPU-only (no GPU acceleration)
- X11 specific (not Wayland)
- Performance varies by X11 driver

**Memory Format:** Various (typically RGB/RGBA)
**Performance Characteristics:**
- Capture time: ~10-20ms for 1920x1080
- Memory usage: ~6-8MB for 1920x1080
- CPU usage: 10-20%

### 2. Wayland wlr-screencopy
**Availability:** Wayland compositors supporting wlr-screencopy-unstable-v1
**Performance:** ⭐⭐⭐⭐ (Very Good)
**Raw Pixel Access:** ✅ Direct buffer access
**Hardware Acceleration:** ✅ Compositor-dependent

**Advantages:**
- Modern Wayland protocol
- Potential GPU acceleration
- Good performance on supported compositors

**Disadvantages:**
- Limited compositor support
- Protocol still marked as unstable
- Complex implementation

### 3. FFmpeg/GStreamer Screen Capture
**Availability:** Most Linux distributions
**Performance:** ⭐⭐⭐ (Good)
**Raw Pixel Access:** ✅ Through codec pipeline
**Hardware Acceleration:** ✅ Potential GPU support

**Advantages:**
- Cross-platform compatibility
- Hardware acceleration potential
- Well-maintained

**Disadvantages:**
- Heavy dependency
- Overkill for single screenshots
- Complex configuration

## Compatibility Matrix

| OS Version | Primary API | Fallback API | Raw Pixel Access | Performance Score |
|------------|-------------|--------------|-------------------|-------------------|
| Windows 11 | Graphics.Capture | GDI+ | ✅ | ⭐⭐⭐⭐⭐ |
| Windows 10 1903+ | Graphics.Capture | GDI+ | ✅ | ⭐⭐⭐⭐⭐ |
| Windows 10 1803+ | Graphics.Capture | GDI+ | ✅ | ⭐⭐⭐⭐ |
| Windows 10 < 1803 | GDI+ | - | ✅ | ⭐⭐⭐ |
| Windows 8.1 | GDI+ | - | ✅ | ⭐⭐⭐ |
| Windows 7 | GDI+ | - | ✅ | ⭐⭐⭐ |
| macOS 13+ | CGWindowListCreateImage | - | ✅ | ⭐⭐⭐⭐⭐ |
| macOS 12+ | CGWindowListCreateImage | - | ✅ | ⭐⭐⭐⭐ |
| macOS 10.14+ | CGWindowListCreateImage | - | ✅ | ⭐⭐⭐⭐ |
| macOS 10.5-10.13 | CGWindowListCreateImage | - | ✅ | ⭐⭐⭐⭐ |
| Ubuntu 22.04+ (Wayland) | wlr-screencopy | X11 XGetImage | ✅ | ⭐⭐⭐⭐ |
| Ubuntu 20.04+ (X11) | XGetImage | - | ✅ | ⭐⭐⭐ |
| Fedora 36+ (Wayland) | wlr-screencopy | X11 XGetImage | ✅ | ⭐⭐⭐⭐ |
| Generic Linux X11 | XGetImage | - | ✅ | ⭐⭐⭐ |

## Performance Comparison

### Baseline: PNG Screenshot → WebP Conversion
- **Capture Time:** 15-30ms
- **PNG Encoding:** 50-100ms
- **WebP Conversion:** 20-40ms
- **Total Time:** 85-170ms
- **Memory Peak:** 2x image size during conversion

### Direct WebP Capture (Projected)
- **Capture Time:** 2-10ms (depending on API)
- **Direct WebP Encoding:** 15-30ms
- **Total Time:** 17-40ms (59-76% faster)
- **Memory Peak:** 1x image size (22% reduction)

## Fallback Strategy

### Tier 1: Native Optimized
- Windows 10 1803+: Windows.Graphics.Capture
- macOS 12+: ScreenCaptureKit or CGWindowListCreateImage
- Linux Wayland: wlr-screencopy

### Tier 2: Native Compatible
- Windows 7-10 < 1803: GDI+
- macOS 10.5+: CGWindowListCreateImage
- Linux X11: XGetImage

### Tier 3: Fallback to Existing Pipeline
- Any platform where native modules fail to compile
- Platforms not explicitly supported
- Runtime errors in native code

## Implementation Priority

1. **Phase 1 (Week 1-2):** Research and WebP integration ✅
2. **Phase 2 (Week 3-4):** Windows implementation (Graphics.Capture + GDI+ fallback)
3. **Phase 3 (Week 5-6):** macOS implementation (CGWindowListCreateImage)
4. **Phase 4 (Week 7-8):** Linux implementation (X11 + Wayland)
5. **Phase 5 (Week 9-10):** Integration and testing
6. **Phase 6 (Week 11-12):** Deployment and monitoring

## Risk Assessment

### High Risk
- **Native module compilation failures** - Mitigated by comprehensive CI/CD and fallback
- **OS API changes** - Mitigated by version testing and graceful degradation

### Medium Risk
- **Performance expectations not met** - Mitigated by conservative estimates
- **Wayland protocol stability** - Mitigated by X11 fallback

### Low Risk
- **WebP encoding issues** - Well-established libwebp library
- **Cross-platform compatibility** - Extensive testing planned