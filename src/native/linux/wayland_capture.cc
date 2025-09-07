#ifdef __linux__
#ifdef HAVE_WAYLAND

#include "screenshot.h"
#include <wayland-client.h>
#include <wayland-client-protocol.h>
#include <cstring>
#include <unistd.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <errno.h>

// Note: In a real implementation, these would be generated from the 
// wlr-screencopy-unstable-v1.xml protocol file
// For now, we'll provide stub implementations

namespace WebPScreenshot {
namespace Linux {

// WaylandImplementation class implementation
WaylandImplementation::WaylandImplementation() 
    : is_supported_(false), display_(nullptr), registry_(nullptr), 
      screencopy_manager_(nullptr) {
}

WaylandImplementation::~WaylandImplementation() {
    DisconnectFromDisplay();
}

bool WaylandImplementation::Initialize() {
    if (is_supported_) return true;
    
    try {
        if (!ConnectToDisplay()) {
            return false;
        }
        
        EnumerateOutputs();
        
        is_supported_ = screencopy_manager_ != nullptr && !wayland_displays_.empty();
        return is_supported_;
        
    } catch (const std::exception& e) {
        DisconnectFromDisplay();
        return false;
    }
}

bool WaylandImplementation::ConnectToDisplay() {
    display_ = wl_display_connect(nullptr);
    if (!display_) {
        return false;
    }
    
    registry_ = wl_display_get_registry(display_);
    if (!registry_) {
        wl_display_disconnect(display_);
        display_ = nullptr;
        return false;
    }
    
    // Set up registry listeners
    static const struct wl_registry_listener registry_listener = {
        RegistryGlobalHandler,
        RegistryGlobalRemoveHandler
    };
    
    wl_registry_add_listener(registry_, &registry_listener, this);
    
    // Roundtrip to get all globals
    wl_display_roundtrip(display_);
    
    return true;
}

void WaylandImplementation::DisconnectFromDisplay() {
    wayland_displays_.clear();
    
    if (screencopy_manager_) {
        // zwlr_screencopy_manager_v1_destroy(screencopy_manager_);
        screencopy_manager_ = nullptr;
    }
    
    if (registry_) {
        wl_registry_destroy(registry_);
        registry_ = nullptr;
    }
    
    if (display_) {
        wl_display_disconnect(display_);
        display_ = nullptr;
    }
}

void WaylandImplementation::EnumerateOutputs() {
    // This would normally be handled through the registry global handler
    // For now, we'll create a default display entry
    WaylandDisplayInfo default_display;
    default_display.output = nullptr;
    default_display.name = "Wayland Display";
    default_display.description = "Default Wayland Output";
    default_display.x = 0;
    default_display.y = 0;
    default_display.width = 1920; // Default resolution
    default_display.height = 1080;
    default_display.scale = 1;
    default_display.is_primary = true;
    
    wayland_displays_.push_back(default_display);
}

std::vector<DisplayInfo> WaylandImplementation::GetDisplays() {
    std::vector<DisplayInfo> displays;
    
    for (size_t i = 0; i < wayland_displays_.size(); ++i) {
        const auto& wayland_display = wayland_displays_[i];
        
        DisplayInfo info;
        info.index = static_cast<uint32_t>(i);
        info.width = static_cast<uint32_t>(wayland_display.width);
        info.height = static_cast<uint32_t>(wayland_display.height);
        info.x = wayland_display.x;
        info.y = wayland_display.y;
        info.scale_factor = static_cast<float>(wayland_display.scale);
        info.is_primary = wayland_display.is_primary;
        info.name = wayland_display.name;
        
        displays.push_back(info);
    }
    
    return displays;
}

ScreenshotResult WaylandImplementation::CaptureDisplay(uint32_t display_index) {
    ScreenshotResult result;
    
    if (display_index >= wayland_displays_.size()) {
        result.error_message = "Display index out of range";
        return result;
    }
    
    if (!screencopy_manager_) {
        result.error_message = "wlr-screencopy protocol not available";
        return result;
    }
    
    const auto& display_info = wayland_displays_[display_index];
    return CaptureWithScreencopy(display_info.output);
}

ScreenshotResult WaylandImplementation::CaptureWithScreencopy(struct wl_output* output) {
    ScreenshotResult result;
    
    if (!screencopy_manager_) {
        result.error_message = "wlr-screencopy manager not available";
        return result;
    }
    
    // Find display info for this output
    const WaylandDisplayInfo* display_info = nullptr;
    for (const auto& display : wayland_displays_) {
        if (display.output == output) {
            display_info = &display;
            break;
        }
    }
    
    if (!display_info) {
        result.error_message = "Output not found in display list";
        return result;
    }
    
    // Create screenshot frame context
    ScreencopyContext context;
    context.result = &result;
    context.width = display_info->width;
    context.height = display_info->height;
    context.format = 0;
    context.stride = 0;
    context.finished = false;
    context.failed = false;
    
    // Create screencopy frame
    // Note: In a real implementation, we would use the actual wlr-screencopy protocol
    // For now, we'll simulate the process but mark as not implemented
    
    // Setup shared memory buffer
    const uint32_t bytes_per_pixel = 4; // RGBA
    const size_t buffer_size = display_info->width * display_info->height * bytes_per_pixel;
    
    // Create shared memory file
    int shm_fd = CreateSharedMemoryFile(buffer_size);
    if (shm_fd < 0) {
        result.error_message = "Failed to create shared memory file";
        return result;
    }
    
    // Map the shared memory
    void* shm_data = mmap(nullptr, buffer_size, PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd, 0);
    if (shm_data == MAP_FAILED) {
        close(shm_fd);
        result.error_message = "Failed to map shared memory";
        return result;
    }
    
    // In a complete implementation, we would:
    // 1. Create a wl_shm_pool from the fd
    // 2. Create a wl_buffer from the pool
    // 3. Create a zwlr_screencopy_frame_v1 
    // 4. Set up proper event handlers
    // 5. Wait for the frame to complete
    
    // For now, we'll return an error indicating the feature is not fully implemented
    munmap(shm_data, buffer_size);
    close(shm_fd);
    
    result.error_message = "Wayland screencopy requires full wlr-screencopy protocol implementation";
    result.success = false;
    
    return result;
}

int WaylandImplementation::CreateSharedMemoryFile(size_t size) {
    // Create a temporary file for shared memory
    char name[] = "/tmp/webp-screenshot-XXXXXX";
    int fd = mkstemp(name);
    if (fd < 0) {
        return -1;
    }
    
    // Unlink the file so it's automatically cleaned up
    unlink(name);
    
    // Resize the file
    if (ftruncate(fd, size) < 0) {
        close(fd);
        return -1;
    }
    
    return fd;
}

// Static Wayland protocol handlers
void WaylandImplementation::RegistryGlobalHandler(void* data, struct wl_registry* registry,
                                                uint32_t name, const char* interface, 
                                                uint32_t version) {
    WaylandImplementation* impl = static_cast<WaylandImplementation*>(data);
    
    if (std::strcmp(interface, "wl_output") == 0) {
        struct wl_output* output = static_cast<struct wl_output*>(
            wl_registry_bind(registry, name, &wl_output_interface, std::min(version, 2U)));
        
        static const struct wl_output_listener output_listener = {
            OutputGeometryHandler,
            OutputModeHandler,
            OutputDoneHandler,
            OutputScaleHandler
        };
        
        wl_output_add_listener(output, &output_listener, impl);
        
        // Add to displays list
        WaylandDisplayInfo display_info;
        display_info.output = output;
        display_info.name = "Wayland Output " + std::to_string(impl->wayland_displays_.size());
        impl->wayland_displays_.push_back(display_info);
        
    } else if (std::strcmp(interface, "zwlr_screencopy_manager_v1") == 0) {
        // impl->screencopy_manager_ = static_cast<struct zwlr_screencopy_manager_v1*>(
        //     wl_registry_bind(registry, name, &zwlr_screencopy_manager_v1_interface, version));
        // Note: This requires the actual protocol implementation
    }
}

void WaylandImplementation::RegistryGlobalRemoveHandler(void* data, struct wl_registry* registry,
                                                      uint32_t name) {
    // Handle removal of global objects
}

void WaylandImplementation::OutputGeometryHandler(void* data, struct wl_output* output,
                                                int32_t x, int32_t y, int32_t physical_width,
                                                int32_t physical_height, int32_t subpixel,
                                                const char* make, const char* model,
                                                int32_t transform) {
    WaylandImplementation* impl = static_cast<WaylandImplementation*>(data);
    
    // Find the corresponding display and update geometry
    for (auto& display : impl->wayland_displays_) {
        if (display.output == output) {
            display.x = x;
            display.y = y;
            display.description = std::string(make) + " " + std::string(model);
            break;
        }
    }
}

void WaylandImplementation::OutputModeHandler(void* data, struct wl_output* output,
                                            uint32_t flags, int32_t width, int32_t height,
                                            int32_t refresh) {
    WaylandImplementation* impl = static_cast<WaylandImplementation*>(data);
    
    // Update display mode information
    for (auto& display : impl->wayland_displays_) {
        if (display.output == output) {
            display.width = width;
            display.height = height;
            display.is_primary = (flags & WL_OUTPUT_MODE_CURRENT) != 0;
            break;
        }
    }
}

void WaylandImplementation::OutputDoneHandler(void* data, struct wl_output* output) {
    // Called when all output information has been sent
}

void WaylandImplementation::OutputScaleHandler(void* data, struct wl_output* output,
                                             int32_t factor) {
    WaylandImplementation* impl = static_cast<WaylandImplementation*>(data);
    
    // Update scale factor
    for (auto& display : impl->wayland_displays_) {
        if (display.output == output) {
            display.scale = factor;
            break;
        }
    }
}

// Screencopy protocol handlers (stubs)
void WaylandImplementation::ScreencopyFrameHandler(void* data, 
                                                 struct zwlr_screencopy_frame_v1* frame,
                                                 uint32_t format, uint32_t width, uint32_t height,
                                                 uint32_t stride) {
    // Handle frame buffer information
}

void WaylandImplementation::ScreencopyReadyHandler(void* data,
                                                 struct zwlr_screencopy_frame_v1* frame,
                                                 uint32_t tv_sec_hi, uint32_t tv_sec_lo,
                                                 uint32_t tv_nsec) {
    // Frame is ready for copying
}

void WaylandImplementation::ScreencopyFailedHandler(void* data,
                                                  struct zwlr_screencopy_frame_v1* frame) {
    // Screencopy operation failed
}

} // namespace Linux
} // namespace WebPScreenshot

#else // !HAVE_WAYLAND

// Stub implementation when Wayland is not available
namespace WebPScreenshot {
namespace Linux {

WaylandImplementation::WaylandImplementation() : is_supported_(false) {}
WaylandImplementation::~WaylandImplementation() {}

bool WaylandImplementation::Initialize() { return false; }
std::vector<DisplayInfo> WaylandImplementation::GetDisplays() { return {}; }
ScreenshotResult WaylandImplementation::CaptureDisplay(uint32_t display_index) {
    ScreenshotResult result;
    result.error_message = "Wayland support not compiled in";
    return result;
}

} // namespace Linux
} // namespace WebPScreenshot

#endif // HAVE_WAYLAND
#endif // __linux__