import SwiftUI

enum ConnectionOutlineItem: Identifiable, Hashable {
    case group(AppGroup)
    case connection(Connection)

    var id: String {
        switch self {
        case .group(let group):
            return "g:\(group.id)"
        case .connection(let connection):
            return "c:\(connection.id)"
        }
    }
}

struct ContentView: View {
    @Bindable var store: ConnectionStore
    @State private var selection = Set<ConnectionOutlineItem.ID>()
    @State private var expandedGroups = Set<String>()
    @State private var killTarget: KillTarget?
    @State private var alertMessage: String?

    private let killer = ProcessKiller()

    var body: some View {
        VStack(spacing: 0) {
            if let pollError = store.pollError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("Refresh failed: \(pollError)")
                    Spacer()
                }
                .font(.callout)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(Color.red.opacity(0.85))
            }

            Table(of: ConnectionOutlineItem.self, selection: $selection) {
                TableColumn("Process") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group(let group):
                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.displayName)
                                .fontWeight(.semibold)
                            Text("\(group.connectionCount) connection\(group.connectionCount == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .connection(let connection):
                        VStack(alignment: .leading, spacing: 2) {
                            Text(connection.processName)
                                .fontWeight(.medium)
                            if let path = connection.processPath {
                                Text(path)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                        }
                    }
                }
                .width(min: 160, ideal: 240)

