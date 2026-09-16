# Word Save Release Notes

- Release date: 2026-04-28
- Release scope: `study_words.html`, `version.md`

## Summary

This release refreshes the version audit for the current single-file HTML build and fixes two practical issues discovered during the review:

- search filters now work without a keyword when a chapter filter or phonetic assist filter is present
- backup and local state import now reject invalid non-object payloads before they can corrupt runtime state

## Shipped Changes

### Functional fixes

- Fixed search result generation so chapter-only and phonetic-only filtering returns usable results
- Fixed search practice session labels so they reflect the active keyword, chapter, and phonetic filters
- Hardened backup import validation for malformed payloads
- Hardened local state restoration from `localStorage`

### Documentation

- Rewrote `version.md` to match the actual current runtime
- Corrected the previous wrong conclusion that synonym aggregation was disconnected
- Documented the current runtime dependencies, linkage review, known risks, and optimization suggestions

## Verification

- `study_words.html` reports no editor syntax errors
- Browser check confirmed:
  - chapter-only search returns results
  - phonetic-only search returns results
  - no-filter search still returns no results by design
  - invalid imported state is rejected with `Invalid imported state`

## Known Limits

- ECharts still depends on CDN availability
- Audio playback still depends on remote `eng_sound` URLs
- Search results still display the first 24 matches only

## Impact

- Search interaction is more consistent with the visible UI controls
- Invalid backups are less likely to break the page state
- Version documentation now reflects the real shipped behavior