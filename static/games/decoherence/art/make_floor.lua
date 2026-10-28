-- The floor inside the window: the cryo deck. Hexagonal cold plates 112 px across, bevelled, each with an inset panel,
-- a central hatch with a status light, a ring of vents and rivets; coolant glows in the seams and a light runs along them.
-- One tile is 112 x 194 (two rows of the hexagonal lattice), seamless. Tag idle: 4 frames x 200 ms.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_floor.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local K = {void=hex("#04060d"), p0=hex("#080d1e"), p1=hex("#0d1430"), p2=hex("#141d40"), p3=hex("#1a2550"), p4=hex("#283768"),
  g0=hex("#0c1d30"), g1=hex("#15415c"), g2=hex("#2a7a9c"), g3=hex("#7fdfff"), mint=hex("#5fcfa6"), gold=hex("#c9a24a")}
local S = 112; local RH = math.floor(S*math.sqrt(3)/2 + 0.5)  -- 97: row spacing of the hexagonal lattice
local TW, TH = S, RH*2
local NF = 4
local B4 = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}}
local function dz(x,y) return (B4[y%4+1][x%4+1]+0.5)/16 end
local centres = {{S/2, RH/2}, {0, RH/2 + RH}}
local function near(x, y)
  local b1, b2, c1 = 1e9, 1e9, nil
  for _, c in ipairs(centres) do for oy = -1, 1 do for ox = -1, 1 do
    local cx, cy = c[1] + ox*TW, c[2] + oy*TH; local d = (x-cx)^2 + (y-cy)^2
    if d < b1 then b2 = b1; b1 = d; c1 = {cx, cy} elseif d < b2 then b2 = d end end end end
  return math.sqrt(b1), math.sqrt(b2), c1
end
local spr = Sprite(TW, TH, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
for f = 0, NF-1 do
  local img = Image(TW, TH, ColorMode.RGB)
  for y = 0, TH-1 do for x = 0, TW-1 do
    local d1, d2, c = near(x, y); local seam = (d2*d2 - d1*d1) / (2*S)  -- distance to the nearest seam, in px
    local dx, dy = x - c[1], y - c[2]; local ang = math.atan(dy, dx); local r = d1
    local col
    if seam < 1.2 then
      -- the coolant light runs round each plate: a bright stretch travelling along the seam
      local run = (ang/(2*math.pi) * 6 + f/NF) % 1
      col = (run < 0.12) and K.g3 or ((dz(x, y) > 0.4) and K.g2 or K.g1)
    elseif seam < 2.6 then col = K.g1
    elseif seam < 4.5 then col = (dz(x, y) > 0.55) and K.g0 or K.p0
    elseif seam < 8 then col = (dx + dy < 0) and K.p4 or K.p1            -- the plate's bevel, lit top-left
    elseif seam < 9 then col = K.p3
    elseif seam >= 19 and seam < 20 then col = K.p0                      -- the inset panel line
    elseif seam >= 20 and seam < 21 then col = (dx + dy < 0) and K.p3 or K.p1
    else
      col = (dz(x*3 + y, y*5 + x) > 0.93) and K.p3 or K.p2               -- frost on the plate
      -- the central hatch: a bevelled ring and a dark well
      if r < 11 then col = K.p1 end
      if r >= 9 and r < 11 then col = (dx + dy < 0) and K.p4 or K.p0 end
      if r < 3 then col = K.p0 end
      -- a ring of six vents, slots along the radius
      if r >= 17 and r < 25 then
        local a6 = (ang / (math.pi/3)) % 1
        if a6 < 0.05 or a6 > 0.95 then col = K.void end
        if a6 >= 0.05 and a6 < 0.08 then col = K.p4 end
      end
    end
    img:drawPixel(x, y, col)
  end end
  -- rivets at the inner corners of every plate, and each plate's status light (blinking out of step)
  for i, c in ipairs(centres) do
    for k = 0, 5 do
      local a = k*math.pi/3 + math.pi/6; local rx, ry = c[1] + math.cos(a)*36, c[2] + math.sin(a)*36
      for oy = -1, 1 do for ox = -1, 1 do
        local x, y = math.floor(rx + ox*TW + 0.5), math.floor(ry + oy*TH + 0.5)
        if x >= 0 and y >= 0 and x < TW-1 and y < TH-1 then img:drawPixel(x, y, K.p4); img:drawPixel(x+1, y+1, K.p0) end
      end end
    end
    local on = ((f + i) % NF) ~= 0
    local lc = (i == 1) and K.g3 or ((i == 2) and K.mint or K.gold)
    for oy = -1, 1 do for ox = -1, 1 do
      local x, y = math.floor(c[1] + ox*TW + 0.5), math.floor(c[2] + oy*TH + 0.5)
      if x >= 1 and y >= 1 and x < TW-1 and y < TH-1 then
        img:drawPixel(x, y, on and lc or K.p1); if on then img:drawPixel(x-1, y, K.g1); img:drawPixel(x+1, y, K.g1) end
      end
    end end
  end
  local fr = (f == 0) and spr.frames[1] or spr:newEmptyFrame(f + 1)
  fr.duration = 0.2
  if f == 0 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
end
local tg = spr:newTag(1, NF); tg.name = "idle"; tg.aniDir = AniDir.FORWARD
spr:saveAs(out .. "/floor.aseprite"); print("wrote floor.aseprite " .. TW .. "x" .. TH); spr:close()
