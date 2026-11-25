#!/usr/bin/env python3
"""Writes the README's images, `.misc/readme/*.svg`, from the layouts below.

Run from anywhere with the system Python 3.9 or later; it needs only the standard library:

    python3 .misc/readme/build.py                  # rewrites the SVG files beside this script
    python3 .misc/readme/build.py --dark <dir>     # also writes copies forced to the dark palette

Every image shares one style block: the palette as CSS variables on a solid panel, redefined
under `prefers-color-scheme: dark`, so each image is legible on either GitHub theme. Text widths
come from Helvetica's metrics, padded for the wider system fonts; the build stops when a label
would leave its box or two labels overlap, instead of writing a broken image.
"""

import os
import re
import sys
from xml.sax.saxutils import escape

OUT = os.path.dirname(os.path.abspath(__file__))
W = 960

# Helvetica's advance widths per 1000 units, ASCII 32..126.
HELVETICA = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
OTHER = {"→": 1000, "←": 1000, "↓": 600, "·": 278, "›": 333, "✓": 800, "✗": 800, "…": 1000,
         "’": 222, "—": 1000, "–": 556, "⇢": 1000, "│": 300, "≤": 584}
SANS_PAD = 1.08  # San Francisco and Segoe UI set a little wider than Helvetica
BOLD_PAD = 1.07
MONO_EM = 0.61

SIZE = {"h": 20, "b": 16, "t": 15, "m": 14, "c": 14}
LEAD = {"h": 26, "b": 21, "t": 20, "m": 19, "c": 19}

STYLE = """
svg { --bg: #ffffff; --frame: #d1d9e0; --ink: #1f2328; --muted: #59636e; --line: #6e7781;
  --bnd: #0969da; --bnd-f: #ddf4ff; --beh: #8250df; --beh-f: #fbefff;
  --dat: #9a6700; --dat-f: #fff8c5; --bad: #cf222e; --bad-f: #ffebe9;
  --neu: #8c959f; --neu-f: #f6f8fa; }
@media (prefers-color-scheme: dark) {
  svg { --bg: #0d1117; --frame: #3d444d; --ink: #f0f6fc; --muted: #9198a1; --line: #9198a1;
    --bnd: #4493f8; --bnd-f: #0c2448; --beh: #ab7df8; --beh-f: #221a3a;
    --dat: #d29922; --dat-f: #2b2111; --bad: #f85149; --bad-f: #3a1618;
    --neu: #656c76; --neu-f: #151b23; }
}
text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica,
  Arial, sans-serif; font-size: 15px; fill: var(--ink); }
.code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
  "Liberation Mono", monospace; font-size: 14px; }
.h { font-size: 20px; font-weight: 600; }
.b { font-size: 16px; font-weight: 600; }
.m { font-size: 14px; fill: var(--muted); }
.panel { fill: var(--bg); stroke: var(--frame); stroke-width: 1; }
.box { stroke-width: 1.5; }
.dash { stroke-dasharray: 6 4; }
.k-bnd { fill: var(--bnd-f); stroke: var(--bnd); } .a-bnd { fill: var(--bnd); }
.k-beh { fill: var(--beh-f); stroke: var(--beh); } .a-beh { fill: var(--beh); }
.k-dat { fill: var(--dat-f); stroke: var(--dat); } .a-dat { fill: var(--dat); }
.k-bad { fill: var(--bad-f); stroke: var(--bad); } .a-bad { fill: var(--bad); }
.k-neu { fill: var(--neu-f); stroke: var(--neu); } .a-neu { fill: var(--ink); }
.k-bg { fill: var(--bg); stroke: var(--neu); }
.ln { fill: none; stroke: var(--line); stroke-width: 1.5; }
.ln-bad { fill: none; stroke: var(--bad); stroke-width: 1.5; }
.hd { fill: var(--line); } .hd-bad { fill: var(--bad); }
.lbg { fill: var(--bg); } .p-bnd { fill: var(--bnd-f); } .p-beh { fill: var(--beh-f); }
"""


def char_width(c, mono, size):
    if mono:
        return MONO_EM * size
    o = ord(c)
    units = HELVETICA[o - 32] if 32 <= o <= 126 else OTHER.get(c, 1000)
    return units * size / 1000


def split_rich(s):
    """`a `code` b` → [("a ", False), ("code", True), (" b", False)]."""
    parts = s.split("`")
    return [(p, i % 2 == 1) for i, p in enumerate(parts) if p]


