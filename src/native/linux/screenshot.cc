#ifdef __linux__

#include "screenshot.h"
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <chrono>

// X11 includes
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#include <X11/extensions/Xrandr.h>
#include <sys/ipc.h>
#include <sys/shm.h>

// Wayland includes (if available)
#ifdef HAVE_WAYLAND
#include <wayland-client.h>
#include <wayland-client-protocol.h>
// Note: wlr-screencopy protocol headers would be generated from .xml files
#endif

namespace WebPScreenshot {
namespace Linux {

// LinuxScreenshotCapture implementation
LinuxScreenshotCapture::LinuxScreenshotCapture() 
    : initialized_(false), display_server_(DisplayServerType::Unknown) {
    Initialize();
}

LinuxScreenshotCapture::~LinuxScreenshotCapture() = default;

void LinuxScreenshotCapture::Initialize() {
    if (initialized_) return;
    
    try {
        display_server_ = DetectDisplayServer();
        
        switch (display_server_) {
            case DisplayServerType::X11:
                x11_impl_ = std::make_unique<X11Implementation>();
                if (x11_impl_->Initialize()) {
                    initialized_ = true;
                }
                break;
                
            case DisplayServerType::Wayland:
                wayland_impl_ = std::make_unique<WaylandImplementation>();
                if (wayland_impl_->Initialize()) {
                    initialized_ = true;
                }
                // Try X11 as fallback if Wayland fails
                if (!initialized_) {
                    x11_impl_ = std::make_unique<X11Implementation>();
                    if (x11_impl_->Initialize()) {
                        display_server_ = DisplayServerType::X11;
                        initialized_ = true;
                    }
                }
                break;
                
            default:
                // Try X11 as default fallback
                x11_impl_ = std::make_unique<X11Implementation>();
                if (x11_impl_->Initialize()) {
                    display_server_ = DisplayServerType::X11;
                    initialized_ = true;
                }
                break;
        }
        
    } catch (const std::exception& e) {
        initialized_ = false;
    }
}

DisplayServerType LinuxScreenshotCapture::DetectDisplayServer() {
    return Utils::DetectDisplayServer();
}

std::vector<DisplayInfo> LinuxScreenshotCapture::GetDisplays() {
    if (!initialized_) Initialize();
    
    switch (display_server_) {
        case DisplayServerType::X11:
            if (x11_impl_) return x11_impl_->GetDisplays();
            break;
            
        case DisplayServerType::Wayland:
            if (wayland_impl_) return wayland_impl_->GetDisplays();
            // Fallback to X11 if available
            if (x11_impl_) return x11_impl_->GetDisplays();
            break;
            
        default:
            if (x11_impl_) return x11_impl_->GetDisplays();
            break;
    }
    
    return {};
}

ScreenshotResult LinuxScreenshotCapture::CaptureDisplay(uint32_t display_index) {
    if (!initialized_) Initialize();
    
    ScreenshotResult result;
    
    try {
        switch (display_server_) {
            case DisplayServerType::X11:
                if (x11_impl_) {
                    result = x11_impl_->CaptureDisplay(display_index);
                } else {
                    result.error_message = "X11 implementation not available";
                }
                break;
                
            case DisplayServerType::Wayland:
                if (wayland_impl_) {
                    result = wayland_impl_->CaptureDisplay(display_index);
                } else if (x11_impl_) {
                    // Fallback to X11
                    result = x11_impl_->CaptureDisplay(display_index);
                } else {
                    result.error_message = "No screenshot implementation available";
                }
                break;
                
            default:
                if (x11_impl_) {
                    result = x11_impl_->CaptureDisplay(display_index);
                } else {
                    result.error_message = "Unknown display server type";
                }
                break;
        }
        
    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = std::string("Linux screenshot capture failed: ") + e.what();
    }
    
    return result;
}

std::vector<ScreenshotResult> LinuxScreenshotCapture::CaptureAllDisplays() {
    if (!initialized_) Initialize();
    
    std::vector<ScreenshotResult> results;
    std::vector<DisplayInfo> displays = GetDisplays();
    
    for (uint32_t i = 0; i < displays.size(); ++i) {
        results.push_back(CaptureDisplay(i));
    }
    
    return results;
}

bool LinuxScreenshotCapture::IsSupported() {
    return initialized_ && 
           ((x11_impl_ && x11_impl_->IsSupported()) || 
            (wayland_impl_ && wayland_impl_->IsSupported()));
}

std::string LinuxScreenshotCapture::GetImplementationName() {
    switch (display_server_) {
        case DisplayServerType::X11:
            return "X11 (XGetImage)";
        case DisplayServerType::Wayland:
            return wayland_impl_ && wayland_impl_->IsSupported() 
                ? "Wayland (wlr-screencopy)" 
                : "X11 (XGetImage fallback)";
        default:
            return "X11 (XGetImage default)";
    }
}

// Utility functions implementation
namespace Utils {

DisplayServerType DetectDisplayServer() {
    // Check for Wayland first
    if (IsWaylandAvailable()) {
        return DisplayServerType::Wayland;
    }
    
    // Check for X11
    if (IsX11Available()) {
        return DisplayServerType::X11;
    }
    
    return DisplayServerType::Unknown;
}

bool IsX11Available() {
    // Check if DISPLAY environment variable is set
    const char* display_env = std::getenv("DISPLAY");
    if (!display_env) {
        return false;
    }
    
    // Try to open X11 display
    Display* display = XOpenDisplay(nullptr);
    if (display) {
        XCloseDisplay(display);
        return true;
    }
    
    return false;
}

bool IsWaylandAvailable() {
    // Check for Wayland environment variables
    const char* wayland_display = std::getenv("WAYLAND_DISPLAY");
    const char* xdg_session_type = std::getenv("XDG_SESSION_TYPE");
    
    if (wayland_display && std::strlen(wayland_display) > 0) {
        return true;
    }
    
    if (xdg_session_type && std::strcmp(xdg_session_type, "wayland") == 0) {
        return true;
    }
    
#ifdef HAVE_WAYLAND
    // Try to connect to Wayland display
    struct wl_display* display = wl_display_connect(nullptr);
    if (display) {
        wl_display_disconnect(display);
        return true;
    }
#endif
    
    return false;
}

std::string GetDisplayServerName(DisplayServerType type) {
    switch (type) {
        case DisplayServerType::X11:
            return "X11";
        case DisplayServerType::Wayland:
            return "Wayland";
        case DisplayServerType::Mir:
            return "Mir";
        default:
            return "Unknown";
    }
}

std::string GetEnvironmentVariable(const char* name) {
    const char* value = std::getenv(name);
    return value ? std::string(value) : std::string();
}

bool IsEnvironmentVariableSet(const char* name) {
    const char* value = std::getenv(name);
    return value && std::strlen(value) > 0;
}

std::string GetX11DisplayName() {
    return GetEnvironmentVariable("DISPLAY");
}

std::string GetWaylandDisplayName() {
    std::string wayland_display = GetEnvironmentVariable("WAYLAND_DISPLAY");
    if (wayland_display.empty()) {
        wayland_display = "wayland-0"; // Default
    }
    return wayland_display;
}

bool IsWaylandCompositorRunning() {
#ifdef HAVE_WAYLAND
    struct wl_display* display = wl_display_connect(nullptr);
    if (display) {
        wl_display_disconnect(display);
        return true;
    }
#endif
    return false;
}

// Color format conversion functions
void ConvertBGRA32ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count) {
    for (uint32_t i = 0; i < pixel_count; ++i) {
        uint32_t offset = i * 4;
        output[offset] = input[offset + 2];     // R = B
        output[offset + 1] = input[offset + 1]; // G = G
        output[offset + 2] = input[offset];     // B = R
        output[offset + 3] = input[offset + 3]; // A = A
    }
}

void ConvertRGB24ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count) {
    for (uint32_t i = 0; i < pixel_count; ++i) {
        uint32_t in_offset = i * 3;
        uint32_t out_offset = i * 4;
        output[out_offset] = input[in_offset];     // R
        output[out_offset + 1] = input[in_offset + 1]; // G
        output[out_offset + 2] = input[in_offset + 2]; // B
        output[out_offset + 3] = 255;             // A (opaque)
    }
}

void ConvertRGB16ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count) {
    const uint16_t* input16 = reinterpret_cast<const uint16_t*>(input);
    
    for (uint32_t i = 0; i < pixel_count; ++i) {
        uint16_t pixel = input16[i];
        uint32_t offset = i * 4;
        
        // RGB565 format: RRRR RGGG GGGB BBBB
        output[offset] = ((pixel >> 11) & 0x1F) << 3;     // R
        output[offset + 1] = ((pixel >> 5) & 0x3F) << 2;  // G
        output[offset + 2] = (pixel & 0x1F) << 3;         // B
        output[offset + 3] = 255;                          // A
    }
}

