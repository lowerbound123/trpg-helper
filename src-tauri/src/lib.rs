mod commands;
mod errors;
mod services;
mod token;
mod types;

// Re-exports needed by already-extracted command modules (export_commands.rs,
// mask_commands.rs) that reference these via `crate::` paths.
pub(crate) use errors::{AppError, CommandResult};
pub(crate) use services::path_service::clean_file_name;
pub(crate) use services::path_service::{decode_data_url, encode_data_url, remove_file_if_exists};
pub(crate) use services::project_service::{resolve_project_root, safe_project_relative_path};
// Re-exports used by `run()` setup hook.
pub(crate) use services::asset_service::ensure_library;
pub(crate) use services::path_service::reset_debug_log;

// Import commands for `generate_handler!` in `run()`.
use commands::asset_commands::*;
use commands::export_commands::{
    encode_handout_image_to_downloads, export_image, export_image_bytes_to_downloads,
    export_image_file_to_downloads, export_image_to_downloads,
    write_encoded_image_bytes_to_downloads,
};
use commands::mask_commands::{
    delete_project_mask, read_project_file_data_url, save_project_mask, save_project_mask_cache,
};
use commands::preview_commands::{save_project_asset, save_project_preview};
use commands::project_commands::*;
use commands::token_project_commands::*;
use tauri::{LogicalSize, Manager};
use token::commands::generate_token_batch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            reset_debug_log();
            let source = include_str!("../../configuration.toml");
            let configuration = token::configuration::parse_handout_configuration(source)
                .map_err(std::io::Error::other)?;
            let handout_export_configuration =
                token::configuration::parse_handout_export_configuration(source)
                    .map_err(std::io::Error::other)?;
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&configuration.application.title)?;
                window.set_size(LogicalSize::new(
                    f64::from(configuration.window.width),
                    f64::from(configuration.window.height),
                ))?;
                window.set_min_size(Some(LogicalSize::new(
                    f64::from(configuration.window.min_width),
                    f64::from(configuration.window.min_height),
                )))?;
                window.set_resizable(configuration.window.resizable)?;
            }
            token::configuration::set_active_configuration(configuration)
                .map_err(std::io::Error::other)?;
            token::configuration::set_active_handout_export_configuration(
                handout_export_configuration,
            )
            .map_err(std::io::Error::other)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            ensure_library(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            append_debug_log,
            copy_project_masks,
            create_library_folder,
            create_project,
            create_project_folder,
            create_token_project,
            create_token_project_folder,
            delete_library_entries,
            delete_project_entries,
            delete_token_project_entries,
            encode_handout_image_to_downloads,
            delete_project_mask,
            export_image,
            export_image_bytes_to_downloads,
            export_image_file_to_downloads,
            export_image_to_downloads,
            get_library,
            generate_token_batch,
            import_asset,
            import_background,
            import_font,
            list_project_folders,
            list_projects,
            list_token_project_folders,
            list_token_projects,
            move_library_record,
            move_managed_project,
            move_token_project,
            open_managed_project,
            open_project,
            open_token_project,
            read_configuration,
            read_file_data_url,
            read_project_file_data_url,
            rename_library_folder,
            rename_library_record,
            rename_managed_project,
            rename_project_folder,
            rename_token_project,
            rename_token_project_folder,
            repair_missing_thumbnails,
            save_font_preview,
            save_managed_project,
            save_project,
            save_project_asset,
            save_project_mask,
            save_project_mask_cache,
            save_project_preview,
            save_token_project,
            save_token_project_preview,
            copy_token_project,
            write_encoded_image_bytes_to_downloads,
            update_token_ring_config,
            write_configuration
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