                TableColumn("PID") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group:
                        Text("—")
                    case .connection(let connection):
                        Text(String(connection.pid))
                            .monospacedDigit()
                    }
                }
                .width(60)

                TableColumn("Proto") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group:
                        Text("—")
                    case .connection(let connection):
                        Text(connection.proto.displayName)
                            .monospaced()
                    }
                }
                .width(60)

                TableColumn("Local") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group:
                        Text("—")
                    case .connection(let connection):
                        Text(connection.localDisplay)
                            .monospaced()
                            .lineLimit(1)
                    }
                }
                .width(min: 140, ideal: 180)

                TableColumn("Remote") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group:
                        Text("—")
                    case .connection(let connection):
                        Text(connection.remoteDisplay)
                            .monospaced()
                            .lineLimit(1)
                    }
                }
                .width(min: 140, ideal: 180)

                TableColumn("State") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group:
                        Text("—")
                    case .connection(let connection):
                        Text(connection.state.isEmpty ? "—" : connection.state)
                            .monospaced()
                    }
                }
                .width(110)

                TableColumn("Download (MB/s)") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group(let group):
                        Text(formatRateMBPS(group.downloadBytesPerSecond))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    case .connection(let connection):
                        Text(formatRateMBPS(connection.downloadBytesPerSecond))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                .width(min: 100, ideal: 120)

                TableColumn("Upload (MB/s)") { (item: ConnectionOutlineItem) in
                    switch item {
                    case .group(let group):
                        Text(formatRateMBPS(group.uploadBytesPerSecond))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    case .connection(let connection):
                        Text(formatRateMBPS(connection.uploadBytesPerSecond))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                .width(min: 100, ideal: 120)
            } rows: {
                ForEach(store.groupedDisplayed) { group in
                    DisclosureTableRow(
                        ConnectionOutlineItem.group(group),
                        isExpanded: expansionBinding(for: group.id)
                    ) {
                        ForEach(group.connections) { connection in
                            TableRow(ConnectionOutlineItem.connection(connection))
                        }
                    }
                }
            }
            .contextMenu(forSelectionType: ConnectionOutlineItem.ID.self) { ids in
                Button("Kill Process…") {
                    presentKill(for: ids)
                }
                .disabled(ids.isEmpty)
            }
            .overlay {
                if store.displayed.isEmpty {
                    ContentUnavailableView(
                        store.connections.isEmpty ? "No connections yet" : "No matches",
                        systemImage: "network.slash",
                        description: Text(
                            store.connections.isEmpty
                                ? "Waiting for the first poll…"
                                : "Try clearing search or filters."
                        )
                    )
                }
            }
            .onChange(of: store.groupedDisplayed.map(\.id)) { _, ids in
                expandedGroups = expandedGroups.intersection(Set(ids))
            }

            statusBar
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                TextField("Search name / IP / port", text: $store.filters.searchText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 220)

                Picker("Proto", selection: $store.filters.protoFilter) {
                    ForEach(ProtoFilter.allCases) { filter in
                        Text(filter.label).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 180)

                Toggle("Listening only", isOn: $store.filters.listeningOnly)

                Button("Kill Process…") {
                    presentKill(for: selection)
                }
                .disabled(selection.isEmpty)
            }
        }
        .sheet(item: $killTarget) { target in
            KillConfirmSheet(
                target: target,
                killer: killer,
                onFinished: { killTarget = nil },
                onError: { message in
                    alertMessage = message
                }
            )
        }
        .alert("Couldn’t kill process", isPresented: Binding(
            get: { alertMessage != nil },
            set: { if !$0 { alertMessage = nil } }
        )) {
            Button("OK", role: .cancel) { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
        .task {
            store.start()
        }
        .onDisappear {
            store.stop()
        }
    }

    private var statusBar: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(spacing: 0) {
                Text(statusText(now: context.date))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(.bar)
        }
    }

    private func statusText(now: Date) -> String {
        let shown = store.displayed.count
        let total = store.connections.count
        let groups = store.groupedDisplayed.count
        let updated = relativeUpdated(lastUpdatedAt: store.lastUpdatedAt, now: now)
        return "\(groups) apps · \(shown) shown · \(total) total · Updated \(updated)"
    }

    private func expansionBinding(for groupID: String) -> Binding<Bool> {
        Binding(
            get: { expandedGroups.contains(groupID) },
            set: { isExpanded in
                if isExpanded {
                    expandedGroups.insert(groupID)
                } else {
                    expandedGroups.remove(groupID)
                }
            }
        )
    }

    private func presentKill(for ids: Set<ConnectionOutlineItem.ID>) {
        let selectedConnections = connections(matching: ids)
        guard !selectedConnections.isEmpty else { return }

        let pids = Array(Set(selectedConnections.map(\.pid))).sorted()
        let names = Array(Set(selectedConnections.map(\.processName))).sorted()
        let processName: String
        if names.count == 1 {
            processName = names[0]
        } else if pids.count == 1 {
            processName = names.joined(separator: ", ")
        } else {
            processName = "\(names.first ?? "Processes") +\(pids.count - 1) more"
        }

        killTarget = KillTarget(
            pids: pids,
            processName: processName,
            connectionCount: selectedConnections.count
        )
    }

    private func connections(matching ids: Set<ConnectionOutlineItem.ID>) -> [Connection] {
        var selected: [Connection] = []
        var seen = Set<Connection.ID>()

        for group in store.groupedDisplayed {
            if ids.contains(ConnectionOutlineItem.group(group).id) {
                for connection in group.connections where seen.insert(connection.id).inserted {
                    selected.append(connection)
                }
                continue
            }
            for connection in group.connections {
                let itemID = ConnectionOutlineItem.connection(connection).id
                if ids.contains(itemID), seen.insert(connection.id).inserted {
                    selected.append(connection)
                }
            }
        }
        return selected
    }
}

func relativeUpdated(lastUpdatedAt: Date?, now: Date) -> String {
    guard let lastUpdatedAt else { return "—" }
    let seconds = max(0, Int(now.timeIntervalSince(lastUpdatedAt)))
    if seconds < 2 {
        return "just now"
    }
    if seconds < 60 {
        return "\(seconds)s ago"
    }
    return lastUpdatedAt.formatted(date: .omitted, time: .shortened)
}

struct KillTarget: Identifiable, Hashable {
    var id: String { pids.map(String.init).joined(separator: ",") }
    let pids: [Int32]
    let processName: String
    let connectionCount: Int

    var pidLabel: String {
        if pids.count == 1 {
            return String(pids[0])
        }
        return pids.map(String.init).joined(separator: ", ")
    }
}
