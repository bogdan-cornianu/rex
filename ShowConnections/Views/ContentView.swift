import SwiftUI

struct ContentView: View {
    @Bindable var store: ConnectionStore
    @State private var selection = Set<Connection.ID>()
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

            Table(store.displayed, selection: $selection) {
                TableColumn("Process") { (connection: Connection) in
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
                .width(min: 140, ideal: 220)

                TableColumn("PID") { (connection: Connection) in
                    Text(String(connection.pid))
                        .monospacedDigit()
                }
                .width(60)

                TableColumn("Proto") { (connection: Connection) in
                    Text(connection.proto.displayName)
                        .monospaced()
                }
                .width(60)

                TableColumn("Local") { (connection: Connection) in
                    Text(connection.localDisplay)
                        .monospaced()
                        .lineLimit(1)
                }
                .width(min: 140, ideal: 180)

                TableColumn("Remote") { (connection: Connection) in
                    Text(connection.remoteDisplay)
                        .monospaced()
                        .lineLimit(1)
                }
                .width(min: 140, ideal: 180)

                TableColumn("State") { (connection: Connection) in
                    Text(connection.state.isEmpty ? "—" : connection.state)
                        .monospaced()
                }
                .width(110)
            }
            .contextMenu(forSelectionType: Connection.ID.self) { ids in
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
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if store.isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                }

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

    private func presentKill(for ids: Set<Connection.ID>) {
        let selected = store.displayed.filter { ids.contains($0.id) }
        guard let first = selected.first else { return }
        let pid = first.pid
        killTarget = KillTarget(
            pid: pid,
            processName: store.processName(for: pid),
            connectionCount: store.connectionCount(for: pid)
        )
    }
}

struct KillTarget: Identifiable, Hashable {
    var id: Int32 { pid }
    let pid: Int32
    let processName: String
    let connectionCount: Int
}
