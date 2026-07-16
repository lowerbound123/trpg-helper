use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum SegmentationModelId {
    BiRefNetGeneral,
    U2Net,
    Ben2,
    MacosVision,
}

impl SegmentationModelId {
    pub(crate) fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "u2net" | "u2-net" => Self::U2Net,
            "ben2" | "ben2-base" => Self::Ben2,
            "macos-vision" | "vision" => Self::MacosVision,
            _ => Self::BiRefNetGeneral,
        }
    }

    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::BiRefNetGeneral => "birefnet-general",
            Self::U2Net => "u2net",
            Self::Ben2 => "ben2",
            Self::MacosVision => "macos-vision",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum InputNormalization {
    ImageNet,
    Unit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OutputTransform {
    SigmoidMinMax,
    MinMax,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ModelDownload {
    pub(crate) revision: &'static str,
    pub(crate) file_name: &'static str,
    pub(crate) url: &'static str,
    pub(crate) sha256: &'static str,
    pub(crate) size_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ModelSpec {
    pub(crate) id: SegmentationModelId,
    pub(crate) input_size: u32,
    pub(crate) normalization: InputNormalization,
    pub(crate) output_index: usize,
    pub(crate) output_transform: OutputTransform,
    pub(crate) download: Option<ModelDownload>,
}

const BIREFNET_DOWNLOAD: ModelDownload = ModelDownload {
    revision: "epoch-244",
    file_name: "BiRefNet-general-epoch_244.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-epoch_244.onnx",
    sha256: "58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c",
    size_bytes: 972_666_916,
};

const U2NET_DOWNLOAD: ModelDownload = ModelDownload {
    revision: "7fc34deee10329bc039c10a73b98090d0c6f5c59",
    file_name: "u2net.onnx",
    url: "https://huggingface.co/Heliosoph/u2net-onnx/resolve/7fc34deee10329bc039c10a73b98090d0c6f5c59/u2net.onnx",
    sha256: "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491",
    size_bytes: 175_997_641,
};

const BEN2_DOWNLOAD: ModelDownload = ModelDownload {
    revision: "e48a20765fb421d19dcdb0bf3cc61e802ca5ec8f",
    file_name: "BEN2_Base.onnx",
    url: "https://huggingface.co/PramaLLC/BEN2/resolve/e48a20765fb421d19dcdb0bf3cc61e802ca5ec8f/BEN2_Base.onnx",
    sha256: "22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101",
    size_bytes: 222_932_053,
};

pub(crate) const fn model_spec(id: SegmentationModelId) -> ModelSpec {
    match id {
        SegmentationModelId::BiRefNetGeneral => ModelSpec {
            id,
            input_size: 1024,
            normalization: InputNormalization::ImageNet,
            output_index: 0,
            output_transform: OutputTransform::SigmoidMinMax,
            download: Some(BIREFNET_DOWNLOAD),
        },
        SegmentationModelId::U2Net => ModelSpec {
            id,
            input_size: 320,
            normalization: InputNormalization::ImageNet,
            output_index: 0,
            output_transform: OutputTransform::MinMax,
            download: Some(U2NET_DOWNLOAD),
        },
        SegmentationModelId::Ben2 => ModelSpec {
            id,
            input_size: 1024,
            normalization: InputNormalization::Unit,
            output_index: 0,
            output_transform: OutputTransform::MinMax,
            download: Some(BEN2_DOWNLOAD),
        },
        SegmentationModelId::MacosVision => ModelSpec {
            id,
            input_size: 0,
            normalization: InputNormalization::Unit,
            output_index: 0,
            output_transform: OutputTransform::MinMax,
            download: None,
        },
    }
}
