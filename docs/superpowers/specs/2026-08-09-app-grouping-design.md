# Rex — App Grouping Design Spec

**Date:** 2026-08-09  
**Status:** Approved  
**Product:** Rex — hierarchical grouping of connection rows by application

## Problem

The connection table is flat: every socket is a top-level row. Busy apps (browsers, Electron apps) produce dozens of rows that are hard to scan. Users want to collapse an application to one summary line and expand it to see that app’s connections.

## Goals

- Group connection rows under expandable **application** parents with a disclosure control
- Parent row shows **display name**, **connection count**, and **summed Download / Upload (MB/s)**
- Child rows remain today’s per-connection rows (proto, endpoints, state, rates, PID)
- Preserve existing filters (search, proto, listening-only): filter connections first, then rebuild groups
- Kill Process works for selected connection leaves and for selected parent groups (all distinct PIDs in the group)

## Non-goals

- Second-level nesting by PID / helper process
- App icons in the table
- Persisting expand/collapse state across app launches
- Replacing the table with a free-form List/Outline-only UI
- Changing how libproc or nstat collect data

## Decisions

| Topic | Choice |
|-------|--------|
| UI approach | Hierarchical SwiftUI `Table` with `DisclosureTableRow` |
| Children | Connection rows (same leaf model as today) |
| Group key | Path through `Something.app` when `processPath` contains a `.app` segment; otherwise `name:<processName>` |
| Display name | Bundle folder name without `.app`, or `processName` when falling back |
| Parent metrics | Name + connection count + summed download/upload MB/s |
| Default expand | All groups **collapsed** |
| Expand state | In-memory `Set` of group IDs; retain IDs that still exist after filter/poll updates |
| Rate sum | Treat missing (`nil`) child rates as `0` for aggregation; parent still formats via `formatRateMBPS` |

## Data model

```swift
struct AppGroup: Identifiable, Hashable, Sendable {
    var id: String              // group key
    var displayName: String
    var connections: [Connection]

    var connectionCount: Int { connections.count }
    var downloadBytesPerSecond: Double  // sum of child rates (nil → 0)
    var uploadBytesPerSecond: Double
}
```

### Group key algorithm

1. If `processPath` is non-nil and contains a path component ending in `.app` (case-sensitive `.app` suffix as on disk), the key is the absolute path **through and including** that component (e.g. `/Applications/Firefox.app`).
2. Otherwise the key is `name:` + `processName`.
3. Display name: for a bundle key, the last path component with the `.app` suffix removed; for a name key, `processName`.

Connections that share a key belong to one `AppGroup`. Groups sort by `displayName` ascending (case-insensitive). Children within a group keep the same relative order as in the filtered connection list before grouping.

## UI

- Replace the flat `Table(store.displayed, …)` in `ContentView` with a hierarchical table driven by `[AppGroup]`.
- Each parent is a `DisclosureTableRow` whose children are `TableRow`s for that group’s connections.
- **Parent Process column:** disclosure chevron, `displayName`, secondary caption with connection count (e.g. `24 connections`).
- **Parent PID, Proto, Local, Remote, State:** em dash (`—`).
- **Parent Download / Upload:** aggregated rates formatted like leaf rows.
- **Child columns:** unchanged from the current connection table (process name + path, PID, proto, endpoints, state, rates).

## Selection and kill

- Leaf selection continues to identify `Connection` rows.
- Selecting a **parent** means “all connections in that group” for kill purposes.
- Kill target resolution:
  - Selected leaves → unique PIDs among those connections (current behavior).
  - Selected parent(s) → unique PIDs among all connections in those groups.
- Confirm sheet and SIGTERM → optional SIGKILL flow remain as today; copy should reflect when multiple PIDs are in scope.

## Filters

1. Apply existing `ConnectionFilters` to the flat `[Connection]` list.
2. Build `[AppGroup]` from the filtered list.
3. Drop empty groups (none should remain after step 2).
4. Prune expand-state IDs that no longer appear in the new group list.

## Architecture

```
ConnectionPoller / nstat → ConnectionStore.connections
                         → filters → displayed connections
                         → AppGrouping.buildGroups → groupedDisplayed
ContentView hierarchical Table ← groupedDisplayed
```

| Unit | Responsibility |
|------|----------------|
| `Rex/Models/AppGrouping.swift` | Pure key/name helpers, `AppGroup`, `buildGroups(from:)`, rate aggregation |
| `ConnectionStore` | Expose grouped list for UI and unit tests (grouping after filter) |
| `ContentView` | Hierarchical table, expand-state `Set`, selection → kill PID set |
| `ConnectionPoller` / `NetworkStatisticsClient` | Unchanged |

## Testing

**Unit**

- Bundle path extracts key and display name (`…/Firefox.app/Contents/MacOS/firefox` → key `…/Firefox.app`, name `Firefox`)
- Paths without `.app` fall back to `name:<processName>`
- Aggregation: connection count and summed MB/s (including nil-as-zero)
- Grouping runs on an already-filtered list (e.g. listening-only does not leave unrelated parents)

**Manual**

- Open Firefox (or similar) → one collapsed parent with count and non-zero aggregate rates when active
- Expand → connection rows match pre-grouping expectations for that app
- Search / proto / listening-only rebuild groups correctly
- Kill on parent prompts for all PIDs in the group; kill on leaf remains single-PID when only one PID is selected

## Success

User opens Rex → sees app-level rows instead of an ungrouped flood → expands one app → inspects its connections → can kill at group or connection granularity without leaving the hierarchical table.
