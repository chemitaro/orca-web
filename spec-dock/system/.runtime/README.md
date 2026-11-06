# Runtime coordination

This shipped directory is a static compatibility and documentation surface. The current runtime does not create a `create.lock`, a repository-wide shared lease, a registry, a journal, or a cache here.

Only `work start` uses the short same-clone exclusion needed to recheck reservations, perform the Git branch/checkout effects, and publish one direct target without a duplicate Start. On Linux and macOS, that exclusion is `fcntl.flock` on an already-open descriptor for the existing Git common directory; it does not leave a custom lock file behind and it does not govern ordinary editing, Artifact publication, Finish, or `active clear`.

The durable worktree-local selection is the ignored `spec-dock/.agent/work-target/target-<32-hex-token>.json` record. Its filename token identifies one record instance and is not the GitHub-numbered Scope ID.
