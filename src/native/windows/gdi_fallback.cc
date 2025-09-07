#include "gdi_fallback.h"
#include <windows.h>
#include <iostream>

namespace ScreenshotWebP {
namespace Windows {

GDIFallback::GDIFallback() : screenDC_(nullptr), memoryDC_(nullptr), bitmap_(nullptr), bitmapData_(nullptr) {
}

GDIFallback::~GDIFallback() {
    Cleanup();
}

bool GDIFallback::Initialize(int displayIndex) {
    displayIndex_ = displayIndex;
    
    // Get display information
    DISPLAY_DEVICE displayDevice;
    displayDevice.cb = sizeof(DISPLAY_DEVICE);
    
    if (!EnumDisplayDevices(nullptr, displayIndex, &displayDevice, 0)) {
        std::cerr << "Failed to enumerate display device " << displayIndex << std::endl;
        return false;
    }
    
    // Get display settings
    DEVMODE devMode;
    devMode.dmSize = sizeof(DEVMODE);
    
    if (!EnumDisplaySettings(displayDevice.DeviceName, ENUM_CURRENT_SETTINGS, &devMode)) {
        std::cerr << "Failed to get display settings for " << displayDevice.DeviceName << std::endl;
        return false;
    }
    
    displayWidth_ = devMode.dmPelsWidth;
    displayHeight_ = devMode.dmPelsHeight;
    displayX_ = devMode.dmPosition.x;
    displayY_ = devMode.dmPosition.y;
    
    // Create device contexts
    screenDC_ = CreateDC(displayDevice.DeviceName, nullptr, nullptr, nullptr);
    if (!screenDC_) {
        std::cerr << "Failed to create screen DC for display " << displayIndex << std::endl;
        return false;
    }
    
    memoryDC_ = CreateCompatibleDC(screenDC_);
    if (!memoryDC_) {
        std::cerr << "Failed to create memory DC" << std::endl;
        Cleanup();
        return false;
    }
    
    // Create DIB for direct pixel access
    BITMAPINFO bmi = {};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = displayWidth_;
    bmi.bmiHeader.biHeight = -static_cast<LONG>(displayHeight_); // Negative for top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;
    bmi.bmiHeader.biSizeImage = displayWidth_ * displayHeight_ * 4;
    
    bitmap_ = CreateDIBSection(memoryDC_, &bmi, DIB_RGB_COLORS, &bitmapData_, nullptr, 0);
    if (!bitmap_ || !bitmapData_) {
        std::cerr << "Failed to create DIB section" << std::endl;
        Cleanup();
        return false;
    }
    
    // Select bitmap into memory DC
    HGDIOBJ oldBitmap = SelectObject(memoryDC_, bitmap_);
    if (!oldBitmap) {
        std::cerr << "Failed to select bitmap into memory DC" << std::endl;
        Cleanup();
        return false;
    }
    
    return true;
}

bool GDIFallback::CaptureFrame(uint8_t** data, uint32_t* width, uint32_t* height, uint32_t* stride) {
    if (!screenDC_ || !memoryDC_ || !bitmap_ || !bitmapData_) {
        std::cerr << "GDI fallback not initialized" << std::endl;
        return false;
    }
    
    // Capture screen to memory DC
    BOOL result = BitBlt(
        memoryDC_, 0, 0, displayWidth_, displayHeight_,
        screenDC_, 0, 0,
        SRCCOPY
    );
    
    if (!result) {
        std::cerr << "BitBlt failed: " << GetLastError() << std::endl;
        return false;
    }
    
    // Allocate output buffer
    uint32_t outputStride = displayWidth_ * 4;
    uint32_t outputSize = outputStride * displayHeight_;
    uint8_t* outputData = new uint8_t[outputSize];
    
    // Copy and convert from BGRA to RGBA if needed
    uint8_t* src = static_cast<uint8_t*>(bitmapData_);
    uint8_t* dst = outputData;
    
    for (uint32_t row = 0; row < displayHeight_; ++row) {
        for (uint32_t col = 0; col < displayWidth_; ++col) {
            uint32_t srcOffset = (row * displayWidth_ + col) * 4;
            uint32_t dstOffset = (row * displayWidth_ + col) * 4;
            
            // GDI gives us BGRA, convert to RGBA
            dst[dstOffset + 0] = src[srcOffset + 2]; // R
            dst[dstOffset + 1] = src[srcOffset + 1]; // G
            dst[dstOffset + 2] = src[srcOffset + 0]; // B
            dst[dstOffset + 3] = 255;               // A (always opaque for desktop)
        }
    }
    
    *data = outputData;
    *width = displayWidth_;
    *height = displayHeight_;
    *stride = outputStride;
    
    return true;
}

void GDIFallback::FreeFrameData(uint8_t* data) {
    delete[] data;
}

void GDIFallback::Cleanup() {
    if (bitmap_) {
        DeleteObject(bitmap_);
        bitmap_ = nullptr;
        bitmapData_ = nullptr;
    }
    
    if (memoryDC_) {
        DeleteDC(memoryDC_);
        memoryDC_ = nullptr;
    }
    
    if (screenDC_) {
        DeleteDC(screenDC_);
        screenDC_ = nullptr;
    }
}

int GDIFallback::GetDisplayCount() {
    return GetSystemMetrics(SM_CMONITORS);
}

DisplayInfo GDIFallback::GetDisplayInfo(int displayIndex) {
    DisplayInfo info{};
    info.index = displayIndex;
    
    DISPLAY_DEVICE displayDevice;
    displayDevice.cb = sizeof(DISPLAY_DEVICE);
    
    if (EnumDisplayDevices(nullptr, displayIndex, &displayDevice, 0)) {
        DEVMODE devMode;
        devMode.dmSize = sizeof(DEVMODE);
        
        if (EnumDisplaySettings(displayDevice.DeviceName, ENUM_CURRENT_SETTINGS, &devMode)) {
            info.x = devMode.dmPosition.x;
            info.y = devMode.dmPosition.y;
            info.width = devMode.dmPelsWidth;
            info.height = devMode.dmPelsHeight;
            info.isPrimary = (devMode.dmPosition.x == 0 && devMode.dmPosition.y == 0);
            
            // Convert device name
            int len = WideCharToMultiByte(CP_UTF8, 0, displayDevice.DeviceName, -1, nullptr, 0, nullptr, nullptr);
            if (len > 0 && len < sizeof(info.deviceName)) {
                WideCharToMultiByte(CP_UTF8, 0, displayDevice.DeviceName, -1, 
                                  reinterpret_cast<char*>(info.deviceName), len, nullptr, nullptr);
            }
        }
    } else {
        // Fallback to primary display info
        info.x = 0;
        info.y = 0;
        info.width = GetSystemMetrics(SM_CXSCREEN);
        info.height = GetSystemMetrics(SM_CYSCREEN);
        info.isPrimary = true;
    }
    
    return info;
}

} // namespace Windows  
} // namespace ScreenshotWebP