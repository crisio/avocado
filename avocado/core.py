"""Core avocado helpers."""

from __future__ import annotations


def avocado(name: str = "avocado") -> str:
    """Return a simple avocado-themed string."""
    return str(name)


def describe(name: str = "avocado") -> str:
    """Provide a short description for the named fruit."""
    return f"{name} is a nutrient-dense fruit with a creamy texture."


def is_avocado(value: object) -> bool:
    """Return True when the provided value looks like an avocado."""
    return str(value).strip().lower() == "avocado"


def make_avocado(kind: str = "hass") -> dict[str, str]:
    """Return a simple avocado record."""
    return {"name": "avocado", "kind": kind}
