//! Shared backend type boundary. All structs use `#[serde(rename_all =
//! "camelCase")]` for JS interop and are `pub(crate)` so that command modules
//! can construct and return them.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryRecord {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) file_name: String,
    pub(crate) path: String,
    pub(crate) thumbnail_path: Option<String>,
    #[serde(default)]
    pub(crate) font_family: Option<String>,
    pub(crate) tags: Vec<String>,
    #[serde(default)]
    pub(crate) folder: String,
    pub(crate) media_type: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryIndex {
    #[serde(default)]
    pub(crate) backgrounds: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) assets: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) fonts: Vec<LibraryRecord>,
    #[serde(default)]
    pub(crate) background_folders: Vec<String>,
    #[serde(default)]
    pub(crate) asset_folders: Vec<String>,
    #[serde(default)]
    pub(crate) font_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportResult {
    pub(crate) record: LibraryRecord,
    pub(crate) library: LibraryIndex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPayload {
    pub(crate) document: Value,
    pub(crate) metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) project_dir: String,
    #[serde(default)]
    pub(crate) folder: String,
    pub(crate) background_asset_id: Option<String>,
    pub(crate) preview_path: Option<String>,
    pub(crate) preview_size_bytes: Option<u64>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectFolderIndex {
    #[serde(default)]
    pub(crate) folders: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteEntries {
    #[serde(default)]
    pub(crate) ids: Vec<String>,
    #[serde(default)]
    pub(crate) folders: Vec<String>,
}
