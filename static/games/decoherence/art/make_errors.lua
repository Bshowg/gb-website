-- The faults, on a 20x20 canvas each, centred. Hard pixel objects with a dark outline, in colours no answer uses.
-- Tags: noise (4 x 80 ms, re-rolling static with a crackling edge), noise_hit; bug (2 x 120 ms, a scuttling mite), bug_frozen
-- (eyes white, after a flip), bug_hit; sim (4 x 160 ms, a vacuum tube whose filament glows and dims), sim_feed (flaring as it
-- eats an answer), sim_hit.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_errors.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function hex(h) return PC.rgba(tonumber(h:sub(2,3),16), tonumber(h:sub(4,5),16), tonumber(h:sub(6,7),16), 255) end
local K = {ol=hex("#05060c"), w=hex("#ffffff"), g1=hex("#e8ecff"), g2=hex("#b8bcd0"), g3=hex("#8a90a8"), g5=hex("#363a52"),
  a1=hex("#f2ffd0"), a3=hex("#b8ff3c"), a4=hex("#6fae1c"),
  r0=hex("#fff0f2"), r1=hex("#ffd0d8"), r2=hex("#ff3b5c"), r3=hex("#b02040"), r4=hex("#5a1020"),
  steel=hex("#6a7090"), steel2=hex("#9aa0b8"), glass=hex("#2a3050"), glass2=hex("#46507a")}
local N = 20
local function hsh(x, y, s) local k = (x*73856093 ~ y*19349663 ~ s*83492791) & 0x7fffffff; k = ((k ~ (k >> 13)) * 1274126177) & 0x7fffffff; return (k % 1000)/1000 end
local function stamp(img, t, pal, white)
  local H, Wd = #t, #t[1]; local x0, y0 = math.floor((N - Wd)/2), math.floor((N - H)/2)
  local function filled(r, k) return r >= 1 and r <= H and k >= 1 and k <= Wd and t[r]:sub(k,k) ~= "." end
  for r = 0, H+1 do for k = 0, Wd+1 do if not filled(r, k) and (filled(r-1,k) or filled(r+1,k) or filled(r,k-1) or filled(r,k+1)) then img:drawPixel(x0+k-1, y0+r-1, K.ol) end end end
  for r = 1, H do for k = 1, Wd do local ch = t[r]:sub(k,k); if ch ~= "." then img:drawPixel(x0+k-1, y0+r-1, white and K.w or pal[ch]) end end end
end
-- thermal noise: a jagged blob of static, re-rolled every frame
local function noise(f)
  local t = {}
  for y = 0, 12 do local row = ""
    for x = 0, 12 do local d = math.sqrt((x-6)^2 + (y-6)^2) + (hsh(x, y, 3 + f*5) - 0.5)*2.2
      if d < 5.6 then local h = hsh(x, y, 7 + f*13); row = row .. (h > 0.8 and "w" or (h > 0.55 and "1" or (h > 0.3 and "2" or "3"))) else row = row .. "." end end
    t[#t+1] = row end
  return t
end
local NOISEPAL = {w=K.w, ["1"]=K.g1, ["2"]=K.g3, ["3"]=K.g5}
-- the bit-flip bug: a circuit mite, a 0 for a body, wire legs, two hot eyes; the legs alternate
local BUG = {
  {"..#.....#..", "...#...#...", "#..#####..#", ".#.#a.a#.#.", "..##333##..", ".#.#3.3#.#.", "#..#3.3#..#", "...#333#...", "..#.###.#..", ".#.......#."},
  {"..#.....#..", "...#...#...", "...#####...", "##.#a.a#.##", "..##333##..", "...#3.3#...", "##.#3.3#.##", "...#333#...", ".#..###..#.", "#.........#"},
}
local BUGPAL = {["#"]=K.a4, ["3"]=K.a3, a=K.a1}
-- the classical simulator: a vacuum tube, its filament glowing and dimming
local TUBE = {
  "....####....",
  "...#gggg#...",
  "..#gg..gg#..",
  ".#g......g#.",
  ".#g.ffff.g#.",
  ".#g.fABf.g#.",
  ".#g.fBAf.g#.",
  ".#g.fABf.g#.",
  ".#g.ffff.g#.",
  ".#g......g#.",
  ".#gg....gg#.",
  ".#ssssssss#.",
  ".#sSSSSSSs#.",
  ".#ssssssss#.",
  "..#s#ss#s#..",
  "...#.##.#...",
}
local function tubePal(level, swap)
  local hot = {K.r3, K.r2, K.r1, K.r0}
  local a, b = hot[math.min(4, level+1)], hot[math.max(1, level)]
  if swap then a, b = b, a end
  return {["#"]=K.glass2, g=K.glass, f=(level >= 3) and K.r2 or K.r3, A=a, B=b, s=K.steel, S=K.steel2}
end

local spr = Sprite(N, N, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
local n, tags = 0, {}
local function frame(draw, dur)
  n = n + 1
  local fr = (n == 1) and spr.frames[1] or spr:newEmptyFrame(n)
  fr.duration = dur
  local img = Image(N, N, ColorMode.RGB); draw(img)
  if n == 1 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
end
local function tag(name, fn) local from = n + 1; fn(); tags[#tags+1] = {name, from, n} end
tag("noise", function() for f = 0, 3 do frame(function(img) stamp(img, noise(f), NOISEPAL) end, 0.08) end end)
tag("noise_hit", function() frame(function(img) stamp(img, noise(0), NOISEPAL, true) end, 0.1) end)
tag("bug", function() for f = 1, 2 do frame(function(img) stamp(img, BUG[f], BUGPAL) end, 0.12) end end)
tag("bug_frozen", function() frame(function(img) stamp(img, BUG[1], {["#"]=K.a4, ["3"]=K.a3, a=K.w}) end, 0.1) end)
tag("bug_hit", function() frame(function(img) stamp(img, BUG[1], BUGPAL, true) end, 0.1) end)
tag("sim", function() for f = 0, 3 do frame(function(img) stamp(img, TUBE, tubePal(({1,2,3,2})[f+1], f % 2 == 1)) end, 0.16) end end)
tag("sim_feed", function() frame(function(img) stamp(img, TUBE, tubePal(4, false)) end, 0.1) end)
tag("sim_hit", function() frame(function(img) stamp(img, TUBE, nil, true) end, 0.1) end)
for _, t in ipairs(tags) do local tg = spr:newTag(t[2], t[3]); tg.name = t[1]; tg.aniDir = AniDir.FORWARD end
spr:saveAs(out .. "/errors.aseprite"); print("wrote errors.aseprite (" .. n .. " frames)"); spr:close()
