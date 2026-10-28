-- Grover, the interference orb. 11x11 RGB, one "body" layer plus a hidden dark "bg" reference layer (keep it hidden:
-- export.ps1 exports visible layers only). Tags: idle, fire, collapse, reading, reset, hurt.
-- Build:  "C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=<this folder> --script make_grover.lua
local out = app.params["out"] or "."
local PC = app.pixelColor
local function C(c, a) return PC.rgba(c[1], c[2], c[3], math.floor((a or 1) * 255 + 0.5)) end
local BG, CY, INK, WHITE, MINT, RED = {6,8,18}, {127,223,255}, {232,251,255}, {255,255,255}, {154,255,214}, {255,59,92}
local SZ, CX = 11, 5
local PI, TAU = math.pi, 2 * math.pi

local function dist(x, y) return math.sqrt((x - CX) ^ 2 + (y - CX) ^ 2) end
local function angd(a, b) local d = math.abs(a - b) % TAU; if d > PI then d = TAU - d end; return d end
local function round(v) return math.floor(v + 0.5) end
local function put(img, x, y, c) if x >= 0 and y >= 0 and x < SZ and y < SZ then img:drawPixel(x, y, c) end end
local function each(fn) for y = 0, SZ - 1 do for x = 0, SZ - 1 do fn(x, y, dist(x, y)) end end end
local function ring(img, r, col) each(function(x, y, d) if d >= r - 0.5 and d < r + 0.5 then put(img, x, y, col) end end) end
local function disc(img, r, col) each(function(x, y, d) if d < r then put(img, x, y, col) end end) end
local function haze(img, k) k = k or 1; each(function(x, y, d)
  if d >= 1.5 and d < 2.3 then put(img, x, y, C(CY, 0.22 * k)) elseif d >= 2.3 and d < 3.5 then put(img, x, y, C(CY, 0.12 * k)) end end) end
local function dot(img) put(img, CX, CX, C(WHITE)) end
local function plus(img, col) put(img, CX - 1, CX, col); put(img, CX + 1, CX, col); put(img, CX, CX - 1, col); put(img, CX, CX + 1, col) end
local function diag(img, col) put(img, CX - 1, CX - 1, col); put(img, CX + 1, CX - 1, col); put(img, CX - 1, CX + 1, col); put(img, CX + 1, CX + 1, col) end
local function core(img) diag(img, C(CY, 0.55)); plus(img, C(INK, 0.6)); dot(img) end

-- idle: the |0> lobe runs clockwise and the |1> lobe counter-clockwise around the ring; where they meet the ring
-- flashes white and a mint spark pops outside it (constructive interference), twice per loop
local N = 8
local function lobe(phi, th) return math.max(0, 1 - angd(phi, th) / (PI / 3)) end
local function idle(i)
  return function(img)
    local t = i / N * TAU
    local th0, th1 = t, PI - t
    haze(img)
    each(function(x, y, d)
      if d >= 3.5 and d < 4.5 then
        local tot = lobe(math.atan(y - CX, x - CX), th0) + lobe(math.atan(y - CX, x - CX), th1)
        if tot > 1.2 then put(img, x, y, C(WHITE))
        elseif tot > 0.75 then put(img, x, y, C(INK))
        elseif tot > 0.3 then put(img, x, y, C(CY))
        else put(img, x, y, C(CY, 0.4)) end
      end
    end)
    core(img)
    if angd(th0, th1) < 0.3 then
      local m = math.atan(math.sin(th0) + math.sin(th1), math.cos(th0) + math.cos(th1))
      put(img, CX + round(5 * math.cos(m)), CX + round(5 * math.sin(m)), C(MINT))
    end
  end
end

local FR = {}
local function add(tag, dur, fn) FR[#FR + 1] = {tag = tag, dur = dur, fn = fn} end
for i = 0, N - 1 do add("idle", 0.1, idle(i)) end
-- fire: a one-pixel recoil, the ring lit white
add("fire", 0.05, function(img) haze(img); ring(img, 3, C(INK)); dot(img) end)
-- collapse: the ring falls onto the query dot as the read begins
add("collapse", 0.05, function(img) haze(img, 0.7); ring(img, 3, C(CY)); core(img) end)
add("collapse", 0.05, function(img) haze(img, 0.4); ring(img, 2, C(CY)); dot(img) end)
add("collapse", 0.05, function(img) ring(img, 1, C(CY)); dot(img) end)
add("collapse", 0.05, function(img) dot(img) end)
-- reading: the dot pulses while the register is measured
add("reading", 0.08, function(img) dot(img) end)
add("reading", 0.08, function(img) plus(img, C(INK, 0.8)); dot(img) end)
add("reading", 0.08, function(img) ring(img, 2, C(CY, 0.3)); diag(img, C(CY, 0.6)); plus(img, C(INK)); dot(img) end)
add("reading", 0.08, function(img) plus(img, C(INK, 0.8)); dot(img) end)
-- reset: the Hadamard flash re-prepares the orb, a white burst that becomes the ring again
add("reset", 0.05, function(img) disc(img, 1.5, C(WHITE)) end)
add("reset", 0.05, function(img) ring(img, 4, C(CY, 0.3)); ring(img, 2, C(WHITE)); dot(img) end)
add("reset", 0.05, function(img) ring(img, 4, C(CY, 0.6)); ring(img, 3, C(WHITE)); dot(img) end)
add("reset", 0.05, function(img) haze(img); ring(img, 5, C(WHITE, 0.5)); ring(img, 4, C(INK)); dot(img) end)
add("reset", 0.05, function(img) haze(img); ring(img, 4, C(CY)); core(img) end)
-- hurt: a bite; the instrument shows the classical world's colour for a flicker
add("hurt", 0.05, function(img) each(function(x, y, d) if d < 3.5 then put(img, x, y, C(RED, 0.18)) end end); ring(img, 4, C(RED)); plus(img, C(INK, 0.6)); dot(img) end)

local spr = Sprite(SZ, SZ, ColorMode.RGB)
local layer = spr.layers[1]; layer.name = "body"
local bgl = spr:newLayer(); bgl.name = "bg"; bgl.stackIndex = 1; bgl.isVisible = false
local pal = Palette(6)
for i, c in ipairs({BG, CY, INK, WHITE, MINT, RED}) do pal:setColor(i - 1, Color{r = c[1], g = c[2], b = c[3], a = 255}) end
spr:setPalette(pal)
for i, f in ipairs(FR) do
  local fr = (i == 1) and spr.frames[1] or spr:newEmptyFrame(i)
  fr.duration = f.dur
  local img = Image(SZ, SZ, ColorMode.RGB); f.fn(img)
  if i == 1 and layer:cel(1) then spr:deleteCel(layer, 1) end
  spr:newCel(layer, fr, img, Point(0, 0))
  local b = Image(SZ, SZ, ColorMode.RGB); b:clear(PC.rgba(BG[1], BG[2], BG[3], 255))
  spr:newCel(bgl, fr, b, Point(0, 0))
end
local i = 1
while i <= #FR do
  local j = i
  while j < #FR and FR[j + 1].tag == FR[i].tag do j = j + 1 end
  local tag = spr:newTag(i, j); tag.name = FR[i].tag; tag.aniDir = AniDir.FORWARD
  i = j + 1
end
local path = out .. "/grover.aseprite"
spr:saveAs(path)
print("wrote " .. path .. " (" .. #FR .. " frames)")
spr:close()
