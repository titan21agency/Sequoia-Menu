"""Trace assets/tree-cream.png into a smooth SVG path (pure Python + Pillow, no other deps).
Usage: python tools/trace-tree.py  -> prints the path "d" (viewBox 0 0 355 502)
"""
import math
from PIL import Image

SRC = 'assets/tree-cream.png'
UP = 4  # trace at 4x for smoother edges

im = Image.open(SRC).convert('RGBA')
W0, H0 = im.size
a = im.getchannel('A').resize((W0 * UP, H0 * UP), Image.LANCZOS)
W, H = a.size
px = a.load()
inside = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y] >= 128

# Moore-neighbour boundary trace of the single outer shape
start = next((x, y) for y in range(H) for x in range(W) if inside(x, y) and inside(x, y + 1) and inside(x + 1, y + 1))
dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]  # clockwise (y down)
pts, cur, s0 = [start], start, 6  # nothing above the start pixel: begin searching from north
while True:
    for i in range(8):
        d = (s0 + i) % 8
        nx, ny = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
        if inside(nx, ny):
            cur, s0 = (nx, ny), (d + 6) % 8  # next search starts two steps counter-clockwise
            break
    else:
        break
    if cur == start or len(pts) > 200000:
        break
    pts.append(cur)

# light smoothing of pixel stairs, then Ramer-Douglas-Peucker
n = len(pts)
sm = [(sum(pts[(i + k) % n][0] for k in range(-3, 4)) / 7, sum(pts[(i + k) % n][1] for k in range(-3, 4)) / 7) for i in range(n)]

def rdp(p, eps):
    if len(p) < 3:
        return p
    (x1, y1), (x2, y2) = p[0], p[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    i, dmax = 0, 0
    for k in range(1, len(p) - 1):
        d = abs((x2 - x1) * (y1 - p[k][1]) - (x1 - p[k][0]) * (y2 - y1)) / L
        if d > dmax:
            i, dmax = k, d
    if dmax > eps:
        return rdp(p[:i + 1], eps)[:-1] + rdp(p[i:], eps)
    return [p[0], p[-1]]

far = max(range(n), key=lambda i: (sm[i][0] - sm[0][0]) ** 2 + (sm[i][1] - sm[0][1]) ** 2)  # closed loop: split in two
poly = rdp(sm[:far + 1], 1.6)[:-1] + rdp(sm[far:] + [sm[0]], 1.6)[:-1]

def angle(a, b, c):
    v1 = (a[0] - b[0], a[1] - b[1]); v2 = (c[0] - b[0], c[1] - b[1])
    l = (math.hypot(*v1) * math.hypot(*v2)) or 1e-9
    return math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l))))

# quadratic curves through edge midpoints; sharp vertices (< 110 deg) stay as corners
m = len(poly)
f = lambda v: f'{v / UP:.2f}'.rstrip('0').rstrip('.')
mid = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
out = []
first = mid(poly[-1], poly[0])
out.append(f'M{f(first[0])} {f(first[1])}')
for i in range(m):
    prev, p, nxt = poly[i - 1], poly[i], poly[(i + 1) % m]
    e = mid(p, nxt)
    if angle(prev, p, nxt) < 110:
        out.append(f'L{f(p[0])} {f(p[1])}L{f(e[0])} {f(e[1])}')
    else:
        out.append(f'Q{f(p[0])} {f(p[1])} {f(e[0])} {f(e[1])}')
out.append('Z')
print(f'<!-- {W0}x{H0}, {m} vertices -->')
print(''.join(out))
