// Windows release builds should not spawn a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:trainer.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running engineering trainer");
}