def seg_width(text, mono, size, bold=False):
    w = sum(char_width(c, mono, size if not mono else SIZE["c"]) for c in text)
    if not mono:
        w *= SANS_PAD * (BOLD_PAD if bold else 1)
    return w


def rich_width(s, cls="t"):
    size = SIZE[cls]
    bold = cls in ("h", "b")
    return sum(seg_width(t, m, size, bold) for t, m in split_rich(s))


def wrap(s, width, cls="t"):
    """Greedy wrap of a rich string, keeping `code` spans whole."""
    tokens = []
    for text, mono in split_rich(s):
        if mono:
            tokens.append("`" + text + "`")
        else:
            tokens.extend(t for t in re.split(r"(\s+)", text) if t)
    lines, cur = [], ""
    for tok in tokens:
        trial = cur + tok
        if cur and not tok.isspace() and rich_width(trial, cls) > width:
            lines.append(cur.rstrip())
            cur = tok
        else:
            cur = trial if (cur or not tok.isspace()) else cur
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


class Fig:
    def __init__(self, name, title, desc):
        self.name, self.title, self.desc = name, title, desc
        self.items = []
        self.texts = []  # (x0, y0, x1, y1, label) for the overlap check
        self.h = 0

    # -- primitives ------------------------------------------------------------------------
    def rect(self, x, y, w, h, cls, rx=8):
        self.items.append(
            '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" class="%s"/>' % (x, y, w, h, rx, cls))
        self.h = max(self.h, y + h)

    def text(self, x, y, s, cls="t", anchor="start", accent=None, check=True):
        """One line of rich text with its baseline at y."""
        width = rich_width(s, cls)
        x0 = {"start": x, "middle": x - width / 2, "end": x - width}[anchor]
        size = SIZE[cls]
        spans = []
        for t, mono in split_rich(s):
            c = "code" if mono else ""
            spans.append('<tspan class="%s">%s</tspan>' % (c, escape(t)) if c else escape(t))
        classes = " ".join(c for c in (cls if cls != "t" else "", accent and "a-" + accent) if c)
        attr = ' class="%s"' % classes if classes else ""
        anchor_attr = "" if anchor == "start" else ' text-anchor="%s"' % anchor
        self.items.append('<text x="%g" y="%g"%s%s xml:space="preserve">%s</text>'
                          % (x, y, attr, anchor_attr, "".join(spans)))
        if check:
            self.texts.append((x0, y - size * 0.78, x0 + width, y + size * 0.22, s))
        self.h = max(self.h, y + 6)
        return x0, x0 + width

    def label(self, x, y, s, cls="m", anchor="middle", on=None):
        """An arrow's label on a plate of the fill beneath it (`on`, a box kind), baseline at y."""
        width = rich_width(s, cls)
        x0 = {"start": x, "middle": x - width / 2, "end": x - width}[anchor]
        size = SIZE[cls]
        self.items.append('<rect x="%g" y="%g" width="%g" height="%g" class="%s"/>'
                          % (x0 - 3, y - size * 0.85, width + 6, size * 1.15, "p-" + on if on else "lbg"))
        self.text(x, y, s, cls, anchor)

    def arrow(self, pts, bad=False, dashed=False, head=True):
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        L = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        hl, hw = 10, 5
        line = list(pts)
        if head:
            line[-1] = (x2 - ux * (hl - 1), y2 - uy * (hl - 1))
        d = " ".join("%g,%g" % p for p in line)
        cls = ("ln-bad" if bad else "ln") + (" dash" if dashed else "")
        self.items.append('<polyline points="%s" class="%s"/>' % (d, cls))
        if head:
            bx, by = x2 - ux * hl, y2 - uy * hl
            poly = [(x2, y2), (bx - uy * hw, by + ux * hw), (bx + uy * hw, by - ux * hw)]
            self.items.append('<polygon points="%s" class="%s"/>'
                              % (" ".join("%g,%g" % p for p in poly), "hd-bad" if bad else "hd"))

    # -- composites ------------------------------------------------------------------------
    def box(self, x, y, w, kind, title=None, lines=(), h=None, dashed=False, pad=12,
            title_accent=True, wrap_to=None):
        """A box with a bold title and wrapped lines; returns its height.

        A line is a rich string, or (cls, rich string) with cls "m" (muted) or "c" (one code
        line, never wrapped)."""
        inner = (wrap_to or w) - 2 * pad
        rows = []
        if title:
            for t in wrap(title, inner, "b"):
                rows.append(("b", t))
        for ln in lines:
            cls, s = ln if isinstance(ln, tuple) else ("t", ln)
            if cls == "gap":
                rows.append(("gap", ""))
                continue
            if cls == "c":
                rows.append(("t", "`%s`" % s))
                continue
            for t in wrap(s, inner, cls):
                rows.append((cls, t))
        content = sum(LEAD[c] if c != "gap" else 8 for c, _ in rows)
        hh = h if h is not None else content + 2 * pad - 4
        self.rect(x, y, w, hh, "box k-%s%s" % (kind, " dash" if dashed else ""))
        cy = y + pad - 4
        for cls, t in rows:
            if cls == "gap":
                cy += 8
                continue
            cy += LEAD[cls]
            accent = kind if (cls == "b" and title_accent) else None
            x0, x1 = self.text(x + pad, cy - 5, t, cls, accent=accent)
            if x1 > x + w - pad + 0.5:
                raise SystemExit("%s: %r leaves its box by %.0f px" % (self.name, t, x1 - (x + w - pad)))
        if content + 2 * pad - 4 > hh + 0.5:
            raise SystemExit("%s: box %r is %d px short" % (self.name, title, content + 2 * pad - 4 - hh))
        return hh

    # -- output ----------------------------------------------------------------------------
    def check(self):
        t = self.texts
        for i in range(len(t)):
            for j in range(i + 1, len(t)):
                a, b = t[i], t[j]
                if a[0] < b[2] - 1 and b[0] < a[2] - 1 and a[1] < b[3] - 1 and b[1] < a[3] - 1:
                    raise SystemExit("%s: %r overlaps %r" % (self.name, a[4], b[4]))
            if t[i][0] < 0 or t[i][2] > W:
                raise SystemExit("%s: %r leaves the image" % (self.name, t[i][4]))

    def svg(self, height=None):
        self.check()
        H = height or self.h + 24
        head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" '
                'aria-labelledby="title desc">\n<title id="title">%s</title>\n'
                '<desc id="desc">%s</desc>\n<style>%s</style>\n'
                % (W, H, escape(self.title), escape(self.desc), STYLE))
        panel = '<rect x="0.5" y="0.5" width="%d" height="%d" rx="12" class="panel"/>\n' % (W - 1, H - 1)
        return head + panel + "\n".join(self.items) + "\n</svg>\n"


