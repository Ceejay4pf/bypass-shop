"""Draw the Bypass Shop app icons as PNG.

WHY THIS EXISTS
The icons were SVG only. Chrome on Android decides whether to offer "Install
app" partly on the icons a manifest declares, and an SVG is not something every
version of every browser will accept for that; iOS Safari ignores the manifest
entirely and wants a plain square PNG from <link rel="apple-touch-icon">. So the
app was installable in theory and, on a real phone, mostly wasn't.

These are drawn to match public/icon.svg exactly rather than converted from it —
PIL cannot render SVG, and adding a renderer to the toolchain to produce four
small squares is a poor trade. The paths below are the same coordinates as the
SVG, so if the SVG is ever redrawn, redraw them here too.

Run:  python tools/make_icons.py
"""

from PIL import Image, ImageDraw, ImageFont

BLUE = (37, 99, 235)      # #2563EB
WHITE = (255, 255, 255)


def _font(size):
    """Arial Bold if Windows has it, else whatever PIL can give us. The word
    BYPASS is decoration; a fallback face is better than no icon."""
    for name in ("arialbd.ttf", "Arial_Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw(size, maskable=False):
    """One icon, drawn at 4x and shrunk, which is how the diagonals come out
    smooth without any anti-aliasing code of our own."""
    s = 4
    px = size * s
    img = Image.new("RGB", (px, px), BLUE)
    d = ImageDraw.Draw(img)

    # scale from the 512 SVG viewBox onto this canvas
    k = px / 512.0
    def p(x, y):
        return (x * k, y * k)

    if maskable:
        # Square, and the mark pulled in to 152..360 so Android can crop it to a
        # circle without slicing the box. No wordmark: at the size a launcher
        # shows this, six letters are a grey smudge.
        box = [(256, 150), (360, 204), (360, 308), (256, 362), (152, 308), (152, 204)]
        mid_l, mid_c, mid_r = (152, 204), (256, 258), (360, 204)
        stem = [(256, 258), (256, 362)]
        w = 24 * k
    else:
        # Rounded square, matching the SVG's rx=96.
        img = Image.new("RGB", (px, px), (255, 255, 255))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, px - 1, px - 1], radius=96 * k, fill=BLUE)
        box = [(256, 120), (392, 190), (392, 322), (256, 392), (120, 322), (120, 190)]
        mid_l, mid_c, mid_r = (120, 190), (256, 260), (392, 190)
        stem = [(256, 260), (256, 392)]
        w = 26 * k

    lw = max(1, int(round(w)))
    d.line([p(*a) for a in box] + [p(*box[0])], fill=WHITE, width=lw, joint="curve")
    d.line([p(*mid_l), p(*mid_c), p(*mid_r)], fill=WHITE, width=lw, joint="curve")
    d.line([p(*stem[0]), p(*stem[1])], fill=WHITE, width=lw, joint="curve")

    # round the joints off, the way stroke-linecap="round" does
    r = lw / 2.0
    for pt in box + [mid_c, stem[1]]:
        cx, cy = p(*pt)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

    if not maskable:
        f = _font(int(70 * k))
        d.text(p(256, 470), "BYPASS", font=f, fill=WHITE, anchor="ms")

    return img.resize((size, size), Image.LANCZOS)


OUT = [
    ("public/icon-192.png", 192, False),
    ("public/icon-512.png", 512, False),
    ("public/icon-maskable-512.png", 512, True),
    # iOS draws its own rounded corners over whatever it is given, so the
    # apple icon is the square one — a rounded PNG would get rounded twice and
    # show white wedges in the corners.
    ("public/apple-touch-icon.png", 180, True),
]

if __name__ == "__main__":
    for path, size, maskable in OUT:
        draw(size, maskable).save(path, "PNG", optimize=True)
        print("wrote", path, f"{size}x{size}")
