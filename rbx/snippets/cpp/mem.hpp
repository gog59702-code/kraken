#pragma once
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace mem {

inline DWORD pidByName(const std::wstring& exe) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W pe{ sizeof(pe) };
    DWORD pid = 0;
    if (Process32FirstW(snap, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, exe.c_str()) == 0) {
                pid = pe.th32ProcessID;
                break;
            }
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
    return pid;
}

struct Process {
    HANDLE    handle{};
    DWORD     pid{};
    uintptr_t base{};
    size_t    imageSize{};

    bool attach(const std::wstring& exe) {
        pid = pidByName(exe);
        if (!pid) return false;
        // VM_READ seul au départ. VM_OPERATION/VM_WRITE fait lever Hyperion
        // plus vite : ne les demander que si un hook l'exige vraiment.
        handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
        if (!handle) return false;

        HMODULE mods[1024]{};
        DWORD needed = 0;
        if (!EnumProcessModulesEx(handle, mods, sizeof(mods), &needed, LIST_MODULES_ALL))
            return false;
        base = reinterpret_cast<uintptr_t>(mods[0]);

        MODULEINFO mi{};
        if (GetModuleInformation(handle, mods[0], &mi, sizeof(mi)))
            imageSize = mi.SizeOfImage;
        return base != 0;
    }

    bool alive() const {
        DWORD code = 0;
        return handle && GetExitCodeProcess(handle, &code) && code == STILL_ACTIVE;
    }

    template <typename T>
    std::optional<T> read(uintptr_t addr) const {
        T out{};
        SIZE_T got = 0;
        if (!ReadProcessMemory(handle, reinterpret_cast<LPCVOID>(addr),
                               &out, sizeof(T), &got))
            return std::nullopt;
        if (got != sizeof(T)) return std::nullopt;
        return out;
    }

    bool readBuf(uintptr_t addr, void* dst, size_t size) const {
        SIZE_T got = 0;
        return ReadProcessMemory(handle, reinterpret_cast<LPCVOID>(addr),
                                 dst, size, &got) && got == size;
    }

    std::optional<uintptr_t> moduleBase(const std::wstring& name) const {
        HMODULE mods[1024]{};
        DWORD needed = 0;
        if (!EnumProcessModulesEx(handle, mods, sizeof(mods), &needed, LIST_MODULES_ALL))
            return std::nullopt;
        const DWORD count = needed / sizeof(HMODULE);
        for (DWORD i = 0; i < count; ++i) {
            wchar_t path[MAX_PATH]{};
            if (!GetModuleBaseNameW(handle, mods[i], path, MAX_PATH)) continue;
            if (_wcsicmp(path, name.c_str()) == 0)
                return reinterpret_cast<uintptr_t>(mods[i]);
        }
        return std::nullopt;
    }

    // Pattern style "48 8B 05 ? ? ? ? 48 85 C0" ('?' = wildcard)
    std::optional<uintptr_t> scan(uintptr_t start, size_t len, const char* pattern) const {
        std::vector<std::pair<uint8_t, bool>> sig;
        auto hex = [](char c) -> uint8_t {
            if (c >= '0' && c <= '9') return uint8_t(c - '0');
            if (c >= 'A' && c <= 'F') return uint8_t(c - 'A' + 10);
            if (c >= 'a' && c <= 'f') return uint8_t(c - 'a' + 10);
            return 0;
        };
        const char* p = pattern;
        while (*p) {
            while (*p == ' ') ++p;
            if (!*p) break;
            if (*p == '?') { sig.push_back({ 0, false }); ++p; continue; }
            sig.push_back({ uint8_t(hex(p[0]) << 4 | hex(p[1])), true });
            p += 2;
        }
        if (sig.empty()) return std::nullopt;

        std::vector<uint8_t> buf(len);
        if (!readBuf(start, buf.data(), len)) return std::nullopt;

        const size_t n = sig.size();
        for (size_t i = 0; i + n <= buf.size(); ++i) {
            bool ok = true;
            for (size_t j = 0; j < n; ++j) {
                if (sig[j].second && buf[i + j] != sig[j].first) { ok = false; break; }
            }
            if (ok) return start + i;
        }
        return std::nullopt;
    }
};

} // namespace mem
