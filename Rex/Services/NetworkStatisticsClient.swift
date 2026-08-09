import Darwin
import Foundation

/// Client for the private `com.apple.network.statistics` kernel control socket.
/// Supplies per-flow byte rates keyed like `Connection.makeID`.
final class NetworkStatisticsClient: @unchecked Sendable {
    private let lock = NSLock()
    private var fd: Int32 = -1
    private var runTask: Task<Void, Never>?
    private var contextCounter: UInt64 = 1

    private var providerBySrc: [UInt64: UInt32] = [:]
    private var flowKeyBySrc: [UInt64: String] = [:]
    private var pendingDesc: [UInt64] = []
    private var lastCounts: [UInt64: (rx: UInt64, tx: UInt64, at: Date)] = [:]
    private var ratesByFlowKey: [String: FlowRate] = [:]

    func start() {
        lock.lock()
        let alreadyRunning = runTask != nil
        lock.unlock()
        guard !alreadyRunning else { return }

        guard connectSocket() else { return }
        subscribeProviders()

        let task = Task.detached(priority: .utility) { [weak self] in
            guard let self else { return }
            await self.runLoop()
        }
        lock.lock()
        runTask = task
        lock.unlock()
    }

    func stop() {
        lock.lock()
        runTask?.cancel()
        runTask = nil
        let sock = fd
        fd = -1
        providerBySrc.removeAll()
        flowKeyBySrc.removeAll()
        pendingDesc.removeAll()
        lastCounts.removeAll()
        ratesByFlowKey.removeAll()
        lock.unlock()
        if sock >= 0 {
            Darwin.close(sock)
        }
    }

    func snapshotRates() -> [String: FlowRate] {
        lock.lock()
        defer { lock.unlock() }
        return ratesByFlowKey
    }

    // MARK: - Socket

    private func connectSocket() -> Bool {
        let sock = nstat_open_control_socket()
        guard sock >= 0 else { return false }
        lock.lock()
        if fd >= 0 {
            Darwin.close(fd)
        }
        fd = sock
        lock.unlock()
        return true
    }

    private func subscribeProviders() {
        let providers: [UInt32] = [
            NStat.Provider.tcpKernel,
            NStat.Provider.tcpUserland,
            NStat.Provider.udpKernel,
            NStat.Provider.udpUserland,
        ]
        for provider in providers {
            sendAddAllSources(provider: provider)
        }
    }

    // MARK: - Loop

    private func runLoop() async {
        var lastQuery = Date.distantPast
        while !Task.isCancelled {
            drainSocket()
            requestPendingDescriptions(limit: 8)

            let now = Date()
            if now.timeIntervalSince(lastQuery) >= 1.0 {
                sendQueryAll()
                lastQuery = now
            }

            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    private func drainSocket() {
        lock.lock()
        let sock = fd
        lock.unlock()
        guard sock >= 0 else { return }

        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            let n = buffer.withUnsafeMutableBytes { raw in
                Darwin.recv(sock, raw.baseAddress, raw.count, 0)
            }
            if n <= 0 {
                break
            }
            parseDatagram(Data(buffer.prefix(Int(n))))
        }
    }

    // MARK: - Send helpers

    private func nextContext() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        contextCounter += 1
        return contextCounter
    }

    private func send(_ bytes: [UInt8]) {
        lock.lock()
        let sock = fd
        lock.unlock()
        guard sock >= 0 else { return }
        _ = bytes.withUnsafeBytes { raw in
            Darwin.send(sock, raw.baseAddress, raw.count, 0)
        }
    }

    private func sendAddAllSources(provider: UInt32) {
        var msg = NStat.AddAllSources()
        msg.hdr.context = nextContext()
        msg.hdr.type = NStat.MessageType.addAllSources
        msg.hdr.length = UInt16(MemoryLayout<NStat.AddAllSources>.size)
        msg.provider = provider
        send(bytesOf(msg))
    }

    private func sendGetDescription(srcRef: UInt64) {
        var msg = NStat.SrcRefRequest()
        msg.hdr.context = nextContext()
        msg.hdr.type = NStat.MessageType.getSrcDesc
        msg.hdr.length = UInt16(MemoryLayout<NStat.SrcRefRequest>.size)
        msg.srcref = srcRef
        send(bytesOf(msg))
    }

