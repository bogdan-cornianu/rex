import Darwin
import Foundation

enum ConnectionPollError: Error, LocalizedError, Sendable {
    case listPidsFailed

    var errorDescription: String? {
        switch self {
        case .listPidsFailed:
            return "Failed to list processes"
        }
    }
}

struct ConnectionPoller: Sendable {
    func snapshot() -> Result<[Connection], Error> {
        do {
            let pids = try listPIDs()
            var connections: [Connection] = []
            connections.reserveCapacity(256)

            for pid in pids {
                guard let process = processInfo(pid: pid) else { continue }
                connections.append(contentsOf: sockets(for: process))
            }

            return .success(connections)
        } catch {
            return .failure(error)
        }
    }

    private struct ProcessInfo {
        let pid: Int32
        let name: String
        let path: String?
    }

    private func listPIDs() throws -> [Int32] {
        let type = UInt32(PROC_ALL_PIDS)
        let numberOfBytes = proc_listpids(type, 0, nil, 0)
        guard numberOfBytes > 0 else {
            throw ConnectionPollError.listPidsFailed
        }

        let count = Int(numberOfBytes) / MemoryLayout<pid_t>.stride
        var buffer = [pid_t](repeating: 0, count: count)
        let written = buffer.withUnsafeMutableBufferPointer { ptr in
            proc_listpids(type, 0, ptr.baseAddress, Int32(numberOfBytes))
        }
        guard written > 0 else {
            throw ConnectionPollError.listPidsFailed
        }

        let actualCount = Int(written) / MemoryLayout<pid_t>.stride
        return Array(buffer.prefix(actualCount)).filter { $0 > 0 }
    }

    private func processInfo(pid: Int32) -> ProcessInfo? {
        var pathBuffer = [CChar](repeating: 0, count: Int(MAXPATHLEN))
        let pathLength = proc_pidpath(pid, &pathBuffer, UInt32(MAXPATHLEN))
        let path: String?
        if pathLength > 0 {
            path = String(cString: pathBuffer)
        } else {
            path = nil
        }

        var nameBuffer = [CChar](repeating: 0, count: Int(MAXCOMLEN) * 2 + 1)
        let nameLength = proc_name(pid, &nameBuffer, UInt32(nameBuffer.count))
        let name: String
        if nameLength > 0 {
            name = String(cString: nameBuffer)
        } else if let path, let last = path.split(separator: "/").last {
            name = String(last)
        } else {
            return nil
        }

        return ProcessInfo(pid: pid, name: name, path: path)
    }

    private func sockets(for process: ProcessInfo) -> [Connection] {
        let bufferSize = proc_pidinfo(process.pid, PROC_PIDLISTFDS, 0, nil, 0)
        guard bufferSize > 0 else { return [] }

        let fdCount = Int(bufferSize) / MemoryLayout<proc_fdinfo>.stride
        var fdInfos = [proc_fdinfo](repeating: proc_fdinfo(), count: fdCount)
        let written = fdInfos.withUnsafeMutableBufferPointer { ptr in
            proc_pidinfo(
                process.pid,
                PROC_PIDLISTFDS,
                0,
                ptr.baseAddress,
                Int32(fdCount * MemoryLayout<proc_fdinfo>.stride)
            )
        }
        guard written > 0 else { return [] }

        let actualCount = Int(written) / MemoryLayout<proc_fdinfo>.stride
        var results: [Connection] = []

        for index in 0..<actualCount {
            let info = fdInfos[index]
            guard info.proc_fdtype == UInt32(PROX_FDTYPE_SOCKET) else { continue }
            if let connection = connection(from: process, fd: info.proc_fd) {
                results.append(connection)
            }
        }

        return results
    }