# ==========================================================================================
# 1. How it works: one message, from the ask to the reply
# ==========================================================================================
def how_it_works():
    f = Fig("how-it-works", "One message, from the ask to the reply",
            "The api stores the user's message with its queued Run in one transaction and sends "
            "the jobs after the commit; the worker moves the Run to generating, then to done "
            "with the assistant's message, or to failed. A retry is a new Run.")
    f.text(28, 42, "One message, from the ask to the reply", "h")
    bw, gap, x0 = 272, 44, 28
    xs = [x0, x0 + bw + gap, x0 + 2 * (bw + gap)]

    f.text(28, 84, "In the api, one request", "b", accent="bnd")
    y1 = 98
    hs = [
        f.box(xs[0], y1, bw, "neu", "1 · The browser asks",
              ["`POST /chats/:chatId/messages`", "with `{ \"text\": \"Hello\" }`", ("m", "the cookie names the user")], h=126),
        f.box(xs[1], y1, bw, "bnd", "2 · One transaction",
              ["`AskChatService.ask` stores the user's message and its `queued` Run together"], h=126),
        f.box(xs[2], y1, bw, "bnd", "3 · After the commit",
              ["sends `ReplyToMessage` to SQS, and `TitleChat` on a chat's first message",
               "responds `202` with the Run"], h=126),
    ]
    for i in range(2):
        f.arrow([(xs[i] + bw, y1 + 63), (xs[i + 1], y1 + 63)])

    f.text(28, 258, "In the worker, one handling per job", "b", accent="bnd")
    y2 = 296
    f.box(xs[0], y2, bw, "neu", "4 · SQS invokes the worker",
          ["a Lambda mapping posts each batch to `POST /events`", ("m", "`TitleChat` goes to `TitleChatService`")], h=140)
    f.box(xs[1], y2, bw, "bnd", "5 · Start, then ask",
          ["`ReplyChatService.reply` moves the Run to `generating`, then asks the language model with the chat's history"], h=140)
    f.box(xs[2], y2, bw, "bnd", "6 · One transaction, or failed",
          ["the assistant's message and the Run `done`;", "on any other end, the Run `failed`",
           ("m", "its text stays in the row, off the wire")], h=140)
    for i in range(2):
        f.arrow([(xs[i] + bw, y2 + 70), (xs[i + 1], y2 + 70)])
    # 3 → 4: the job crosses SQS
    mx = xs[2] + bw / 2
    f.arrow([(mx, y1 + 126), (mx, 276), (xs[0] + bw / 2, 276), (xs[0] + bw / 2, y2)])
    f.label((mx + xs[0] + bw) / 2 + 40, 281, "the job, through SQS")

    # The Run's statuses
    f.text(28, 486, "A Run's statuses", "b", accent="beh")
    ys = 520
    pw, ph = 132, 40
    px = {"queued": 60, "generating": 300, "done": 560, "failed": 560}
    py = {"queued": ys, "generating": ys, "done": ys, "failed": ys + 92}

    def pill(name, kind):
        f.rect(px[name], py[name], pw, ph, "box k-%s" % kind, rx=20)
        f.text(px[name] + pw / 2, py[name] + 26, "`%s`" % name, anchor="middle")

    pill("queued", "neu")
    pill("generating", "neu")
    pill("done", "beh")
    pill("failed", "bad")
    cy = ys + ph / 2
    f.arrow([(px["queued"] + pw, cy), (px["generating"], cy)])
    f.label((px["queued"] + pw + px["generating"]) / 2, cy - 8, "`RunMove.start`")
    f.arrow([(px["generating"] + pw, cy), (px["done"], cy)])
    f.label((px["generating"] + pw + px["done"]) / 2, cy - 8, "`RunMove.complete`")
    fy = py["failed"] + ph / 2
    f.arrow([(px["generating"] + pw / 2, ys + ph), (px["generating"] + pw / 2, fy), (px["failed"], fy)])
    f.label(px["generating"] + pw / 2 + 12, fy - 8, "`RunMove.fail`: any other end", anchor="start")
    qy = fy + 44
    fx = px["failed"] + pw / 2
    f.arrow([(px["queued"] + pw / 2, ys + ph), (px["queued"] + pw / 2, qy), (fx, qy), (fx, py["failed"] + ph)])
    f.label(px["queued"] + pw / 2 + 12, qy + 5, "`RunMove.fail`: SQS refused the send", anchor="start")
    # retry
    rx = px["failed"] + pw
    ry = qy + 40
    f.arrow([(rx, fy), (rx + 40, fy), (rx + 40, ry), (px["queued"] - 30, ry),
             (px["queued"] - 30, cy), (px["queued"], cy)], dashed=True)
    f.label((rx + px["queued"]) / 2, ry + 5, "retry: `POST /chats/:chatId/runs`, a new Run of the same message")
    f.text(28, ry + 44, "Meanwhile the browser polls `GET /chats/:chatId/runs/:runId`, and sees `queued`, `generating`, then `done` or `failed`.", "m")
    return f


