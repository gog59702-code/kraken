cmake_minimum_required(VERSION 3.25)
project(rbx_ext LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui
    GIT_TAG        v1.91.5)
FetchContent_MakeAvailable(imgui)

add_library(imgui_backends STATIC
    ${imgui_SOURCE_DIR}/backends/imgui_impl_dx11.cpp
    ${imgui_SOURCE_DIR}/backends/imgui_impl_win32.cpp)
target_link_libraries(imgui_backends PUBLIC imgui d3d11)
target_include_directories(imgui_backends PUBLIC ${imgui_SOURCE_DIR}/backends)

add_executable(rbx_ext WIN32 overlay.cpp)
target_include_directories(rbx_ext PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(rbx_ext PRIVATE imgui_backends d3d11 dxgi dwmapi)
target_compile_options(rbx_ext PRIVATE /W4 /permissive- /O2)
