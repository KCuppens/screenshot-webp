#ifdef __APPLE__

#include "screenshot.h"
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <Foundation/Foundation.h>
#include <AppKit/AppKit.h>
#include <AvailabilityMacros.h>

#include <algorithm>
#include <cstring>
#include <sstream>

namespace WebPScreenshot {
namespace macOS {

// MacOSScreenshotCapture implementation
MacOSScreenshotCapture::MacOSScreenshotCapture() : initialized_(false) {
    Initialize();
}

MacOSScreenshotCapture::~MacOSScreenshotCapture() = default;

void MacOSScreenshotCapture::Initialize() {
    if (initialized_) return;
    
    try {
        EnumerateDisplays();
        initialized_ = true;
    } catch (const std::exception& e) {
        // Log error but don't throw - allow fallback mechanisms to work
        initialized_ = false;
    }
}

void MacOSScreenshotCapture::EnumerateDisplays() {
    display_handles_.clear();
    
    std::vector<CGDirectDisplayID> display_ids = Utils::GetActiveDisplays();
    
    for (size_t i = 0; i < display_ids.size(); ++i) {
        DisplayHandle handle;
        handle.display_id = display_ids[i];
        handle.info = Utils::DisplayIDToDisplayInfo(display_ids[i], static_cast<uint32_t>(i));
        
        display_handles_.push_back(handle);
    }
}

std::vector<DisplayInfo> MacOSScreenshotCapture::GetDisplays() {
    if (!initialized_) Initialize();
    
    std::vector<DisplayInfo> displays;
    for (const auto& handle : display_handles_) {
        displays.push_back(handle.info);
    }
    
    return displays;
}

ScreenshotResult MacOSScreenshotCapture::CaptureDisplay(uint32_t display_index) {
    if (!initialized_) Initialize();
    
    ScreenshotResult result;
    
    if (display_index >= display_handles_.size()) {
        result.error_message = "Display index out of range";
        return result;
    }
    
    // Check permissions on macOS 10.14+
    if (Utils::IsMacOS10_14OrLater()) {
        if (!CheckScreenRecordingPermission()) {
            result.error_message = "Screen recording permission required (macOS 10.14+)";
            return result;
        }
    }
    
    try {
        return CaptureWithCGWindowListCreateImage(display_handles_[display_index].display_id);
    } catch (const std::exception& e) {
        result.error_message = std::string("macOS screenshot capture failed: ") + e.what();
        return result;
    }
}

std::vector<ScreenshotResult> MacOSScreenshotCapture::CaptureAllDisplays() {
    if (!initialized_) Initialize();
    
    std::vector<ScreenshotResult> results;
    
    for (uint32_t i = 0; i < display_handles_.size(); ++i) {
        results.push_back(CaptureDisplay(i));
    }
    
    return results;
}

bool MacOSScreenshotCapture::IsSupported() {
    return initialized_ && !display_handles_.empty();
}

std::string MacOSScreenshotCapture::GetImplementationName() {
    return "CGWindowListCreateImage";
}

bool MacOSScreenshotCapture::CheckScreenRecordingPermission() {
    if (!Utils::IsMacOS10_14OrLater()) {
        return true; // No permission required on older macOS
    }
    
    Utils::PermissionStatus status = Utils::GetScreenRecordingPermissionStatus();
    return status == Utils::PermissionStatus::Authorized;
}

bool MacOSScreenshotCapture::RequestScreenRecordingPermission() {
    if (!Utils::IsMacOS10_14OrLater()) {
        return true;
    }
    
    return Utils::RequestScreenRecordingPermissionAsync();
}

ScreenshotResult MacOSScreenshotCapture::CaptureWithCGWindowListCreateImage(CGDirectDisplayID display_id) {
    ScreenshotResult result;
    
    @autoreleasepool {
        // Create image from display
        CGImageRef image = CGWindowListCreateImage(
            CGRectNull,  // Capture entire display
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
            kCGWindowImageDefault
        );
        
        if (!image) {
            result.error_message = "Failed to create CGImage from display";
            return result;
        }
        
        // For specific display, we need to handle multi-display setups
        if (display_id != CGMainDisplayID()) {
            CGRect display_bounds = CGDisplayBounds(display_id);
            
            // Create image for specific display bounds
            CGImageRelease(image);
            image = CGWindowListCreateImage(
                display_bounds,
                kCGWindowListOptionOnScreenOnly,
                kCGNullWindowID,
                kCGWindowImageDefault
            );
            
            if (!image) {
                result.error_message = "Failed to create CGImage for specific display";
                return result;
            }
        }
        
        Utils::CGImageWrapper image_wrapper(image);
        result = CGImageToScreenshotResult(image);
    }
    
    return result;
}

ScreenshotResult MacOSScreenshotCapture::CaptureWithCoreGraphics(CGDirectDisplayID display_id) {
    ScreenshotResult result;
    
    @autoreleasepool {
        CGImageRef image = CGDisplayCreateImage(display_id);
        
        if (!image) {
            result.error_message = "Failed to create CGImage from display using CoreGraphics";
            return result;
        }
        
        Utils::CGImageWrapper image_wrapper(image);
        result = CGImageToScreenshotResult(image);
    }
    
    return result;
}

CGImageRef MacOSScreenshotCapture::CreateCGImageFromDisplay(CGDirectDisplayID display_id) {
    // Try modern approach first
    CGImageRef image = CGDisplayCreateImage(display_id);
    
    if (image) {
        return image;
    }
    
    // Fallback to window list approach
    CGRect display_bounds = CGDisplayBounds(display_id);
    return CGWindowListCreateImage(
        display_bounds,
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID,
        kCGWindowImageDefault
    );
}

ScreenshotResult MacOSScreenshotCapture::CGImageToScreenshotResult(CGImageRef image) {
    ScreenshotResult result;
    
    if (!image) {
        result.error_message = "Invalid CGImage";
        return result;
    }
    
    @autoreleasepool {
        Utils::CGImageWrapper wrapper(image);
        
        uint32_t width = wrapper.GetWidth();
        uint32_t height = wrapper.GetHeight();
        uint32_t bits_per_pixel = wrapper.GetBitsPerPixel();
        uint32_t bytes_per_row = wrapper.GetBytesPerRow();
        
        // Ensure we have RGBA format (32 bits per pixel)
        if (bits_per_pixel != 32) {
            result.error_message = "Unsupported pixel format - expected 32 bits per pixel";
            return result;
        }
        
        // Get bitmap data
        uint32_t stride;
        uint32_t bytes_per_pixel_out;
        void* bitmap_data = GetBitmapDataFromCGImage(image, &width, &height, &stride, &bytes_per_pixel_out);
        
        if (!bitmap_data) {
            result.error_message = "Failed to get bitmap data from CGImage";
            return result;
        }
        
        // Calculate total data size
        size_t data_size = static_cast<size_t>(height) * stride;
        
        // Allocate result buffer and copy data
        result.data = std::make_unique<uint8_t[]>(data_size);
        std::memcpy(result.data.get(), bitmap_data, data_size);
        
        // Set result properties
        result.width = width;
        result.height = height;
        result.stride = stride;
        result.bytes_per_pixel = bytes_per_pixel_out;
        result.success = true;
        
        // Cleanup
        ReleaseBitmapData(bitmap_data);
    }
    
    return result;
}

void* MacOSScreenshotCapture::GetBitmapDataFromCGImage(CGImageRef image, uint32_t* width, 
                                                       uint32_t* height, uint32_t* stride,
                                                       uint32_t* bytes_per_pixel) {
    if (!image) return nullptr;
    
    @autoreleasepool {
        *width = static_cast<uint32_t>(CGImageGetWidth(image));
        *height = static_cast<uint32_t>(CGImageGetHeight(image));
        *bytes_per_pixel = 4; // RGBA
        *stride = *width * *bytes_per_pixel;
        
        // Create bitmap context
        CGColorSpaceRef color_space = Utils::ColorSpaceManager::GetRGBColorSpace();
        if (!color_space) return nullptr;
        
        // Allocate bitmap data
        size_t data_size = static_cast<size_t>(*height) * *stride;
        void* bitmap_data = malloc(data_size);
        if (!bitmap_data) return nullptr;
        
        CGContextRef context = CGBitmapContextCreate(
            bitmap_data,
            *width,
            *height,
            8,  // bits per component
            *stride,
            color_space,
            kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
        );
        
        if (!context) {
            free(bitmap_data);
            return nullptr;
        }
        
        // Draw the image into the bitmap context
        CGRect rect = CGRectMake(0, 0, *width, *height);
        CGContextDrawImage(context, rect, image);
        
        // Cleanup
        CGContextRelease(context);
        
        return bitmap_data;
    }
}

void MacOSScreenshotCapture::ReleaseBitmapData(void* bitmap_data) {
    if (bitmap_data) {
        free(bitmap_data);
    }
}

float MacOSScreenshotCapture::GetDisplayScaleFactor(CGDirectDisplayID display_id) {
    @autoreleasepool {
        // Get the display mode
        CGDisplayModeRef mode = CGDisplayCopyDisplayMode(display_id);
        if (!mode) return 1.0f;
        
        // Calculate scale factor
        size_t pixel_width = CGDisplayModeGetPixelWidth(mode);
        size_t width = CGDisplayModeGetWidth(mode);
        
        CGDisplayModeRelease(mode);
        
        if (width == 0) return 1.0f;
        
        return static_cast<float>(pixel_width) / static_cast<float>(width);
    }
}

void MacOSScreenshotCapture::ApplyRetinaScaling(DisplayInfo& info, CGDirectDisplayID display_id) {
    float scale = GetDisplayScaleFactor(display_id);
    info.scale_factor = scale;
    
    // The width/height from CGDisplayBounds are in points, not pixels
    // For Retina displays, multiply by scale factor to get actual pixel dimensions
    if (scale > 1.0f) {
        info.width = static_cast<uint32_t>(info.width * scale);
        info.height = static_cast<uint32_t>(info.height * scale);
    }
}

// Utility functions implementation
namespace Utils {

bool IsMacOS10_14OrLater() {
    if (@available(macOS 10.14, *)) {
        return true;
    }
    return false;
}

bool IsMacOS10_15OrLater() {
    if (@available(macOS 10.15, *)) {
        return true;
    }
    return false;
}

bool IsMacOS12OrLater() {
    if (@available(macOS 12.0, *)) {
        return true;
    }
    return false;
}

std::vector<CGDirectDisplayID> GetActiveDisplays() {
    std::vector<CGDirectDisplayID> displays;
    
    uint32_t max_displays = 32;
    CGDirectDisplayID display_ids[max_displays];
    uint32_t display_count;
    
    CGError error = CGGetActiveDisplayList(max_displays, display_ids, &display_count);
    
    if (error == kCGErrorSuccess) {
        for (uint32_t i = 0; i < display_count; ++i) {
            displays.push_back(display_ids[i]);
        }
    }
    
    return displays;
}

DisplayInfo DisplayIDToDisplayInfo(CGDirectDisplayID display_id, uint32_t index) {
    DisplayInfo info;
    
    @autoreleasepool {
        info.index = index;
        
        CGRect bounds = CGDisplayBounds(display_id);
        info.width = static_cast<uint32_t>(bounds.size.width);
        info.height = static_cast<uint32_t>(bounds.size.height);
        info.x = static_cast<int32_t>(bounds.origin.x);
        info.y = static_cast<int32_t>(bounds.origin.y);
        
        info.is_primary = (display_id == CGMainDisplayID());
        
        // Get display name
        NSString* display_name = @"Unknown Display";
        
        if (IsMacOS10_15OrLater()) {
            // Use newer API if available
            CFStringRef name = CGDisplayCreateUUIDFromDisplayID(display_id);
            if (name) {
                display_name = (__bridge NSString*)name;
                CFRelease(name);
            }
        }
        
        info.name = [display_name UTF8String];
        
        // Apply Retina scaling
        macOS::MacOSScreenshotCapture::ApplyRetinaScaling(info, display_id);
    }
    
    return info;
}

PermissionStatus GetScreenRecordingPermissionStatus() {
    if (!IsMacOS10_14OrLater()) {
        return PermissionStatus::Authorized;
    }
    
    @autoreleasepool {
        // Try to capture a small area to test permission
        CGImageRef test_image = CGWindowListCreateImage(
            CGRectMake(0, 0, 1, 1),
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
            kCGWindowImageDefault
        );
        
        if (test_image) {
            CGImageRelease(test_image);
            return PermissionStatus::Authorized;
        } else {
            return PermissionStatus::Denied;
        }
    }
}

bool RequestScreenRecordingPermissionAsync() {
    if (!IsMacOS10_14OrLater()) {
        return true;
    }
    
    @autoreleasepool {
        // Create a dummy CGImage request to trigger permission prompt
        CGImageRef test_image = CGWindowListCreateImage(
            CGRectMake(0, 0, 1, 1),
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
            kCGWindowImageDefault
        );
        
        if (test_image) {
            CGImageRelease(test_image);
            return true;
        }
        
        return false;
    }
}

std::string OSStatusToString(int status) {
    @autoreleasepool {
        NSError* error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
        return [[error localizedDescription] UTF8String];
    }
}

std::string GetLastCoreGraphicsError() {
    return "CoreGraphics error occurred";
}

// CFDataWrapper implementation
CFDataWrapper::CFDataWrapper(CFDataRef data) : data_(data) {
    if (data_) {
        CFRetain(data_);
    }
}

CFDataWrapper::~CFDataWrapper() {
    if (data_) {
        CFRelease(data_);
    }
}

const uint8_t* CFDataWrapper::GetData() const {
    return data_ ? CFDataGetBytePtr(data_) : nullptr;
}

size_t CFDataWrapper::GetLength() const {
    return data_ ? CFDataGetLength(data_) : 0;
}

bool CFDataWrapper::IsValid() const {
    return data_ != nullptr;
}

// CGImageWrapper implementation
CGImageWrapper::CGImageWrapper(CGImageRef image) : image_(image) {
    // Note: We don't retain here as we assume ownership is transferred
}

CGImageWrapper::~CGImageWrapper() {
    if (image_) {
        CGImageRelease(image_);
    }
}

uint32_t CGImageWrapper::GetWidth() const {
    return image_ ? static_cast<uint32_t>(CGImageGetWidth(image_)) : 0;
}

uint32_t CGImageWrapper::GetHeight() const {
    return image_ ? static_cast<uint32_t>(CGImageGetHeight(image_)) : 0;
}

uint32_t CGImageWrapper::GetBitsPerPixel() const {
    return image_ ? static_cast<uint32_t>(CGImageGetBitsPerPixel(image_)) : 0;
}

uint32_t CGImageWrapper::GetBytesPerRow() const {
    return image_ ? static_cast<uint32_t>(CGImageGetBytesPerRow(image_)) : 0;
}

// ColorSpaceManager implementation
CGColorSpaceRef ColorSpaceManager::rgb_color_space_ = nullptr;

CGColorSpaceRef ColorSpaceManager::GetRGBColorSpace() {
    if (!rgb_color_space_) {
        rgb_color_space_ = CGColorSpaceCreateWithName(kCGColorSpaceGenericRGB);
    }
    return rgb_color_space_;
}

void ColorSpaceManager::ReleaseColorSpace(CGColorSpaceRef color_space) {
    if (color_space) {
        CGColorSpaceRelease(color_space);
    }
}

} // namespace Utils

} // namespace macOS

// Factory function implementation for macOS
#if !defined(_WIN32) && !defined(__linux__)
std::unique_ptr<ScreenshotCapture> CreateScreenshotCapture() {
    return std::make_unique<macOS::MacOSScreenshotCapture>();
}
#endif

} // namespace WebPScreenshot

#endif // __APPLE__