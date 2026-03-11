#!/usr/bin/env python3
"""
Extract ballroom dance figures from scanned PDF page images using Claude's vision API.

Usage:
    # Extract all figure pages (skips front matter automatically)
    python scripts/extract_figures.py

    # Extract specific PDF pages only
    python scripts/extract_figures.py --pages 7 8 9

    # Dry run: show which pages would be processed
    python scripts/extract_figures.py --dry-run

Requires ANTHROPIC_API_KEY set via environment variable or in a .env file
in the project root.
Output goes to data/extracted/<dance>.yaml
"""

import anthropic
import base64
import json
import os
import sys
import argparse
import yaml
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


def load_dotenv():
    """Load .env file from project root if it exists."""
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value


load_dotenv()
RAW_DIR = PROJECT_ROOT / "data" / "raw"
OUT_DIR = PROJECT_ROOT / "data" / "extracted"

# PDF pages that contain figure data (skip cover, preface, contents, abbreviations)
# Each PDF page is a two-page spread from the scanned book.
# Book page numbers (from contents):
#   Waltz: 9-43       Foxtrot: 44-72
#   Quickstep: 73-96  Tango: 97-127
#   Additional Figures: 128+
#
# PDF page mapping (each PDF page = 2 book pages):
#   PDF page 7  = book pages 10-11 (first Waltz figures)
#   PDF page 24 = book pages 44-45 (first Foxtrot figures) approx
#   etc.
#
# We process all pages from 7 onwards to catch everything.
FIRST_FIGURE_PAGE = 7
LAST_PAGE = 69

