--!nocheck
-- remote_spy.luau — log FireServer / InvokeServer en jeu, copiable
-- Sert à découvrir la surface remote avant de l'abuser.

local Players = game:GetService("Players")
local CoreGui = game:GetService("CoreGui")

local gui = Instance.new("ScreenGui")
gui.Name = "Spy"
gui.ResetOnSpawn = false
gui.DisplayOrder = 999
gui.Parent = (gethui and gethui()) or CoreGui

local frame = Instance.new("ScrollingFrame")
frame.Size = UDim2.new(0, 470, 0, 340)
frame.Position = UDim2.new(0, 20, 0, 20)
frame.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
frame.BackgroundTransparency = 0.12
frame.BorderSizePixel = 0
frame.CanvasSize = UDim2.new(0, 0, 0, 0)
frame.ScrollBarThickness = 4
frame.Parent = gui

local layout = Instance.new("UIListLayout")
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Padding = UDim.new(0, 2)
layout.Parent = frame

local copy = Instance.new("TextButton")
copy.Size = UDim2.new(0, 120, 0, 24)
copy.Position = UDim2.new(0, 20, 0, 366)
copy.BackgroundColor3 = Color3.fromRGB(40, 40, 46)
copy.BorderSizePixel = 0
copy.Font = Enum.Font.Code
copy.TextSize = 12
copy.TextColor3 = Color3.fromRGB(235, 235, 235)
copy.Text = "copy log"
copy.Parent = gui

local order = 0
local lines = {}

local function add(text, color)
    order += 1
    lines[#lines + 1] = text
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, -6, 0, 16)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Code
    lbl.TextSize = 12
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.TextColor3 = color or Color3.fromRGB(200, 200, 200)
    lbl.Text = text
    lbl.LayoutOrder = order
    lbl.Parent = frame
    frame.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y + 6)
end

local function pretty(v)
    local t = typeof(v)
    if t == "Instance" then
        return v:GetFullName()
    elseif t == "table" then
        local parts = {}
        for k, val in pairs(v) do
            parts[#parts + 1] = tostring(k) .. "=" .. tostring(val)
        end
        return "{" .. table.concat(parts, ", ") .. "}"
    elseif t == "CFrame" then
        return "(cframe)"
    elseif t == "Vector3" then
        return string.format("(%0.1f, %0.1f, %0.1f)", v.X, v.Y, v.Z)
    end
    return tostring(v)
end

local oldNamecall
oldNamecall = hookmetamethod(game, "__namecall", function(self, ...)
    local method = getnamecallmethod()
    if not checkcaller() and (method == "FireServer" or method == "InvokeServer") then
        local args = table.pack(...)
        local out = {}
        for i = 1, args.n do out[i] = pretty(args[i]) end
        add(("%s -> %s"):format(method, self:GetFullName()),
            Color3.fromRGB(120, 220, 255))
        if #out > 0 then
            add("   (" .. table.concat(out, ", ") .. ")",
                Color3.fromRGB(215, 215, 215))
        end
    end
    return oldNamecall(self, ...)
end)

copy.MouseButton1Click:Connect(function()
    if setclipboard then
        setclipboard(table.concat(lines, "\n"))
    end
end)

add("remote spy live — FireServer / InvokeServer", Color3.fromRGB(255, 200, 80))
add("alt+f4 : stop (ou getgenv().SpyOff())", Color3.fromRGB(140, 140, 140))
