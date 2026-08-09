# Rex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native macOS SwiftUI window app that polls live TCP/UDP connections via libproc and lets the user kill the owning process after confirmation.

**Architecture:** `ConnectionPoller` reads sockets with libproc on a ~1s timer; `ConnectionStore` holds filtered state on the MainActor; SwiftUI `Table` displays rows; `ProcessKiller` sends SIGTERM/SIGKILL after a confirm sheet.

**Tech Stack:** Swift 6, SwiftUI, AppKit only where needed for process path, libproc (`Darwin`), XcodeGen for the `.xcodeproj`, XCTest for unit tests.

## Global Constraints

- macOS 14+ deployment target
- No Network Extension, no shelling out to `lsof`/`netstat`
- No DNS reverse lookup, byte counters, auto-flagging, menu bar, or root helper in v1
- Kill process only (not per-socket close / firewall)
- App runs as current user; EPERM must surface as an alert

## File Structure

```
project.yml
Rex/
  RexApp.swift
  Models/Connection.swift
  Models/ConnectionFilters.swift
  Services/ConnectionPoller.swift
  Services/ProcessKiller.swift
  Store/ConnectionStore.swift
  Views/ContentView.swift
  Views/KillConfirmSheet.swift
  Resources/Assets.xcassets
  Resources/Info.plist
RexTests/
  ConnectionFiltersTests.swift
  ConnectionIDTests.swift
docs/superpowers/specs/2026-08-02-show-connections-design.md
docs/manual-smoke-checklist.md
```

---

### Task 1: Scaffold XcodeGen macOS app

**Files:**
- Create: `project.yml`
- Create: `Rex/RexApp.swift`
- Create: `Rex/Resources/Info.plist`
- Create: `Rex/Resources/Assets.xcassets/Contents.json`
- Create: `Rex/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `Rex/Views/ContentView.swift` (placeholder)
- Create: `RexTests/ConnectionFiltersTests.swift` (empty suite shell)

**Interfaces:**
- Produces: Xcode project `Rex.xcodeproj` with app + test targets

- [ ] **Step 1: Write `project.yml`**

```yaml
name: Rex
options:
  bundleIdPrefix: com.rex
  deploymentTarget:
    macOS: "14.0"
  createIntermediateGroups: true
settings:
  base:
    SWIFT_VERSION: "6.0"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
