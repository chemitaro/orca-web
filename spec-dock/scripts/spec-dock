#!/usr/bin/env -S python3 -I
"""Standalone repository shim: delegate unchanged arguments to the external console."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sys

_SHIM_SIGNATURE = b"specdock.path-shim/v1"
_LEGACY_SIGNATURE = b"Standalone repository shim: delegate only to the absolute pinned engine."


def _preflight_failure(code: str, message: str) -> int:
    arguments = sys.argv[1:]
    common = arguments[: arguments.index("--") if "--" in arguments else len(arguments)]
    if "--json" not in common:
        print(f"spec-dock: {message}", file=sys.stderr)
        return 3
    print(
        json.dumps(
            {
                "schema_version": "specdock.cli/v2",
                "command": "entrypoint",
                "status": "failed",
                "exit_code": 3,
                "data": {"kind": "diagnostic", "findings": [], "unverified": []},
                "effects": [],
                "warnings": [],
                "error": {"code": code, "message": message, "details": {}},
                "recovery": None,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return 3


def main() -> int:
    candidate = shutil.which("spec-dock")
    if candidate is None:
        return _preflight_failure(
            "EXTERNAL_CLI_UNAVAILABLE", "external spec-dock is not on PATH; install the package and expose its console."
        )
    try:
        executable = Path(candidate).resolve(strict=True)
        recursive = executable.samefile(Path(__file__))
        if not recursive:
            with executable.open("rb") as stream:
                prefix = stream.read(4096)
            recursive = _SHIM_SIGNATURE in prefix or _LEGACY_SIGNATURE in prefix
        if recursive:
            return _preflight_failure(
                "SHIM_RECURSION", "PATH resolves to a repository shim; install the external spec-dock console on PATH."
            )
        environment = dict(os.environ)
        for key in ("PYTHONPATH", "PYTHONHOME", "PYTHONUSERBASE", "PYTHONSTARTUP"):
            environment.pop(key, None)
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        os.execve(str(executable), [str(executable), *sys.argv[1:]], environment)
    except (OSError, ValueError, RuntimeError):
        return _preflight_failure(
            "EXTERNAL_CLI_UNAVAILABLE",
            "external spec-dock could not be executed; check its package installation and PATH.",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
