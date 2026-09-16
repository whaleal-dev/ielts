# IELTS

[简体中文](README.md) | [English](README_EN.md)

[GitHub repository](https://github.com/whaleal-dev/ielts)

IELTS is a local-first collection of study tools for IELTS preparation. The current application in `web/` modernizes eight legacy single-file HTML tools with Vue 3, Vite, and TypeScript. Original implementations, source data, scripts, and audio assets remain available in `legacy/` for compatibility and reference.

## Features

- A daily dashboard for study tasks, recent activity, and quick access to training.
- Guided study paths that connect input, practice, review, and reflection.
- Eight training modules for vocabulary, pronunciation, dictation, listening, synonyms, audio playback, corpus dictation, and progress review.
- Local storage for study progress, settings, and backups, with no account required.
- Versioned application backups with import preview and rollback on failure.
- Compatibility with existing legacy localStorage and IndexedDB data.

## Requirements

- Node.js 20.19 or later, or Node.js 22.12 or later.
- npm 10 or later.
- A modern desktop browser.

## Quick Start

```bash
git clone https://github.com/whaleal-dev/ielts.git
cd ielts/web
npm install
npm run dev
```

Open `http://127.0.0.1:5173/#/` after the development server starts.

## Development Commands

Run these commands from the `web/` directory:

```bash
npm run dev          # Start the development server
npm test             # Run the Vitest test suite
npm run build        # Type-check and create a production build
npm run preview      # Preview the production build locally
npm run data:vocab   # Rebuild generated vocabulary data
npm run data:corpus  # Rebuild generated corpus data
```

## Main Routes

| Route | Purpose |
|---|---|
| `/` | Daily dashboard with tasks, recent activity, and training shortcuts |
| `/plans` | Study paths connecting input, practice, review, and reflection |
| `/tools` | All eight training modules grouped by learning goal |
| `/settings` | Application settings and complete backup import/export |

## Training Modules

| Route | Module |
|---|---|
| `/study-tracker` | Progress tracking and review |
| `/vocabulary` | Vocabulary study |
| `/pronunciation` | Word pronunciation trainer |
| `/dictation` | Word dictation |
| `/listen-dictation` | Listen-only repeat dictation |
| `/synonyms` | Synonym and paraphrase study |
| `/audio-player` | Sequential audio player |
| `/corpus-dictation` | Corpus chapter dictation |

## Repository Layout

```text
web/                    Current Vue application and primary development entry point
  scripts/              Data synchronization and legacy CSS tools
  src/modules.ts        Training module registry
  src/features/         Business implementation for the eight modules
  src/shared/backup/    Application backup providers and rollback logic
  src/shared/learning-events/  Cross-module learning events and summaries
  src/data/             Generated vocabulary and corpus data
  src/views/            Dashboard, plans, tools, settings, and route shells
  docs/                 Architecture, baseline, plans, and migration notes
legacy/                 Archived legacy tools, data, scripts, and audio assets
CLAUDE.md               Project development rules and compatibility constraints
ROADMAP.md              Current status, completed work, backlog, and validation log
```

## Data and Privacy

- Study records, settings, and exercise state are stored in the current browser by default.
- Export a complete JSON backup from **Settings** before clearing site data, switching browsers, or reinstalling the operating system.
- Audio blobs are intentionally excluded from complete JSON backups; keep the original audio files separately.
- The application has no account system and does not upload study data by itself.

## Development Rules

- Build new features only in `web/`; use `legacy/` as a data and behavior reference.
- Register new training modules in `web/src/modules.ts` and keep route components thin.
- Do not manually edit generated JSON under `web/src/data/`; use the corresponding `npm run data:*` command.
- Do not rename persisted keys or backup fields without a migration function and regression tests.
- Run `npm test` and `npm run build` before submitting business changes.

## Documentation

- Chinese guide: `README.md`
- Web development guide: `web/README.md`
- Architecture: `web/docs/ARCHITECTURE.md`
- Regression baseline and data contracts: `web/docs/BASELINE.md`
- Product integration plan: `web/docs/PRODUCT-INTEGRATION-PLAN.md`
- Next version plan: `web/docs/V0.2-PLAN.md`
- Project status: `ROADMAP.md`

## License

No license file is currently provided. Unless a license is added, the repository source is publicly viewable but no additional reuse rights are granted.