targets:
  Rex:
    type: application
    platform: macOS
    sources:
      - path: Rex
        excludes:
          - Resources/**
      - path: Rex/Resources
        buildPhase: resources
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.rex.app
        PRODUCT_NAME: Rex
        INFOPLIST_FILE: Rex/Resources/Info.plist
        GENERATE_INFOPLIST_FILE: false
        LD_RUNPATH_SEARCH_PATHS: "@executable_path/../Frameworks"
        CODE_SIGN_IDENTITY: "-"
        AD_HOC_CODE_SIGNING_ALLOWED: YES
    scheme:
      testTargets:
        - RexTests
  RexTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - RexTests
    dependencies:
      - target: Rex
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.rex.tests
        GENERATE_INFOPLIST_FILE: true
        CODE_SIGN_IDENTITY: "-"
```

- [ ] **Step 2: Write minimal app entry + placeholder UI + Info.plist + assets Contents.json**

`RexApp.swift` — `@main` `App` with `WindowGroup { ContentView() }`.  
`ContentView.swift` — `Text("Rex")`.  
Info.plist — `CFBundleName`, `CFBundleIdentifier` via build settings, `LSMinimumSystemVersion` 14.0, `NSPrincipalClass` = `NSApplication`, scene manifest for SwiftUI.

- [ ] **Step 3: Generate project and build**

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd /Users/bogdancornianu/Projects/show-connections/Untitled
xcodegen generate
xcodebuild -scheme Rex -project Rex.xcodeproj -destination 'platform=macOS' build
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 4: Commit**

```bash
git add project.yml Rex RexTests Rex.xcodeproj
git commit -m "Scaffold Rex macOS app with XcodeGen"
```

---

### Task 2: Connection model + filter logic (TDD)

**Files:**
- Create: `Rex/Models/Connection.swift`
- Create: `Rex/Models/ConnectionFilters.swift`
- Create: `RexTests/ConnectionFiltersTests.swift`
- Create: `RexTests/ConnectionIDTests.swift`

**Interfaces:**
- Produces:
  - `enum Proto: String, CaseIterable, Hashable` — `tcp`, `udp`, `tcp6`, `udp6` with `var isTCP: Bool` / `var isUDP: Bool`
  - `enum AddressFamily: String, Hashable` — `ipv4`, `ipv6`
  - `struct Connection: Identifiable, Hashable, Sendable` with fields from the design spec
  - `static func makeID(pid:proto:localAddress:localPort:remoteAddress:remotePort:) -> String`
  - `struct ConnectionFilters` with `searchText`, `protoFilter: ProtoFilter`, `listeningOnly`
  - `enum ProtoFilter: String, CaseIterable` — `all`, `tcp`, `udp`
  - `func filtered(_ connections: [Connection]) -> [Connection]`

- [ ] **Step 1: Write failing filter + id tests**

```swift
func testFilterBySearchMatchesProcessName() { ... }
func testFilterBySearchMatchesRemoteAddress() { ... }
func testFilterTCPOnly() { ... }
func testListeningOnlyKeepsEmptyRemote() { ... }
func testMakeIDStableAndDistinct() { ... }
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild test -scheme Rex -project Rex.xcodeproj -destination 'platform=macOS'
```

- [ ] **Step 3: Implement `Connection` + `ConnectionFilters`**

Listening-only: `remoteAddress.isEmpty || remotePort == 0` OR `state == "LISTEN"`. Prefer `state == "LISTEN"` when present; also treat empty remote as listening for UDP binds.

Search: case-insensitive match against `processName`, `processPath`, `localAddress`, `remoteAddress`, string forms of ports and PID.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "Add Connection model and filter logic with tests"
```

---

### Task 3: ConnectionPoller (libproc)

**Files:**
- Create: `Rex/Services/ConnectionPoller.swift`

**Interfaces:**
- Consumes: `Connection`, `Proto`, `AddressFamily`
- Produces:
  - `struct ConnectionPoller: Sendable`
  - `func snapshot() -> Result<[Connection], Error>` — one-shot enumerate
  - Maps TCP states via `tcp_connection_info.tcpi_state` using the standard `TCPS_*` numeric values to strings (`CLOSED`, `LISTEN`, `SYN_SENT`, `SYN_RECEIVED`, `ESTABLISHED`, `CLOSE_WAIT`, `FIN_WAIT_1`, `CLOSING`, `LAST_ACK`, `FIN_WAIT_2`, `TIME_WAIT`)
  - UDP `state` = `""`

- [ ] **Step 1: Implement poller using libproc**

Use `proc_listpids`, `proc_pidpath`, `proc_name`, `proc_pidinfo(PROC_PIDLISTFDS)`, `proc_pidfdinfo(PROC_PIDFDSOCKETINFO)`. Skip FDs that are not sockets. Skip PIDs that fail with EPERM. Parse `socket_fdinfo` for IPv4/IPv6 TCP/UDP.

- [ ] **Step 2: Smoke from a tiny debug path or manual run** — build succeeds; when app later wires store, browser shows ESTABLISHED.

- [ ] **Step 3: Commit**

```bash
git commit -m "Add libproc ConnectionPoller for live socket snapshots"
```

---

### Task 4: ProcessKiller + ConnectionStore

**Files:**
- Create: `Rex/Services/ProcessKiller.swift`
- Create: `Rex/Store/ConnectionStore.swift`

**Interfaces:**
- Produces:
  - `enum KillError: Error` — `permissionDenied`, `notFound`, `failed(errno: Int32)`
  - `struct ProcessKiller` — `func terminate(pid: Int32) throws`, `func forceQuit(pid: Int32) throws`, `func isAlive(pid: Int32) -> Bool`
  - `@MainActor @Observable final class ConnectionStore`
    - `connections: [Connection]`
    - `filters: ConnectionFilters`
    - `pollError: String?`
    - `isRefreshing: Bool`
    - `var displayed: [Connection] { filters.filtered(connections) }`
    - `func start()` / `func stop()` — timer ~1s calling poller off MainActor then assigning results
    - `func connectionCount(for pid: Int32) -> Int`

- [ ] **Step 1: Implement killer using `kill(2)` and `kill(pid, 0)` for liveness**

Map `errno == EPERM` → `KillError.permissionDenied`, `ESRCH` → `notFound`.

- [ ] **Step 2: Implement store with `Task` loop `try await Task.sleep(for: .seconds(1))`**

- [ ] **Step 3: Build**

- [ ] **Step 4: Commit**

```bash
git commit -m "Add ProcessKiller and ConnectionStore polling loop"
```

---

### Task 5: SwiftUI table + kill confirm sheet

**Files:**
- Modify: `Rex/Views/ContentView.swift`
- Create: `Rex/Views/KillConfirmSheet.swift`
- Modify: `Rex/RexApp.swift` (inject store)

**Interfaces:**
- Consumes: `ConnectionStore`, `ProcessKiller`
- Produces: full window UI per design spec

- [ ] **Step 1: Implement `ContentView`**

Toolbar search, proto picker, listening toggle, refresh ProgressView when `isRefreshing`, banner if `pollError != nil`, `Table` columns, selection `Set<Connection.ID>`, Kill Process button disabled when selection empty.

- [ ] **Step 2: Implement `KillConfirmSheet`**

Show name, PID, connection count. Buttons: Cancel, Terminate, Force Quit (enabled after terminate attempted and still alive, or always available as secondary destructive). On Terminate: call killer; on EPERM show alert. After terminate, wait 2s and check `isAlive`.

- [ ] **Step 3: Wire `.task { store.start() }` / `onDisappear { store.stop() }`**

- [ ] **Step 4: Build and manual smoke**

- [ ] **Step 5: Commit**

```bash
git commit -m "Add connection table UI and kill confirm flow"
```

---

### Task 6: Manual smoke checklist + verify tests

**Files:**
- Create: `docs/manual-smoke-checklist.md`

- [ ] **Step 1: Write checklist** covering browser ESTABLISHED, kill helper, SIP EPERM alert, filter snappiness

- [ ] **Step 2: Run unit tests — all PASS**

- [ ] **Step 3: Commit**

```bash
git commit -m "Add manual smoke checklist; verify unit tests"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| libproc polling ~1s | 3, 4 |
| Table columns + filters | 2, 5 |
| Kill SIGTERM / SIGKILL confirm | 4, 5 |
| EPERM alert, keep last list on poll fail | 4, 5 |
| Unit tests filters/ids | 2 |
| Manual smoke | 6 |
| No DNS/bytes/firewall/menubar | Global — not implemented |

No placeholders remaining.
