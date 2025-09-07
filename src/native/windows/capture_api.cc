#include "capture_api.h"
#include <windows.h>
#include <dwmapi.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <winrt/base.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <windows.graphics.capture.interop.h>
#include <d3d11_4.h>
#include <iostream>

#pragma comment(lib, "windowsapp")
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "dwmapi.lib")

namespace ScreenshotWebP {
namespace Windows {

struct CaptureAPI::Impl {
    winrt::com_ptr<ID3D11Device> device;
    winrt::com_ptr<ID3D11DeviceContext> context;
    winrt::com_ptr<IDXGIOutputDuplication> duplication;
    winrt::Windows::Graphics::Capture::GraphicsCaptureSession session{nullptr};
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool framePool{nullptr};
    
    bool initialized = false;
    UINT displayWidth = 0;
    UINT displayHeight = 0;
};

CaptureAPI::CaptureAPI() : impl_(std::make_unique<Impl>()) {
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    winrt::init_apartment();
}

CaptureAPI::~CaptureAPI() {
    if (impl_->session) {
        impl_->session.Close();
    }
    if (impl_->framePool) {
        impl_->framePool.Close();
    }
    CoUninitialize();
}

bool CaptureAPI::Initialize() {
    try {
        // Create D3D11 device
        D3D_FEATURE_LEVEL featureLevel;
        HRESULT hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_HARDWARE,
            nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            nullptr, 0,
            D3D11_SDK_VERSION,
            impl_->device.put(),
            &featureLevel,
            impl_->context.put()
        );

        if (FAILED(hr)) {
            std::cerr << "Failed to create D3D11 device: " << std::hex << hr << std::endl;
            return false;
        }

        impl_->initialized = true;
        return true;

    } catch (const std::exception& e) {
        std::cerr << "Exception in CaptureAPI::Initialize: " << e.what() << std::endl;
        return false;
    } catch (...) {
        std::cerr << "Unknown exception in CaptureAPI::Initialize" << std::endl;
        return false;
    }
}

bool CaptureAPI::SetupDuplication(int displayIndex) {
    if (!impl_->initialized) {
        return false;
    }

    try {
        // Get DXGI adapter and output
        winrt::com_ptr<IDXGIDevice> dxgiDevice;
        impl_->device->QueryInterface(IID_PPV_ARGS(dxgiDevice.put()));

        winrt::com_ptr<IDXGIAdapter> adapter;
        dxgiDevice->GetAdapter(adapter.put());

        winrt::com_ptr<IDXGIOutput> output;
        HRESULT hr = adapter->EnumOutputs(displayIndex, output.put());
        if (FAILED(hr)) {
            std::cerr << "Failed to enumerate output " << displayIndex << ": " << std::hex << hr << std::endl;
            return false;
        }

        // Get output1 for duplication
        winrt::com_ptr<IDXGIOutput1> output1;
        hr = output->QueryInterface(IID_PPV_ARGS(output1.put()));
        if (FAILED(hr)) {
            std::cerr << "Failed to get IDXGIOutput1: " << std::hex << hr << std::endl;
            return false;
        }

        // Create desktop duplication
        hr = output1->DuplicateOutput(impl_->device.get(), impl_->duplication.put());
        if (FAILED(hr)) {
            std::cerr << "Failed to create desktop duplication: " << std::hex << hr << std::endl;
            return false;
        }

        // Get output description
        DXGI_OUTPUT_DESC outputDesc;
        output->GetDesc(&outputDesc);
        impl_->displayWidth = outputDesc.DesktopCoordinates.right - outputDesc.DesktopCoordinates.left;
        impl_->displayHeight = outputDesc.DesktopCoordinates.bottom - outputDesc.DesktopCoordinates.top;

        return true;

    } catch (const std::exception& e) {
        std::cerr << "Exception in CaptureAPI::SetupDuplication: " << e.what() << std::endl;
        return false;
    } catch (...) {
        std::cerr << "Unknown exception in CaptureAPI::SetupDuplication" << std::endl;
        return false;
    }
}

bool CaptureAPI::CaptureFrame(uint8_t** data, uint32_t* width, uint32_t* height, uint32_t* stride) {
    if (!impl_->duplication) {
        return false;
    }

    try {
        DXGI_OUTDUPL_FRAME_INFO frameInfo;
        winrt::com_ptr<IDXGIResource> resource;

        // Acquire next frame
        HRESULT hr = impl_->duplication->AcquireNextFrame(1000, &frameInfo, resource.put());
        if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
            return false; // No new frame
        }
        if (FAILED(hr)) {
            std::cerr << "Failed to acquire next frame: " << std::hex << hr << std::endl;
            return false;
        }

        // Get texture from resource
        winrt::com_ptr<ID3D11Texture2D> texture;
        hr = resource->QueryInterface(IID_PPV_ARGS(texture.put()));
        if (FAILED(hr)) {
            impl_->duplication->ReleaseFrame();
            std::cerr << "Failed to get texture from resource: " << std::hex << hr << std::endl;
            return false;
        }

        // Get texture description
        D3D11_TEXTURE2D_DESC textureDesc;
        texture->GetDesc(&textureDesc);

        // Create staging texture for CPU access
        D3D11_TEXTURE2D_DESC stagingDesc = textureDesc;
        stagingDesc.Usage = D3D11_USAGE_STAGING;
        stagingDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        stagingDesc.BindFlags = 0;
        stagingDesc.MiscFlags = 0;

        winrt::com_ptr<ID3D11Texture2D> stagingTexture;
        hr = impl_->device->CreateTexture2D(&stagingDesc, nullptr, stagingTexture.put());
        if (FAILED(hr)) {
            impl_->duplication->ReleaseFrame();
            std::cerr << "Failed to create staging texture: " << std::hex << hr << std::endl;
            return false;
        }

        // Copy to staging texture
        impl_->context->CopyResource(stagingTexture.get(), texture.get());

        // Map staging texture
        D3D11_MAPPED_SUBRESOURCE mappedResource;
        hr = impl_->context->Map(stagingTexture.get(), 0, D3D11_MAP_READ, 0, &mappedResource);
        if (FAILED(hr)) {
            impl_->duplication->ReleaseFrame();
            std::cerr << "Failed to map staging texture: " << std::hex << hr << std::endl;
            return false;
        }

        // Allocate output buffer
        uint32_t outputStride = textureDesc.Width * 4; // BGRA
        uint32_t outputSize = outputStride * textureDesc.Height;
        uint8_t* outputData = new uint8_t[outputSize];

        // Copy data
        uint8_t* src = static_cast<uint8_t*>(mappedResource.pData);
        uint8_t* dst = outputData;
        
        for (uint32_t row = 0; row < textureDesc.Height; ++row) {
            memcpy(dst, src, outputStride);
            src += mappedResource.RowPitch;
            dst += outputStride;
        }

        // Unmap and release
        impl_->context->Unmap(stagingTexture.get(), 0);
        impl_->duplication->ReleaseFrame();

        // Set output parameters
        *data = outputData;
        *width = textureDesc.Width;
        *height = textureDesc.Height;
        *stride = outputStride;

        return true;

    } catch (const std::exception& e) {
        std::cerr << "Exception in CaptureAPI::CaptureFrame: " << e.what() << std::endl;
        return false;
    } catch (...) {
        std::cerr << "Unknown exception in CaptureAPI::CaptureFrame" << std::endl;
        return false;
    }
}

