#pragma once

#ifdef __linux__

#include "../common/screenshot_common.h"
#include <vector>
#include <memory>
#include <string>
#include <cstdint>

// Forward declarations for X11 types
typedef struct _XDisplay Display;
typedef unsigned long Window;
typedef unsigned long Atom;
typedef struct _XImage XImage;
typedef struct _XWindowAttributes XWindowAttributes;
typedef struct _XRRScreenResources XRRScreenResources;
typedef struct _XRROutputInfo XRROutputInfo;
typedef struct _XRRCrtcInfo XRRCrtcInfo;

// Forward declarations for Wayland types
struct wl_display;
struct wl_registry;
struct wl_output;
struct zwlr_screencopy_manager_v1;
struct zwlr_screencopy_frame_v1;

namespace WebPScreenshot {
namespace Linux {

// Display server type enumeration
enum class DisplayServerType {
    Unknown,
    X11,
    Wayland,
    Mir  // Future support
};

class LinuxScreenshotCapture : public ScreenshotCapture {
public:
    LinuxScreenshotCapture();
    ~LinuxScreenshotCapture() override;
    
    // ScreenshotCapture interface
    std::vector<DisplayInfo> GetDisplays() override;
    ScreenshotResult CaptureDisplay(uint32_t display_index) override;
    std::vector<ScreenshotResult> CaptureAllDisplays() override;
    bool IsSupported() override;
    std::string GetImplementationName() override;

private:
    bool initialized_;
    DisplayServerType display_server_;
    
    std::unique_ptr<class X11Implementation> x11_impl_;
    std::unique_ptr<class WaylandImplementation> wayland_impl_;
    
    void Initialize();
    DisplayServerType DetectDisplayServer();
    
    // Common display information structure
    struct LinuxDisplayHandle {
        uint32_t index;
        DisplayInfo info;
        
        // X11 specific
        int x11_screen_number = -1;
        Window x11_root_window = 0;
        
        // Wayland specific  
        struct wl_output* wayland_output = nullptr;
        std::string wayland_name;
    };
    
    std::vector<LinuxDisplayHandle> display_handles_;
};

// X11 implementation
class X11Implementation {
public:
    X11Implementation();
    ~X11Implementation();
    
    bool Initialize();
    bool IsSupported() const { return is_supported_; }
    
    std::vector<DisplayInfo> GetDisplays();
    ScreenshotResult CaptureDisplay(uint32_t display_index);
    ScreenshotResult CaptureScreen(int screen_number);
    ScreenshotResult CaptureWindow(Window window);
    
private:
    bool is_supported_;
    Display* display_;
    int screen_count_;
    
    struct X11DisplayInfo {
        int screen_number;
        Window root_window;
        int width, height;
        int depth;
        std::string name;
        bool is_primary;
    };
    
    std::vector<X11DisplayInfo> x11_displays_;
    
    bool OpenDisplay();
    void CloseDisplay();
    void EnumerateScreens();
    void EnumerateXRandROutputs();
    
    // Screenshot capture methods
    ScreenshotResult CaptureWithXGetImage(Window window, int width, int height);
    ScreenshotResult CaptureWithXShmGetImage(Window window, int width, int height);
    
    // Image processing
    ScreenshotResult XImageToScreenshotResult(XImage* ximage);
    void ConvertPixelFormat(XImage* ximage, uint8_t* output_buffer);
    
    // Utility methods
    bool CheckXShmExtension();
    bool CheckXRandRExtension();
    int GetScreenDepth(int screen);
    Window GetRootWindow(int screen);
    
    // Error handling
    static int X11ErrorHandler(Display* display, void* error_event);
    static int X11IOErrorHandler(Display* display);
};

// Wayland implementation
class WaylandImplementation {
public:
    WaylandImplementation();
    ~WaylandImplementation();
    
    bool Initialize();
    bool IsSupported() const { return is_supported_; }
    
    std::vector<DisplayInfo> GetDisplays();
    ScreenshotResult CaptureDisplay(uint32_t display_index);
    
private:
    bool is_supported_;
    struct wl_display* display_;
    struct wl_registry* registry_;
    struct zwlr_screencopy_manager_v1* screencopy_manager_;
    
    struct WaylandDisplayInfo {
        struct wl_output* output;
        std::string name;
        std::string description;
        int x, y;
        int width, height;
        int scale;
        bool is_primary;
    };
    
    std::vector<WaylandDisplayInfo> wayland_displays_;
    
