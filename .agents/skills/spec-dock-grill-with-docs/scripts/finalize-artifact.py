#!/usr/bin/env python3
"""Safely merge route sections into one CLI-published SpecDock Artifact."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys


class FinalizeError(RuntimeError):
    """Raised when the Artifact cannot be finalized without following links."""


def _required_flag(name: str) -> int:
    value = getattr(os, name, None)
    if not isinstance(value, int):
        raise FinalizeError(f"platform does not provide required {name} support")
    return value


def _directory_flags() -> int:
    return os.O_RDONLY | _required_flag("O_DIRECTORY") | _required_flag("O_NOFOLLOW") | getattr(os, "O_CLOEXEC", 0)


def _file_flags() -> int:
    return os.O_RDWR | _required_flag("O_NOFOLLOW") | getattr(os, "O_CLOEXEC", 0)


def _artifact_parts(raw: str, repo_root: str) -> tuple[str, ...]:
    if not raw or "\\" in raw:
        raise FinalizeError("artifact path must be a non-empty POSIX repository-relative path")
    lexical_parts = tuple(raw.split("/"))
    if any(part in {"", ".", ".."} for part in lexical_parts):
        raise FinalizeError("artifact path contains an empty or traversal component")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or tuple(parsed.parts) != lexical_parts:
        raise FinalizeError("artifact path must remain repository-relative and lexical")
    repo_name = Path(repo_root).name
    if lexical_parts[:3] == (repo_name, "spec-dock", "initiatives"):
        lexical_parts = lexical_parts[1:]
    if lexical_parts[:2] != ("spec-dock", "initiatives"):
        raise FinalizeError("artifact path is outside spec-dock/initiatives")
    if len(lexical_parts) < 5 or lexical_parts[-2] != "artifacts":
        raise FinalizeError("artifact path must be a direct child of a scope artifacts directory")
    filename = lexical_parts[-1]
    if filename == "rules.md" or not filename.endswith(".md"):
        raise FinalizeError("artifact filename must be a new Markdown Artifact, not rules.md")
    return lexical_parts


def _main_checkout(repo_root: Path) -> Path | None:
    """The main checkout of this clone: the root itself, or the owner of a linked worktree's git directory."""
    marker = repo_root / ".git"
    try:
        info = os.lstat(marker)
        if stat.S_ISDIR(info.st_mode):
            return repo_root
        if not stat.S_ISREG(info.st_mode):
            return None
        first = marker.read_text(encoding="utf-8").splitlines()[0]
    except (OSError, UnicodeDecodeError, IndexError):
        return None
    if not first.startswith("gitdir:"):
        return None
    gitdir = Path(os.path.normpath(repo_root / first[len("gitdir:") :].strip()))
    if gitdir.parent.name != "worktrees" or gitdir.parent.parent.name != ".git":
        return None
    return gitdir.parent.parent.parent


def _catalog_link_target(current_fd: int, component: str, parent_path: Path, repo_root: Path) -> Path | None:
    """Return this clone's catalog when `spec-dock/initiatives` points at exactly that, otherwise None."""
    main = _main_checkout(repo_root)
    if main is None:
        return None
    catalog = main / "spec-dock" / ".canonical"
    try:
        raw = os.readlink(component, dir_fd=current_fd)
        info = os.lstat(catalog)
        linked = os.path.realpath(raw if Path(raw).is_absolute() else parent_path / raw)
        expected = os.path.realpath(catalog)
    except OSError:
        return None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode) or linked != expected:
        return None
    return Path(expected)


def _open_component(
    current_fd: int, component: str, parent_path: Path, index: int, parts: tuple[str, ...], repo_root: Path
) -> int:
    try:
        return os.open(component, _directory_flags(), dir_fd=current_fd)
    except OSError as exc:
        # Version 4 links spec-dock/initiatives to this clone's catalog (main checkout spec-dock/.canonical); no other link is followed.
        if index == 1 and parts[:2] == ("spec-dock", "initiatives"):
            target = _catalog_link_target(current_fd, component, parent_path, repo_root)
            if target is not None:
                try:
                    return os.open(target, _directory_flags())
                except OSError as link_exc:
                    raise FinalizeError(f"cannot open the catalog link without following links: {link_exc}") from exc
        raise FinalizeError(f"unsafe directory component '{component}' (symlink or non-directory): {exc}") from exc