bool CaptureAPI::IsModernCaptureAvailable() {
    try {
        return winrt::Windows::Graphics::Capture::GraphicsCaptureSession::IsSupported();
    } catch (...) {
        return false;
    }
}

int CaptureAPI::GetDisplayCount() {
    int count = 0;
    
    // Try DXGI first
    try {
        winrt::com_ptr<IDXGIFactory1> factory;
        if (SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(factory.put())))) {
            winrt::com_ptr<IDXGIAdapter1> adapter;
            for (UINT i = 0; factory->EnumAdapters1(i, adapter.put()) != DXGI_ERROR_NOT_FOUND; ++i) {
                winrt::com_ptr<IDXGIOutput> output;
                for (UINT j = 0; adapter->EnumOutputs(j, output.put()) != DXGI_ERROR_NOT_FOUND; ++j) {
                    count++;
                    output = nullptr;
                }
                adapter = nullptr;
            }
        }
    } catch (...) {
        // Fall back to GDI
        count = GetSystemMetrics(SM_CMONITORS);
    }
    
    return std::max(1, count);
}

DisplayInfo CaptureAPI::GetDisplayInfo(int displayIndex) {
    DisplayInfo info{};
    
    try {
        // Try to get info from DXGI
        winrt::com_ptr<IDXGIFactory1> factory;
        if (SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(factory.put())))) {
            winrt::com_ptr<IDXGIAdapter1> adapter;
            
            for (UINT i = 0; factory->EnumAdapters1(i, adapter.put()) != DXGI_ERROR_NOT_FOUND; ++i) {
                winrt::com_ptr<IDXGIOutput> output;
                
                for (UINT j = 0; adapter->EnumOutputs(j, output.put()) != DXGI_ERROR_NOT_FOUND; ++j) {
                    if (static_cast<int>(j) == displayIndex) {
                        DXGI_OUTPUT_DESC desc;
                        if (SUCCEEDED(output->GetDesc(&desc))) {
                            info.index = displayIndex;
                            info.x = desc.DesktopCoordinates.left;
                            info.y = desc.DesktopCoordinates.top;
                            info.width = desc.DesktopCoordinates.right - desc.DesktopCoordinates.left;
                            info.height = desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top;
                            info.isPrimary = (desc.DesktopCoordinates.left == 0 && desc.DesktopCoordinates.top == 0);
                            wcscpy_s(info.deviceName, sizeof(info.deviceName)/sizeof(wchar_t), desc.DeviceName);
                        }
                        return info;
                    }
                    output = nullptr;
                }
                adapter = nullptr;
            }
        }
        
        // Fallback to basic info
        info.index = displayIndex;
        info.width = GetSystemMetrics(SM_CXSCREEN);
        info.height = GetSystemMetrics(SM_CYSCREEN);
        info.isPrimary = (displayIndex == 0);
        
    } catch (...) {
        // Return basic primary display info
        info.index = 0;
        info.width = GetSystemMetrics(SM_CXSCREEN);
        info.height = GetSystemMetrics(SM_CYSCREEN);
        info.isPrimary = true;
    }
    
    return info;
}

void CaptureAPI::FreeFrameData(uint8_t* data) {
    delete[] data;
}

} // namespace Windows
} // namespace ScreenshotWebP