use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ComputeDevice {
    Auto,
    Cpu,
    CoreMl,
    DirectMl,
    Cuda,
    Vision,
}

impl ComputeDevice {
    pub(crate) fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "cpu" => Self::Cpu,
            "coreml" | "core-ml" => Self::CoreMl,
            "directml" | "direct-ml" => Self::DirectMl,
            "cuda" => Self::Cuda,
            "vision" | "macos-vision" => Self::Vision,
            _ => Self::Auto,
        }
    }

    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Cpu => "cpu",
            Self::CoreMl => "coreml",
            Self::DirectMl => "directml",
            Self::Cuda => "cuda",
            Self::Vision => "vision",
        }
    }
}

pub(crate) fn automatic_candidates(coreml_compiled: bool) -> &'static [ComputeDevice] {
    #[cfg(target_os = "macos")]
    {
        if coreml_compiled {
            &[ComputeDevice::CoreMl, ComputeDevice::Cpu]
        } else {
            &[ComputeDevice::Cpu]
        }
    }
    #[cfg(target_os = "windows")]
    {
        let _ = coreml_compiled;
        &[
            ComputeDevice::Cuda,
            ComputeDevice::DirectMl,
            ComputeDevice::Cpu,
        ]
    }
    #[cfg(target_os = "linux")]
    {
        let _ = coreml_compiled;
        &[ComputeDevice::Cuda, ComputeDevice::Cpu]
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = coreml_compiled;
        &[ComputeDevice::Cpu]
    }
}
