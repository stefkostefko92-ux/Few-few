"""Left and right in the mounting video (owner, 24.11.2026): on the left A SX + B SX, on the right A DX + B DX. The
middle pair starts DX; in step 10 its drill hits a rebar and its B DX is swapped for a B SX bolted to the other face
of A DX's web, which moves the fixing holes 65 mm aside. The DX geometry comes from the site's 3-D engine; an SX part
is its mirror image. Pure numpy: build.py, pose.py and middle.py share it."""
HAND = ("sx", "dx", "dx")     # pairs: left, right, middle (the middle's B becomes SX in step 10)
FACE_X = -30.0                # centre of B's fixing face (mm, pair-local x, DX)
WEB = 5.0                     # A's web is x 0…5 mm on DX; B SX bolts to its other face, mirrored about x = 2.5
REBAR_COVER = 0.022           # m of concrete before the middle bracket's first hole meets the rebar (Ø 12, vertical)


def face_x(k, swapped=False):
    """Centre of B's fixing face (mm, pair-local x): DX −30, SX +30, the middle's B SX on A DX +35."""
    if swapped:
        return WEB - FACE_X
    return -FACE_X if HAND[k] == "sx" else FACE_X


def mx(k, x):
    """An x of the DX geometry (mm or m, pair-local) on pair k: mirrored on an SX pair."""
    return -x if HAND[k] == "sx" else x


def mirrored(rec, about):
    """The SX part: the DX mesh mirrored about the plane x = about (mm), normals and winding turned with it."""
    r = dict(rec)
    r["p"] = rec["p"].copy()
    r["p"][:, 0] = 2 * about - r["p"][:, 0]
    r["n"] = rec["n"].copy()
    r["n"][:, 0] *= -1
    r["i"] = rec["i"].reshape(-1, 3)[:, ::-1].ravel().copy()
    return r
