# Contributing to TRPG Helper

## Before You Start

- Search existing issues and pull requests.
- Open an issue before large architectural or document-schema changes.
- Do not commit model weights, user data, logs, build products, credentials, or machine-specific paths.
- Keep changes scoped and preserve backward compatibility for saved Handout and Token projects.

## Development Workflow

1. Fork the repository and create a focused branch.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Implement the change with tests proportional to its risk.
4. Run all checks listed below.
5. Open a pull request using the repository template.

```bash
pnpm test
pnpm run typecheck
pnpm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Rust code must remain compatible with the `rust-version` declared in `src-tauri/Cargo.toml`. UI changes should include screenshots at relevant desktop sizes and must keep Chinese and English message keys synchronized.

## Commits and Pull Requests

- Use concise imperative commit subjects.
- Describe behavior changes, migration implications, and verification performed.
- Update `CHANGELOG.md`, `DOC.md`, configuration comments, and translations when applicable.
- Confirm the contribution can be distributed under GPL-3.0-only and identify any third-party material.

By contributing, you agree that your contribution is licensed under GPL-3.0-only.
