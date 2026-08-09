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
