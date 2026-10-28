-- The register outside the window: the warm deck. The same hexagonal deck as the window's floor, small and not yet cooled:
-- plates tinted by the noise, dim and many-hued, breathing slowly out of step, with hot-pixel sparkle; seams cold and dark.
-- One seamless 64x64 tile (the warps under candidates shear it row by row and need this period): plates 32 px wide on 32 px rows.
-- Tag idle: 6 frames x 200 ms, a seamless loop.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_register.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local FOAM = {"#2b2f7a","#4a3aa8","#7a3fbf","#b23f9a","#2f6fbf","#2fa0a0"}
local function rgb(h) return tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16) end
local function H(x, y, s) local k = (x*73856093 ~ y*19349663 ~ (s or 0)*83492791) & 0x7fffffff; k = ((k ~ (k >> 13)) * 1274126177) & 0x7fffffff; return (k % 10000) / 10000 end
local T, S, RH, NF = 64, 32, 32, 6
local centres = {}
for row = 0, 1 do for col = 0, 1 do centres[#centres+1] = {col*S + ((row % 2 == 0) and 0 or S/2), row*RH, col + row*2} end end
local function near(x, y)
  local b1, b2, id = 1e9, 1e9, 0
  for _, c in ipairs(centres) do for oy = -1, 1 do for ox = -1, 1 do
    local d = (x - c[1] - ox*T)^2 + (y - c[2] - oy*T)^2
    if d < b1 then b2 = b1; b1 = d; id = c[3] elseif d < b2 then b2 = d end end end end
  return math.sqrt(b1), math.sqrt(b2), id
end
local spr = Sprite(T, T, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
for f = 0, NF-1 do
  local img = Image(T, T, ColorMode.RGB)
  for y = 0, T-1 do for x = 0, T-1 do
    local d1, d2, id = near(x, y); local seam = d2 - d1
    local c
    if seam < 1.1 then c = PC.rgba(4, 6, 13, 255)
    elseif seam < 2.2 then c = PC.rgba(9, 13, 30, 255)
    else
      local hue = FOAM[math.floor(H(id, 3, 5)*6) + 1]
      local k = 0.13 + 0.07*H(id, 3, 6) + 0.035*math.sin(f/NF*2*math.pi + H(id, 3, 7)*6.28)
      if seam < 3.4 then k = k * 0.75 end                       -- a darker rim just inside each seam
      if H(x*3 + f*17, y*5 + f*11, 9) > 0.975 then k = k + 0.3 end  -- hot pixels, different every frame
      local r, g, b = rgb(hue)
      c = PC.rgba(math.floor(r*k*1.05), math.floor(g*k*1.05), math.floor(b*k*1.05), 255)
    end
    img:drawPixel(x, y, c)
  end end
  local fr = (f == 0) and spr.frames[1] or spr:newEmptyFrame(f + 1)
  fr.duration = 0.2
  if f == 0 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
end
local tg = spr:newTag(1, NF); tg.name = "idle"; tg.aniDir = AniDir.FORWARD
spr:saveAs(out .. "/register.aseprite"); print("wrote register.aseprite"); spr:close()
