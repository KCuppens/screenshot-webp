#ifdef _WIN32

#include "screenshot.h"
#include <windows.h>
#include <gdiplus.h>
#include <dwmapi.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.System.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <thread>
#include <chrono>

#include <algorithm>
#include <sstream>

#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "shcore.lib")

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Graphics::Capture;
using namespace Windows::Graphics::DirectX;
using namespace Windows::Graphics::DirectX::Direct3D11;
using namespace Windows::Graphics::Imaging;

namespace WebPScreenshot {
namespace Windows {

// WindowsScreenshotCapture implementation
WindowsScreenshotCapture::WindowsScreenshotCapture() 
    : use_graphics_capture_(false), initialized_(false) {
    Initialize();
}

WindowsScreenshotCapture::~WindowsScreenshotCapture() = default;

void WindowsScreenshotCapture::Initialize() {
    if (initialized_) return;
    
    try {
        // Try Graphics Capture API first (Windows 10 1803+)
        if (CheckGraphicsCaptureSupport()) {
            graphics_capture_ = std::make_unique<GraphicsCaptureImpl>();
            if (graphics_capture_->Initialize() && graphics_capture_->IsSupported()) {
                use_graphics_capture_ = true;
            }
        }
        
        // Initialize GDI+ fallback
        if (!use_graphics_capture_) {
            gdi_impl_ = std::make_unique<GDIPlusImpl>();
            gdi_impl_->Initialize();
        }
        
        initialized_ = true;
    } catch (const std::exception&) {
        // Fall back to GDI+ if Graphics Capture initialization fails
        if (!gdi_impl_) {
            gdi_impl_ = std::make_unique<GDIPlusImpl>();
            gdi_impl_->Initialize();
        }
        use_graphics_capture_ = false;
        initialized_ = true;
    }
}

bool WindowsScreenshotCapture::CheckGraphicsCaptureSupport() {
    try {
        return Utils::IsWindows10OrGreater() && 
               winrt::Windows::Graphics::Capture::GraphicsCaptureSession::IsSupported();
    } catch (...) {
        return false;
    }
}

std::vector<DisplayInfo> WindowsScreenshotCapture::GetDisplays() {
    if (!initialized_) Initialize();
    
    if (use_graphics_capture_ && graphics_capture_) {
        return graphics_capture_->GetDisplays();
    } else if (gdi_impl_) {
        return gdi_impl_->GetDisplays();
    }
    
    return {};
}

ScreenshotResult WindowsScreenshotCapture::CaptureDisplay(uint32_t display_index) {
    if (!initialized_) Initialize();
    
    ScreenshotResult result;
    
    try {
        if (use_graphics_capture_ && graphics_capture_) {
            result = graphics_capture_->CaptureDisplay(display_index);
        } else if (gdi_impl_) {
            result = gdi_impl_->CaptureDisplay(display_index);
        } else {
            result.error_message = "No screenshot implementation available";
            return result;
        }
    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = std::string("Exception during capture: ") + e.what();
    }
    
    return result;
}

std::vector<ScreenshotResult> WindowsScreenshotCapture::CaptureAllDisplays() {
    if (!initialized_) Initialize();
    
    std::vector<ScreenshotResult> results;
    std::vector<DisplayInfo> displays = GetDisplays();
    
    for (uint32_t i = 0; i < displays.size(); ++i) {
        results.push_back(CaptureDisplay(i));
    }
    
    return results;
}

bool WindowsScreenshotCapture::IsSupported() {
    if (!initialized_) Initialize();
    
    return (use_graphics_capture_ && graphics_capture_ && graphics_capture_->IsSupported()) ||
           (gdi_impl_ && gdi_impl_->IsSupported());
}

std::string WindowsScreenshotCapture::GetImplementationName() {
    if (!initialized_) Initialize();
    
    if (use_graphics_capture_) {
        return "Windows.Graphics.Capture";
    } else {
        return "GDI+";
    }
}

// GraphicsCaptureImpl implementation
GraphicsCaptureImpl::GraphicsCaptureImpl() 
    : is_supported_(false), com_initialized_(false) {}

GraphicsCaptureImpl::~GraphicsCaptureImpl() {
    CleanupCOM();
}

bool GraphicsCaptureImpl::Initialize() {
    try {
        if (!InitializeCOM()) {
            return false;
        }
        
        // Check if Graphics Capture is supported
        if (!GraphicsCaptureSession::IsSupported()) {
            return false;
        }
        
        EnumerateDisplays();
        is_supported_ = true;
        return true;
        
    } catch (...) {
        CleanupCOM();
        return false;
    }
}

bool GraphicsCaptureImpl::InitializeCOM() {
    try {
        winrt::init_apartment(winrt::apartment_type::single_threaded);
        com_initialized_ = true;
        return true;
    } catch (...) {
        return false;
    }
}

void GraphicsCaptureImpl::CleanupCOM() {
    if (com_initialized_) {
        // WinRT cleanup is automatic
        com_initialized_ = false;
    }
}

void GraphicsCaptureImpl::EnumerateDisplays() {
    display_handles_.clear();
    
    std::vector<Utils::MonitorInfo> monitors = Utils::EnumerateMonitors();
    
    for (size_t i = 0; i < monitors.size(); ++i) {
        DisplayHandle handle;
        handle.monitor_handle = monitors[i].handle;
        handle.adapter_name = monitors[i].device_name;
        handle.info = Utils::MonitorInfoToDisplayInfo(monitors[i], static_cast<uint32_t>(i));
        
        display_handles_.push_back(handle);
    }
}

std::vector<DisplayInfo> GraphicsCaptureImpl::GetDisplays() {
    std::vector<DisplayInfo> displays;
    
    for (const auto& handle : display_handles_) {
        displays.push_back(handle.info);
    }
    
    return displays;
}

ScreenshotResult GraphicsCaptureImpl::CaptureDisplay(uint32_t display_index) {
    ScreenshotResult result;
    
    if (display_index >= display_handles_.size()) {
        result.error_message = "Display index out of range";
        return result;
    }
    
    try {
        return CaptureWithGraphicsCapture(display_handles_[display_index].monitor_handle);
    } catch (const std::exception& e) {
        result.error_message = std::string("Graphics Capture failed: ") + e.what();
        return result;
    }
}

ScreenshotResult GraphicsCaptureImpl::CaptureWithGraphicsCapture(void* monitor_handle) {
    ScreenshotResult result;
    
    try {
        // Create capture item from monitor
        auto interop = winrt::get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
        winrt::com_ptr<IGraphicsCaptureItem> capture_item_native;
        
        HRESULT hr = interop->CreateForMonitor(
            static_cast<HMONITOR>(monitor_handle),
            winrt::guid_of<IGraphicsCaptureItem>(),
            capture_item_native.put_void()
        );
        
        if (FAILED(hr)) {
            result.error_message = "Failed to create capture item";
            return result;
        }
        
        auto capture_item = capture_item_native.as<GraphicsCaptureItem>();
        
        // Create D3D11 device
        winrt::com_ptr<ID3D11Device> d3d_device;
        winrt::com_ptr<ID3D11DeviceContext> d3d_context;
        
        D3D_FEATURE_LEVEL feature_levels[] = {
            D3D_FEATURE_LEVEL_11_1,
            D3D_FEATURE_LEVEL_11_0
        };
        
        hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_HARDWARE,
            nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            feature_levels,
            ARRAYSIZE(feature_levels),
            D3D11_SDK_VERSION,
            d3d_device.put(),
            nullptr,
            d3d_context.put()
        );
        
        if (FAILED(hr)) {
            result.error_message = "Failed to create D3D11 device";
            return result;
        }
        
        // Get DXGI device for WinRT interop
        auto dxgi_device = d3d_device.as<IDXGIDevice>();
        winrt::com_ptr<IInspectable> inspectable;
        hr = CreateDirect3D11DeviceFromDXGIDevice(dxgi_device.get(), inspectable.put());
        
        if (FAILED(hr)) {
            result.error_message = "Failed to create Direct3D11 device from DXGI";
            return result;
        }
        
        auto d3d_device_winrt = inspectable.as<IDirect3DDevice>();
        
        // Get capture item size
        auto item_size = capture_item.Size();
        
        // Create frame pool with optimized settings
        auto frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            d3d_device_winrt,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2, // Double buffering for better performance
            item_size
        );
        