    private func sendQueryAll() {
        var msg = NStat.SrcRefRequest()
        msg.hdr.context = nextContext()
        msg.hdr.type = NStat.MessageType.querySrc
        msg.hdr.length = UInt16(MemoryLayout<NStat.SrcRefRequest>.size)
        msg.srcref = NStat.srcRefAll
        send(bytesOf(msg))
    }

    private func requestPendingDescriptions(limit: Int) {
        lock.lock()
        let batch = Array(pendingDesc.prefix(limit))
        if !batch.isEmpty {
            pendingDesc.removeFirst(min(limit, pendingDesc.count))
        }
        lock.unlock()
        for src in batch {
            sendGetDescription(srcRef: src)
        }
    }

    // MARK: - Parse

    private func parseDatagram(_ data: Data) {
        var offset = 0
        while offset + MemoryLayout<NStat.Header>.size <= data.count {
            let hdr: NStat.Header = read(data, at: offset)
            let length = Int(hdr.length)
            if length < MemoryLayout<NStat.Header>.size || offset + length > data.count {
                break
            }
            let slice = data.subdata(in: offset..<(offset + length))
            handleMessage(type: hdr.type, data: slice)
            offset += length
        }
    }

    private func handleMessage(type: UInt32, data: Data) {
        switch type {
        case NStat.MessageType.srcAdded:
            guard data.count >= MemoryLayout<NStat.SrcAdded>.size else { return }
            let msg: NStat.SrcAdded = read(data, at: 0)
            lock.lock()
            providerBySrc[msg.srcref] = msg.provider
            if flowKeyBySrc[msg.srcref] == nil {
                pendingDesc.append(msg.srcref)
            }
            lock.unlock()

        case NStat.MessageType.srcRemoved:
            guard data.count >= MemoryLayout<NStat.SrcRefRequest>.size else { return }
            let msg: NStat.SrcRefRequest = read(data, at: 0)
            lock.lock()
            providerBySrc.removeValue(forKey: msg.srcref)
            if let key = flowKeyBySrc.removeValue(forKey: msg.srcref) {
                ratesByFlowKey.removeValue(forKey: key)
            }
            lastCounts.removeValue(forKey: msg.srcref)
            pendingDesc.removeAll { $0 == msg.srcref }
            lock.unlock()

        case NStat.MessageType.srcDesc:
            handleSrcDesc(data)

        case NStat.MessageType.srcCounts:
            handleSrcCounts(data)

        default:
            break
        }
    }

    private func handleSrcDesc(_ data: Data) {
        let headerSize = MemoryLayout<NStat.SrcDescriptionHeader>.size
        guard data.count >= headerSize else { return }
        let header: NStat.SrcDescriptionHeader = read(data, at: 0)
        let payload = data.subdata(in: headerSize..<data.count)

        let identity: FlowIdentity?
        switch header.provider {
        case NStat.Provider.tcpKernel, NStat.Provider.tcpUserland:
            identity = FlowIdentity.parseTCP(payload)
        case NStat.Provider.udpKernel, NStat.Provider.udpUserland:
            identity = FlowIdentity.parseUDP(payload)
        default:
            identity = nil
        }

        guard let identity, identity.isPlausible else { return }
        let key = identity.flowKey

        lock.lock()
        providerBySrc[header.srcref] = header.provider
        flowKeyBySrc[header.srcref] = key
        lock.unlock()
    }

    private func handleSrcCounts(_ data: Data) {
        guard data.count >= MemoryLayout<NStat.SrcCounts>.size else { return }
        let msg: NStat.SrcCounts = read(data, at: 0)
        let now = Date()
        let rx = msg.counts.rxbytes
        let tx = msg.counts.txbytes

        lock.lock()
        defer { lock.unlock() }

        let previous = lastCounts[msg.srcref]
        lastCounts[msg.srcref] = (rx, tx, now)

        guard let flowKey = flowKeyBySrc[msg.srcref] else { return }

        let download = TrafficRateMath.rateBytesPerSecond(
            previousBytes: previous?.rx,
            previousTime: previous?.at,
            currentBytes: rx,
            currentTime: now
        )
        let upload = TrafficRateMath.rateBytesPerSecond(
            previousBytes: previous?.tx,
            previousTime: previous?.at,
            currentBytes: tx,
            currentTime: now
        )

        if let download, let upload {
            ratesByFlowKey[flowKey] = FlowRate(
                downloadBytesPerSecond: download,
                uploadBytesPerSecond: upload
            )
        }
    }
}