PixelFormat DetectPixelFormat(int depth, int bits_per_pixel, 
                            uint32_t red_mask, uint32_t green_mask, uint32_t blue_mask) {
    if (bits_per_pixel == 32) {
        if (red_mask == 0x00FF0000 && green_mask == 0x0000FF00 && blue_mask == 0x000000FF) {
            return PixelFormat::RGBA32;
        } else if (red_mask == 0x000000FF && green_mask == 0x0000FF00 && blue_mask == 0x00FF0000) {
            return PixelFormat::BGRA32;
        }
    } else if (bits_per_pixel == 24) {
        if (red_mask == 0xFF0000 && green_mask == 0x00FF00 && blue_mask == 0x0000FF) {
            return PixelFormat::RGB24;
        } else if (red_mask == 0x0000FF && green_mask == 0x00FF00 && blue_mask == 0xFF0000) {
            return PixelFormat::BGR24;
        }
    } else if (bits_per_pixel == 16) {
        if (red_mask == 0xF800 && green_mask == 0x07E0 && blue_mask == 0x001F) {
            return PixelFormat::RGB16;
        } else if (red_mask == 0x001F && green_mask == 0x07E0 && blue_mask == 0xF800) {
            return PixelFormat::BGR16;
        }
    } else if (bits_per_pixel == 15) {
        if (red_mask == 0x7C00 && green_mask == 0x03E0 && blue_mask == 0x001F) {
            return PixelFormat::RGB15;
        } else if (red_mask == 0x001F && green_mask == 0x03E0 && blue_mask == 0x7C00) {
            return PixelFormat::BGR15;
        }
    }
    
    return PixelFormat::Unknown;
}