        // Create capture session with optimizations
        auto session = frame_pool.CreateCaptureSession(capture_item);
        
        // Enable cursor capture for better user experience
        session.IsCursorCaptureEnabled(true);
        
        // Enable border exclusion for cleaner captures
        session.IsBorderRequired(false);
        
        // Set up frame capture synchronization
        bool frame_captured = false;
        std::exception_ptr capture_exception;
        winrt::com_ptr<ID3D11Texture2D> captured_texture;
        
        // Frame arrived handler
        frame_pool.FrameArrived([&](auto&& sender, auto&&) {
            try {
                if (auto frame = sender.TryGetNextFrame()) {
                    // Get the Direct3D surface
                    auto access = frame.Surface().as<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
                    
                    winrt::com_ptr<IDXGISurface> dxgi_surface;
                    hr = access->GetInterface(winrt::guid_of<IDXGISurface>(), dxgi_surface.put_void());
                    
                    if (SUCCEEDED(hr)) {
                        // Get texture from DXGI surface
                        hr = dxgi_surface->QueryInterface(captured_texture.put());
                    }
                }
                frame_captured = true;
            }
            catch (...) {
                capture_exception = std::current_exception();
                frame_captured = true;
            }
        });
        
        // Start capture
        session.StartCapture();
        
        // Wait for frame with timeout
        auto start_time = std::chrono::steady_clock::now();
        const auto timeout = std::chrono::milliseconds(3000);
        