// MARK: - Flow identity

private struct FlowIdentity {
    var pid: Int32
    var proto: Proto
    var localAddress: String
    var localPort: UInt16
    var remoteAddress: String
    var remotePort: UInt16

    var isPlausible: Bool {
        pid > 0 && localPort >= 0
    }

    var flowKey: String {
        Connection.makeID(
            pid: pid,
            proto: proto,
            localAddress: localAddress,
            localPort: localPort,
            remoteAddress: remoteAddress,
            remotePort: remotePort
        )
    }

    static func parseTCP(_ payload: Data) -> FlowIdentity? {
        // Offsets from current XNU nstat_tcp_descriptor (macOS 14+).
        let pidOffset = 116
        let localOffset = 124
        let remoteOffset = 152
        guard payload.count >= remoteOffset + 28 else { return nil }
        let pid = payload.readUInt32(at: pidOffset)
        guard let local = SocketAddress.parse(payload, at: localOffset),
              let remote = SocketAddress.parse(payload, at: remoteOffset)
        else { return nil }
        return make(pid: Int32(bitPattern: pid), isTCP: true, local: local, remote: remote)
    }

    static func parseUDP(_ payload: Data) -> FlowIdentity? {
        let localOffset = 56
        let remoteOffset = 84
        let pidOffset = 128
        guard payload.count >= pidOffset + 4 else { return nil }
        let pid = payload.readUInt32(at: pidOffset)
        guard let local = SocketAddress.parse(payload, at: localOffset),
              let remote = SocketAddress.parse(payload, at: remoteOffset)
        else { return nil }
        return make(pid: Int32(bitPattern: pid), isTCP: false, local: local, remote: remote)
    }

    private static func make(
        pid: Int32,
        isTCP: Bool,
        local: SocketAddress,
        remote: SocketAddress
    ) -> FlowIdentity? {
        guard local.family == remote.family || remote.isUnspecified else { return nil }

        let family = local.family
        let proto: Proto
        switch (isTCP, family) {
        case (true, .ipv4): proto = .tcp
        case (true, .ipv6): proto = .tcp6
        case (false, .ipv4): proto = .udp
        case (false, .ipv6): proto = .udp6
        }

        let remoteIsUnspecified =
            (family == .ipv4 && (remote.address == "0.0.0.0" || remote.port == 0))
            || (family == .ipv6 && (remote.address == "::" || remote.port == 0))
            || remote.isUnspecified

        return FlowIdentity(
            pid: pid,
            proto: proto,
            localAddress: local.address,
            localPort: local.port,
            remoteAddress: remoteIsUnspecified ? "" : remote.address,
            remotePort: remoteIsUnspecified ? 0 : remote.port
        )
    }
}

private struct SocketAddress {
    var family: AddressFamily
    var address: String
    var port: UInt16
    var isUnspecified: Bool

    static func parse(_ data: Data, at offset: Int) -> SocketAddress? {
        guard offset + 2 <= data.count else { return nil }
        let familyRaw = Int32(data[offset])
        // sockaddr.sa_family is at offset 1 on Darwin (sa_len at 0).
        let familyValue = Int32(data[offset + 1])

        if familyValue == AF_INET {
            guard offset + MemoryLayout<sockaddr_in>.size <= data.count else { return nil }
            var addr = data.withUnsafeBytes { raw -> sockaddr_in in
                raw.loadUnaligned(fromByteOffset: offset, as: sockaddr_in.self)
            }
            var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            inet_ntop(AF_INET, &addr.sin_addr, &buffer, socklen_t(INET_ADDRSTRLEN))
            let address = cString(from: buffer)
            let port = UInt16(bigEndian: addr.sin_port)
            return SocketAddress(
                family: .ipv4,
                address: address,
                port: port,
                isUnspecified: address == "0.0.0.0" && port == 0
            )
        }

        if familyValue == AF_INET6 {
            guard offset + MemoryLayout<sockaddr_in6>.size <= data.count else { return nil }
            var addr = data.withUnsafeBytes { raw -> sockaddr_in6 in
                raw.loadUnaligned(fromByteOffset: offset, as: sockaddr_in6.self)
            }
            var buffer = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
            inet_ntop(AF_INET6, &addr.sin6_addr, &buffer, socklen_t(INET6_ADDRSTRLEN))
            let address = cString(from: buffer)
            let port = UInt16(bigEndian: addr.sin6_port)
            return SocketAddress(
                family: .ipv6,
                address: address,
                port: port,
                isUnspecified: (address == "::" || address == "::0") && port == 0
            )
        }

        // Some payloads may leave family in sa_family only; ignore unknown.
        _ = familyRaw
        return nil
    }
}

