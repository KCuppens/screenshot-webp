#pragma once

#include <windows.h>
#include <cstdint>

namespace ScreenshotWebP {
namespace Windows {

struct DisplayInfo {
    int index;
    int x, y;
    uint32_t width, height;
    bool isPrimary;
    char deviceName[256];
};

class GDIFallback {
public:
    GDIFallback();
    ~GDIFallback();

    // Initialize for a specific display
    bool Initialize(int displayIndex);

    // Capture a frame (caller must free with FreeFrameData)
    bool CaptureFrame(uint8_t** data, uint32_t* width, uint32_t* height, uint32_t* stride);

    // Free frame data allocated by CaptureFrame
    void FreeFrameData(uint8_t* data);

    // Get number of displays
    static int GetDisplayCount();

    // Get display information
    static DisplayInfo GetDisplayInfo(int displayIndex);

private:
    void Cleanup();

    int displayIndex_ = 0;
    uint32_t displayWidth_ = 0;
    uint32_t displayHeight_ = 0;
    int displayX_ = 0;
    int displayY_ = 0;

    HDC screenDC_;
    HDC memoryDC_;
    HBITMAP bitmap_;
    void* bitmapData_;
};

} // namespace Windows
} // namespace ScreenshotWebP