        while (!frame_captured) {
            if (std::chrono::steady_clock::now() - start_time > timeout) {
                session.Close();
                result.error_message = "Capture timeout";
                return result;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        
        session.Close();
        frame_pool.Close();
        
        if (capture_exception) {
            std::rethrow_exception(capture_exception);
        }
        
        if (!captured_texture) {
            result.error_message = "No frame captured";
            return result;
        }
        
        // Get texture description
        D3D11_TEXTURE2D_DESC desc;
        captured_texture->GetDesc(&desc);
        
        // Create optimized staging texture with memory pool integration
        D3D11_TEXTURE2D_DESC staging_desc = desc;
        staging_desc.Usage = D3D11_USAGE_STAGING;
        staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        staging_desc.BindFlags = 0;
        staging_desc.MiscFlags = 0;
        
        // Use cached staging texture if available (GPU memory pool concept)
        static thread_local winrt::com_ptr<ID3D11Texture2D> cached_staging_texture;
        static thread_local uint32_t cached_width = 0, cached_height = 0;
        
        winrt::com_ptr<ID3D11Texture2D> staging_texture;
        
        if (cached_staging_texture && cached_width >= desc.Width && cached_height >= desc.Height) {
            // Reuse cached staging texture for better performance
            staging_texture = cached_staging_texture;
        } else {
            // Create new staging texture
            hr = d3d_device->CreateTexture2D(&staging_desc, nullptr, staging_texture.put());
            
            if (FAILED(hr)) {
                result.error_message = "Failed to create staging texture";
                return result;
            }
            
            // Cache for future use
            cached_staging_texture = staging_texture;
            cached_width = desc.Width;
            cached_height = desc.Height;
        }
        
        // Use asynchronous copy for better GPU pipeline utilization
        d3d_context->CopyResource(staging_texture.get(), captured_texture.get());
        
        // Flush GPU commands to ensure copy completion
        d3d_context->Flush();
        
        // Map staging texture
        D3D11_MAPPED_SUBRESOURCE mapped;
        hr = d3d_context->Map(staging_texture.get(), 0, D3D11_MAP_READ, 0, &mapped);
        
        if (FAILED(hr)) {
            result.error_message = "Failed to map staging texture";
            return result;
        }
        
        // Copy and convert pixel data (BGRA -> RGBA)
        const uint32_t width = desc.Width;
        const uint32_t height = desc.Height;
        const uint32_t bytes_per_pixel = 4;
        const uint32_t data_size = width * height * bytes_per_pixel;
        
        result.data = Utils::AllocateScreenshotBuffer(data_size);
        
        const uint8_t* src = static_cast<const uint8_t*>(mapped.pData);
        uint8_t* dst = result.data.get();
        
        // Fast SIMD-optimized BGRA to RGBA conversion
        if (mapped.RowPitch == width * bytes_per_pixel) {
            // Contiguous memory - can convert in one pass
            SIMD::ConvertBGRAToRGBA(src, dst, width * height);
        } else {
            // Row padding - convert row by row
            for (uint32_t y = 0; y < height; ++y) {
                const uint8_t* src_row = src + y * mapped.RowPitch;
                uint8_t* dst_row = dst + y * width * bytes_per_pixel;
                SIMD::ConvertBGRAToRGBA(src_row, dst_row, width);
            }
        }
        
        d3d_context->Unmap(staging_texture.get(), 0);
        
        // Fill result
        result.success = true;
        result.width = width;
        result.height = height;
        result.bytes_per_pixel = bytes_per_pixel;
        result.data_size = data_size;
        result.stride = width * bytes_per_pixel;
        result.format = "RGBA";
        result.implementation = "Windows Graphics Capture";
        
        return result;
        
    } catch (const std::exception& e) {
        result.error_message = "Graphics Capture error: " + std::string(e.what());
        return result;
    } catch (...) {
        result.error_message = "Unknown Graphics Capture error";
        return result;
    }
}

// GDIPlusImpl implementation
GDIPlusImpl::GDIPlusImpl() 
    : is_supported_(false), gdiplus_initialized_(false), gdiplus_token_(0) {}

GDIPlusImpl::~GDIPlusImpl() {
    if (gdiplus_initialized_) {
        Gdiplus::GdiplusShutdown(gdiplus_token_);
    }
}

bool GDIPlusImpl::Initialize() {
    Gdiplus::GdiplusStartupInput startup_input;
    Gdiplus::Status status = Gdiplus::GdiplusStartup(&gdiplus_token_, &startup_input, nullptr);
    
    if (status == Gdiplus::Ok) {
        gdiplus_initialized_ = true;
        is_supported_ = true;
        return true;
    }
    
    return false;
}

std::vector<DisplayInfo> GDIPlusImpl::GetDisplays() {
    std::vector<DisplayInfo> displays;
    
    MonitorEnumData data;
    data.displays = &displays;
    data.index = 0;
    
    EnumDisplayMonitors(nullptr, nullptr, MonitorEnumProc, reinterpret_cast<LPARAM>(&data));
    
    return displays;
}

BOOL CALLBACK GDIPlusImpl::MonitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor, 
                                          LPRECT lprcMonitor, LPARAM dwData) {
    MonitorEnumData* data = reinterpret_cast<MonitorEnumData*>(dwData);
    
    MONITORINFOEX monitor_info;
    monitor_info.cbSize = sizeof(MONITORINFOEX);
    
    if (GetMonitorInfo(hMonitor, &monitor_info)) {
        DisplayInfo info;
        info.index = data->index++;
        info.width = lprcMonitor->right - lprcMonitor->left;
        info.height = lprcMonitor->bottom - lprcMonitor->top;
        info.x = lprcMonitor->left;
        info.y = lprcMonitor->top;
        info.scale_factor = 1.0f; // TODO: Get actual DPI scaling
        info.is_primary = (monitor_info.dwFlags & MONITORINFOF_PRIMARY) != 0;
        info.name = Utils::WStringToString(monitor_info.szDevice);
        
        data->displays->push_back(info);
    }
    
    return TRUE;
}

ScreenshotResult GDIPlusImpl::CaptureDisplay(uint32_t display_index) {
    std::vector<DisplayInfo> displays = GetDisplays();
    
    if (display_index >= displays.size()) {
        ScreenshotResult result;
        result.error_message = "Display index out of range";
        return result;
    }
    
    return CaptureWithGDI(displays[display_index]);
}

ScreenshotResult GDIPlusImpl::CaptureWithGDI(const DisplayInfo& display) {
    ScreenshotResult result;
    
    HDC screen_dc = GetDC(nullptr);
    if (!screen_dc) {
        result.error_message = "Failed to get screen DC";
        return result;
    }
    
    HDC mem_dc = CreateCompatibleDC(screen_dc);
    if (!mem_dc) {
        ReleaseDC(nullptr, screen_dc);
        result.error_message = "Failed to create memory DC";
        return result;
    }
    
    uint32_t stride;
    HBITMAP bitmap = static_cast<HBITMAP>(CreateDIBSection(mem_dc, display.width, display.height, &stride));
    
    if (!bitmap) {
        DeleteDC(mem_dc);
        ReleaseDC(nullptr, screen_dc);
        result.error_message = "Failed to create DIB section";
        return result;
    }
    
    HBITMAP old_bitmap = static_cast<HBITMAP>(SelectObject(mem_dc, bitmap));
    
    if (!CopyScreenToDIB(screen_dc, mem_dc, bitmap, display.width, display.height, display.x, display.y)) {
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(nullptr, screen_dc);
        result.error_message = "Failed to copy screen to DIB";
        return result;
    }
    
    // Get bitmap data
    DIBSECTION dib_section;
    if (GetObject(bitmap, sizeof(DIBSECTION), &dib_section) == 0) {
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(nullptr, screen_dc);
        result.error_message = "Failed to get bitmap object info";
        return result;
    }
    
    // Allocate result buffer using memory pool
    uint32_t data_size = stride * display.height;
    result.data = Utils::AllocateScreenshotBuffer(data_size);
    
    // Copy bitmap data
    memcpy(result.data.get(), dib_section.dsBm.bmBits, data_size);
    
    result.width = display.width;
    result.height = display.height;
    result.stride = stride;
    result.bytes_per_pixel = 4; // BGRA
    result.success = true;
    
    // Cleanup
    SelectObject(mem_dc, old_bitmap);
    DeleteObject(bitmap);
    DeleteDC(mem_dc);
    ReleaseDC(nullptr, screen_dc);
    
    return result;
}

void* GDIPlusImpl::CreateDIBSection(HDC hdc, uint32_t width, uint32_t height, uint32_t* stride) {
    BITMAPINFO bmp_info = {};
    bmp_info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmp_info.bmiHeader.biWidth = width;
    bmp_info.bmiHeader.biHeight = -static_cast<int>(height); // Top-down DIB
    bmp_info.bmiHeader.biPlanes = 1;
    bmp_info.bmiHeader.biBitCount = 32;
    bmp_info.bmiHeader.biCompression = BI_RGB;
    
    *stride = ((width * 32 + 31) / 32) * 4; // 4-byte alignment
    
    void* bits;
    return CreateDIBSection(hdc, &bmp_info, DIB_RGB_COLORS, &bits, nullptr, 0);
}

bool GDIPlusImpl::CopyScreenToDIB(HDC src_dc, HDC dst_dc, HBITMAP dst_bitmap, 
                                 uint32_t width, uint32_t height, int src_x, int src_y) {
    return BitBlt(dst_dc, 0, 0, width, height, src_dc, src_x, src_y, SRCCOPY) != FALSE;
}

// Utility functions
namespace Utils {

std::string GetWindowsVersionString() {
    OSVERSIONINFOEX os_info = {};
    os_info.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
    
    // Note: GetVersionEx is deprecated but still works for basic version info
    if (GetVersionEx(reinterpret_cast<OSVERSIONINFO*>(&os_info))) {
        std::ostringstream oss;
        oss << "Windows " << os_info.dwMajorVersion << "." << os_info.dwMinorVersion;
        oss << " Build " << os_info.dwBuildNumber;
        return oss.str();
    }
    
    return "Windows (unknown version)";
}

bool IsWindows10OrGreater() {
    OSVERSIONINFOEX os_info = {};
    os_info.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
    os_info.dwMajorVersion = 10;
    os_info.dwMinorVersion = 0;
    
    DWORDLONG condition_mask = 0;
    VER_SET_CONDITION(condition_mask, VER_MAJORVERSION, VER_GREATER_EQUAL);
    VER_SET_CONDITION(condition_mask, VER_MINORVERSION, VER_GREATER_EQUAL);
    
    return VerifyVersionInfo(&os_info, VER_MAJORVERSION | VER_MINORVERSION, condition_mask) != FALSE;
}

bool IsWindows8OrGreater() {
    OSVERSIONINFOEX os_info = {};
    os_info.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
    os_info.dwMajorVersion = 6;
    os_info.dwMinorVersion = 2;
    
    DWORDLONG condition_mask = 0;
    VER_SET_CONDITION(condition_mask, VER_MAJORVERSION, VER_GREATER_EQUAL);
    VER_SET_CONDITION(condition_mask, VER_MINORVERSION, VER_GREATER_EQUAL);
    
    return VerifyVersionInfo(&os_info, VER_MAJORVERSION | VER_MINORVERSION, condition_mask) != FALSE;
}

std::string GetLastErrorString() {
    DWORD error = GetLastError();
    if (error == 0) return "No error";
    
    LPSTR message_buffer = nullptr;
    size_t size = FormatMessageA(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                                nullptr, error, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPSTR)&message_buffer, 0, nullptr);
    
