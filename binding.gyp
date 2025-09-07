{
  "targets": [
    {
      "target_name": "webp_screenshot",
      "sources": [
        "src/native/screenshot.cc"
      ],
      "include_dirs": [
      ],
      "defines": [
      ],
      "conditions": [
        [
          "OS==\"win\"",
          {
            "sources": [
            ],
            "libraries": [
              "-lgdi32",
              "-luser32"
            ],
            "defines": [
              "_WIN32_WINNT=0x0A00",
              "WINVER=0x0A00",
              "NOMINMAX",
              "WIN32_LEAN_AND_MEAN"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "Optimization": 2,
                "InlineFunctionExpansion": 2,
                "EnableIntrinsicFunctions": "true",
                "FavorSizeOrSpeed": 1,
                "AdditionalOptions": [
                  "/std:c++17",
                  "/arch:AVX2",
                  "/GL",
                  "/Oi",
                  "/fp:fast"
                ]
              },
              "VCLinkerTool": {
                "LinkTimeCodeGeneration": 1
              }
            }
          }
        ],
        [
          "OS==\"mac\"",
          {
            "sources": [
              "src/native/macos/screenshot.mm",
              "src/native/macos/capture_manager.mm",
              "src/native/macos/permissions.mm"
            ],
            "libraries": [
              "-framework CoreGraphics",
              "-framework CoreFoundation",
              "-framework AppKit",
              "-framework AVFoundation"
            ],
            "xcode_settings": {
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "10.14",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "GCC_OPTIMIZATION_LEVEL": "3",
              "LLVM_LTO": "YES",
              "OTHER_CPLUSPLUSFLAGS": [
                "-march=native",
                "-mavx2",
                "-msse4.1",
                "-flto",
                "-ffast-math",
                "-funroll-loops"
              ]
            }
          }
        ],
        [
          "OS==\"linux\"",
          {
            "sources": [
              "src/native/linux/screenshot.cc",
              "src/native/linux/x11_capture.cc",
              "src/native/linux/wayland_capture.cc"
            ],
            "libraries": [
              "-lX11",
              "-lXrandr",
              "-lXfixes",
              "-lXext"
            ],
            "cflags_cc": [
              "-std=c++17",
              "-fexceptions",
              "-fPIC",
              "-O3",
              "-march=native",
              "-mavx2",
              "-msse4.1",
              "-flto",
              "-ffast-math",
              "-funroll-loops",
              "-finline-functions"
            ],
            "link_settings": {
              "libraries": [
                "-lX11",
                "-lXrandr",
                "-lXfixes",
                "-lXext"
              ],
              "ldflags": [
                "-flto",
                "-O3"
              ]
            },
            "conditions": [
              [
                "pkg-config --exists wayland-client 2>/dev/null",
                {
                  "libraries": [
                    "<!@(pkg-config --libs wayland-client 2>/dev/null || echo '')"
                  ],
                  "include_dirs": [
                    "<!@(pkg-config --cflags-only-I wayland-client 2>/dev/null | sed 's/-I//g' || echo '')"
                  ],
                  "defines": [
                    "HAVE_WAYLAND=1"
                  ]
                },
                {
                  "defines": [
                    "HAVE_WAYLAND=0"
                  ]
                }
              ]
            ]
          }
        ]
      ]
    }
  ]
}