EXTRACTION_PROMPT = """You are extracting structured data from a scanned ballroom dance technique book (ISTD "The Ballroom Technique").

This image shows a two-page spread from the book. Extract ALL figures visible on BOTH pages.

## Abbreviations used in the book
- RF = Right Foot, LF = Left Foot, R = Right, L = Left
- LOD = Line of Dance, DW = Diagonally to wall, DC = Diagonally to centre
- PP = Promenade Position, CBMP = Contrary body movement position
- CBM = Contrary body movement, OP = Outside partner
- B = Ball of foot, H = Heel, T = Toe, IE = Inside Edge
- NFR = No foot rise, Com = Commence, Cont = Continue
- e/o = end of, S = Slow, Q = Quick
- A = Associate, L = Licentiate, F = Fellow (these are exam levels)

## What to extract

For each figure on the page, extract the following as a JSON object:

```json
{
  "dance": "waltz|foxtrot|quickstep|tango",
  "level": "student_teacher|associate|licentiate|fellow",
  "figure_number": 1,
  "figure_name": "Name of the Figure",
  "variant_name": null,
  "man": {
    "steps": [
      {
        "step_number": 1,
        "feet_position": "RF fwd",
        "alignment": "Facing DW",
        "amount_of_turn": "Com to turn R",
        "rise_and_fall": "Com to rise e/o 1"
      }
    ],
    "footwork": "1 HT; 2 T; 3 TH",
    "cbm": "on 1 (slight)",
    "sway": "SRR"
  },
  "lady": {
    "steps": [
      {
        "step_number": 1,
        "feet_position": "LF back",
        "alignment": "Backing DW",
        "amount_of_turn": "Com to turn R",
        "rise_and_fall": "Com to rise e/o 1 NFR"
      }
    ],
    "footwork": "1 TH; 2 T; 3 TH",
    "cbm": "on 1 (slight)",
    "sway": "SLL"
  },
  "timing": "1 2 3",
  "beat_value": "1, 1, 1",
  "notes": ["Any notes listed for this figure"],
  "precede": {
    "associate": ["Figure names that can precede at associate level"],
    "licentiate": ["Figure names at licentiate level"],
    "fellow": ["Figure names at fellow level"]
  },
  "follow": {
    "associate": ["Figure names that can follow at associate level"],
    "licentiate": ["Figure names at licentiate level"],
    "fellow": ["Figure names at fellow level"]
  }
}
```

## CRITICAL rules for precede/follow parsing

The precede and follow sections look like this in the book:

```
Precede: A  LF Closed Change — Chassé from PP — Outside Change — Basic Weave.
             At corner — Natural Turn.
             4-6 Natural Turn can be preceded by Reverse Corté.
         L  Weave from PP — Closed Telemark — Outside Spin — Turning Lock — 4-6
         F  Natural Turn can be preceded by Cross Hesitation.
```

The letters A, L, F at the START of lines indicate the exam level:
- A = Associate level
- L = Licentiate level
- F = Fellow level

IMPORTANT: You MUST separate the figure names into the correct level key. Items after "A" go in "associate", items after "L" go in "licentiate", items after "F" go in "fellow". Strip the level marker ("A", "L", "F", "A)", "L)", "F)") from the beginning of the values. For example, "A Whisk" should become just "Whisk" in the associate array. The level letter is NOT part of the figure name.

Each dash-separated item within a level is a SEPARATE figure/condition. Split them into separate array entries.

Example correct output:
```json
"precede": {
  "associate": ["LF Closed Change", "Chassé from PP", "Outside Change", "Basic Weave"],
  "licentiate": ["Weave from PP", "Closed Telemark", "Outside Spin", "Turning Lock"],
  "fellow": ["Natural Turn can be preceded by Cross Hesitation"]
}
```

## Other important rules

1. Extract EVERY figure visible on both pages. A single page spread may contain 1-3 figures.
2. If a figure has sub-variants (e.g., "RF Closed Change" and "LF Closed Change"), extract each as a separate entry with the same figure_number but different variant_name.
3. If a figure has positional variants at different levels (e.g., Whisk danced at a corner vs side of room), note these as separate entries or include in notes.
4. Preserve the EXACT text from the book for step descriptions, footwork, etc. Do not paraphrase or correct.
5. If a figure continues from a previous page or is only partially visible, extract what you can and add a note like "continues from previous page" or "continues on next page".
6. If the lady's steps say something like "All other technical details remain the same as normal [Figure]", note this in the lady section and leave the repeated fields as null.
7. The "level" field should be the LOWEST level at which this figure appears (student_teacher, associate, licentiate, or fellow).
8. For the dance name, look at the header at the top of each page (e.g., "WALTZ STUDENT TEACHER" or "WALTZ ASSOCIATE").
9. Use null for any field that is missing, marked with a dash, or not applicable.
10. If a page contains non-figure content (table of contents, definitions, etc.), return an empty array.
11. Some figures reference "see page X" for precedes/follows - include the text as-is.
12. For the "sway" field, extract ONLY the sway values (e.g., "SRR" not "SWAY: SRR"). Strip the "SWAY:" label.
13. Always extract timing and beat_value if present. Timing is usually listed as "TIMING: 1 2 & 3 1" and beat_value as "BEAT VALUE: 1, 1/2, 1/2, 1". Strip the labels.
14. For the Closed Change and similar figures that have both a main step chart AND separate sub-variant precede/follow sections (e.g., "RF CLOSED CHANGE" and "LF CLOSED CHANGE"), extract the main figure WITH its step charts, then extract each sub-variant with its own precede/follow. The sub-variants do NOT need duplicate step charts.
15. IMPORTANT: The book often prints CBM and SWAY on the same line, like "CBM on 1 and 4. SWAY: SLSS." You MUST split these into separate fields. The "cbm" field should ONLY contain the CBM info (e.g., "on 1 and 4"), and the "sway" field should ONLY contain the sway letters (e.g., "SLSS"). Do NOT put sway data in the cbm field.
16. The "notes" field should ONLY contain actual notes (lines starting with "Note —" or general annotations). Do NOT include precede/follow data in the notes field. Precede and follow sections are separate fields.

Return ONLY a JSON array of figure objects. No markdown, no explanation, just the JSON array.
If no figures are found on this page, return an empty array: []
"""

MODEL = "claude-sonnet-4-5-20250929"


