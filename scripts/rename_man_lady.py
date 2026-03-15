#!/usr/bin/env python3
"""Replace man/lady with leader/follower in raw_extraction.yaml."""
import re
import sys

def replace_terms(text: str) -> str:
    # YAML keys first (must be exact key matches at start of value)
    # "  man:" -> "  leader:" and "  lady:" -> "  follower:"
    text = re.sub(r'^(\s+)man:', r'\1leader:', text, flags=re.MULTILINE)
    text = re.sub(r'^(\s+)lady:', r'\1follower:', text, flags=re.MULTILINE)

    # Possessives
    text = re.sub(r"\bMan's\b", "Leader's", text)
    text = re.sub(r"\bman's\b", "leader's", text)
    text = re.sub(r"\bLady's\b", "Follower's", text)
    text = re.sub(r"\blady's\b", "follower's", text)

    # ALL CAPS in notes
    text = re.sub(r'\bMAN\b', 'LEADER', text)
    text = re.sub(r'\bLADY\b', 'FOLLOWER', text)

    # Title case in running text (must come after possessives)
    text = re.sub(r'\bMan\b', 'Leader', text)
    text = re.sub(r'\bLady\b', 'Follower', text)

    # Lowercase in running text
    text = re.sub(r'\bman\b', 'leader', text)
    text = re.sub(r'\blady\b', 'follower', text)

    return text


if __name__ == "__main__":
    path = "data/extracted/raw_extraction.yaml"
    with open(path, "r") as f:
        content = f.read()

    result = replace_terms(content)

    with open(path, "w") as f:
        f.write(result)

    # Count changes
    import difflib
    orig_lines = content.splitlines()
    new_lines = result.splitlines()
    changed = sum(1 for a, b in zip(orig_lines, new_lines) if a != b)
    print(f"Modified {changed} lines in {path}")
