-- Card icons, 24x24, one frame per gate or flag, each frame tagged with its id. Drawn from the game's own elements:
-- Grover as a small ring orb, right answers as gold s-orbital clouds, wrong answers as violet p-orbital clouds, the
-- instrument in cyan and ink, mint for what the player gains.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_icons.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local K = {cy=hex("#7fdfff"), cyd=hex("#3f8fb0"), cyk=hex("#1f4a66"), ink=hex("#e8fbff"), wh=hex("#ffffff"), dim=hex("#4a5a8a"), dk=hex("#1a2440"),
  mint=hex("#9affd6"), mintd=hex("#4f9f86"), amber=hex("#ffb347"), grey=hex("#8a90a8"), greyd=hex("#4c5068"), red=hex("#ff3b5c")}
local GOLD = {hex("#6e3420"), hex("#b9722c"), hex("#ffcc55"), hex("#ffe28f"), hex("#ffffff")}
local VIO  = {hex("#2a1f6e"), hex("#4a3aa8"), hex("#7a6cff"), hex("#a99cff"), hex("#e8e0ff")}
local B4 = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}}
local N = 24
local img
local function P(x, y, c) x, y = math.floor(x + 0.5), math.floor(y + 0.5); if x >= 0 and y >= 0 and x < N and y < N then img:drawPixel(x, y, c) end end
local function line(x0, y0, x1, y1, c, step, phase)
  local n = math.max(math.abs(x1-x0), math.abs(y1-y0)); if n == 0 then P(x0, y0, c) return end
  for t = 0, n do if not step or ((t + (phase or 0)) % step == 0) then P(x0 + (x1-x0)*t/n, y0 + (y1-y0)*t/n, c) end end
end
local function ring(cx, cy, r, c, a0, a1, step)
  a0, a1 = a0 or 0, a1 or 2*math.pi; local n = math.max(8, math.floor(r*8))
  for k = 0, n do if not step or k % step == 0 then local a = a0 + (a1-a0)*k/n; P(cx + math.cos(a)*r, cy + math.sin(a)*r, c) end end
end
local function dith(v, x, y) return v*5 + (B4[y%4+1][x%4+1]+0.5)/16 - 0.5 end
-- a right answer: a gold s-orbital cloud with a white core
local function gcloud(cx, cy, r)
  local s = r/2
  for y = math.floor(cy-r-1), math.ceil(cy+r+1) do for x = math.floor(cx-r-1), math.ceil(cx+r+1) do
    local d2 = (x-cx)^2 + (y-cy)^2; local i = math.floor(dith(math.exp(-d2/(2*s*s))*1.05, x, y))
    if i >= 1 then P(x, y, GOLD[math.min(5, i)]) end end end
end
-- a wrong answer: a violet p-orbital, two lobes split by a dark node
local function vcloud(cx, cy, r, ang)
  ang = ang or 0.6; local s = r/2.3; local c, sn = math.cos(ang), math.sin(ang)
  for y = math.floor(cy-r-1), math.ceil(cy+r+1) do for x = math.floor(cx-r-1), math.ceil(cx+r+1) do
    local dx, dy = x-cx, y-cy; local u = dx*c + dy*sn
    local v = (u/s)^2*math.exp(-(dx*dx+dy*dy)/(2*s*s))*1.5
    local i = math.floor(dith(v, x, y)); if i >= 1 then P(x, y, VIO[math.min(5, i)]) end end end
end
-- Grover: a small ring with a lit top-left arc and a white query dot
local function orb(cx, cy)
  ring(cx, cy, 3, K.cyd); ring(cx, cy, 3, K.cy, math.pi*0.9, math.pi*1.6); P(cx, cy, K.wh); P(cx-1, cy, K.cyk); P(cx+1, cy, K.cyk); P(cx, cy-1, K.cyk); P(cx, cy+1, K.cyk)
end
local function spark(x, y) P(x, y, K.wh); P(x-1, y, K.ink); P(x+1, y, K.ink); P(x, y-1, K.ink); P(x, y+1, K.ink) end
local function arrowR(x, y, c) line(x-4, y, x, y, c); P(x-1, y-1, c); P(x-1, y+1, c); P(x-2, y-2, c); P(x-2, y+2, c) end
local function arrowU(x, y, c) line(x, y, x, y+4, c); P(x-1, y+1, c); P(x+1, y+1, c); P(x-2, y+2, c); P(x+2, y+2, c) end
local function arrowD(x, y, c) line(x, y-4, x, y, c); P(x-1, y-1, c); P(x+1, y-1, c); P(x-2, y-2, c); P(x+2, y-2, c) end
local DIG = {["0"]={"###","#.#","#.#","#.#","###"}, ["1"]={".#.","##.",".#.",".#.","###"}}
local function digit(ch, x, y, c) local g = DIG[ch]; for r = 1, 5 do for k = 1, 3 do if g[r]:sub(k,k) == "#" then P(x+k-1, y+r-1, c) end end end end

