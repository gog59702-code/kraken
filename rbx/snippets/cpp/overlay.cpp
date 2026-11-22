#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <dwmapi.h>
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "dwmapi.lib")

#include "imgui.h"
#include "imgui_impl_dx11.h"
#include "imgui_impl_win32.h"

#include "mem.hpp"
#include "sdk.hpp"

#include <chrono>
#include <thread>

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND, UINT, WPARAM, LPARAM);

namespace {

ID3D11Device*           g_dev  = nullptr;
ID3D11DeviceContext*    g_ctx  = nullptr;
IDXGISwapChain*         g_swap = nullptr;
ID3D11RenderTargetView* g_rtv  = nullptr;
HWND                    g_hwnd = nullptr;
bool                    g_run  = true;

mem::Process g_proc;
bool         g_attached = false;

struct PlayerEntry {
    uintptr_t   part{};
    std::string label;
    float       hp{};
};

std::vector<PlayerEntry> g_players;

bool worldToScreen(const float m[4][4], rbx::Vec3 p, ImVec2& out, ImVec2 size) {
    const float w = p.x * m[0][3] + p.y * m[1][3] + p.z * m[2][3] + m[3][3];
    if (w < 0.01f) return false;
    const float x = (p.x * m[0][0] + p.y * m[1][0] + p.z * m[2][0] + m[3][0]) / w;
    const float y = (p.x * m[0][1] + p.y * m[1][1] + p.z * m[2][1] + m[3][1]) / w;
    out.x = size.x * 0.5f * (x + 1.f);
    out.y = size.y * 0.5f * (1.f - y);
    return true;
}

void refreshPlayers() {
    g_players.clear();
    if (!g_attached || !g_proc.alive()) return;

    const uintptr_t dm = rbx::dataModel(g_proc);
    if (!dm) return;

    const uintptr_t workspace = rbx::findChild(g_proc, dm, "Workspace");
    const uintptr_t players   = rbx::findChild(g_proc, dm, "Players");
    if (!workspace || !players) return;

    const uintptr_t local = rbx::findChildByName(g_proc, players, "LocalPlayer");
    const std::string localName = local ? rbx::name(g_proc, local) : std::string{};

    for (uintptr_t plr : rbx::children(g_proc, players)) {
        if (rbx::className(g_proc, plr) != "Player") continue;
        const std::string pname = rbx::name(g_proc, plr);
        if (!localName.empty() && pname == localName) continue;

        const uintptr_t model = rbx::findChild(g_proc, plr, "Model");
        if (!model) continue;

        const uintptr_t hrp = rbx::findChildByName(g_proc, model, "HumanoidRootPart");
        if (!hrp) continue;

        const uintptr_t hum = rbx::findChild(g_proc, model, "Humanoid");
        if (hum && rbx::health(g_proc, hum) <= 0.f) continue;

        PlayerEntry e{};
        e.part  = hrp;
        e.label = pname;
        e.hp    = hum ? rbx::health(g_proc, hum) : 100.f;
        g_players.push_back(std::move(e));
    }
}

void renderMenu() {
    ImGui::SetNextWindowSize(ImVec2(330, 140), ImGuiCond_FirstUseEver);
    ImGui::Begin("rbx_ext");
    ImGui::Text("attached: %s", g_attached ? "yes" : "no");
    if (g_attached) ImGui::Text("pid %lu  base %p", g_proc.pid, (void*)g_proc.base);
    ImGui::Text("players: %zu", g_players.size());
    ImGui::Separator();
    ImGui::TextDisabled("INSERT: menu   END: quit");
    ImGui::End();
}

void renderESP() {
    if (!g_attached) return;

    auto ve = g_proc.read<uintptr_t>(g_proc.base + off::visualengine);
    if (!ve || !*ve) return;
    float m[4][4]{};
    if (!g_proc.readBuf(*ve + off::viewmatrix, m, sizeof(m))) return;

    ImDrawList* dl = ImGui::GetBackgroundDrawList();
    const ImVec2 size = ImGui::GetIO().DisplaySize;

    for (const auto& p : g_players) {
        const rbx::Vec3 pos = rbx::partPosition(g_proc, p.part);
        if (pos.x == 0.f && pos.y == 0.f && pos.z == 0.f) continue;

        const rbx::Vec3 head{ pos.x, pos.y + 1.6f, pos.z };
        const rbx::Vec3 feet{ pos.x, pos.y - 2.6f, pos.z };

        ImVec2 sTop, sBottom;
        if (!worldToScreen(m, head, sTop, size) ||
            !worldToScreen(m, feet, sBottom, size)) continue;

        const float h = sBottom.y - sTop.y;
        if (h < 4.f || h > 2000.f) continue;
        const float w = h * 0.55f;

        dl->AddRect(ImVec2(sTop.x - w * 0.5f, sTop.y),
                    ImVec2(sTop.x + w * 0.5f, sBottom.y),
                    IM_COL32(240, 240, 240, 220), 0.f, 0, 1.0f);

        char label[160];
        snprintf(label, sizeof(label), "%s  [%.0f]", p.label.c_str(), p.hp);
        const ImVec2 ts = ImGui::CalcTextSize(label);
        dl->AddText(ImVec2(sTop.x - ts.x * 0.5f, sTop.y - 16.f),
                    IM_COL32(245, 245, 245, 230), label);
    }
}

bool createDevice() {
    DXGI_SWAP_CHAIN_DESC sd{};
    sd.BufferCount = 2;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = g_hwnd;
    sd.SampleDesc.Count = 1;
    sd.Windowed = TRUE;
    sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;

    D3D_FEATURE_LEVEL fl{};
    const D3D_FEATURE_LEVEL want[]{ D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0 };
    if (FAILED(D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, 0,
            want, 2, D3D11_SDK_VERSION, &sd, &g_swap, &g_dev, &fl, &g_ctx)))
        return false;

