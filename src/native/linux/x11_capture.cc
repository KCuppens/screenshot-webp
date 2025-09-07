#ifdef __linux__

#include "screenshot.h"
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#include <X11/extensions/Xrandr.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <cstring>
#include <algorithm>

namespace WebPScreenshot {
namespace Linux {

// X11Implementation class implementation
X11Implementation::X11Implementation() 
    : is_supported_(false), display_(nullptr), screen_count_(0) {
}

X11Implementation::~X11Implementation() {
    CloseDisplay();
}

bool X11Implementation::Initialize() {
    if (is_supported_) return true;
    
    try {
        if (!OpenDisplay()) {
            return false;
        }
        
        EnumerateScreens();
        
        // Try to enumerate XRandR outputs for better multi-monitor support
        if (CheckXRandRExtension()) {
            EnumerateXRandROutputs();
        }
        
        is_supported_ = !x11_displays_.empty();
        return is_supported_;
        
    } catch (const std::exception& e) {
        CloseDisplay();
        return false;
    }
}

bool X11Implementation::OpenDisplay() {
    // Set error handlers
    XSetErrorHandler(X11ErrorHandler);
    XSetIOErrorHandler(X11IOErrorHandler);
    
    display_ = XOpenDisplay(nullptr);
    if (!display_) {
        return false;
    }
    
    screen_count_ = ScreenCount(display_);
    return screen_count_ > 0;
}

void X11Implementation::CloseDisplay() {
    if (display_) {
        XCloseDisplay(display_);
        display_ = nullptr;
    }
    screen_count_ = 0;
    x11_displays_.clear();
}

void X11Implementation::EnumerateScreens() {
    x11_displays_.clear();
    
    for (int screen = 0; screen < screen_count_; ++screen) {
        X11DisplayInfo info;
        info.screen_number = screen;
        info.root_window = RootWindow(display_, screen);
        info.width = DisplayWidth(display_, screen);
        info.height = DisplayHeight(display_, screen);
        info.depth = GetScreenDepth(screen);
        info.is_primary = (screen == DefaultScreen(display_));
        info.name = "Display " + std::to_string(screen);
        
        x11_displays_.push_back(info);
    }
}

void X11Implementation::EnumerateXRandROutputs() {
    if (!CheckXRandRExtension()) return;
    
    // Clear existing displays and rebuild with XRandR info
    std::vector<X11DisplayInfo> randr_displays;
    
    for (int screen = 0; screen < screen_count_; ++screen) {
        Window root = RootWindow(display_, screen);
        
        XRRScreenResources* screen_resources = XRRGetScreenResources(display_, root);
        if (!screen_resources) continue;
        
        int output_index = 0;
        for (int i = 0; i < screen_resources->noutput; ++i) {
            XRROutputInfo* output_info = XRRGetOutputInfo(display_, screen_resources, 
                                                         screen_resources->outputs[i]);
            if (!output_info || output_info->connection != RR_Connected) {
                XRRFreeOutputInfo(output_info);
                continue;
            }
            
            if (output_info->crtc) {
                XRRCrtcInfo* crtc_info = XRRGetCrtcInfo(display_, screen_resources, 
                                                       output_info->crtc);
                if (crtc_info) {
                    X11DisplayInfo info;
                    info.screen_number = screen;
                    info.root_window = root;
                    info.width = crtc_info->width;
                    info.height = crtc_info->height;
                    info.depth = GetScreenDepth(screen);
                    info.is_primary = (output_info->crtc == screen_resources->outputs[0]);
                    info.name = output_info->name ? std::string(output_info->name) 
                                                 : ("Output " + std::to_string(output_index));
                    
                    randr_displays.push_back(info);
                    output_index++;
                    
                    XRRFreeCrtcInfo(crtc_info);
                }
            }
            
            XRRFreeOutputInfo(output_info);
        }
        
        XRRFreeScreenResources(screen_resources);
    }
    
    // Use XRandR displays if we found any, otherwise keep the basic screen enumeration
    if (!randr_displays.empty()) {
        x11_displays_ = randr_displays;
    }
}

std::vector<DisplayInfo> X11Implementation::GetDisplays() {
    std::vector<DisplayInfo> displays;
    
    for (size_t i = 0; i < x11_displays_.size(); ++i) {
        const auto& x11_display = x11_displays_[i];
        
        DisplayInfo info;
        info.index = static_cast<uint32_t>(i);
        info.width = static_cast<uint32_t>(x11_display.width);
        info.height = static_cast<uint32_t>(x11_display.height);
        info.x = 0; // X11 screens typically start at origin
        info.y = 0;
        info.scale_factor = 1.0f; // X11 doesn't have built-in DPI scaling
        info.is_primary = x11_display.is_primary;
        info.name = x11_display.name;
        
        displays.push_back(info);
    }
    
    return displays;
}

ScreenshotResult X11Implementation::CaptureDisplay(uint32_t display_index) {
    if (display_index >= x11_displays_.size()) {
        ScreenshotResult result;
        result.error_message = "Display index out of range";
        return result;
    }
    
    const auto& display_info = x11_displays_[display_index];
    return CaptureWindow(display_info.root_window);
}

ScreenshotResult X11Implementation::CaptureScreen(int screen_number) {
    if (screen_number >= screen_count_) {
        ScreenshotResult result;
        result.error_message = "Screen number out of range";
        return result;
    }
    
    Window root_window = RootWindow(display_, screen_number);
    return CaptureWindow(root_window);
}

ScreenshotResult X11Implementation::CaptureWindow(Window window) {
    ScreenshotResult result;
    
    if (!display_) {
        result.error_message = "X11 display not available";
        return result;
    }
    
    // Get window attributes
    XWindowAttributes window_attrs;
    if (XGetWindowAttributes(display_, window, &window_attrs) == 0) {
        result.error_message = "Failed to get window attributes";
        return result;
    }
    
    int width = window_attrs.width;
    int height = window_attrs.height;
    
    if (width <= 0 || height <= 0) {
        result.error_message = "Invalid window dimensions";
        return result;
    }
    
    // Try shared memory extension first for better performance
    if (CheckXShmExtension()) {
        result = CaptureWithXShmGetImage(window, width, height);
        if (result.success) {
            return result;
        }
    }
    
    // Fallback to regular XGetImage
    return CaptureWithXGetImage(window, width, height);
}

ScreenshotResult X11Implementation::CaptureWithXGetImage(Window window, int width, int height) {
    ScreenshotResult result;
    
    Utils::PerformanceTimer timer;
    timer.Start();
    
    // Capture the image
    XImage* ximage = XGetImage(display_, window, 0, 0, width, height, AllPlanes, ZPixmap);
    if (!ximage) {
        result.error_message = "XGetImage failed";
        return result;
    }
    
    // Convert XImage to ScreenshotResult
    result = XImageToScreenshotResult(ximage);
    
    // Cleanup
    XDestroyImage(ximage);
    
    return result;
}

ScreenshotResult X11Implementation::CaptureWithXShmGetImage(Window window, int width, int height) {
    ScreenshotResult result;
    
    if (!CheckXShmExtension()) {
        result.error_message = "X11 Shared Memory extension not available";
        return result;
    }
    
    // Calculate image size and create shared memory segment
    int depth = DefaultDepth(display_, DefaultScreen(display_));
    int bytes_per_pixel = (depth + 7) / 8;
    size_t image_size = width * height * bytes_per_pixel;
    
    // Allocate shared memory
    void* shm_addr = Utils::SharedMemoryHelper::AllocateSharedMemory(image_size);
    if (!shm_addr) {
        return CaptureWithXGetImage(window, width, height); // Fallback
    }
    
    // Create XImage with shared memory
    XImage* ximage = XCreateImage(display_, DefaultVisual(display_, DefaultScreen(display_)),
                                 depth, ZPixmap, 0, static_cast<char*>(shm_addr),
                                 width, height, 32, 0);
    
    if (!ximage) {
        Utils::SharedMemoryHelper::FreeSharedMemory(shm_addr, image_size);
        return CaptureWithXGetImage(window, width, height); // Fallback
    }
    
    // Get the image using shared memory
    if (XShmGetImage(display_, window, ximage, 0, 0, AllPlanes) == False) {
        XDestroyImage(ximage);
        Utils::SharedMemoryHelper::FreeSharedMemory(shm_addr, image_size);
        return CaptureWithXGetImage(window, width, height); // Fallback
    }
    
    // Convert to ScreenshotResult
    result = XImageToScreenshotResult(ximage);
    
    // Cleanup
    XDestroyImage(ximage);
    Utils::SharedMemoryHelper::FreeSharedMemory(shm_addr, image_size);
    
    return result;
}

ScreenshotResult X11Implementation::XImageToScreenshotResult(XImage* ximage) {
    ScreenshotResult result;
    
    if (!ximage) {
        result.error_message = "Invalid XImage";
        return result;
    }
    
    uint32_t width = static_cast<uint32_t>(ximage->width);
    uint32_t height = static_cast<uint32_t>(ximage->height);
    uint32_t bytes_per_pixel = 4; // We'll convert everything to RGBA32
    uint32_t stride = width * bytes_per_pixel;
    
    // Detect pixel format
    Utils::PixelFormat format = Utils::DetectPixelFormat(
        ximage->depth, ximage->bits_per_pixel,
        ximage->red_mask, ximage->green_mask, ximage->blue_mask
    );
    
    // Allocate output buffer using memory pool
    size_t output_size = static_cast<size_t>(height) * stride;
    result.data = Utils::AllocateScreenshotBuffer(output_size);
    result.data_size = static_cast<uint32_t>(output_size);
    
    // Convert pixel data
    ConvertPixelFormat(ximage, result.data.get());
    
    // Set result properties
    result.width = width;
    result.height = height;
    result.stride = stride;
    result.bytes_per_pixel = bytes_per_pixel;
    result.success = true;
    
    return result;
}

void X11Implementation::ConvertPixelFormat(XImage* ximage, uint8_t* output_buffer) {
    uint32_t pixel_count = static_cast<uint32_t>(ximage->width * ximage->height);
    
    // Detect pixel format
    Utils::PixelFormat format = Utils::DetectPixelFormat(
        ximage->depth, ximage->bits_per_pixel,
        ximage->red_mask, ximage->green_mask, ximage->blue_mask
    );
    
    switch (format) {
        case Utils::PixelFormat::RGBA32:
            // Direct copy
            std::memcpy(output_buffer, ximage->data, pixel_count * 4);
            break;
            
        case Utils::PixelFormat::BGRA32:
            // Use SIMD-optimized BGRA to RGBA conversion
            SIMD::ConvertBGRAToRGBA(
                reinterpret_cast<const uint8_t*>(ximage->data),
                output_buffer, pixel_count
            );
            break;
            
        case Utils::PixelFormat::RGB24:
        case Utils::PixelFormat::BGR24:
            Utils::ConvertRGB24ToRGBA32(
                reinterpret_cast<const uint8_t*>(ximage->data),
                output_buffer, pixel_count
            );
            break;
            
        case Utils::PixelFormat::RGB16:
        case Utils::PixelFormat::BGR16:
            Utils::ConvertRGB16ToRGBA32(
                reinterpret_cast<const uint8_t*>(ximage->data),
                output_buffer, pixel_count
            );
            break;
            
        default:
            // Fallback: try to extract RGB values pixel by pixel
            for (int y = 0; y < ximage->height; ++y) {
                for (int x = 0; x < ximage->width; ++x) {
                    unsigned long pixel = XGetPixel(ximage, x, y);
                    uint32_t offset = (y * ximage->width + x) * 4;
                    
                    // Extract RGB components (this is a generic approach)
                    output_buffer[offset] = (pixel & ximage->red_mask) >> 16;     // R
                    output_buffer[offset + 1] = (pixel & ximage->green_mask) >> 8; // G
                    output_buffer[offset + 2] = (pixel & ximage->blue_mask);       // B
                    output_buffer[offset + 3] = 255;                               // A
                }
            }
            break;
    }
}

bool X11Implementation::CheckXShmExtension() {
    int major_opcode, first_event, first_error;
    return XQueryExtension(display_, "MIT-SHM", &major_opcode, &first_event, &first_error) == True;
}

bool X11Implementation::CheckXRandRExtension() {
    int major_opcode, first_event, first_error;
    return XQueryExtension(display_, "RANDR", &major_opcode, &first_event, &first_error) == True;
}

int X11Implementation::GetScreenDepth(int screen) {
    return DefaultDepth(display_, screen);
}

Window X11Implementation::GetRootWindow(int screen) {
    return RootWindow(display_, screen);
}

// X11 error handlers (static functions)
int X11Implementation::X11ErrorHandler(Display* display, void* error_event) {
    // In a real implementation, we'd properly handle X11 errors
    // For now, just continue execution
    return 0;
}

int X11Implementation::X11IOErrorHandler(Display* display) {
    // X11 IO errors are usually fatal
    return 0;
}

} // namespace Linux
} // namespace WebPScreenshot

#endif // __linux__