std::string PixelFormatToString(PixelFormat format) {
    switch (format) {
        case PixelFormat::RGB24: return "RGB24";
        case PixelFormat::BGR24: return "BGR24";
        case PixelFormat::RGBA32: return "RGBA32";
        case PixelFormat::BGRA32: return "BGRA32";
        case PixelFormat::RGB16: return "RGB16";
        case PixelFormat::BGR16: return "BGR16";
        case PixelFormat::RGB15: return "RGB15";
        case PixelFormat::BGR15: return "BGR15";
        default: return "Unknown";
    }
}

// Shared memory helper implementation
void* SharedMemoryHelper::AllocateSharedMemory(size_t size) {
    int shm_id = shmget(IPC_PRIVATE, size, IPC_CREAT | 0666);
    if (shm_id == -1) {
        return nullptr;
    }
    
    void* ptr = shmat(shm_id, nullptr, 0);
    if (ptr == (void*)-1) {
        shmctl(shm_id, IPC_RMID, nullptr);
        return nullptr;
    }
    
    // Mark for deletion when no processes are attached
    shmctl(shm_id, IPC_RMID, nullptr);
    
    return ptr;
}

void SharedMemoryHelper::FreeSharedMemory(void* ptr, size_t size) {
    if (ptr && ptr != (void*)-1) {
        shmdt(ptr);
    }
}