# ==========================================================================================
# 2. Infrastructure: what `make up` and `make dev` start, and who reaches what
# ==========================================================================================
def infrastructure():
    f = Fig("infrastructure", "The local stand",
            "make dev runs apps/web, apps/api and apps/worker on the host; make up runs MiniStack, "
            "with the queues, the worker's Lambda mappings, the bucket and the database inside "
            "it, and the telemetry backend. The worker alone reaches the language model.")
    f.text(28, 42, "The local stand: three processes, MiniStack and Grafana", "h")
    f.text(932, 42, "ports of the main tree; a worktree adds 10·N", "m", anchor="end")

    # row 1
    r1, h1 = 76, 64
    f.box(28, r1, 150, "neu", "browser", [("m", "or `curl`")], h=h1)
    f.box(240, r1, 260, "neu", "telemetry container", [("m", "Grafana :3003 · OTLP :4318")], h=h1)
    f.box(620, r1, 210, "neu", "Anthropic API", [("m", "the language model")], h=h1)
    # row 2: make dev
    r2, h2 = 214, 96
    f.box(28, r2, 150, "bnd", "`apps/web` :3001", ["health panel", "proxies `/api/*`"], h=h2)
    f.box(240, r2, 230, "bnd", "`apps/api` :3000", ["routes, use cases", "and the ask's sends"], h=h2)
    f.box(600, r2, 230, "bnd", "`apps/worker` :3002", ["`POST /events`", "runs each job's use case"], h=h2)
    # arrows between rows 1 and 2
    f.arrow([(103, r1 + h1), (103, r2)])
    f.label(111, (r1 + h1 + r2) / 2 + 5, "HTTP", anchor="start")
    f.arrow([(178, r2 + 48), (240, r2 + 48)])
    f.label(209, r2 + 40, "`/api/*`")
    f.arrow([(355, r2), (355, r1 + h1)])
    f.label(363, (r1 + h1 + r2) / 2 + 5, "traces, logs", anchor="start")
    f.arrow([(612, r2), (612, 108), (500, 108)])
    f.label(556, 102, "traces, logs")
    f.arrow([(725, r2), (725, r1 + h1)])
    f.label(733, (r1 + h1 + r2) / 2 + 5, "reply, title", anchor="start")

    # MiniStack
    mt, mb = 396, 568
    f.rect(28, mt, 904, mb - mt, "box k-bg dash")
    f.text(44, mt + 24, "MiniStack container :4566", "b")
    ra = mt + 40
    hA = 92
    f.box(44, ra, 150, "dat", "S3 bucket", ["`attachments`", ("m", "no app wires it")], h=hA, dashed=True)
    f.box(210, ra, 210, "dat", "SQS queues", ["`reply-to-message`", "`title-chat`", ], h=hA)
    f.box(440, ra, 200, "dat", "RDS `database`", ["a Postgres container", ("m", "host port 15432")], h=hA)
    f.box(660, ra, 230, "neu", "Lambda `worker`", ["a mapping per queue", ("m", "invokes go to the host")], h=hA)
    # host → MiniStack
    f.arrow([(330, r2 + h2), (330, ra)])
    f.label(322, 352, "`SendMessage`,", anchor="end")
    f.label(322, 371, "after the commit", anchor="end")
    f.arrow([(455, r2 + h2), (455, ra)])
    f.label(447, 362, "SQL", anchor="end")
    f.arrow([(625, r2 + h2), (625, ra)])
    f.label(617, 362, "SQL", anchor="end")
    f.arrow([(760, ra), (760, r2 + h2)])
    f.label(768, 352, "each batch to", anchor="start")
    f.label(768, 371, "`POST /events`", anchor="start")
    # SQS → Lambda, under the database
    f.arrow([(315, ra + hA), (315, ra + hA + 24), (775, ra + hA + 24), (775, ra + hA)])
    f.label(545, ra + hA + 29, "batches, through the mappings")
    # Pulumi
    py = 596
    f.box(28, py, 904, "neu", "Pulumi: `make up` runs `deployment/local`",
          ["creates the MiniStack and telemetry containers, then inside MiniStack the queues with their dead-letter queues, the function and its mappings, the bucket and the database"])
    f.arrow([(480, py), (480, mb)], dashed=True)
    f.label(488, py - 9, "provisions", anchor="start")
    return f


