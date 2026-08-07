import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "music")
MANIFEST = os.path.join(ROOT, "lib", "soundtrack.ts")

LIBRARY = os.environ.get(
    "NIC_BOPS",
    r"C:\Users\nic21\OneDrive\Documents\Nic Vandewetering\AI Music",
)

VOLUMES = [
    (1, os.path.join(LIBRARY, "Volume 1", "*.mp3")),
    (2, os.path.join(LIBRARY, "Volume 2", "Source tracks", "*.mp3")),
    (3, os.path.join(LIBRARY, "Volume 3", "Source tracks", "*.mp3")),
]

CLIP = 64.0
FADE_IN = 0.35
FADE_OUT = 1.2
BITRATE = "96k"


def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def title_of(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r"^\d+\s*-\s*", "", stem)
    stem = re.sub(r"\s*\(v\d+\)$", "", stem)
    if " - " in stem:
        stem = stem.rsplit(" - ", 1)[0]
    return stem.strip()


def slug_of(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "track"


def excerpt_start(duration):
    if duration <= CLIP:
        return 0.0
    return min(duration * 0.25, 45.0, duration - CLIP)


def sources():
    for volume, pattern in VOLUMES:
        for path in sorted(glob.glob(pattern)):
            base = os.path.basename(path)
            if "Full Mix" in base or base.startswith("Nic Bops Vol"):
                continue
            yield volume, path


def cut(path, dest):
    duration = probe(path)
    start = excerpt_start(duration)
    length = min(CLIP, duration - start)
    fade_at = max(0.0, length - FADE_OUT)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error",
         "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", path,
         "-vn", "-map", "0:a:0",
         "-af", f"afade=t=in:st=0:d={FADE_IN},"
                f"afade=t=out:st={fade_at:.2f}:d={FADE_OUT},"
                "loudnorm=I=-15:TP=-1.5:LRA=11",
         "-ac", "2", "-ar", "44100", "-b:a", BITRATE,
         "-map_metadata", "-1", "-write_xing", "0", "-id3v2_version", "0",
         dest],
        check=True,
    )
    return length


def write_manifest(tracks):
    lines = [
        "export interface SoundtrackTrack {",
        "  id: string;",
        "  title: string;",
        "  volume: number;",
        "  src: string;",
        "  seconds: number;",
        "}",
        "",
        "export const SOUNDTRACK: readonly SoundtrackTrack[] = [",
    ]
    for t in tracks:
        title = t["title"].replace('"', '\\"')
        lines.append(
            f'  {{ id: "{t["id"]}", title: "{title}", volume: {t["volume"]}, '
            f'src: "{t["src"]}", seconds: {t["seconds"]} }},'
        )
    lines += ["];", ""]
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def main():
    os.makedirs(OUT, exist_ok=True)
    for stale in glob.glob(os.path.join(OUT, "*.mp3")):
        os.remove(stale)

    tracks = []
    taken = set()
    for volume, path in sources():
        title = title_of(path)
        slug = slug_of(title)
        while slug in taken:
            slug += "-b"
        taken.add(slug)

        name = f"v{volume}-{slug}.mp3"
        length = cut(path, os.path.join(OUT, name))
        tracks.append({
            "id": f"v{volume}-{slug}",
            "title": title,
            "volume": volume,
            "src": f"/music/{name}",
            "seconds": round(length, 2),
        })
        sys.stdout.write(f"{name}\n")
        sys.stdout.flush()

    write_manifest(tracks)
    total = sum(os.path.getsize(os.path.join(OUT, os.path.basename(t["src"])))
                for t in tracks)
    print(f"{len(tracks)} tracks, {total / 1048576:.1f} MB")


main()