    ID3D11Texture2D* back = nullptr;
    g_swap->GetBuffer(0, IID_PPV_ARGS(&back));
    if (!back) return false;
    g_dev->CreateRenderTargetView(back, nullptr, &g_rtv);
    back->Release();
    return g_rtv != nullptr;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (ImGui_ImplWin32_WndProcHandler(hwnd, msg, wp, lp)) return true;
    if (msg == WM_DESTROY) { g_run = false; PostQuitMessage(0); return 0; }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

} // namespace

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int) {
    const int sw = GetSystemMetrics(SM_CXSCREEN);
    const int sh = GetSystemMetrics(SM_CYSCREEN);

    WNDCLASSEXW wc{ sizeof(wc) };
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = L"rbx_ext_overlay";
    RegisterClassExW(&wc);

    g_hwnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW,
        L"rbx_ext_overlay", L"rbx_ext", WS_POPUP,
        0, 0, sw, sh, nullptr, nullptr, hInst, nullptr);

    SetLayeredWindowAttributes(g_hwnd, RGB(0, 0, 0), 0, LWA_COLORKEY);
    ShowWindow(g_hwnd, SW_SHOW);

    if (!createDevice()) return 1;

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGui::GetIO().IniFilename = nullptr;
    ImGui::StyleColorsDark();
    ImGui_ImplWin32_Init(g_hwnd);
    ImGui_ImplDX11_Init(g_dev, g_ctx);

    std::thread worker([] {
        while (g_run) {
            if (!g_attached) {
                g_attached = g_proc.attach(L"RobloxPlayerBeta.exe");
            } else if (!g_proc.alive()) {
                g_proc = {};
                g_attached = false;
            } else {
                refreshPlayers();
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(250));
        }
    });

    bool menu = true;
    MSG msg{};
    while (g_run) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        if (!g_run) break;

        if (GetAsyncKeyState(VK_INSERT) & 1) menu = !menu;
        if (GetAsyncKeyState(VK_END) & 1) { g_run = false; break; }

        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        renderESP();
        if (menu) renderMenu();

        ImGui::Render();
        const float clear[4]{ 0.f, 0.f, 0.f, 0.f };
        g_ctx->OMSetRenderTargets(1, &g_rtv, nullptr);
        g_ctx->ClearRenderTargetView(g_rtv, clear);
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());
        g_swap->Present(1, 0);
    }

    g_run = false;
    if (worker.joinable()) worker.join();

    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    if (g_rtv)  g_rtv->Release();
    if (g_swap) g_swap->Release();
    if (g_ctx)  g_ctx->Release();
    if (g_dev)  g_dev->Release();
    if (g_proc.handle) CloseHandle(g_proc.handle);
    return 0;
}