# ==========================================================================================
# 3. Architecture: the three rings, imports point inward, the guards refuse the rest
# ==========================================================================================
def architecture():
    f = Fig("architecture", "Three rings, imports point inward",
            "The boundary (apps, the kernel's clients, a module's infrastructure) imports the "
            "behaviour (the use cases, a module's services, domain and contract), which imports "
            "the data, kernel/data. Biome, its GritQL plugin, the isolated linker with tsc -b "
            "and make bundle-check refuse an import that points the wrong way.")
    f.text(28, 42, "Three rings, every import points inward", "h")
    # rings
    f.rect(28, 66, 560, 486, "box k-bnd")
    f.text(46, 92, "boundary", "b", accent="bnd")
    x = 46
    for chip in ("`apps/api`", "`apps/worker`", "`apps/web`"):
        x = f.text(x, 120, chip)[1] + 28
    f.text(46, 144, "the kernel's clients: `config` `postgres` `aws` `llm`")
    f.text(46, 168, "a module's `infrastructure/`: queues, assistants")

    f.rect(64, 194, 488, 334, "box k-beh")
    f.text(82, 220, "behaviour", "b", accent="beh")
    f.text(82, 248, "`application/use-cases`")
    f.text(82, 272, "a module's `services/`")
    f.text(82, 296, "a module's `domain/` and `contract/`")
    f.text(82, 320, "modules: `chat`, `identity`", "m")

    f.rect(100, 346, 416, 158, "box k-dat")
    f.text(118, 372, "data", "b", accent="dat")
    f.text(118, 400, "`kernel/data`")
    f.text(118, 424, "tables, entities, repositories,")
    f.text(118, 446, "the one `init` migration")
    f.text(118, 476, "the one source of truth", "m")

    # inward arrows
    f.arrow([(480, 150), (480, 194)])
    f.label(472, 178, "imports", anchor="end", on="bnd")
    f.arrow([(480, 300), (480, 346)])
    f.label(472, 330, "imports", anchor="end", on="beh")
    # refused outward
    f.arrow([(400, 346), (400, 300)], bad=True)
    f.label(392, 330, "✗ refused", anchor="end", on="beh")

    # guards
    gx, gw = 612, 320
    f.text(gx, 92, "What refuses a wrong import", "b")
    rows = [
        ("Biome `noRestrictedImports`", "an import across a ring, or outward between a module's layers"),
        ("`biome-imports.grit`", "another part's file, a relative path"),
        ("Biome `noImportCycles`", "a cycle of imports"),
        ("isolated linker, `tsc -b`", "a workspace its `package.json` does not declare"),
        ("`make bundle-check`", "a server package in the browser's bundle"),
    ]
    y = 110
    for t, d in rows:
        hh = f.box(gx, y, gw, "neu", t, [d], title_accent=False)
        y += hh + 12
    f.text(gx, y + 14, "what no tool sees, review refuses", "m")
    f.text(28, 580, "`packages/*` (generic tools) and `deployment/` sit outside the rings.", "m")
    return f


