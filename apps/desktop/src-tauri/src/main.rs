// Windows release builds should not spawn a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Schema for the local learner database.
///
/// `attempts` is append-only and is the only durable record of what the learner
/// did. Every ability, belief and retention figure is a projection over it,
/// rebuilt on load, so the mastery parameters can change without invalidating
/// history. Nothing derived is stored here.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial learner schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "saved circuits, streak bookkeeping and course crests",
            sql: include_str!("../migrations/002_circuits_and_progress.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "per-attempt evidence weight for self-scored responses",
            sql: include_str!("../migrations/003_evidence_weight.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// The folder a learner drops their own content packs into.
///
/// Beside `trainer.db` in the app config directory, which on Windows is
/// `%APPDATA%\com.cblasingame.engineering-trainer\` and on Linux
/// `~/.config/com.cblasingame.engineering-trainer/`. Created on first look so
/// there is somewhere to point at rather than an instruction to make one.
fn packs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?
        .join("packs");
    fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Where personal packs go, for the app to show and for a file manager to open.
#[tauri::command]
fn personal_packs_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(packs_dir(&app)?.to_string_lossy().into_owned())
}

/// Every `*.json` in that folder, as (file name, contents).
///
/// Deliberately dumb: it reads bytes and hands them to the renderer, which runs
/// them through the same `parsePack` gate as everything compiled into the
/// build. Validation does not belong in two languages, and a Rust-side
/// schema check would be a second opinion that could disagree with the first.
///
/// This is what lets book-derived material reach an installed application
/// without ever entering version control or the installer. The quarantine
/// gets stronger rather than weaker: the artifact stays redistributable, and
/// the owned material stays on the one machine that is allowed to have it.
///
/// A file that cannot be read comes back with empty contents rather than
/// failing the call, because one unreadable pack should not hide the four that
/// loaded. A valid pack is never empty, so the renderer can tell the two apart
/// without a sentinel value for somebody to get wrong later.
#[tauri::command]
fn personal_packs(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let dir = packs_dir(&app)?;
    let mut found: Vec<(String, String)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("could not read {}: {e}", dir.display()))? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        found.push((name, fs::read_to_string(&path).unwrap_or_default()));
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(found)
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:trainer.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![personal_packs_dir, personal_packs])
        .run(tauri::generate_context!())
        .expect("error while running engineering trainer");
}