local ICONS = {
  {"bolt", function()  -- PHASE KICK: a bolt leaves Grover and strikes a wrong answer
    orb(5, 18); vcloud(17, 7, 5, 0.8)
    line(8, 15, 13, 10, K.cyk); line(9, 14, 13, 10, K.cyd, 2); P(12, 11, K.cy); P(13, 10, K.ink); P(14, 9, K.wh)
    spark(15, 8); P(19, 3, K.ink); P(21, 10, K.ink) end},
  {"sweep", function()  -- HADAMARD SWEEP: an arc in front of Grover crosses a right and a wrong answer
    orb(4, 12)
    ring(4, 12, 12, K.ink, -1.05, 1.05); ring(4, 12, 11, K.cy, -1.0, 1.0); ring(4, 12, 8, K.cyd, -0.9, 0.9, 2)
    gcloud(15, 6, 3); vcloud(15, 18, 3.5, 0.3) end},
  {"wave", function()  -- QFT PULSE: a double ring with fringes spreads from Grover through two answers
    orb(12, 12)
    for k = 0, 47 do local a = k/48*2*math.pi; local f = math.cos(a*8) > 0
      P(12 + math.cos(a)*8, 12 + math.sin(a)*8, f and K.ink or K.cyd); if k % 2 == 0 then P(12 + math.cos(a)*10.5, 12 + math.sin(a)*10.5, K.cyk) end end
    gcloud(19, 5, 3); vcloud(5, 19, 3.5, 0.9) end},
  {"orbit", function()  -- ANCILLA ORBIT: Grover's qubits circle it; one touches a right answer and sparks
    orb(11, 12)
    for i = 0, 5 do local a = -math.pi/2 + i*math.pi/3; local x, y = 11 + math.cos(a)*7, 12 + math.sin(a)*7
      P(x - math.cos(a), y - math.sin(a), K.cyk); P(x, y, K.cy); P(x + math.cos(a), y + math.sin(a), K.ink) end
    ring(11, 12, 7, K.dk, 0, 2*math.pi, 3)
    gcloud(20, 15, 3); spark(17, 15) end},
  {"ladder", function()  -- CNOT LADDER: a shot hits one answer and the step jumps on, rung by rung
    orb(4, 19)
    vcloud(10, 12, 3, 0.4); gcloud(18, 6, 3); vcloud(19, 17, 3, 1.2)
    line(6, 17, 9, 13, K.mint, 2); line(12, 10, 16, 7, K.mint, 2); line(12, 13, 17, 16, K.mint, 2)
    P(10, 12, K.wh); P(18, 6, K.wh); P(19, 17, K.wh) end},
  {"field", function()  -- DIFFUSER: a patch of the operator, left running, steps everything inside it
    for k = 1, 22, 2 do P(k, 2, K.cy); P(k, 21, K.cy); P(1, k+1, K.cy); P(22, k+1, K.cy) end
    for k = 3, 20, 4 do P(k, 4, K.cyk); P(k, 19, K.cyk) end
    line(2, 0, 14, 0, K.cy)
    gcloud(8, 9, 3); vcloud(16, 9, 3.5, 0.4); gcloud(11, 16, 3) end},
  {"spin", function()  -- CLOCK SPEED: a dial with its hand thrown forward, speed lines behind
    ring(13, 12, 8, K.dim); for k = 0, 11 do local a = k*math.pi/6; P(13 + math.cos(a)*8, 12 + math.sin(a)*8, (k % 3 == 0) and K.cy or K.dim) end
    line(13, 12, 18, 7, K.ink); P(13, 12, K.wh)
    line(1, 9, 3, 9, K.cyd); line(0, 12, 3, 12, K.cy); line(1, 15, 3, 15, K.cyd) end},
  {"amplify", function()  -- AMPLITUDE GAIN: a small right answer becomes a loud one
    gcloud(5, 17, 2.2); arrowR(12, 14, K.mint); gcloud(17, 10, 5.5) end},
  {"cancel", function()  -- DESTRUCTIVE INTERFERENCE: a wrong answer thins out and is gone
    vcloud(8, 12, 5.5, 0.6)
    for _, p in ipairs({{15,9},{17,12},{16,15},{19,10},{20,14},{22,12}}) do P(p[1], p[2], VIO[2]) end
    arrowD(19, 22, K.mint) end},
  {"feedforward", function()  -- FEEDFORWARD: a read's answer feeds the next hits, stacking
    for x = 2, 8 do P(x, 2, K.dim); P(x, 10, K.dim) end; for y = 2, 10 do P(2, y, K.dim); P(8, y, K.dim) end
    digit("1", 4, 4, K.ink)
    ring(12, 13, 6, K.mint, -1.6, 0.6, 1); P(17, 15, K.mint); P(16, 16, K.mint); P(18, 15, K.mint)
    for i = 0, 4 do local c = i < 3 and GOLD[3] or K.dk; line(4 + i*4, 21, 6 + i*4, 21, c); line(4 + i*4, 22, 6 + i*4, 22, c) end end},
  {"readfast", function()  -- FAST READOUT: Grover falls to its dot and the read ring races out
    ring(12, 12, 9, K.ink, -2.4, 2.4, 2); ring(12, 12, 6, K.cy); ring(12, 12, 3, K.cyd)
    P(12, 12, K.wh); spark(12, 12)
    line(0, 6, 3, 6, K.cyd); line(0, 12, 2, 12, K.cy); line(0, 18, 3, 18, K.cyd) end},
  {"mitigation", function()  -- ERROR MITIGATION: a noisy trace averaged into a clean one
    local ys = {12,9,15,10,14,8,16,11,13}
    for i = 1, #ys-1 do line(i, ys[i], i+1, ys[i+1], K.grey) end
    line(10, 4, 10, 20, K.dim, 2)
    for x = 11, 23 do P(x, 12 + math.floor(math.sin((x-11)*0.55)*4 + 0.5), K.ink) end
    arrowR(9, 3, K.mint) end},
  {"coherence", function()  -- COHERENCE: a long trace that decays slowly, under a raised ceiling
    line(0, 3, 23, 3, K.mint, 2)
    local px, py
    for x = 0, 23 do local env = 7*math.exp(-x/40); local y = 13 + math.floor(math.sin(x*0.55)*env + 0.5)
      if px then line(px, py, x, y, K.cy) end; px, py = x, y
      if x % 3 == 0 then P(x, 13 - math.floor(env + 0.5) - 1, K.cyk); P(x, 13 + math.floor(env + 0.5) + 1, K.cyk) end end end},
  {"suppression", function()  -- ERROR SUPPRESSION: a noise error held down by dampers
    for y = 6, 14 do for x = 5, 15 do local d = (x-10)^2 + (y-10)^2; local h = ((x*7 + y*13) % 5)
      if d < 22 and h > 1 then P(x, y, h > 3 and K.ink or (h > 2 and K.grey or K.greyd)) end end end
    line(3, 17, 17, 17, K.mint); line(5, 19, 15, 19, K.mintd); line(7, 21, 13, 21, K.mintd)
    arrowD(20, 14, K.mint) end},
  {"zeno", function()  -- ZENO EFFECT: a watched wrong answer frozen in the eye's gaze
    for k = 0, 20 do local t = k/20; local x = 1 + t*22; local h = math.sin(t*math.pi)*7; P(x, 12 - h, K.ink); P(x, 12 + h, K.ink) end
    vcloud(12, 12, 4, 0.2)
    for _, p in ipairs({{6,3},{12,1},{18,3}}) do P(p[1], p[2], K.cyd) end end},
  {"momentum", function()  -- MOMENTUM: Grover with a motion trail of chevrons
    orb(17, 12)
    for i = 0, 2 do local x = 10 - i*4; local c = (i == 0) and K.cy or ((i == 1) and K.cyd or K.cyk)
      P(x, 12, c); P(x-1, 11, c); P(x-1, 13, c); P(x-2, 10, c); P(x-2, 14, c) end end},
}

local spr = Sprite(N, N, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
for i, ic in ipairs(ICONS) do
  local fr = (i == 1) and spr.frames[1] or spr:newEmptyFrame(i)
  img = Image(N, N, ColorMode.RGB); ic[2]()
  if i == 1 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
  local tg = spr:newTag(i, i); tg.name = ic[1]
end
spr:saveAs(out .. "/icons.aseprite"); print("wrote icons.aseprite (" .. #ICONS .. " icons)"); spr:close()
