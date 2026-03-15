#!/usr/bin/env python3
"""Split raw_extraction.yaml into individual figure files.

Output structure:
  data/{dance}/{level_group}/{number}-{slug}.yaml

Level groups:
  student_teacher, associate -> bronze
  licentiate -> silver
  fellow -> gold
"""
import re
import yaml
from pathlib import Path

LEVEL_TO_GROUP = {
    "student_teacher": "bronze",
    "associate": "bronze",
    "licentiate": "silver",
    "fellow": "gold",
}

def slugify(name: str) -> str:
    """Convert figure name to a filename-safe slug."""
    s = name.lower()
    s = re.sub(r"[''']", "", s)         # remove apostrophes
    s = re.sub(r"[^a-z0-9]+", "-", s)   # non-alphanumeric to dashes
    s = s.strip("-")
    return s


def main():
    src = Path("data/extracted/raw_extraction.yaml")
    out_base = Path("data")

    with open(src) as f:
        figures = yaml.safe_load(f)

    print(f"Loaded {len(figures)} figures from {src}")

    created = 0
    for fig in figures:
        dance = fig["dance"]
        level = fig["level"]
        group = LEVEL_TO_GROUP[level]
        fig_num = fig.get("figure_number")
        fig_name = fig["figure_name"]
        variant = fig.get("variant_name")

        # Build filename: {number}-{name-slug}.yaml
        slug = slugify(fig_name)
        if variant:
            variant_slug = slugify(variant)[:40]  # truncate long variants
            slug += f"--{variant_slug}"

        if fig_num is not None:
            filename = f"{fig_num}-{slug}.yaml"
        else:
            filename = f"0-{slug}.yaml"

        dir_path = out_base / dance / group
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / filename

        # Handle potential filename collisions
        if file_path.exists():
            i = 2
            while True:
                alt = dir_path / f"{file_path.stem}-{i}.yaml"
                if not alt.exists():
                    file_path = alt
                    break
                i += 1

        with open(file_path, "w") as f:
            yaml.dump(fig, f, default_flow_style=False, allow_unicode=True, sort_keys=False, width=120)

        created += 1

    print(f"Created {created} files under {out_base}/")

    # List structure
    for dance_dir in sorted(out_base.iterdir()):
        if not dance_dir.is_dir() or dance_dir.name == "extracted":
            continue
        for level_dir in sorted(dance_dir.iterdir()):
            if not level_dir.is_dir():
                continue
            count = len(list(level_dir.glob("*.yaml")))
            print(f"  {dance_dir.name}/{level_dir.name}: {count} files")


if __name__ == "__main__":
    main()
