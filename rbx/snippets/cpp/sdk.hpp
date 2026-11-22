#pragma once
#include "mem.hpp"
#include <string>
#include <string_view>
#include <vector>

// OFF = 0 -> le walker sort proprement, aucune lecture au hasard.
// Remplir avec tools/dump-offsets.md, une valeur par build du client.
namespace off {

inline constexpr uintptr_t fake_datamodel     = 0x000000; // global .data
inline constexpr uintptr_t datamodel          = 0x000000; // [fdm] + X -> DataModel*
inline constexpr uintptr_t instance_parent    = 0x000000;
inline constexpr uintptr_t instance_children  = 0x000000; // MSVC vector<Instance*>
inline constexpr uintptr_t instance_name      = 0x000000; // MSVC std::string
inline constexpr uintptr_t instance_class     = 0x000000; // MSVC std::string
inline constexpr uintptr_t primitive          = 0x000000; // BasePart -> Primitive*
inline constexpr uintptr_t primitive_position = 0x000000; // Primitive -> Vector3
inline constexpr uintptr_t humanoid_health    = 0x000000;
inline constexpr uintptr_t humanoid_maxhealth = 0x000000;
inline constexpr uintptr_t visualengine       = 0x000000;
inline constexpr uintptr_t viewmatrix         = 0x000000;

} // namespace off

namespace rbx {

using Instance = uintptr_t;

// MSVC std::string : union 16 octets (SSO) + size + capacity
inline std::string readMSVCString(const mem::Process& p, Instance inst, uintptr_t offset) {
    auto size = p.read<size_t>(inst + offset + 16);
    if (!size || *size == 0 || *size > 256) return {};
    if (*size <= 15) {
        char buf[16]{};
        if (!p.readBuf(inst + offset, buf, *size)) return {};
        return std::string(buf, *size);
    }
    auto ptr = p.read<uintptr_t>(inst + offset);
    if (!ptr || !*ptr) return {};
    std::string out(*size, '\0');
    if (!p.readBuf(*ptr, out.data(), *size)) return {};
    return out;
}

// MSVC std::vector : { begin, end, capacity }
inline std::vector<Instance> children(const mem::Process& p, Instance inst) {
    std::vector<Instance> out;
    if (!inst || !off::instance_children) return out;

    auto begin = p.read<uintptr_t>(inst + off::instance_children);
    auto end   = p.read<uintptr_t>(inst + off::instance_children + 8);
    if (!begin || !end || *end <= *begin) return out;

    const size_t count = (*end - *begin) / sizeof(uintptr_t);
    if (count > 8192) return out;           // longueur corrompue -> fail closed
    out.resize(count);
    if (!p.readBuf(*begin, out.data(), count * sizeof(uintptr_t))) out.clear();
    return out;
}

inline std::string className(const mem::Process& p, Instance inst) {
    return readMSVCString(p, inst, off::instance_class);
}

inline std::string name(const mem::Process& p, Instance inst) {
    return readMSVCString(p, inst, off::instance_name);
}

inline Instance findChild(const mem::Process& p, Instance parent, std::string_view wanted) {
    for (Instance c : children(p, parent)) {
        if (className(p, c) == wanted) return c;
    }
    return 0;
}

inline Instance findChildByName(const mem::Process& p, Instance parent, std::string_view wanted) {
    for (Instance c : children(p, parent)) {
        if (name(p, c) == wanted) return c;
    }
    return 0;
}

struct Vec3 { float x, y, z; };

inline Instance dataModel(const mem::Process& p) {
    if (!off::fake_datamodel || !off::datamodel) return 0;
    auto fdm = p.read<Instance>(p.base + off::fake_datamodel);
    if (!fdm || !*fdm) return 0;
    auto dm = p.read<Instance>(*fdm + off::datamodel);
    if (!dm) return 0;
    return *dm;
}

inline Vec3 partPosition(const mem::Process& p, Instance part) {
    if (!off::primitive || !off::primitive_position) return {};
    auto prim = p.read<Instance>(part + off::primitive);
    if (!prim || !*prim) return {};
    auto pos = p.read<Vec3>(*prim + off::primitive_position);
    return pos ? *pos : Vec3{};
}

inline float health(const mem::Process& p, Instance humanoid) {
    auto h = p.read<float>(humanoid + off::humanoid_health);
    return h ? *h : 0.f;
}

} // namespace rbx