bool SharedMemoryHelper::IsSharedMemoryAvailable() {
    // Test if we can create a small shared memory segment
    void* test_ptr = AllocateSharedMemory(4096);
    if (test_ptr) {
        FreeSharedMemory(test_ptr, 4096);
        return true;
    }
    return false;
}

// Error handling functions
std::string GetLinuxErrorString(int error_code) {
    return std::string(std::strerror(error_code));
}

std::string GetX11ErrorString(int error_code) {
    switch (error_code) {
        case BadRequest: return "BadRequest";
        case BadValue: return "BadValue";
        case BadWindow: return "BadWindow";
        case BadPixmap: return "BadPixmap";
        case BadAtom: return "BadAtom";
        case BadCursor: return "BadCursor";
        case BadFont: return "BadFont";
        case BadMatch: return "BadMatch";
        case BadDrawable: return "BadDrawable";
        case BadAccess: return "BadAccess";
        case BadAlloc: return "BadAlloc";
        case BadColor: return "BadColor";
        case BadGC: return "BadGC";
        case BadIDChoice: return "BadIDChoice";
        case BadName: return "BadName";
        case BadLength: return "BadLength";
        case BadImplementation: return "BadImplementation";
        default: return "Unknown X11 error";
    }
}

void LogX11Error(const std::string& operation, int error_code) {
    // In a real implementation, this would log to a proper logging system
    // For now, we'll just store the error for potential later retrieval
}

// Distribution detection
LinuxDistribution DetectLinuxDistribution() {
    LinuxDistribution dist;
    
    // Try reading /etc/os-release first (systemd standard)
    std::ifstream os_release("/etc/os-release");
    if (os_release.is_open()) {
        std::string line;
        while (std::getline(os_release, line)) {
            if (line.find("NAME=") == 0) {
                dist.name = line.substr(5);
                // Remove quotes if present
                if (dist.name.front() == '"' && dist.name.back() == '"') {
                    dist.name = dist.name.substr(1, dist.name.length() - 2);
                }
            } else if (line.find("VERSION=") == 0) {
                dist.version = line.substr(8);
                if (dist.version.front() == '"' && dist.version.back() == '"') {
                    dist.version = dist.version.substr(1, dist.version.length() - 2);
                }
            }
        }
        os_release.close();
    }
    
    // Get desktop environment
    std::string desktop_env = GetEnvironmentVariable("XDG_CURRENT_DESKTOP");
    if (desktop_env.empty()) {
        desktop_env = GetEnvironmentVariable("DESKTOP_SESSION");
    }
    dist.desktop_environment = desktop_env;
    
    return dist;
}

// Performance timer implementation
PerformanceTimer::PerformanceTimer() : start_time_(0) {}

void PerformanceTimer::Start() {
    auto now = std::chrono::high_resolution_clock::now();
    start_time_ = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
}

double PerformanceTimer::ElapsedMilliseconds() const {
    auto now = std::chrono::high_resolution_clock::now();
    uint64_t current_time = std::chrono::duration_cast<std::chrono::nanoseconds>(
        now.time_since_epoch()).count();
    
    return static_cast<double>(current_time - start_time_) / 1000000.0;
}

} // namespace Utils

} // namespace Linux

// Factory function implementation for Linux
#if defined(__linux__) && !defined(_WIN32) && !defined(__APPLE__)
std::unique_ptr<ScreenshotCapture> CreateScreenshotCapture() {
    return std::make_unique<Linux::LinuxScreenshotCapture>();
}
#endif

} // namespace WebPScreenshot

#endif // __linux__