def _open_parent(repo_root: str, parts: tuple[str, ...]) -> int:
    root_path = Path(repo_root)
    if not root_path.is_absolute():
        raise FinalizeError("repo root must be absolute")
    try:
        root_info = os.lstat(root_path)
    except OSError as exc:
        raise FinalizeError(f"cannot inspect repo root: {exc}") from exc
    if stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode):
        raise FinalizeError("repo root must be an ordinary directory, not a symlink")

    try:
        current_fd = os.open(root_path, _directory_flags())
    except OSError as exc:
        raise FinalizeError(f"cannot open repo root without following symlinks: {exc}") from exc

    try:
        for index, component in enumerate(parts[:-1]):
            next_fd = _open_component(
                current_fd, component, root_path.joinpath(*parts[:index]), index, parts, root_path
            )
            os.close(current_fd)
            current_fd = next_fd
        return current_fd
    except BaseException:
        os.close(current_fd)
        raise


def _stat_artifact(parent_fd: int, filename: str) -> os.stat_result:
    try:
        info = os.stat(filename, dir_fd=parent_fd, follow_symlinks=False)
    except OSError as exc:
        raise FinalizeError(f"cannot lstat Artifact without following symlinks: {exc}") from exc
    if not stat.S_ISREG(info.st_mode):
        raise FinalizeError("Artifact is not an ordinary file; symlink and special files are rejected")
    if info.st_nlink != 1:
        raise FinalizeError("Artifact must have exactly one hard link")
    return info


def _require_parent_still_bound(repo_root: str, parts: tuple[str, ...], parent_fd: int) -> None:
    try:
        rebound_fd = _open_parent(repo_root, parts)
    except FinalizeError as exc:
        raise FinalizeError(f"Artifact parent moved outside the repository: {exc}") from exc
    try:
        opened = os.fstat(parent_fd)
        rebound = os.fstat(rebound_fd)
        if (opened.st_dev, opened.st_ino) != (rebound.st_dev, rebound.st_ino):
            raise FinalizeError("Artifact parent moved outside the repository")
    finally:
        os.close(rebound_fd)


def _identity(repo_root: str, artifact: str) -> int:
    parts = _artifact_parts(artifact, repo_root)
    parent_fd = _open_parent(repo_root, parts)
    try:
        info = _stat_artifact(parent_fd, parts[-1])
    finally:
        os.close(parent_fd)
    print(
        json.dumps(
            {
                "ctime_ns": info.st_ctime_ns,
                "device": info.st_dev,
                "inode": info.st_ino,
            },
            sort_keys=True,
        )
    )
    return 0


def _write_all(fd: int, body: bytes) -> None:
    view = memoryview(body)
    written = 0
    while written < len(view):
        count = os.write(fd, view[written:])
        if count <= 0:
            raise FinalizeError("Artifact write made no progress")
        written += count


def _read_all(fd: int) -> bytes:
    os.lseek(fd, 0, os.SEEK_SET)
    chunks: list[bytes] = []
    while True:
        chunk = os.read(fd, 1024 * 64)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def _merge_scaffold_with_sections(scaffold: bytes, sections: bytes) -> bytes:
    if not sections.startswith(b"## "):
        raise FinalizeError("final Artifact input must begin with a level-two route section")
    try:
        scaffold.decode("utf-8")
        sections.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FinalizeError("Artifact scaffold and route sections must be valid UTF-8") from exc
    if not scaffold.startswith(b"---\n") or b"\n---\n" not in scaffold[4:]:
        raise FinalizeError("CLI-generated Artifact scaffold has invalid front matter")
    section_offset = scaffold.find(b"\n## ")
    if section_offset < 0:
        raise FinalizeError("CLI-generated Artifact scaffold has no route section seam")
    heading_offset = scaffold.find(b"\n# ")
    if heading_offset < 0 or heading_offset >= section_offset:
        raise FinalizeError("CLI-generated Artifact scaffold has no preserved title heading")
    return scaffold[: section_offset + 1] + sections


