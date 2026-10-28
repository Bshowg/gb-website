-- The title, 200x28: DECOHERENCE found by Grover's algorithm. Hand-drawn lettering on a 7x10 grid at 2x.
-- Stages, one loop of about 7 s (tag idle):
--   superposition: the whole row a shimmering neutral haze, every column equal;
--   oracle: the letters' pixels turn faint gold, the gaps faint violet;
--   amplify: the letters grow loud while the gaps cancel and scatter;
--   resolved: DECOHERENCE in bevelled gold, a glint sweeping across, then a long hold;
--   read: a white flash, and the letters collapse back into the haze.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_title.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local W, H = 200, 28
local B4 = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}}
local function dz(x, y, f) return (B4[(y+f)%4+1][(x+f*3)%4+1]+0.5)/16 end
local function hsh(x, y, s) local k = (x*73856093 ~ y*19349663 ~ s*83492791) & 0x7fffffff; k = ((k ~ (k >> 13)) * 1274126177) & 0x7fffffff; return (k % 1000)/1000 end
local NEU  = {hex("#2a2f52"), hex("#3e456e"), hex("#5a5f8a"), hex("#7a80aa")}
local GOLD = {hex("#6e3420"), hex("#b9722c"), hex("#ffcc55"), hex("#ffe28f"), hex("#fff4c8"), hex("#ffffff")}
local LETTER = {hex("#6e3420"), hex("#b9722c"), hex("#ffcc55"), hex("#ffcc55")}
local VIO  = {hex("#2a1f6e"), hex("#4a3aa8"), hex("#7a6cff"), hex("#a99cff")}
local GL = {
  D={"######.","##...##","##...##","##...##","##...##","##...##","##...##","##...##","##...##","######."},
  E={"#######","##.....","##.....","##.....","######.","##.....","##.....","##.....","##.....","#######"},
  C={".######","##.....","##.....","##.....","##.....","##.....","##.....","##.....","##.....",".######"},
  O={".#####.","##...##","##...##","##...##","##...##","##...##","##...##","##...##","##...##",".#####."},
  H={"##...##","##...##","##...##","##...##","#######","##...##","##...##","##...##","##...##","##...##"},
  R={"######.","##...##","##...##","##...##","######.","##.##..","##..##.","##..##.","##...##","##...##"},
  N={"##...##","###..##","###..##","####.##","##.####","##..###","##..###","##...##","##...##","##...##"},
}
local WORD = "DECOHERENCE"
local S, GAP, Y0 = 2, 2, 4
local LW = 7*S
local X0 = math.floor((W - (#WORD*LW + (#WORD-1)*GAP)) / 2)
-- the letter mask, and the band the letters sit in (the register's row)
local mask, top = {}, {}
for i = 1, #WORD do
  local g = GL[WORD:sub(i,i)]; local ox = X0 + (i-1)*(LW + GAP)
  for r = 1, 10 do for c = 1, 7 do if g[r]:sub(c,c) == "#" then
    for sy = 0, S-1 do for sx = 0, S-1 do local x, y = ox + (c-1)*S + sx, Y0 + (r-1)*S + sy; mask[y*W + x] = true end end
  end end end
end
for y = 0, H-1 do for x = 0, W-1 do if mask[y*W + x] and not mask[(y-1)*W + x] then top[y*W + x] = true end end end
local BX0, BX1, BY0, BY1 = X0 - 2, X0 + #WORD*LW + (#WORD-1)*GAP + 1, Y0, Y0 + 10*S - 1
local function inBand(x, y) return x >= BX0 and x <= BX1 and y >= BY0 and y <= BY1 end
local function pick(ramp, v, x, y, f) local n = #ramp; local i = math.floor(v*n + dz(x, y, f) - 0.5); if i < 1 then return nil end; return ramp[math.min(n, i)] end

-- one frame from the stage parameters: haze strength, mark (0..1 how much the oracle has shown), amp (letters' loudness),
-- cancel (the gaps' remaining amplitude), glint (x of the sweep or nil), flash (white over the letters)
local function draw(img, f, p)
  for y = 0, H-1 do for x = 0, W-1 do
    local L = mask[y*W + x]; local c
    if inBand(x, y) then
      local shimmer = 0.55 + 0.45*hsh(x, y, f)
      if L then
        local v = p.haze*shimmer*(1 - p.amp) + p.amp
        if p.mark > 0 or p.amp > 0 then c = pick(LETTER, math.min(1, (0.35*p.mark*(1 - p.amp) + p.amp)*shimmer^(1 - p.amp)), x, y, f) or c
        else c = pick(NEU, p.haze*shimmer, x, y, f) end
        if p.amp > 0.95 and top[y*W + x] then c = GOLD[4] end
        if p.amp > 0.95 and not top[y*W + x] and not mask[(y+1)*W + x] then c = GOLD[2] end
        if p.glint and math.abs(x - p.glint - (y - Y0)*0.5) < 2 and p.amp > 0.9 then c = GOLD[6] end
        if p.flash > 0 then c = (hsh(x, y, f + 99) < p.flash) and GOLD[6] or c end
      else
        local v = p.haze*shimmer*p.cancel
        if p.mark > 0 then c = pick(VIO, v*(0.6 + 0.4*p.mark), x, y, f) else c = pick(NEU, v, x, y, f) end
        -- cancelled amplitude scatters as a few violet sparks just outside the row
      end
    end
    if c then img:drawPixel(x, y, c) end
  end end
  if p.scatter and p.scatter > 0 then
    for k = 1, 26 do local x = math.floor(BX0 + hsh(k, 1, 7)*(BX1-BX0)); local y0 = BY0 + hsh(k, 2, 7)*(BY1-BY0)
      local dy = (hsh(k, 3, 7) < 0.5 and -1 or 1)*p.scatter*8; local y = math.floor(y0 + dy)
      if y >= 0 and y < H and not mask[y*W + x] and hsh(k, f, 3) > 0.3 then img:drawPixel(x, y, VIO[math.max(1, 3 - math.floor(p.scatter*2))]) end end
  end
end

local frames = {}
local function add(p, dur) frames[#frames+1] = {p=p, dur=dur} end
for i = 0, 7 do add({haze=0.75, mark=0, amp=0, cancel=1, flash=0}, 0.11) end                               -- superposition
for i = 1, 4 do add({haze=0.75, mark=i/4, amp=0, cancel=1, flash=0}, 0.09) end                             -- the oracle marks
for i = 1, 14 do local u = i/14; u = u*u*(3-2*u); add({haze=0.75, mark=1, amp=u, cancel=1-u, flash=0, scatter=u}, 0.09) end -- amplify, cancel
for i = 0, 9 do add({haze=0.75, mark=1, amp=1, cancel=0, flash=0, glint=BX0 + (BX1-BX0+20)*i/9 - 10}, 0.06) end  -- the glint
add({haze=0.75, mark=1, amp=1, cancel=0, flash=0}, 2.4)                                                     -- hold
add({haze=0.75, mark=1, amp=1, cancel=0, flash=0.7}, 0.07); add({haze=0.75, mark=1, amp=1, cancel=0, flash=1}, 0.07)  -- read
for i = 1, 6 do local u = i/6; add({haze=0.75, mark=1 - u, amp=1 - u, cancel=u, flash=0.4*(1-u)}, 0.09) end -- collapse

local spr = Sprite(W, H, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
for i, fr0 in ipairs(frames) do
  local fr = (i == 1) and spr.frames[1] or spr:newEmptyFrame(i)
  fr.duration = fr0.dur
  local img = Image(W, H, ColorMode.RGB); draw(img, i, fr0.p)
  if i == 1 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
end
local tg = spr:newTag(1, #frames); tg.name = "idle"; tg.aniDir = AniDir.FORWARD
local total = 0; for _, f in ipairs(frames) do total = total + f.dur end
spr:saveAs(out .. "/title.aseprite"); print(string.format("wrote title.aseprite (%d frames, %.2f s)", #frames, total)); spr:close()