    private func connection(from process: ProcessInfo, fd: Int32) -> Connection? {
        var socketInfo = socket_fdinfo()
        let size = Int32(MemoryLayout<socket_fdinfo>.stride)
        let result = withUnsafeMutablePointer(to: &socketInfo) { ptr in
            proc_pidfdinfo(process.pid, fd, PROC_PIDFDSOCKETINFO, ptr, size)
        }
        guard result > 0 else { return nil }

        let kind = socketInfo.psi.soi_kind
        switch kind {
        case Int32(SOCKINFO_TCP):
            return makeConnection(
                process: process,
                inet: socketInfo.psi.soi_proto.pri_tcp.tcpsi_ini,
                isTCP: true,
                state: tcpStateName(socketInfo.psi.soi_proto.pri_tcp.tcpsi_state)
            )
        case Int32(SOCKINFO_IN):
            return makeConnection(
                process: process,
                inet: socketInfo.psi.soi_proto.pri_in,
                isTCP: false,
                state: ""
            )
        default:
            return nil
        }
    }

    private func makeConnection(
        process: ProcessInfo,
        inet: in_sockinfo,
        isTCP: Bool,
        state: String
    ) -> Connection? {
        let family: AddressFamily
        let localAddress: String
        let remoteAddress: String
        let proto: Proto

        if inet.insi_vflag & UInt8(INI_IPV6) != 0 {
            family = .ipv6
            localAddress = ipv6String(inet.insi_laddr.ina_6)
            remoteAddress = ipv6String(inet.insi_faddr.ina_6)
            proto = isTCP ? .tcp6 : .udp6
        } else if inet.insi_vflag & UInt8(INI_IPV4) != 0 {
            family = .ipv4
            localAddress = ipv4String(inet.insi_laddr.ina_46.i46a_addr4)
            remoteAddress = ipv4String(inet.insi_faddr.ina_46.i46a_addr4)
            proto = isTCP ? .tcp : .udp
        } else {
            return nil
        }

        let localPort = UInt16(bigEndian: UInt16(truncatingIfNeeded: inet.insi_lport))
        let remotePort = UInt16(bigEndian: UInt16(truncatingIfNeeded: inet.insi_fport))

        let remoteIsUnspecified =
            (family == .ipv4 && (remoteAddress == "0.0.0.0" || remotePort == 0))
            || (family == .ipv6 && (remoteAddress == "::" || remotePort == 0))

        let normalizedRemoteAddress = remoteIsUnspecified ? "" : remoteAddress
        let normalizedRemotePort = remoteIsUnspecified ? 0 : remotePort

        let id = Connection.makeID(
            pid: process.pid,
            proto: proto,
            localAddress: localAddress,
            localPort: localPort,
            remoteAddress: normalizedRemoteAddress,
            remotePort: normalizedRemotePort
        )

        return Connection(
            id: id,
            pid: process.pid,
            processName: process.name,
            processPath: process.path,
            proto: proto,
            localAddress: localAddress,
            localPort: localPort,
            remoteAddress: normalizedRemoteAddress,
            remotePort: normalizedRemotePort,
            state: state,
            family: family
        )
    }

    private func tcpStateName(_ state: Int32) -> String {
        switch state {
        case Int32(TSI_S_CLOSED): return "CLOSED"
        case Int32(TSI_S_LISTEN): return "LISTEN"
        case Int32(TSI_S_SYN_SENT): return "SYN_SENT"
        case Int32(TSI_S_SYN_RECEIVED): return "SYN_RECEIVED"
        case Int32(TSI_S_ESTABLISHED): return "ESTABLISHED"
        case Int32(TSI_S__CLOSE_WAIT): return "CLOSE_WAIT"
        case Int32(TSI_S_FIN_WAIT_1): return "FIN_WAIT_1"
        case Int32(TSI_S_CLOSING): return "CLOSING"
        case Int32(TSI_S_LAST_ACK): return "LAST_ACK"
        case Int32(TSI_S_FIN_WAIT_2): return "FIN_WAIT_2"
        case Int32(TSI_S_TIME_WAIT): return "TIME_WAIT"
        default: return "UNKNOWN(\(state))"
        }
    }

    private func ipv4String(_ address: in_addr) -> String {
        var addr = address
        var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        inet_ntop(AF_INET, &addr, &buffer, socklen_t(INET_ADDRSTRLEN))
        return String(cString: buffer)
    }

    private func ipv6String(_ address: in6_addr) -> String {
        var addr = address
        var buffer = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
        inet_ntop(AF_INET6, &addr, &buffer, socklen_t(INET6_ADDRSTRLEN))
        return String(cString: buffer)
    }
}
