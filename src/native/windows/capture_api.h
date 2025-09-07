#pragma once

#include <windows.h>
#include <cstdint>
#include <memory>

namespace ScreenshotWebP {
namespace Windows {

struct DisplayInfo {
    int index;
    int x, y;
    uint32_t width, height;
    bool isPrimary;
    wchar_t deviceName[32];
};

class CaptureAPI {
public:
    CaptureAPI();
    ~CaptureAPI();

    // Initialize the capture API
    bool Initialize();

    // Setup duplication for a specific display
    bool SetupDuplication(int displayIndex);

    // Capture a frame (caller must free with FreeFrameData)
    bool CaptureFrame(uint8_t** data, uint32_t* width, uint32_t* height, uint32_t* stride);

    // Free frame data allocated by CaptureFrame
    void FreeFrameData(uint8_t* data);

    // Check if modern Windows.Graphics.Capture is available
    static bool IsModernCaptureAvailable();

    // Get number of displays
    static int GetDisplayCount();

    // Get display information
    static DisplayInfo GetDisplayInfo(int displayIndex);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace Windows
} // namespace ScreenshotWebP