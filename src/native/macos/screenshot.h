#pragma once

#ifdef __APPLE__

#include "../common/screenshot_common.h"
#include <vector>
#include <memory>
#include <string>

// Forward declarations for macOS types
typedef struct CGImage* CGImageRef;
typedef struct CGColorSpace* CGColorSpaceRef;
typedef struct CGDataProvider* CGDataProviderRef;
typedef struct CGContext* CGContextRef;
typedef uint32_t CGDirectDisplayID;
typedef struct __CFData* CFDataRef;

namespace WebPScreenshot {
namespace macOS {

class MacOSScreenshotCapture : public ScreenshotCapture {
public:
    MacOSScreenshotCapture();
    ~MacOSScreenshotCapture() override;
    
    // ScreenshotCapture interface
    std::vector<DisplayInfo> GetDisplays() override;
    ScreenshotResult CaptureDisplay(uint32_t display_index) override;
    std::vector<ScreenshotResult> CaptureAllDisplays() override;
    bool IsSupported() override;
    std::string GetImplementationName() override;

private:
    bool initialized_;
    
    struct DisplayHandle {
        CGDirectDisplayID display_id;
        DisplayInfo info;
    };
    
    std::vector<DisplayHandle> display_handles_;
    
    void Initialize();
    void EnumerateDisplays();
    
    // Screen capture methods
    ScreenshotResult CaptureWithCoreGraphics(CGDirectDisplayID display_id);
    ScreenshotResult CaptureWithCGWindowListCreateImage(CGDirectDisplayID display_id);
    
    // Permission handling
    bool CheckScreenRecordingPermission();
    bool RequestScreenRecordingPermission();
    
    // Utility methods
    CGImageRef CreateCGImageFromDisplay(CGDirectDisplayID display_id);
    ScreenshotResult CGImageToScreenshotResult(CGImageRef image);
    
    // Helper functions for CGImage processing
    static void* GetBitmapDataFromCGImage(CGImageRef image, uint32_t* width, 
                                         uint32_t* height, uint32_t* stride,
                                         uint32_t* bytes_per_pixel);
    static void ReleaseBitmapData(void* bitmap_data);
    
    // Display scaling helpers
    static float GetDisplayScaleFactor(CGDirectDisplayID display_id);
    static void ApplyRetinaScaling(DisplayInfo& info, CGDirectDisplayID display_id);
};

// Utility functions
namespace Utils {
    // System version checking
    bool IsMacOS10_14OrLater();
    bool IsMacOS10_15OrLater();
    bool IsMacOS12OrLater();
    
    // Display enumeration
    std::vector<CGDirectDisplayID> GetActiveDisplays();
    DisplayInfo DisplayIDToDisplayInfo(CGDirectDisplayID display_id, uint32_t index);
    
    // Permission management
    enum class PermissionStatus {
        NotDetermined,
        Denied,
        Authorized,
        Unknown
    };
    
    PermissionStatus GetScreenRecordingPermissionStatus();
    bool RequestScreenRecordingPermissionAsync();
    
    // Error handling
    std::string OSStatusToString(int status);
    std::string GetLastCoreGraphicsError();
    
    // Memory management
    class CFDataWrapper {
    public:
        explicit CFDataWrapper(CFDataRef data);
        ~CFDataWrapper();
        
        const uint8_t* GetData() const;
        size_t GetLength() const;
        bool IsValid() const;
        
    private:
        CFDataRef data_;
    };
    
    class CGImageWrapper {
    public:
        explicit CGImageWrapper(CGImageRef image);
        ~CGImageWrapper();
        
        CGImageRef Get() const { return image_; }
        bool IsValid() const { return image_ != nullptr; }
        
        uint32_t GetWidth() const;
        uint32_t GetHeight() const;
        uint32_t GetBitsPerPixel() const;
        uint32_t GetBytesPerRow() const;
        
    private:
        CGImageRef image_;
    };
    
    // Color space management
    class ColorSpaceManager {
    public:
        static CGColorSpaceRef GetRGBColorSpace();
        static void ReleaseColorSpace(CGColorSpaceRef color_space);
        
    private:
        static CGColorSpaceRef rgb_color_space_;
    };
}

} // namespace macOS
} // namespace WebPScreenshot

#endif // __APPLE__