# ==========================================================================================
# 4. Module design: the inside of chat, and where a change goes
# ==========================================================================================
def module_design():
    f = Fig("module-design", "How a module is cut",
            "From a handler down: use cases, the module's <Verb><Model>Service, its <Model>Service "
            "over the data layer's repositories, and its models' rules and moves; a change that "
            "is no fix wraps or composes a unit instead of editing it.")
    f.text(28, 42, "How a module is cut, in `chat`", "h")
    sx, sw = 28, 400
    side_x, side_w = 478, 172
    rows = [
        ("bnd", "handler · `apps/`", ["`ChatHandler`, `WorkerHandler`", ("m", "calls one method or use case, at most after the user's record's read")]),
        ("beh", "use case · `application/use-cases`", ["`replyToMessage` `titleChat`", ("m", "a plain `Effect.fn`; only a handler calls it")]),
        ("beh", "`<Verb><Model>Service` · `services/`", ["`AskChatService.ask`, `.retry`", "`ReplyChatService.reply`", "`TitleChatService.title`"]),
        ("beh", "`<Model>Service` · `services/`", ["`ChatService` `MessageService` `RunService`", "`create` `getOne(where)` `update(to, where)`", "`RunService.update(from, to)`: under the status read"]),
        ("beh", "rules and moves · `domain/`", ["`ChatPolicy` `RunPolicy` `RunMove`", "`ChatState` `RunState`", ("m", "a class of statics per kind, beside the model")]),
    ]
    y = 66
    tops = []
    for kind, title, lines in rows:
        hh = f.box(sx, y, sw, kind, title, lines)
        tops.append((y, hh))
        y += hh + 34
    for i in range(len(tops) - 1):
        y0 = tops[i][0] + tops[i][1]
        y1 = tops[i + 1][0]
        f.arrow([(sx + 60, y0), (sx + 60, y1)])
        f.label(sx + 68, (y0 + y1) / 2 + 5, "calls" if i < 3 else "applies", anchor="start")
    # side boxes
    vy, vh = tops[2]
    ih = f.box(side_x, vy - 8, side_w, "bnd", "`infrastructure/`", ["`chat.queue.ts`", "`MessageAssistant`", "`ChatAssistant`"])
    f.arrow([(sx + sw, vy + vh / 2), (side_x, vy + vh / 2)])
    f.label((sx + sw + side_x) / 2, vy + vh / 2 - 8, "calls")
    my, mh = tops[3]
    dh = f.box(side_x, my - 4, side_w, "dat", "`kernel/data`", ["`ChatRepository`", "`MessageRepository`", "`RunRepository`"])
    f.arrow([(sx + sw, my + mh / 2), (side_x, my + mh / 2)])
    f.label((sx + sw + side_x) / 2, my + mh / 2 - 8, "calls")
    f.box(side_x, my - 4 + dh + 12, side_w, "neu", None, [("m", "and `Transaction`, from `packages/db`, for the writes that commit together")])

    # where a change goes
    px, pw = 672, 260
    f.text(px, 90, "Where a change goes", "b")
    f.text(px, 112, "ask in order; the first yes decides", "m")
    steps = [
        ("1 · A fix, or its own purpose", "edit the unit"),
        ("2 · Every holder needs it", "wrap: a `layer<Variant>` of the same interface"),
        ("3 · Only some callers need it", "compose: `<Aspect><Model>Service`, `ensure<Combined>`"),
        ("4 · An order of calls", "over models of one module: `<Verb><Model>Service`; over modules: a use case"),
    ]
    y = 128
    for q, a in steps:
        hh = f.box(px, y, pw, "neu", q, [a], title_accent=False)
        y += hh + 12
    f.box(px, y + 4, pw, "bad", None, ["Never fold a wrap or a composed unit into the one below to save lines."])
    return f


