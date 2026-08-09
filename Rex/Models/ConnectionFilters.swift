import Foundation

enum ProtoFilter: String, CaseIterable, Identifiable, Sendable {
    case all
    case tcp
    case udp

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .tcp: "TCP"
        case .udp: "UDP"
        }
    }
}

struct ConnectionFilters: Equatable, Sendable {
    var searchText: String = ""
    var protoFilter: ProtoFilter = .all
    var listeningOnly: Bool = false

    func filtered(_ connections: [Connection]) -> [Connection] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let queryLower = query.lowercased()

        return connections.filter { connection in
            if listeningOnly && !connection.isListening {
                return false
            }

            switch protoFilter {
            case .all:
                break
            case .tcp:
                if !connection.proto.isTCP { return false }
            case .udp:
                if !connection.proto.isUDP { return false }
            }

            guard !query.isEmpty else { return true }

            let haystacks: [String] = [
                connection.processName,
                connection.processPath ?? "",
                connection.localAddress,
                connection.remoteAddress,
                connection.state,
                connection.proto.rawValue,
                String(connection.pid),
                String(connection.localPort),
                String(connection.remotePort),
                connection.localDisplay,
                connection.remoteDisplay,
            ]

            return haystacks.contains { $0.lowercased().contains(queryLower) }
        }
    }
}
