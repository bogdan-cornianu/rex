import Foundation
import Observation

@MainActor
@Observable
final class ConnectionStore {
    private(set) var connections: [Connection] = []
    private(set) var pollError: String?
    private(set) var isRefreshing: Bool = false

    var filters = ConnectionFilters()

    var displayed: [Connection] {
        filters.filtered(connections)
    }

    private let poller = ConnectionPoller()
    private var pollTask: Task<Void, Never>?

    func start() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            await self?.runPollLoop()
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
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
        isRefreshing = true
        let result = await Task.detached(priority: .utility) { [poller] in
            poller.snapshot()
        }.value

        switch result {
        case .success(let next):
            connections = next
            pollError = nil
        case .failure(let error):
            pollError = error.localizedDescription
        }

        isRefreshing = false
    }
}
