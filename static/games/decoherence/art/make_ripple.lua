-- Candidates outside the window: a ripple on the register. 29x29, emissive, ordered dither, rings travelling outward.
-- Tags: n0..n2 neutral (cold grey-blue) by amplitude, r the oracle on a right answer (gold, in phase, bright centre),
-- w the oracle on a wrong answer (violet, a dark node at the centre). 8 frames x 90 ms each, seamless loops.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_ripple.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local NEU  = {"#242b4e","#36406a","#4f5a8a","#7280ac","#a2acd0"}
local GOLD = {"#4a2618","#7a4422","#b9722c","#f0b240","#ffe28f"}
local VIO  = {"#1e1752","#2e2478","#4a3aa8","#7a6cff","#b4a8ff"}
local N, C, NF = 29, 14, 8
local B4 = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}}
local function dz(x,y) return (B4[y%4+1][x%4+1]+0.5)/16 end
local spr = Sprite(N, N, ColorMode.RGB)
local body = spr.layers[1]; body.name = "body"
local n, tags = 0, {}
local function clip(tag, ramp, gain, node)
  local from = n + 1
  for f = 0, NF-1 do
    n = n + 1
    local fr = (n == 1) and spr.frames[1] or spr:newEmptyFrame(n)
    fr.duration = 0.09
    local img = Image(N, N, ColorMode.RGB)
    local ph = f/NF*math.pi
    for y = 0, N-1 do for x = 0, N-1 do
      local r = math.sqrt((x-C)^2 + (y-C)^2)
      local env = math.exp(-r/7.5)
      local w = node and math.sin(r*0.9 - ph)^2 or math.cos(r*0.9 - ph)^2
      local v = env*w*gain
      if node and r < 1.5 then v = 0 end
      if not node and r < 1.2 then v = math.max(v, gain*0.9) end
      local t = v*5 + dz(x, y) - 0.5; local i = math.floor(t)
      if i >= 1 then img:drawPixel(x, y, hex(ramp[math.min(5, i)])) end
    end end
    if n == 1 and body:cel(1) then spr:deleteCel(body, 1) end
    spr:newCel(body, fr, img, Point(0,0))
  end
  tags[#tags+1] = {tag, from, n}
end
clip("n0", NEU, 0.62, false); clip("n1", NEU, 0.8, false); clip("n2", NEU, 1.0, false)
clip("r", GOLD, 0.95, false); clip("w", VIO, 0.95, true)
for _, t in ipairs(tags) do local tg = spr:newTag(t[2], t[3]); tg.name = t[1]; tg.aniDir = AniDir.FORWARD end
spr:saveAs(out .. "/ripple.aseprite"); print("wrote ripple.aseprite (" .. n .. " frames)"); spr:close()