# ==========================================================================================
# 5. Rules and style: the rule files by what they bind, and the few met first
# ==========================================================================================
def rules_and_style():
    f = Fig("rules-and-style", "The rules and the code style",
            "The fifteen files of .claude/rules grouped by what they bind, then the six questions "
            "of name-and-body.md, the file names and the two kinds of error.")
    f.text(28, 42, "The rules in `.claude/rules/`, and the ones met first", "h")
    lx, lw = 28, 330
    groups = [
        ("beh", "every `.ts` file", ["`name-and-body.md` `naming.md`", "`composition.md` `effect.md`",
                                   "`effect-style.md` `effect-services.md`"]),
        ("beh", "`application/`, `apps/`, `kernel/`", ["`layering.md` `modules.md`", "`repositories.md` `models.md`"]),
        ("beh", "the tests", ["`effect-tests.md`"]),
        ("neu", "the repository and the toolkit", ["`tooling.md` `claude-md.md`", "`commits.md` `pull-requests.md`"]),
    ]
    y = 66
    for kind, t, lines in groups:
        hh = f.box(lx, y, lw, kind, t, lines)
        y += hh + 12
    f.text(lx, y + 10, "a file loads where its `paths:` filter matches;", "m")
    f.text(lx, y + 30, "`commits.md`, with none, loads always", "m")

    rx, rw = 380, 552
    y = 66
    y += f.box(rx, y, rw, "neu", "`name-and-body.md`: six questions of every public name", [
        "1  The name tells the intent: what is true after the call",
        "2  One word per concept, one concept per word",
        "3  The body does what the name and the types promise",
        "4  One level of abstraction in a body",
        "5  Know what holds a unit's methods together",
        "6  One sentence, no \"and\"",
    ], title_accent=False) + 12
    y += f.box(rx, y, rw, "neu", "File names: `naming.md`", [
        "`<name>.<role>.ts`: `run.model.ts` `ask-chat.service.ts` `chat.http.ts`",
        "`<owner>-<what>.ts`: `llm-call-policy.ts` `schema-codec.ts`",
    ], title_accent=False) + 12
    cw = (rw - 16) / 2
    wire = ["`Schema.TaggedError`", "`ChatBusyError` → `409`", "`RunNotFoundError` → `404`", ("m", "the api serves it as it is")]
    inner = ["`Data.TaggedError`", "`RunStatusInvalidError`", "`RunStartedError`", ("m", "never reaches a response")]
    f.box(rx, y, cw, "bnd", "on the wire: `effect.md`", wire)
    f.box(rx + cw + 16, y, cw, "beh", "inside the process", inner)
    return f


# ==========================================================================================
# 6. Patterns the code repeats
# ==========================================================================================
def patterns():
    f = Fig("patterns", "Patterns the code repeats",
            "Six shapes from chat: a guarded move, a rule keyed by a table, the writes in one "
            "transaction with the sends after it, errors handled once at a flow's end, "
            "acquireUseRelease around the answer, and real services over mocked repositories.")
    f.text(28, 42, "Patterns the code repeats", "h")
    tw, gap = 444, 16
    xs = [28, 28 + tw + gap]
    tiles = [
        ("A guarded move", [
            "runs.update(run, yield* RunMove.start(run))",
            "// RunService.update(from, to):",
            "const { row } = yield* Run.makeUpdate(to)",
            "runs.update(row, encodeWhere(",
            "  Struct.pick(from, ['id', 'status'])))",
        ], "the write carries the status the Run was read in, so a Run moved since dies"),
        ("A rule keyed by a table", [
            "const moveRunRules = {",
            "  queued: ['generating', 'failed'],",
            "  generating: ['done', 'failed'],",
            "  done: [], failed: [],",
            "} as const satisfies Record<RunStatus, …>",
        ], "a new status fails typecheck until its row exists"),
        ("The writes in one transaction, sends after it", [
            "const run = yield* messages",
            "  .create({ chatId: chat.id, text, … })",
            "  .pipe(Effect.flatMap(runs.create),",
            "    transaction.run)",
            "if (ChatState.isNew(chat.run))",
            "  yield* queue.sendTitleChat(chat)",
            "return yield* askReply(run)",
        ], "a delivery always finds the Run it names"),
        ("Errors handled once, at the flow's end", [
            "replies.reply(job.messageId).pipe(",
            "  Effect.catchTag('RunNotFoundError', skip),",
            "  Effect.catchTag(['RunStartedError',",
            "    'LlmError'], logFailed),",
            "  Effect.onErrorIf(Cause.hasInterrupts, log))",
        ], "the main path reads as if nothing fails"),
        ("Start whole, answer, fail what was started", [
            "Effect.acquireUseRelease(",
            "  Effect.gen(function* start() { … }),",
            "  Effect.fnUntraced(function* answer(started) {",
            "    … }),",
            "  function failUnanswered(started, answered) {",
            "    … },",
            ")",
        ], "`start` → `generating`, `answer` → `done`, `failUnanswered` → `failed` on any other end; each step named where it runs"),
        ("Real services over mocked leaves", [
            "Layer.mock(ChatRepository, chats),",
            "Layer.mock(MessageRepository, messages),",
            "Layer.mock(RunRepository, runs),",
            "transaction,",
        ], "unit suites run the real services over mocked repositories; a method a case leaves out dies"),
    ]
    y = 66
    for r in range(3):
        hs = []
        for c in range(2):
            title, code, note = tiles[r * 2 + c]
            lines = [("c", s) for s in code] + [("gap", ""), ("m", note)]
            hs.append((xs[c], title, lines))
        # equal heights per row
        heights = []
        for x, title, lines in hs:
            probe = Fig("probe", "", "")
            heights.append(probe.box(x, y, tw, "neu", title, lines))
        hh = max(heights)
        for x, title, lines in hs:
            f.box(x, y, tw, "neu", title, lines, h=hh, title_accent=False)
        y += hh + 14
    return f


