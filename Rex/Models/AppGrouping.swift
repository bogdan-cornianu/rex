import Foundation

struct AppGroup: Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let connections: [Connection]

    var connectionCount: Int { connections.count }

    var downloadBytesPerSecond: Double {
        connections.reduce(0) { $0 + ($1.downloadBytesPerSecond ?? 0) }
    }

    var uploadBytesPerSecond: Double {
        connections.reduce(0) { $0 + ($1.uploadBytesPerSecond ?? 0) }
    }
}

enum AppGrouping {
    static func groupKey(processName: String, processPath: String?) -> String {
        if let bundlePath = bundlePath(from: processPath) {
            return bundlePath
        }
        return "name:\(processName)"
    }

    static func displayName(processName: String, processPath: String?) -> String {
        if let bundlePath = bundlePath(from: processPath) {
            let last = (bundlePath as NSString).lastPathComponent
            if last.hasSuffix(".app") {
                return String(last.dropLast(4))
            }
            return last
        }
        return processName
    }

    static func buildGroups(from connections: [Connection]) -> [AppGroup] {
        var order: [String] = []
        var buckets: [String: (displayName: String, connections: [Connection])] = [:]

        for connection in connections {
            let key = groupKey(processName: connection.processName, processPath: connection.processPath)
            if buckets[key] == nil {
                order.append(key)
                buckets[key] = (
                    displayName: displayName(
                        processName: connection.processName,
                        processPath: connection.processPath
                    ),
                    connections: []
                )
            }
            buckets[key]?.connections.append(connection)
        }

        let groups = order.compactMap { key -> AppGroup? in
            guard let bucket = buckets[key] else { return nil }
            return AppGroup(
                id: key,
                displayName: bucket.displayName,
                connections: bucket.connections
            )
        }

        return groups.sorted {
            $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending
        }
    }

    private static func bundlePath(from processPath: String?) -> String? {
        guard let processPath, !processPath.isEmpty else { return nil }
        let components = (processPath as NSString).pathComponents
        guard let index = components.lastIndex(where: { $0.hasSuffix(".app") }) else {
            return nil
        }
        let bundleComponents = components[...index]
        return NSString.path(withComponents: Array(bundleComponents))
    }
}
