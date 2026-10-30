"""The logos as the renderers may draw them: only an image Pillow decodes to the end. A damaged one (cut short, a second
frame header) is left out of the page, never a failed document: an issued drawing set keeps its logo bytes for good
(audit 2026-10-06)."""

import io

from PIL import Image


MAX_PIXELS = 4_000_000  # as the upload check (src/lib/logo.ts): the size is read from the header, before decoding


def decodable(data):
    """True when the bytes are an image of at most MAX_PIXELS that Pillow can decode whole."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > MAX_PIXELS:
                return False
            im.load()
        return True
    except Exception:  # any decoder error: the logo stays out
        return False
