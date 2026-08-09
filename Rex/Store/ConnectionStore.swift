import Foundation
import Observation

@MainActor
@Observable
final class ConnectionStore {
    private(set) var connections: [Connection] = []
    private(set) var pollError: String?
    private(set) var lastUpdatedAt: Date?

    var filters = ConnectionFilters()

    var displayed: [Connection] {
        filters.filtered(connections)
    }

    var groupedDisplayed: [AppGroup] {
        AppGrouping.buildGroups(from: displayed)
    }

    private let poller = ConnectionPoller()
    private let nstat = NetworkStatisticsClient()
    private var pollTask: Task<Void, Never>?

    func start() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            await self?.runPollLoop()
        }
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil {
            let client = nstat
            Task.detached(priority: .utility) {
                client.start()
            }
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        nstat.stop()
    }

    func connectionCount(for pid: Int32) -> Int {
        connections.filter { $0.pid == pid }.count
    }

    func processName(for pid: Int32) -> String {
        connections.first(where: { $0.pid == pid })?.processName ?? "PID \(pid)"
    }

    private func runPollLoop() async {
        while !Task.isCancelled {
            await refreshOnce()
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func refreshOnce() async {
        let result = await Task.detached(priority: .utility) { [poller] in
            poller.snapshot()
        }.value

        let rates = nstat.snapshotRates()

        switch result {
        case .success(let next):
            connections = next.map { connection in
                guard let rate = rates[connection.id] else { return connection }
                return connection.withRates(
                    downloadBytesPerSecond: rate.downloadBytesPerSecond,
                    uploadBytesPerSecond: rate.uploadBytesPerSecond
                )
            }
            pollError = nil
            lastUpdatedAt = .now
        case .failure(let error):
            pollError = error.localizedDescription
        }
    }
}
