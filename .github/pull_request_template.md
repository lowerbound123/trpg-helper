## Summary

Describe the behavior changed and why.

## Verification

- [ ] `pnpm test`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`

## Compatibility and Licensing

- [ ] Saved-project compatibility was considered.
- [ ] UI text is present in both supported locales.
- [ ] No model weights, user data, credentials, logs, build products, or machine-specific paths are included.
- [ ] New third-party material and licenses are documented.
