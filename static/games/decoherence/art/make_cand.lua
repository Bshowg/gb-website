-- Candidates as probability clouds, three kinds of each. 15x15 RGB, emissive, ordered dither shifted per frame.
-- Right answers have no nodes (their wave never changes sign): a = s-orbital, b = sigma bond (two lobes merged in phase),
-- c = trio (three clouds in phase). Right answers carry bright samples of probability travelling through them.
-- Wrong answers have nodes, dark where the wave changes sign: a = p-orbital (one node), b = d-orbital (a clover, two nodes),
-- c = 2s-orbital (a core and a ring split by a dark radial node).
-- Tags: r<kind><level> and w<kind><level>, kind a/b/c, level 0..3 by amplitude, 12 frames x 80 ms each, seamless loops;
-- r<kind>f / w<kind>f, one white flash frame for a gate hit.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_cand.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local GOLD  = {"#6e3420","#b9722c","#ffcc55","#ffe28f","#ffffff"}
local VIO   = {"#2a1f6e","#4a3aa8","#7a6cff","#a99cff","#e8e0ff"}
local WHITE = {"#8a90a8","#b8bcd0","#e8ecff","#ffffff","#ffffff"}
local N, C, NF = 15, 7, 12
local TAU = 2*math.pi
local B4 = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}}
local function q(v, x, y, f)
  local t = v*5 + (B4[(y+f)%4+1][(x+f*3)%4+1]+0.5)/16 - 0.5; local i = math.floor(t)
  if i < 0 then return 0 end; if i > 5 then return 5 end; return i
end
local AMP = {0.3, 0.5, 0.72, 0.95}
local function g(dx, dy, s) return math.exp(-(dx*dx+dy*dy)/(2*s*s)) end
-- each kind: a field over (dx,dy) at loop phase t in [0,1), and optional bright samples
local KIND = {
  r = {
    -- s: a round cloud that breathes, three samples orbiting inside it
    a = function(a, t) local s = (3.4 - 1.1*a)*0.78*(1 + 0.08*math.sin(t*TAU)); local k = 0.35 + 0.75*a
      return function(dx, dy) return k*g(dx, dy, s) end,
        function() local pts = {}; for i = 0, 2 do local an = t*TAU + i*TAU/3; pts[#pts+1] = {math.cos(an)*s*0.9, math.sin(an)*s*0.9} end; return pts end end,
    -- sigma bond: two lobes merged in phase, turning half a turn per loop (it is symmetric), samples running along its axis
    b = function(a, t) local s = (2.6 - 0.8*a)*0.8; local k = 0.35 + 0.75*a; local th = t*math.pi; local d = 2.4
      local cx, cy = math.cos(th)*d, math.sin(th)*d
      return function(dx, dy) return k*math.min(1, g(dx-cx, dy-cy, s) + g(dx+cx, dy+cy, s)) end,
        function() local u = math.cos(t*TAU*2)*d; return {{math.cos(th)*u, math.sin(th)*u}} end end,
    -- trio: three clouds at 120 degrees turning a third of a turn per loop, each with a pulsing core
    c = function(a, t) local s = (2.2 - 0.6*a)*0.85; local k = 0.35 + 0.75*a; local th = t*TAU/3; local d = 2.8
      local P = {}; for i = 0, 2 do local an = th + i*TAU/3; P[#P+1] = {math.cos(an)*d, math.sin(an)*d} end
      return function(dx, dy) local v = 0; for _, p in ipairs(P) do v = v + g(dx-p[1], dy-p[2], s) end; return k*math.min(1, v) end,
        function() local i = math.floor(t*3) % 3 + 1; return {P[i]} end end,
  },
  w = {
    -- p: two lobes and a node, turning half a turn per loop
    a = function(a, t) local s = (3.4 - 1.1*a)*0.78; local k = 0.35 + 0.75*a; local th = 0.64 + t*math.pi
      local c, sn = math.cos(th), math.sin(th)
      return function(dx, dy) local u = dx*c + dy*sn; return k*(u/s)^2*g(dx, dy, s)*1.4 end end,
    -- d: a four-leaf clover, two nodes, turning a quarter turn per loop
    b = function(a, t) local s = (3.2 - 1.0*a)*0.8; local k = 0.35 + 0.75*a; local th = t*math.pi/2
      local c, sn = math.cos(th), math.sin(th)
      return function(dx, dy) local u, v = dx*c + dy*sn, -dx*sn + dy*c; return k*math.min(1, (2*u*v/(s*s))^2*g(dx, dy, s*0.95)*0.9) end end,
    -- 2s: a core and a ring split by a dark radial node; the ring swells and the node with it
    c = function(a, t) local s = (1.4 - 0.3*a); local k = 0.35 + 0.75*a; local r0 = 3.6 + 0.5*math.sin(t*TAU)
      return function(dx, dy) local r = math.sqrt(dx*dx+dy*dy); return k*math.min(1, g(dx, dy, s) + 0.62*math.exp(-((r-r0)^2)/0.9)) end end,
  },
}
local spr = Sprite(N, N, ColorMode.RGB)
local body = spr.layers[1]; body.name = "body"
local bg = spr:newLayer(); bg.name = "bg"; bg.stackIndex = 1; bg.isVisible = false
local n, tags = 0, {}
local function frame(field, samples, ramp, f, coreWhite)
  n = n + 1
  local fr = (n == 1) and spr.frames[1] or spr:newEmptyFrame(n)
  fr.duration = 0.08
  local img = Image(N, N, ColorMode.RGB)
  for y = 0, N-1 do for x = 0, N-1 do local l = q(field(x-C, y-C), x, y, f); if l > 0 then img:drawPixel(x, y, hex(ramp[l])) end end end
  if samples then for _, p in ipairs(samples()) do local x, y = math.floor(C + p[1] + 0.5), math.floor(C + p[2] + 0.5)
    if x >= 0 and y >= 0 and x < N and y < N then img:drawPixel(x, y, hex(ramp[5])) end end end
  if coreWhite then img:drawPixel(C, C, hex(ramp[5])) end
  if n == 1 and body:cel(1) then spr:deleteCel(body, 1) end
  spr:newCel(body, fr, img, Point(0,0))
  local gb = Image(N, N, ColorMode.RGB); gb:clear(PC.rgba(6,8,18,255)); spr:newCel(bg, fr, gb, Point(0,0))
end
for _, side in ipairs({"r", "w"}) do
  for _, kind in ipairs({"a", "b", "c"}) do
    for lv = 1, 4 do
      local from = n + 1
      for f = 0, NF-1 do
        local field, samples = KIND[side][kind](AMP[lv], f/NF)
        frame(field, (side == "r" and lv >= 2) and samples or nil, side == "r" and GOLD or VIO, f, side == "r" and kind == "a" and lv >= 3)
      end
      tags[#tags+1] = {side .. kind .. (lv-1), from, n}
    end
    local from = n + 1; local field = KIND[side][kind](0.95, 0); frame(field, nil, WHITE, 0, false); tags[#tags+1] = {side .. kind .. "f", from, n}
  end
end
for _, t in ipairs(tags) do local tg = spr:newTag(t[2], t[3]); tg.name = t[1]; tg.aniDir = AniDir.FORWARD end
spr:saveAs(out .. "/cand.aseprite"); print("wrote cand.aseprite (" .. n .. " frames, " .. #tags .. " tags)"); spr:close()