# ==========================================================================================
# 7. Principles behind the patterns
# ==========================================================================================
def principles():
    f = Fig("principles", "The principles behind it",
            "Composition over folding; guards in the build, not in review; one source of truth "
            "for data; minimal, then right, then hard; the reasoning committed beside the code.")
    f.text(28, 42, "The principles behind it", "h")
    rows = [
        ("Composition over folding",
         "A new purpose is a new unit that wraps or composes the old one; minimal means less code in each unit, never fewer units.",
         "`composition.md`, decisions › Composition: wrap or compose"),
        ("Guards in the build, not in review",
         "Biome, its GritQL plugin, `tsc -b` and the bundle check refuse a wrong import before anyone reads it; review keeps what no tool sees.",
         "decisions › Guards are configuration"),
        ("One source of truth for data",
         "`kernel/data` declares every store; a module's domain imports none of it and declares its own values, which a service holds in step with the tables'.",
         "decisions › The data at the centre, Checks kept in the tables"),
        ("Minimal, then right, then hard",
         "The whole feature in its smallest form, played end to end; then its design; then the `Later` items the owner picks.",
         "`sdd.md` › Minimal, right, hard"),
        ("Reasoning committed beside the code",
         "Each decision with its why, rejected alternatives and cost; a `Decision:` paragraph in its commit; a `lab.md` per ticket.",
         "`decisions.md`, `commits.md`, `docs/tickets/`"),
    ]
    y = 66
    kinds = ["neu"] * 5
    for (t, what, held), k in zip(rows, kinds):
        lt, lw_, lh = wrap(t, 230, "b"), wrap(what, 390, "t"), wrap(held, 204, "m")
        hh = max(len(lt) * LEAD["b"], len(lw_) * LEAD["t"], len(lh) * LEAD["m"]) + 22
        f.rect(28, y, 904, hh, "box k-%s" % k)
        for i, ln in enumerate(wrap(t, 230, "b")):
            f.text(44, y + 30 + i * LEAD["b"], ln, "b")
        for i, ln in enumerate(wrap(what, 390, "t")):
            f.text(290, y + 29 + i * LEAD["t"], ln)
        for i, ln in enumerate(lh):
            f.text(708, y + 29 + i * LEAD["m"], ln, "m")
        y += hh + 12
    return f


FIGS = [how_it_works, infrastructure, architecture, module_design, rules_and_style, patterns, principles]


def main(argv):
    dark = None
    if len(argv) >= 2 and argv[0] == "--dark":
        dark = argv[1]
        os.makedirs(dark, exist_ok=True)
    for build in FIGS:
        fig = build()
        svg = fig.svg()
        with open(os.path.join(OUT, fig.name + ".svg"), "w", encoding="utf-8") as fh:
            fh.write(svg)
        if dark:
            forced = svg.replace("@media (prefers-color-scheme: dark)", "@media all")
            with open(os.path.join(dark, fig.name + "-dark.svg"), "w", encoding="utf-8") as fh:
                fh.write(forced)
        print("wrote", fig.name + ".svg")


if __name__ == "__main__":
    main(sys.argv[1:])