    bool ConnectToDisplay();
    void DisconnectFromDisplay();
    void EnumerateOutputs();
    
    // Screenshot capture
    ScreenshotResult CaptureWithScreencopy(struct wl_output* output);
    
    // Helper methods
    int CreateSharedMemoryFile(size_t size);
    
    // Screencopy context for managing capture state
    struct ScreencopyContext {
        ScreenshotResult* result;
        uint32_t width;
        uint32_t height;
        uint32_t format;
        uint32_t stride;
        bool finished;
        bool failed;
        void* shm_data;
        size_t shm_size;
    };
    
    // Wayland protocol handlers
    static void RegistryGlobalHandler(void* data, struct wl_registry* registry,
                                    uint32_t name, const char* interface, 
                                    uint32_t version);
    static void RegistryGlobalRemoveHandler(void* data, struct wl_registry* registry,
                                          uint32_t name);
    static void OutputGeometryHandler(void* data, struct wl_output* output,
                                    int32_t x, int32_t y, int32_t physical_width,
                                    int32_t physical_height, int32_t subpixel,
                                    const char* make, const char* model,
                                    int32_t transform);
    static void OutputModeHandler(void* data, struct wl_output* output,
                                uint32_t flags, int32_t width, int32_t height,
                                int32_t refresh);
    static void OutputDoneHandler(void* data, struct wl_output* output);
    static void OutputScaleHandler(void* data, struct wl_output* output,
                                 int32_t factor);
    
    // Screencopy handlers
    static void ScreencopyFrameHandler(void* data, 
                                     struct zwlr_screencopy_frame_v1* frame,
                                     uint32_t format, uint32_t width, uint32_t height,
                                     uint32_t stride);
    static void ScreencopyReadyHandler(void* data,
                                     struct zwlr_screencopy_frame_v1* frame,
                                     uint32_t tv_sec_hi, uint32_t tv_sec_lo,
                                     uint32_t tv_nsec);
    static void ScreencopyFailedHandler(void* data,
                                      struct zwlr_screencopy_frame_v1* frame);
};

// Utility functions
namespace Utils {
    // Display server detection
    DisplayServerType DetectDisplayServer();
    bool IsX11Available();
    bool IsWaylandAvailable();
    std::string GetDisplayServerName(DisplayServerType type);
    
    // Environment variable helpers
    std::string GetEnvironmentVariable(const char* name);
    bool IsEnvironmentVariableSet(const char* name);
    
    // X11 utilities
    std::string GetX11DisplayName();
    int GetX11ScreenCount();
    
    // Wayland utilities  
    std::string GetWaylandDisplayName();
    bool IsWaylandCompositorRunning();
    std::vector<std::string> GetAvailableWaylandProtocols();
    
    // Color format conversion
    void ConvertBGRA32ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count);
    void ConvertRGB24ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count);
    void ConvertRGB16ToRGBA32(const uint8_t* input, uint8_t* output, uint32_t pixel_count);
    
    // Pixel format detection
    enum class PixelFormat {
        Unknown,
        RGB24,
        BGR24,
        RGBA32,
        BGRA32,
        RGB16,
        BGR16,
        RGB15,
        BGR15
    };
    
    PixelFormat DetectPixelFormat(int depth, int bits_per_pixel, 
                                uint32_t red_mask, uint32_t green_mask, uint32_t blue_mask);
    std::string PixelFormatToString(PixelFormat format);
    
    // Memory management helpers
    class SharedMemoryHelper {
    public:
        static void* AllocateSharedMemory(size_t size);
        static void FreeSharedMemory(void* ptr, size_t size);
        static bool IsSharedMemoryAvailable();
    };
    
    // Error handling
    std::string GetLinuxErrorString(int error_code);
    std::string GetX11ErrorString(int error_code);
    void LogX11Error(const std::string& operation, int error_code);
    
    // Distribution detection
    struct LinuxDistribution {
        std::string name;
        std::string version;
        std::string codename;
        std::string desktop_environment;
    };
    
    LinuxDistribution DetectLinuxDistribution();
    std::vector<std::string> GetInstalledPackages();
    bool IsPackageInstalled(const std::string& package_name);
    
    // Performance utilities
    class PerformanceTimer {
    public:
        PerformanceTimer();
        void Start();
        double ElapsedMilliseconds() const;
        
    private:
        uint64_t start_time_;
    };
}

} // namespace Linux
} // namespace WebPScreenshot

#endif // __linux__