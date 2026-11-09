"""Per-tier presentation + the 'caught' video. Values can be overridden by env."""
import os

DIFFICULTY = "hard"
LABEL = "hard · youtube downloads only"

# Hardcoded "caught" video: the clip that plays (in ASCII) when a request is
# blocked. Baked into the image at build time as media/caught.mp4 and played
# from disk; CAUGHT_VIDEO_URL is only the source for the one-time fallback fetch
# if that file is missing.
CAUGHT_VIDEO_URL = os.environ.get(
    "CAUGHT_VIDEO_URL", "https://www.youtube.com/watch?v=9lNZ_Rnr7Jc")
CAUGHT_FILE = os.environ.get(
    "CAUGHT_FILE", os.path.join(os.path.dirname(__file__), "media", "caught.mp4"))