// MARK: - NStat wire types

private enum NStat {
    enum MessageType {
        static let addAllSources: UInt32 = 1002
        static let querySrc: UInt32 = 1004
        static let getSrcDesc: UInt32 = 1005
        static let srcAdded: UInt32 = 10001
        static let srcRemoved: UInt32 = 10002
        static let srcDesc: UInt32 = 10003
        static let srcCounts: UInt32 = 10004
    }

    enum Provider {
        static let tcpKernel: UInt32 = 2
        static let tcpUserland: UInt32 = 3
        static let udpKernel: UInt32 = 4
        static let udpUserland: UInt32 = 5
    }

    static let srcRefAll: UInt64 = 0xffff_ffff_ffff_ffff

    struct Header {
        var context: UInt64 = 0
        var type: UInt32 = 0
        var length: UInt16 = 0
        var flags: UInt16 = 0
    }

    struct AddAllSources {
        var hdr = Header()
        var filter: UInt64 = 0
        var events: UInt64 = 0
        var provider: UInt32 = 0
        var targetPid: Int32 = 0
        var targetUUID = (UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0),
                          UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt8(0))
    }

    struct SrcAdded {
        var hdr = Header()
        var srcref: UInt64 = 0
        var provider: UInt32 = 0
        var reserved: UInt32 = 0
    }

    struct SrcRefRequest {
        var hdr = Header()
        var srcref: UInt64 = 0
    }

    struct SrcDescriptionHeader {
        var hdr = Header()
        var srcref: UInt64 = 0
        var eventFlags: UInt64 = 0
        var provider: UInt32 = 0
        var reserved: UInt32 = 0
    }

    struct Counts {
        var rxpackets: UInt64 = 0
        var rxbytes: UInt64 = 0
        var txpackets: UInt64 = 0
        var txbytes: UInt64 = 0
        var cellRxbytes: UInt64 = 0
        var cellTxbytes: UInt64 = 0
        var wifiRxbytes: UInt64 = 0
        var wifiTxbytes: UInt64 = 0
        var wiredRxbytes: UInt64 = 0
        var wiredTxbytes: UInt64 = 0
        var rxduplicatebytes: UInt32 = 0
        var rxoutoforderbytes: UInt32 = 0
        var txretransmit: UInt32 = 0
        var connectattempts: UInt32 = 0
        var connectsuccesses: UInt32 = 0
        var minRtt: UInt32 = 0
        var avgRtt: UInt32 = 0
        var varRtt: UInt32 = 0
    }

    struct SrcCounts {
        var hdr = Header()
        var srcref: UInt64 = 0
        var eventFlags: UInt64 = 0
        var counts = Counts()
    }
}

// MARK: - Binary helpers

private func bytesOf<T>(_ value: T) -> [UInt8] {
    withUnsafeBytes(of: value) { Array($0) }
}

private func read<T>(_ data: Data, at offset: Int) -> T {
    data.withUnsafeBytes { raw in
        raw.loadUnaligned(fromByteOffset: offset, as: T.self)
    }
}

private extension Data {
    func readUInt32(at offset: Int) -> UInt32 {
        withUnsafeBytes { raw in
            raw.loadUnaligned(fromByteOffset: offset, as: UInt32.self)
        }
    }
}

private func cString(from buffer: [CChar]) -> String {
    buffer.withUnsafeBufferPointer { ptr in
        guard let base = ptr.baseAddress else { return "" }
        return String(cString: base)
    }
}
