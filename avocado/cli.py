"""Command-line interface for the avocado package."""

from __future__ import annotations

import argparse

from .core import describe


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print avocado information.")
    parser.add_argument("name", nargs="?", default="avocado", help="Name to describe.")
    parser.add_argument("--count", type=int, default=1, help="Number of times to print the description.")
    args = parser.parse_args(argv)

    if args.count < 0:
        parser.error("--count must be non-negative")

    for _ in range(args.count):
        print(describe(args.name))

    return 0
