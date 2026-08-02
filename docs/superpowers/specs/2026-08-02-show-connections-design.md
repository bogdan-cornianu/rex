# Show Connections — Design Spec

**Date:** 2026-08-02  
**Status:** Approved  
**Product:** Mac desktop app — live network connections viewer for manual security watching

## Problem

Users need a clear, always-current view of which processes hold live TCP/UDP connections, and a safe way to terminate a suspicious process after confirmation. Existing tools (`lsof`, `netstat`, Activity Monitor) are either CLI-only, incomplete for this job, or bury network detail.

## Goals

- Show all visible live network connections in a sortable, filterable table
- Attribute each connection to a process (name, PID, path when readable)
- Allow killing the owning process (SIGTERM, then optional SIGKILL) after an explicit confirm sheet
- Stay responsive under roughly 1k rows with ~1s refresh

## Non-goals (v1)

- Auto-flagging “weird” apps (unsigned, first-seen, etc.)
- DNS reverse lookup of remote addresses
- Byte counters / bandwidth
- Firewall block or per-socket close
- Menu bar presence
- Root helper / Full Disk Access requirement
- Notarization / distribution pipeline
- Network Extension / packet capture

## Users & success

- **User:** someone manually scanning for unexpected outbound/inbound activity
- **Success:** open app → see live ESTABLISHED rows when a browser is active → filter by process or IP → confirm-kill a test process → row disappears on next poll; SIP/EPERM kills show a clear alert and the app stays up

## Architecture

```
SwiftUI Window Table → ConnectionStore → ConnectionPoller → libproc
                    ↘ ProcessKiller → kill(2)
```

| Unit | Responsibility |
|------|----------------|
| `ConnectionPoller` | Background ~1s poll: list PIDs, read socket FDs, map to `[Connection]` |
| `ConnectionStore` | `@Observable` source of truth; search / proto / listening filters; sort state |
| `ProcessKiller` | Confirm → SIGTERM; if process still alive after ~2s → offer SIGKILL; surface EPERM |
| Main `Table` UI | Columns, toolbar filters, kill action, error banner |

No Network Extension. No shelling out to `lsof`/`netstat`.

## Data model

```swift
struct Connection: Identifiable, Hashable {
    var id: String              // pid + proto + local + remote
    var pid: Int32
    var processName: String
    var processPath: String?
    var proto: Proto            // tcp, udp, tcp6, udp6
    var localAddress: String
    var localPort: UInt16
    var remoteAddress: String   // empty if listening / unbound remote
    var remotePort: UInt16
    var state: String           // ESTABLISHED, LISTEN, TIME_WAIT, …; blank for UDP
    var family: AddressFamily   // ipv4 / ipv6
}
```

## Data flow

1. Timer on a background queue every ~1s
2. `proc_listpids(PROC_ALL_PIDS, …)`
3. Per PID: resolve name/path; `PROC_PIDLISTFDS` → socket FDs → `PROC_PIDFDSOCKETINFO`
4. Build `[Connection]`; publish to `ConnectionStore` on the MainActor
5. Skip PIDs that return EPERM without failing the whole poll
6. On poll failure: keep last good list and set an error banner (“Refresh failed”)

## Kill flow

1. User selects row(s) → unique PID set
2. Confirm sheet shows process name, PID, and how many listed connections that PID owns
3. **Terminate** → `kill(pid, SIGTERM)`
4. If PID still present after ~2s → sheet/alert offers **Force Quit** → `kill(pid, SIGKILL)`
5. On EPERM / SIP-protected target → alert: permission denied; app continues

## UX

- Single normal macOS window (not menu bar)
- Toolbar: search (name / IP / port) · proto picker (All / TCP / UDP) · “Listening only” toggle · subtle refresh indicator
- SwiftUI `Table` with sortable columns: Process, PID, Proto, Local, Remote, State
- Context menu and toolbar button: **Kill Process…**
- Empty filtered results show empty state, not an error

## Privileges & limits

- App runs as the current user
- Some root/SIP process sockets may be incomplete or missing — acceptable in v1
- No Full Disk Access and no privileged helper in v1
- Cannot reliably kill SIP-protected or other-user root processes — must fail loudly

## Project layout

```
ShowConnections/                 # app sources
  Models/Connection.swift
  Services/ConnectionPoller.swift
  Services/ProcessKiller.swift
  Store/ConnectionStore.swift
  Views/…                        # main table + kill sheet
ShowConnectionsTests/            # unit tests (mapping, filters, ids)
```

## Testing

**Unit**

- Map fixture socket info → `Connection`
- Filter/search (proto, listening-only, text)
- Stable `id` uniqueness / collision cases

**Manual**

- Browser open → ESTABLISHED rows appear
- Kill a controllable test helper → row gone next poll
- Attempt kill of SIP-protected process → permission alert; app stays up
- Filters remain usable with ~1k rows

## Open follow-ups (post-v1)

- Code-signing / notarization
- Optional firewall block via Network Extension
- First-seen / unsigned highlighting
- Menu bar companion window