    std::string message(message_buffer, size);
    LocalFree(message_buffer);
    
    return message;
}

std::wstring StringToWString(const std::string& str) {
    if (str.empty()) return std::wstring();
    
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), nullptr, 0);
    std::wstring result(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &result[0], size_needed);
    
    return result;
}

std::string WStringToString(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), nullptr, 0, nullptr, nullptr);
    std::string result(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &result[0], size_needed, nullptr, nullptr);
    
    return result;
}

std::vector<MonitorInfo> EnumerateMonitors() {
    std::vector<MonitorInfo> monitors;
    
    struct EnumData {
        std::vector<MonitorInfo>* monitors;
    };
    
    EnumData data;
    data.monitors = &monitors;
    
    auto enum_proc = [](HMONITOR hMonitor, HDC hdcMonitor, LPRECT lprcMonitor, LPARAM dwData) -> BOOL {
        EnumData* data = reinterpret_cast<EnumData*>(dwData);
        
        MONITORINFOEX monitor_info;
        monitor_info.cbSize = sizeof(MONITORINFOEX);
        
        if (GetMonitorInfo(hMonitor, &monitor_info)) {
            MonitorInfo info;
            info.handle = hMonitor;
            info.rect = monitor_info.rcMonitor;
            info.work_rect = monitor_info.rcWork;
            info.device_name = WStringToString(monitor_info.szDevice);
            info.is_primary = (monitor_info.dwFlags & MONITORINFOF_PRIMARY) != 0;
            
            data->monitors->push_back(info);
        }
        
        return TRUE;
    };
    
    EnumDisplayMonitors(nullptr, nullptr, enum_proc, reinterpret_cast<LPARAM>(&data));
    
    return monitors;
}

DisplayInfo MonitorInfoToDisplayInfo(const MonitorInfo& monitor, uint32_t index) {
    DisplayInfo info;
    info.index = index;
    info.width = monitor.rect.right - monitor.rect.left;
    info.height = monitor.rect.bottom - monitor.rect.top;
    info.x = monitor.rect.left;
    info.y = monitor.rect.top;
    info.scale_factor = 1.0f; // TODO: Get actual DPI scaling
    info.is_primary = monitor.is_primary;
    info.name = monitor.device_name;
    
    return info;
}

} // namespace Utils

} // namespace Windows

// Factory function implementation
std::unique_ptr<ScreenshotCapture> CreateScreenshotCapture() {
    return std::make_unique<Windows::WindowsScreenshotCapture>();
}

} // namespace WebPScreenshot

#endif // _WIN32