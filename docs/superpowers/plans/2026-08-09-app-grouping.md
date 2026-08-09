# App Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hierarchical connection table grouped by `.app` bundle (else process name), with parent aggregates and disclosure rows.

**Architecture:** Pure `AppGrouping` builds `[AppGroup]` from filtered connections; `ConnectionStore.groupedDisplayed` exposes it; `ContentView` uses hierarchical `Table` + `DisclosureTableRow`.

**Tech Stack:** Swift 6, SwiftUI Table (macOS 14+), XCTest

**Spec:** [docs/superpowers/specs/2026-08-09-app-grouping-design.md](../specs/2026-08-09-app-grouping-design.md)

## Global Constraints

- Group key: path through `Something.app`, else `name:<processName>`
- Parent: name + count + summed MB/s (nil rates as 0)
- Default collapsed; in-memory expand `Set`
- Filter then group; kill parent → all distinct PIDs in group
- No app icons, no PID nesting, no persisted expand state

---

## File map

| File | Role |
|------|------|
| `Rex/Models/AppGrouping.swift` | `AppGroup`, key/name, `buildGroups` |
| `RexTests/AppGroupingTests.swift` | Unit tests |
| `Rex/Store/ConnectionStore.swift` | `groupedDisplayed` |
| `Rex/Views/ContentView.swift` | Hierarchical table, selection/kill |
| `docs/manual-smoke-checklist.md` | Expand/group checks |

---

### Task 1: AppGrouping pure module (TDD)

- [ ] Write failing tests: bundle key/name, name fallback, aggregation, stable group sort
- [ ] Implement `AppGrouping.swift` until green
- [ ] Commit

### Task 2: Store exposes groupedDisplayed

- [ ] Add `groupedDisplayed` = `buildGroups(from: displayed)`
- [ ] Commit

### Task 3: Hierarchical ContentView

- [ ] Replace flat `Table` with `DisclosureTableRow` over `groupedDisplayed`
- [ ] Parent/child column cells per spec; expand state `Set`
- [ ] Kill resolves parent selection to all group PIDs
- [ ] Commit

### Task 4: Smoke checklist + verify

- [ ] Update manual smoke checklist
- [ ] `xcodebuild test` green
- [ ] Commit
