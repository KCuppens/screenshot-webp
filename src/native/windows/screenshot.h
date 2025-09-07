#pragma once

#ifdef _WIN32

#include "../common/screenshot_common.h"
#include <windows.h>
#include <vector>
#include <memory>
#include <string>

namespace WebPScreenshot {
namespace Windows {

// Forward declarations
class GraphicsCaptureImpl;
class GDIPlusImpl;

class WindowsScreenshotCapture : public ScreenshotCapture {
public:
    WindowsScreenshotCapture();
    ~WindowsScreenshotCapture() override;
    
    // ScreenshotCapture interface
    std::vector<DisplayInfo> GetDisplays() override;
    ScreenshotResult CaptureDisplay(uint32_t display_index) override;
    std::vector<ScreenshotResult> CaptureAllDisplays() override;
    bool IsSupported() override;
    std::string GetImplementationName() override;

private:
    std::unique_ptr<GraphicsCaptureImpl> graphics_capture_;
    std::unique_ptr<GDIPlusImpl> gdi_impl_;
    bool use_graphics_capture_;
    bool initialized_;
    
    void Initialize();
    bool CheckGraphicsCaptureSupport();
    std::vector<DisplayInfo> EnumerateDisplaysWin32();
};

// Windows Graphics Capture API implementation (Windows 10 1803+)
class GraphicsCaptureImpl {
public:
    GraphicsCaptureImpl();
    ~GraphicsCaptureImpl();
    
    bool Initialize();
    bool IsSupported() const { return is_supported_; }
    
    std::vector<DisplayInfo> GetDisplays();
    ScreenshotResult CaptureDisplay(uint32_t display_index);
    
private:
    bool is_supported_;
    bool com_initialized_;
    
    struct DisplayHandle {
        void* monitor_handle; // HMONITOR
        std::string adapter_name;
        DisplayInfo info;
    };
    
    std::vector<DisplayHandle> display_handles_;
    
    void EnumerateDisplays();
    ScreenshotResult CaptureWithGraphicsCapture(void* monitor_handle);
    
    // COM interface management
    bool InitializeCOM();
    void CleanupCOM();
};

// GDI+ fallback implementation (Windows 7+)
class GDIPlusImpl {
public:
    GDIPlusImpl();
    ~GDIPlusImpl();
    
    bool Initialize();
    bool IsSupported() const { return is_supported_; }
    
    std::vector<DisplayInfo> GetDisplays();
    ScreenshotResult CaptureDisplay(uint32_t display_index);
    
private:
    bool is_supported_;
    bool gdiplus_initialized_;
    ULONG_PTR gdiplus_token_;
    
    struct MonitorEnumData {
        std::vector<DisplayInfo>* displays;
        uint32_t index;
    };
    
    static BOOL CALLBACK MonitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor, 
                                        LPRECT lprcMonitor, LPARAM dwData);
    
    ScreenshotResult CaptureWithGDI(const DisplayInfo& display);
    ScreenshotResult CaptureDesktopGDI();
    
    // Helper methods
    void* CreateDIBSection(HDC hdc, uint32_t width, uint32_t height, uint32_t* stride);
    bool CopyScreenToDIB(HDC src_dc, HDC dst_dc, HBITMAP dst_bitmap, 
                        uint32_t width, uint32_t height, int src_x, int src_y);
};

// Utility functions
namespace Utils {
    std::string GetWindowsVersionString();
    bool IsWindows10OrGreater();
    bool IsWindows8OrGreater();
    std::string GetLastErrorString();
    std::wstring StringToWString(const std::string& str);
    std::string WStringToString(const std::wstring& wstr);
    
    // Display enumeration helpers
    struct MonitorInfo {
        HMONITOR handle;
        RECT rect;
        RECT work_rect;
        std::string device_name;
        bool is_primary;
    };
    
    std::vector<MonitorInfo> EnumerateMonitors();
    DisplayInfo MonitorInfoToDisplayInfo(const MonitorInfo& monitor, uint32_t index);
}

} // namespace Windows
} // namespace WebPScreenshot

#endif // _WIN32