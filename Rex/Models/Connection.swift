import Foundation

enum Proto: String, CaseIterable, Hashable, Sendable {
    case tcp
    case udp
    case tcp6
    case udp6

    var isTCP: Bool {
        self == .tcp || self == .tcp6
    }

    var isUDP: Bool {
        self == .udp || self == .udp6
    }

    var displayName: String {
        rawValue.uppercased()
    }
}

enum AddressFamily: String, Hashable, Sendable {
    case ipv4
    case ipv6
}

struct Connection: Identifiable, Hashable, Sendable {
    let id: String
    let pid: Int32
    let processName: String
    let processPath: String?
    let proto: Proto
    let localAddress: String
    let localPort: UInt16
    let remoteAddress: String
    let remotePort: UInt16
    let state: String
    let family: AddressFamily
    let downloadBytesPerSecond: Double?
    let uploadBytesPerSecond: Double?

    init(
        id: String,
        pid: Int32,
        processName: String,
        processPath: String?,
        proto: Proto,
        localAddress: String,
        localPort: UInt16,
        remoteAddress: String,
        remotePort: UInt16,
        state: String,
        family: AddressFamily,
        downloadBytesPerSecond: Double? = nil,
        uploadBytesPerSecond: Double? = nil
    ) {
        self.id = id
        self.pid = pid
        self.processName = processName
        self.processPath = processPath
        self.proto = proto
        self.localAddress = localAddress
        self.localPort = localPort
        self.remoteAddress = remoteAddress
        self.remotePort = remotePort
        self.state = state
        self.family = family
        self.downloadBytesPerSecond = downloadBytesPerSecond
        self.uploadBytesPerSecond = uploadBytesPerSecond
    }

    var localDisplay: String {
        formatEndpoint(address: localAddress, port: localPort, family: family)
    }

    var remoteDisplay: String {
        if remoteAddress.isEmpty && remotePort == 0 {
            return "*"
        }
        return formatEndpoint(address: remoteAddress, port: remotePort, family: family)
    }

    var isListening: Bool {
        state == "LISTEN" || (remoteAddress.isEmpty && remotePort == 0)
    }

    func withRates(downloadBytesPerSecond: Double?, uploadBytesPerSecond: Double?) -> Connection {
        Connection(
            id: id,
            pid: pid,
            processName: processName,
            processPath: processPath,
            proto: proto,
            localAddress: localAddress,
            localPort: localPort,
            remoteAddress: remoteAddress,
            remotePort: remotePort,
            state: state,
            family: family,
            downloadBytesPerSecond: downloadBytesPerSecond,
            uploadBytesPerSecond: uploadBytesPerSecond
        )
    }

    static func makeID(
        pid: Int32,
        proto: Proto,
        localAddress: String,
        localPort: UInt16,
        remoteAddress: String,
        remotePort: UInt16
    ) -> String {
        "\(pid)|\(proto.rawValue)|\(localAddress)|\(localPort)|\(remoteAddress)|\(remotePort)"
    }
}

private func formatEndpoint(address: String, port: UInt16, family: AddressFamily) -> String {
    if family == .ipv6 {
        return "[\(address)]:\(port)"
    }
    return "\(address):\(port)"
}