def encode_image(image_path: Path) -> str:
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def extract_page(client: anthropic.Anthropic, page_path: Path) -> list[dict]:
    """Send a page image to Claude and extract figure data."""
    image_data = encode_image(page_path)

    response = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT,
                    },
                ],
            }
        ],
    )

    text = response.content[0].text.strip()

    # Try to parse JSON - Claude might wrap it in ```json blocks
    if text.startswith("```"):
        # Strip markdown code fences
        lines = text.split("\n")
        text = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()

    try:
        figures = json.loads(text)
        if not isinstance(figures, list):
            figures = [figures]
        return figures
    except json.JSONDecodeError as e:
        print(f"  WARNING: Failed to parse JSON from {page_path.name}: {e}")
        # Save the raw response for debugging
        debug_path = OUT_DIR / f"debug_{page_path.stem}.txt"
        with open(debug_path, "w") as f:
            f.write(response.content[0].text)
        print(f"  Raw response saved to {debug_path}")
        return []


def main():
    parser = argparse.ArgumentParser(description="Extract figures from PDF page images")
    parser.add_argument(
        "--pages",
        type=int,
        nargs="+",
        help="Specific PDF page numbers to process (default: all figure pages)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which pages would be processed without calling the API",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output filename (default: raw_extraction.yaml)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        print("Set it in your shell or add to .env file.")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Determine which pages to process
    if args.pages:
        page_numbers = args.pages
    else:
        page_numbers = list(range(FIRST_FIGURE_PAGE, LAST_PAGE + 1))

    page_paths = []
    for num in page_numbers:
        path = RAW_DIR / f"page-{num:02d}.png"
        if path.exists():
            page_paths.append((num, path))
        else:
            print(f"WARNING: {path} not found, skipping")

    print(f"Will process {len(page_paths)} pages")

    if args.dry_run:
        for num, path in page_paths:
            print(f"  PDF page {num}: {path.name}")
        return

    client = anthropic.Anthropic(api_key=api_key)
    all_figures = []
    failed_pages = []

    for i, (num, path) in enumerate(page_paths):
        print(f"[{i+1}/{len(page_paths)}] Processing PDF page {num} ({path.name})...")

        try:
            figures = extract_page(client, path)
            for fig in figures:
                fig["_source_pdf_page"] = num
            all_figures.extend(figures)
            print(f"  Extracted {len(figures)} figure(s)")
        except anthropic.RateLimitError:
            print(f"  Rate limited, waiting 60s...")
            time.sleep(60)
            try:
                figures = extract_page(client, path)
                for fig in figures:
                    fig["_source_pdf_page"] = num
                all_figures.extend(figures)
                print(f"  Extracted {len(figures)} figure(s)")
            except Exception as e:
                print(f"  FAILED after retry: {e}")
                failed_pages.append(num)
        except Exception as e:
            print(f"  ERROR: {e}")
            failed_pages.append(num)

        # Small delay to avoid rate limits
        if i < len(page_paths) - 1:
            time.sleep(1)

    # Save all extracted figures
    output_name = args.output or "raw_extraction.yaml"
    output_path = OUT_DIR / output_name
    with open(output_path, "w") as f:
        yaml.dump(all_figures, f, default_flow_style=False, allow_unicode=True, width=120)

    print(f"\nDone! Extracted {len(all_figures)} figures total.")
    print(f"Output saved to: {output_path}")

    if failed_pages:
        print(f"\nFailed pages (re-run with --pages {' '.join(str(p) for p in failed_pages)}):")
        for p in failed_pages:
            print(f"  PDF page {p}")

    # Print summary by dance
    dance_counts = {}
    for fig in all_figures:
        dance = fig.get("dance", "unknown")
        dance_counts[dance] = dance_counts.get(dance, 0) + 1
    print("\nFigures by dance:")
    for dance, count in sorted(dance_counts.items()):
        print(f"  {dance}: {count}")


if __name__ == "__main__":
    main()
