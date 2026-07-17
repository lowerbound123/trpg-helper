# Changelog

All notable changes to TRPG Helper are documented here. The project follows Semantic Versioning.

## [1.0.0] - 2026-07-18

### Added

- Layer-based Handout editor with masks, paint tools, shapes, polygons, effects, snapping, and deterministic export.
- Batch Token editor with built-in/custom rings, custom backgrounds, split-ring composition, and per-item history.
- PNG, JPEG, WebP, and JPEG XL encoding through shared Rust image services.
- Local asset, background, font, Handout, and Token project management.
- Optional BiRefNet, U²-Net, BEN2, and macOS Vision foreground segmentation.
- Simplified Chinese and English interfaces.
- GitHub Actions CI and draft Release workflows for macOS Apple Silicon, Windows x86_64, and Linux x86_64.

### Distribution Notes

- GitHub Release packages are unsigned and not notarized.
- Automatic updates and commercial app-store distribution are not included.
- Foreground segmentation model weights are downloaded and SHA-256 verified at runtime.

[1.0.0]: https://github.com/lowerbound123/trpg-helper/releases/tag/v1.0
