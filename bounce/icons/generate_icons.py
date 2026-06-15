#!/usr/bin/env python3
"""Generate PNG app icons for the Bounce PWA — no external libraries.

Draws the same red patterned ball as the in-game canvas, supersampled
for smooth edges, and writes PNGs using only the Python standard library
(zlib + struct). Run:  python3 icons/generate_icons.py
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def render(size, maskable=False):
    """Return an RGBA bytearray for a size×size icon (2× supersampled)."""
    ss = 2
    S = size * ss
    px = bytearray(S * S * 4)

    cx, cy = S * 0.5, S * 0.52
    R = S * (0.34 if maskable else 0.30)
    sky_top = (10, 22, 38)
    sky_bot = (22, 50, 77)
    ball_hi = (255, 138, 156)
    ball_mid = (255, 46, 77)
    ball_lo = (183, 21, 48)
    grass = (55, 217, 138)

    # highlight centre for the radial shading
    hx, hy = cx - R * 0.35, cy - R * 0.40
    # rivet centres
    rivets = [(cx + math.cos(a) * R * 0.55, cy + math.sin(a) * R * 0.55)
              for a in (math.pi * i / 2 for i in range(4))]
    rivet_r = R * 0.12
    ground_y = S * 0.84
    ground_h = S * 0.028

    corner = S * 0.18  # rounded-rect corner radius for the background

    def in_round_rect(x, y):
        # full-bleed for maskable; rounded card otherwise
        if maskable:
            return True
        rx = min(max(x, corner), S - corner)
        ry = min(max(y, corner), S - corner)
        return (x - rx) ** 2 + (y - ry) ** 2 <= corner ** 2 or \
               (corner <= x <= S - corner) or (corner <= y <= S - corner)

    for y in range(S):
        for x in range(S):
            i = (y * S + x) * 4
            # background
            t = y / S
            r, g, b = lerp(sky_top[0], sky_bot[0], t), lerp(sky_top[1], sky_bot[1], t), lerp(sky_top[2], sky_bot[2], t)
            a = 255 if in_round_rect(x, y) else 0
            col = (int(r), int(g), int(b))

            if a:
                # ground bar
                if ground_y <= y <= ground_y + ground_h and S * 0.12 <= x <= S * 0.88:
                    col = grass

                # ball
                dx, dy = x - cx, y - cy
                d = math.hypot(dx, dy)
                if d <= R:
                    hd = math.hypot(x - hx, y - hy) / (R * 1.6)
                    hd = min(1.0, hd)
                    if hd < 0.5:
                        bc = mix(ball_hi, ball_mid, hd / 0.5)
                    else:
                        bc = mix(ball_mid, ball_lo, (hd - 0.5) / 0.5)
                    col = bc
                    # rivets
                    for (rxc, ryc) in rivets:
                        if (x - rxc) ** 2 + (y - ryc) ** 2 <= rivet_r ** 2:
                            col = mix(col, (0, 0, 0), 0.35)
                            break
                    # glossy highlight blob
                    if (x - hx) ** 2 / (R * 0.22) ** 2 + (y - hy) ** 2 / (R * 0.16) ** 2 <= 1:
                        col = mix(col, (255, 255, 255), 0.45)

            px[i] = col[0]
            px[i + 1] = col[1]
            px[i + 2] = col[2]
            px[i + 3] = a

    return downsample(px, S, ss), size


def downsample(px, S, ss):
    """Average ss×ss blocks down to (S/ss)×(S/ss) RGBA."""
    out_size = S // ss
    out = bytearray(out_size * out_size * 4)
    for y in range(out_size):
        for x in range(out_size):
            r = g = b = a = 0
            for oy in range(ss):
                for ox in range(ss):
                    si = ((y * ss + oy) * S + (x * ss + ox)) * 4
                    r += px[si]; g += px[si + 1]; b += px[si + 2]; a += px[si + 3]
            n = ss * ss
            di = (y * out_size + x) * 4
            out[di] = r // n; out[di + 1] = g // n; out[di + 2] = b // n; out[di + 3] = a // n
    return out


def write_png(path, width, height, rgba):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        c += struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        return c

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0
        raw.extend(rgba[y * stride:(y + 1) * stride])

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-512.png', 512, True),
    ]
    for name, size, maskable in targets:
        rgba, s = render(size, maskable)
        write_png(os.path.join(HERE, name), s, s, rgba)
        print('wrote', name)


if __name__ == '__main__':
    main()
