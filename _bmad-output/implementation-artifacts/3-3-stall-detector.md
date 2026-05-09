# Story 3.3: Stall Detector

**Status:** done

---

## Story

As the BMAD Implementation Supervisor,
I want stall detection via file change monitoring,
so that I can detect when a workflow gets stuck and alert the human operator.

## Context

**Epic:** 3 - Error Handling & Reliability
**Priority:** P0
**Dependencies:** E3-1 (Error Classification)

## Previous Story Intelligence

From **E3-1 (Error Classification)**:
- Error categories: RETRYABLE, RECOVERABLE, FATAL, HUMAN_INPUT
- Classification determines recovery strategy

**Files to create:**
- `src/state/stall-detector.ts`

## Acceptance Criteria

1. [AC-1] `StallDetector` class monitors file changes during workflow
2. [AC-2] Detect stall when no file changes for configurable timeout (default: 10 min)
3. [AC-3] Progress fingerprinting: track file count + total size
4. [AC-4] `onStall` callback triggered when stalled
5. [AC-5] Configurable via `health.stuck_timeout_ms`
6. [AC-6] Works on Windows/Linux/macOS using `chokidar`
7. [AC-7] Auto-start/stop with workflow lifecycle

## Technical Requirements

### Cross-Platform File Watching

```typescript
// Use chokidar for reliable cross-platform watching
import chokidar from 'chokidar';
import { getPlatform } from '../utils/platform';

const watcher = chokidar.watch(patterns, {
  persistent: true,
  usePolling: getPlatform().isWindows, // Windows needs polling
  ignored: /(^|[\/\\])\.|node_modules/,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});
```

## Dev Notes

### Key Implementation Notes

1. **Watch Scope**: Monitor `src/` and story output directories only
2. **Exclude**: node_modules, .git, dist, *.log, *.sqlite
3. **Fingerprint**: Track file count + total size (not content hashes)

### References

- Stall detection: `_bmad-output/planning-artifacts/prd.md#FR-006`

---

## Dev Agent Record

### Agent Model Used
nemotron-3-super-free

### Debug Log References
- Stall detection logic implemented with chokidar for cross-platform file watching
- Progress fingerprinting tracks file count and total size
- Configurable timeout from health.stuck_timeout_ms (default 10min)
- Auto-start/stop with workflow lifecycle
- Unit tests covering start/stop, fingerprinting, and stall detection

### Completion Notes List
- Implemented StallDetector class with chokidar for reliable cross-platform file watching
- Added configurable stall timeout from health.stuck_timeout_ms config
- Implemented progress fingerprinting tracking file count + total size (not content hashes)
- Added onStall callback triggered when stall conditions are met
- Ensured cross-platform support with Windows polling fallback
- Implemented auto-start/stop functionality that integrates with workflow lifecycle
- Created comprehensive test suite validating all functionality
- Fixed type errors and added missing logger utility
- All acceptance criteria met:
  [AC-1] StallDetector class monitors file changes during workflow ✓
  [AC-2] Detects stall when no file changes for configurable timeout ✓
  [AC-3] Progress fingerprinting: track file count + total size ✓
  [AC-4] onStall callback triggered when stalled ✓
  [AC-5] Configurable via health.stuck_timeout_ms ✓
  [AC-6] Works on Windows/Linux/macOS using chokidar ✓
  [AC-7] Auto-start/stop with workflow lifecycle ✓

### File List

- `src/state/stall-detector.ts`
- `src/state/stall-detector.test.ts`

### Review Findings

- [x] [Review][Patch] Missing workflow lifecycle integration [src/state/stall-detector.ts:30]
- [x] [Review][Patch] Timer memory leak causing runaway stall checks [src/state/stall-detector.ts:140]
- [x] [Review][Patch] Deviation in chokidar ignore regex [src/state/stall-detector.ts:58]
- [x] [Review][Patch] Unnecessary repeated triggering of onStall callback [src/state/stall-detector.ts:148]
- [x] [Review][Defer] Blatant DRY Violations in Agent Logic — deferred, pre-existing
- [x] [Review][Defer] Absurd Fallback Expectations — deferred, pre-existing
- [x] [Review][Defer] Fragile Path Substitutions — deferred, pre-existing
- [x] [Review][Defer] Unbounded Context Bloat in Elicitation — deferred, pre-existing
- [x] [Review][Defer] Missing Error Handling for Critical Assets — deferred, pre-existing
- [x] [Review][Defer] Split Metadata Source of Truth — deferred, pre-existing
- [x] [Review][Defer] Blind Menu Routing — deferred, pre-existing
- [x] [Review][Defer] Non-Deterministic Edge Case Handling — deferred, pre-existing
- [x] [Review][Defer] Hand-Wavy "Party Mode" Integration — deferred, pre-existing
- [x] [Review][Defer] Overly Prescriptive Formatting Constraints — deferred, pre-existing
- [x] [Review][Defer] resolve_config.py script execution fails — deferred, pre-existing
- [x] [Review][Defer] User inputs invalid character — deferred, pre-existing
- [x] [Review][Defer] customize.toml files are unreadable — deferred, pre-existing

