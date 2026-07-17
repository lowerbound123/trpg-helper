# Third-Party Notices

TRPG Helper is licensed under GPL-3.0-only. This notice does not relicense third-party software, model weights, fonts, user assets, or operating-system frameworks. Their original terms continue to apply.

## Application Framework and Frontend

The application depends on open-source packages including:

| Component | License | Source |
| --- | --- | --- |
| Tauri and official Tauri plugins | MIT OR Apache-2.0 | https://github.com/tauri-apps |
| Vue, Pinia, Vue I18n | MIT | https://github.com/vuejs |
| Konva and vue-konva | MIT | https://github.com/konvajs |
| PixiJS | MIT | https://github.com/pixijs/pixijs |
| Reka UI | MIT | https://github.com/unovue/reka-ui |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss |
| VueFinder | MIT | https://github.com/n1crack/vuefinder |
| Lucide | ISC | https://github.com/lucide-icons/lucide |

The complete JavaScript dependency graph is locked in `pnpm-lock.yaml`. At the time of the 1.0 release, `pnpm licenses list` reports dependencies under MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, MPL-2.0, CC0-1.0, 0BSD, MIT-0, BlueOak-1.0.0, and compatible dual-license expressions.

## Rust, Image Codecs, and Native Runtime

| Component | License | Source |
| --- | --- | --- |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |
| `ort` Rust bindings | MIT OR Apache-2.0 | https://github.com/pykeio/ort |
| image-rs | MIT OR Apache-2.0 | https://github.com/image-rs/image |
| OxiPNG | MIT | https://github.com/oxipng/oxipng |
| mozjpeg-rs / mozjpeg | BSD-3-Clause | https://github.com/imazen/mozjpeg-rs |
| libwebp / `webp` bindings | BSD-3-Clause / MIT OR Apache-2.0 | https://chromium.googlesource.com/webm/libwebp/ and https://github.com/jaredforth/webp |
| jpegxl-rs and jpegxl-sys | GPL-3.0-or-later | https://github.com/inflation/jpegxl-rs |
| resvg/usvg | MIT OR Apache-2.0 | https://github.com/linebender/resvg |
| tiny-skia | BSD-3-Clause | https://github.com/linebender/tiny-skia |
| objc2 framework bindings | MIT, or Zlib/Apache-2.0/MIT depending on crate | https://github.com/madsmtm/objc2 |

The full Rust dependency graph and exact versions are locked in `src-tauri/Cargo.lock`. Release builds should retain dependency license files where required by each license.

## Foreground Segmentation Models

Model files are downloaded at runtime from pinned HTTPS URLs and are not committed to this repository or included in source archives.

| Model | Declared license | Upstream / distribution |
| --- | --- | --- |
| BiRefNet General | MIT | https://github.com/ZhengPeng7/BiRefNet and https://github.com/danielgatis/rembg |
| U²-Net ONNX | Apache-2.0 | https://github.com/xuebinqin/U-2-Net and https://huggingface.co/Heliosoph/u2net-onnx |
| BEN2 Base ONNX | MIT | https://huggingface.co/PramaLLC/BEN2 |

The pinned download URLs and SHA-256 digests are recorded in `scripts/segmentation-resources.lock.json` and the Rust model registry. Users and redistributors are responsible for reviewing the current upstream model and dataset terms.

## Apple Vision

On supported macOS systems, foreground segmentation may use Apple's Vision framework. The framework is part of macOS and is not redistributed by this project. Its use is governed by Apple's applicable software license agreements.

## Generating a Fresh Inventory

Before each release, regenerate the dependency inventory with:

```bash
pnpm licenses list
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1
```

If an upstream license changes, update this file and evaluate compatibility before publishing the release.
