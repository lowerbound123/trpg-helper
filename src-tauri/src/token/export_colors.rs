use rand::{Rng, seq::SliceRandom};

use crate::token::{configuration::RandomColorsConfig, types::BatchGenerateItem};

type Rgb = [u8; 3];

pub(crate) fn parse_rgb(value: &str) -> Option<Rgb> {
    let hex = value.strip_prefix('#')?;
    if !matches!(hex.len(), 6 | 8) || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some([
        u8::from_str_radix(&hex[0..2], 16).ok()?,
        u8::from_str_radix(&hex[2..4], 16).ok()?,
        u8::from_str_radix(&hex[4..6], 16).ok()?,
    ])
}

fn replace_rgb(value: &str, rgb: Rgb) -> String {
    let alpha = value
        .strip_prefix('#')
        .filter(|hex| hex.len() == 8)
        .map(|hex| &hex[6..8])
        .unwrap_or("");
    format!("#{:02X}{:02X}{:02X}{alpha}", rgb[0], rgb[1], rgb[2])
}

fn linear_channel(channel: u8) -> f32 {
    let value = f32::from(channel) / 255.0;
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn relative_luminance(rgb: Rgb) -> f32 {
    0.2126 * linear_channel(rgb[0])
        + 0.7152 * linear_channel(rgb[1])
        + 0.0722 * linear_channel(rgb[2])
}

pub(crate) fn contrast_ratio(left: Rgb, right: Rgb) -> f32 {
    let left = relative_luminance(left);
    let right = relative_luminance(right);
    let (lighter, darker) = if left >= right {
        (left, right)
    } else {
        (right, left)
    };
    (lighter + 0.05) / (darker + 0.05)
}

fn oklab(rgb: Rgb) -> [f32; 3] {
    let red = linear_channel(rgb[0]);
    let green = linear_channel(rgb[1]);
    let blue = linear_channel(rgb[2]);
    let l = (0.412_221_46 * red + 0.536_332_55 * green + 0.051_445_995 * blue).cbrt();
    let m = (0.211_903_5 * red + 0.680_699_5 * green + 0.107_396_96 * blue).cbrt();
    let s = (0.088_302_46 * red + 0.281_718_85 * green + 0.629_978_7 * blue).cbrt();
    [
        0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s,
        1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s,
        0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s,
    ]
}

pub(crate) fn oklab_distance(left: Rgb, right: Rgb) -> f32 {
    let left = oklab(left);
    let right = oklab(right);
    ((left[0] - right[0]).powi(2) + (left[1] - right[1]).powi(2) + (left[2] - right[2]).powi(2))
        .sqrt()
}

fn minimum_distance(candidate: Rgb, used: &[Rgb]) -> f32 {
    used.iter()
        .map(|color| oklab_distance(candidate, *color))
        .reduce(f32::min)
        .unwrap_or(1.0)
}

fn choose_single(
    palette: &[Rgb],
    reference: Rgb,
    used: &[Rgb],
    config: &RandomColorsConfig,
) -> Rgb {
    let has_contrast = palette
        .iter()
        .any(|color| contrast_ratio(*color, reference) >= config.minimum_contrast_ratio);
    let contrast_candidates: Vec<_> = palette
        .iter()
        .copied()
        .filter(|color| {
            !has_contrast || contrast_ratio(*color, reference) >= config.minimum_contrast_ratio
        })
        .collect();
    let has_distance = contrast_candidates
        .iter()
        .any(|color| minimum_distance(*color, used) >= config.minimum_oklab_distance);

    contrast_candidates
        .into_iter()
        .filter(|color| {
            !has_distance || minimum_distance(*color, used) >= config.minimum_oklab_distance
        })
        .max_by(|left, right| {
            let left_score = if has_contrast {
                minimum_distance(*left, used)
            } else {
                contrast_ratio(*left, reference)
            };
            let right_score = if has_contrast {
                minimum_distance(*right, used)
            } else {
                contrast_ratio(*right, reference)
            };
            left_score.total_cmp(&right_score).then_with(|| {
                contrast_ratio(*left, reference).total_cmp(&contrast_ratio(*right, reference))
            })
        })
        .unwrap_or(reference)
}

fn choose_pair(
    palette: &[Rgb],
    used_backgrounds: &[Rgb],
    used_rings: &[Rgb],
    config: &RandomColorsConfig,
) -> (Rgb, Rgb) {
    let pairs: Vec<_> = palette
        .iter()
        .copied()
        .flat_map(|background| {
            palette
                .iter()
                .copied()
                .filter(move |ring| *ring != background)
                .map(move |ring| (background, ring))
        })
        .collect();
    let has_contrast = pairs.iter().any(|(background, ring)| {
        contrast_ratio(*background, *ring) >= config.minimum_contrast_ratio
    });
    let contrast_pairs: Vec<_> = pairs
        .into_iter()
        .filter(|(background, ring)| {
            !has_contrast || contrast_ratio(*background, *ring) >= config.minimum_contrast_ratio
        })
        .collect();
    let pair_distance = |background: Rgb, ring: Rgb| {
        minimum_distance(background, used_backgrounds).min(minimum_distance(ring, used_rings))
    };
    let has_distance = contrast_pairs.iter().any(|(background, ring)| {
        pair_distance(*background, *ring) >= config.minimum_oklab_distance
    });

    contrast_pairs
        .into_iter()
        .filter(|(background, ring)| {
            !has_distance || pair_distance(*background, *ring) >= config.minimum_oklab_distance
        })
        .max_by(
            |(left_background, left_ring), (right_background, right_ring)| {
                let left_score = if has_contrast {
                    pair_distance(*left_background, *left_ring)
                } else {
                    contrast_ratio(*left_background, *left_ring)
                };
                let right_score = if has_contrast {
                    pair_distance(*right_background, *right_ring)
                } else {
                    contrast_ratio(*right_background, *right_ring)
                };
                left_score.total_cmp(&right_score).then_with(|| {
                    contrast_ratio(*left_background, *left_ring)
                        .total_cmp(&contrast_ratio(*right_background, *right_ring))
                })
            },
        )
        .unwrap_or(([0, 0, 0], [255, 255, 255]))
}

pub(crate) fn apply_random_colors<R, F>(
    items: &mut [BatchGenerateItem],
    config: &RandomColorsConfig,
    rng: &mut R,
    mut custom_representative: F,
) where
    R: Rng + ?Sized,
    F: FnMut(&str) -> Option<Rgb>,
{
    let mut palette: Vec<_> = config
        .palette
        .iter()
        .filter_map(|color| parse_rgb(color))
        .collect();
    palette.shuffle(rng);
    let mut used_backgrounds = Vec::new();
    let mut used_rings = Vec::new();

    for item in items {
        let custom = item.params.ring_asset_path.is_some();
        let custom_background = item.params.background_asset_path.is_some();
        let current_background = parse_rgb(&item.params.background).unwrap_or([0, 0, 0]);
        let current_ring = parse_rgb(&item.params.ring_color).unwrap_or([255, 255, 255]);

        if item.params.random_background
            && item.params.random_ring_color
            && !custom
            && !custom_background
        {
            let (background, ring) = choose_pair(&palette, &used_backgrounds, &used_rings, config);
            item.params.background = replace_rgb(&item.params.background, background);
            item.params.ring_color = replace_rgb(&item.params.ring_color, ring);
            used_backgrounds.push(background);
            used_rings.push(ring);
            continue;
        }

        if item.params.random_background && !custom_background {
            let reference = if custom {
                item.params
                    .ring_asset_path
                    .as_deref()
                    .and_then(&mut custom_representative)
                    .unwrap_or(current_ring)
            } else {
                current_ring
            };
            let background = choose_single(&palette, reference, &used_backgrounds, config);
            item.params.background = replace_rgb(&item.params.background, background);
            used_backgrounds.push(background);
        }
        if item.params.random_ring_color && !custom {
            let background = parse_rgb(&item.params.background).unwrap_or(current_background);
            let ring = choose_single(&palette, background, &used_rings, config);
            item.params.ring_color = replace_rgb(&item.params.ring_color, ring);
            used_rings.push(ring);
        }
    }
}

#[cfg(test)]
mod tests {
    use rand::{SeedableRng, rngs::StdRng};

    use crate::token::{
        configuration::active_configuration,
        types::{BatchGenerateItem, TokenParams},
    };

    use super::{apply_random_colors, contrast_ratio, oklab_distance, parse_rgb};

    fn item(input: &str, background: &str, ring: &str, style: &str) -> BatchGenerateItem {
        BatchGenerateItem {
            input: input.into(),
            params: TokenParams {
                background: background.into(),
                ring_color: ring.into(),
                ring_style: style.into(),
                random_background: true,
                random_ring_color: true,
                ..TokenParams::default()
            },
        }
    }

    #[test]
    fn randomizes_each_builtin_item_with_contrast_and_preserves_alpha() {
        let config = &active_configuration().export.random_colors;
        let mut items = vec![
            item("a.png", "#11223340", "#44556680", "solid"),
            item("b.png", "#11223320", "#445566C0", "double"),
        ];
        let mut rng = StdRng::seed_from_u64(42);

        apply_random_colors(&mut items, config, &mut rng, |_| None);

        for item in &items {
            assert!(
                item.params.background.ends_with("40") || item.params.background.ends_with("20")
            );
            assert!(
                item.params.ring_color.ends_with("80") || item.params.ring_color.ends_with("C0")
            );
            assert!(
                contrast_ratio(
                    parse_rgb(&item.params.background).unwrap(),
                    parse_rgb(&item.params.ring_color).unwrap(),
                ) >= config.minimum_contrast_ratio
            );
        }
        assert!(
            oklab_distance(
                parse_rgb(&items[0].params.background).unwrap(),
                parse_rgb(&items[1].params.background).unwrap(),
            ) >= config.minimum_oklab_distance
        );
        assert!(
            oklab_distance(
                parse_rgb(&items[0].params.ring_color).unwrap(),
                parse_rgb(&items[1].params.ring_color).unwrap(),
            ) >= config.minimum_oklab_distance
        );
    }

    #[test]
    fn custom_ring_keeps_its_rgb_and_uses_representative_color_for_background() {
        let config = &active_configuration().export.random_colors;
        let mut custom = item("custom.png", "#22222255", "#12345677", "asset:shared");
        custom.params.ring_asset_path = Some("/rings/shared.png".into());
        let mut items = vec![custom];
        let mut rng = StdRng::seed_from_u64(9);

        apply_random_colors(&mut items, config, &mut rng, |id| {
            assert_eq!(id, "/rings/shared.png");
            Some([248, 250, 252])
        });

        assert_eq!(items[0].params.ring_color, "#12345677");
        assert!(items[0].params.background.ends_with("55"));
        assert!(
            contrast_ratio(
                parse_rgb(&items[0].params.background).unwrap(),
                [248, 250, 252],
            ) >= config.minimum_contrast_ratio
        );
    }

    #[test]
    fn random_ring_option_alone_is_ignored_for_custom_rings() {
        let config = &active_configuration().export.random_colors;
        let mut custom = item("custom.png", "#010203FF", "#AABBCC66", "asset:id");
        custom.params.ring_asset_path = Some("/rings/id.png".into());
        custom.params.random_background = false;
        let mut items = vec![custom];
        let mut rng = StdRng::seed_from_u64(3);

        apply_random_colors(&mut items, config, &mut rng, |_| Some([0, 0, 0]));

        assert_eq!(items[0].params.background, "#010203FF");
        assert_eq!(items[0].params.ring_color, "#AABBCC66");
    }

    #[test]
    fn random_background_does_not_modify_custom_background_items() {
        let config = &active_configuration().export.random_colors;
        let mut custom = item("custom.png", "#01020388", "#AABBCCFF", "solid");
        custom.params.background_style = "asset:background".into();
        custom.params.background_asset_path = Some("/backgrounds/shared.png".into());
        custom.params.random_ring_color = false;
        let mut items = vec![custom];
        let mut rng = StdRng::seed_from_u64(11);

        apply_random_colors(&mut items, config, &mut rng, |_| None);

        assert_eq!(items[0].params.background, "#01020388");
    }
}
