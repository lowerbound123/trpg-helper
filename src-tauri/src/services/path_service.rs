//! Path resolution and path safety service boundary.

use std::path::Path;

pub fn clean_file_name(file_name: &str) -> String {
    let fallback = "resource.bin";
    let name = Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback);

    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}
