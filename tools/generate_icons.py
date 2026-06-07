import zlib, struct, math, os

def png(width, height, pixels):
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw += bytes(pixels[y*width+x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw),9)) + chunk(b"IEND", b"")

def make(size):
    px = [(0,0,0,0)]*(size*size)
    cx = cy = (size-1)/2
    r = size*0.46
    inner = size*0.30
    bar_h = size*0.08
    bar_w = size*0.40
    for y in range(size):
        for x in range(size):
            dx, dy = x-cx, y-cy
            d = math.hypot(dx, dy)
            idx = y*size+x
            if d <= r:
                # red circle
                col = (229,57,53,255)
                # white "no" diagonal bar
                # rotate point by -45deg
                rx = (dx*math.cos(math.radians(-45)) - dy*math.sin(math.radians(-45)))
                ry = (dx*math.sin(math.radians(-45)) + dy*math.cos(math.radians(-45)))
                if abs(ry) <= bar_h and abs(rx) <= r*0.9 and d <= r*0.78:
                    col = (255,255,255,255)
                # white ring
                if d >= r-max(1,size*0.06):
                    col = (255,255,255,255)
                px[idx] = col
    return png(size, size, px)

os.makedirs("icons", exist_ok=True)
for s in (16,32,48,128):
    with open(f"icons/icon{s}.png","wb") as f:
        f.write(make(s))
    print("wrote icon", s)