def _finalize(
    repo_root: str,
    artifact: str,
    *,
    expected_device: int,
    expected_inode: int,
    expected_ctime_ns: int,
) -> int:
    body = sys.stdin.buffer.read()
    if not body:
        raise FinalizeError("final Artifact body must be non-empty")

    parts = _artifact_parts(artifact, repo_root)
    parent_fd = _open_parent(repo_root, parts)
    file_fd: int | None = None
    try:
        before = _stat_artifact(parent_fd, parts[-1])
        expected = (expected_device, expected_inode, expected_ctime_ns)
        observed_before = (before.st_dev, before.st_ino, before.st_ctime_ns)
        if observed_before != expected:
            raise FinalizeError(
                f"Artifact identity changed before open: expected={expected} observed={observed_before}"
            )
        try:
            file_fd = os.open(parts[-1], _file_flags(), dir_fd=parent_fd)
        except OSError as exc:
            raise FinalizeError(f"cannot open Artifact without following symlinks: {exc}") from exc
        opened = os.fstat(file_fd)
        observed_opened = (opened.st_dev, opened.st_ino, opened.st_ctime_ns)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_nlink != 1
            or observed_opened != expected
            or observed_opened != observed_before
        ):
            raise FinalizeError(
                f"Artifact identity changed during open: expected={expected} observed={observed_opened}"
            )

        scaffold = _read_all(file_fd)
        final_body = _merge_scaffold_with_sections(scaffold, body)
        _require_parent_still_bound(repo_root, parts, parent_fd)
        before_write = _stat_artifact(parent_fd, parts[-1])
        opened_before_write = os.fstat(file_fd)
        observed_before_write = (before_write.st_dev, before_write.st_ino, before_write.st_ctime_ns)
        observed_opened_before_write = (
            opened_before_write.st_dev,
            opened_before_write.st_ino,
            opened_before_write.st_ctime_ns,
        )
        if observed_before_write != expected or observed_opened_before_write != expected:
            raise FinalizeError(
                "Artifact identity changed immediately before write: "
                f"expected={expected} path={observed_before_write} opened={observed_opened_before_write}"
            )
        os.ftruncate(file_fd, 0)
        os.lseek(file_fd, 0, os.SEEK_SET)
        _write_all(file_fd, final_body)
        os.fsync(file_fd)

        after = _stat_artifact(parent_fd, parts[-1])
        observed_after = (after.st_dev, after.st_ino)
        expected_after = (expected_device, expected_inode)
        if observed_after != expected_after:
            raise FinalizeError(
                f"Artifact identity changed after write: expected={expected_after} observed={observed_after}"
            )
    finally:
        if file_fd is not None:
            os.close(file_fd)
        os.close(parent_fd)

    print(f"spec-dock: ok (finalize artifact) path={artifact}")
    return 0


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_path_arguments(command: argparse.ArgumentParser) -> None:
        command.add_argument("--repo-root", required=True)
        command.add_argument("--artifact", required=True)

    identity = subparsers.add_parser("identity", help="Read a no-follow Artifact identity")
    add_path_arguments(identity)

    finalize = subparsers.add_parser("finalize", help="Finalize the pinned Artifact from stdin")
    add_path_arguments(finalize)
    finalize.add_argument("--expected-device", type=int, required=True)
    finalize.add_argument("--expected-inode", type=int, required=True)
    finalize.add_argument("--expected-ctime-ns", type=int, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        if args.command == "identity":
            return _identity(args.repo_root, args.artifact)
        return _finalize(
            args.repo_root,
            args.artifact,
            expected_device=args.expected_device,
            expected_inode=args.expected_inode,
            expected_ctime_ns=args.expected_ctime_ns,
        )
    except (FinalizeError, OSError) as exc:
        print(
            f"error: {exc}; path={args.artifact}; partial Artifact requires operator recovery",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
