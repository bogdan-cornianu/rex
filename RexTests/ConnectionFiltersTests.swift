import XCTest
@testable import Rex

final class ConnectionFiltersTests: XCTestCase {
    private func sample(
        name: String = "Chrome",
        pid: Int32 = 100,
        proto: Proto = .tcp,
        local: String = "127.0.0.1",
        localPort: UInt16 = 54321,
        remote: String = "1.2.3.4",
        remotePort: UInt16 = 443,
        state: String = "ESTABLISHED"
    ) -> Connection {
        Connection(
            id: Connection.makeID(
                pid: pid,
                proto: proto,
                localAddress: local,
                localPort: localPort,
                remoteAddress: remote,
                remotePort: remotePort
            ),
            pid: pid,
            processName: name,
            processPath: "/Applications/\(name).app/Contents/MacOS/\(name)",
            proto: proto,
            localAddress: local,
            localPort: localPort,
            remoteAddress: remote,
            remotePort: remotePort,
            state: state,
            family: .ipv4
        )
    }

    func testFilterBySearchMatchesProcessName() {
        let filters = ConnectionFilters(searchText: "chrome")
        let rows = [sample(name: "Chrome"), sample(name: "Cursor")]
        XCTAssertEqual(filters.filtered(rows).map(\.processName), ["Chrome"])
    }

    func testFilterBySearchMatchesRemoteAddress() {
        let filters = ConnectionFilters(searchText: "9.9.9.9")
        let rows = [
            sample(remote: "1.2.3.4"),
            sample(pid: 101, remote: "9.9.9.9"),
        ]
        XCTAssertEqual(filters.filtered(rows).count, 1)
        XCTAssertEqual(filters.filtered(rows).first?.remoteAddress, "9.9.9.9")
    }

    func testFilterTCPOnly() {
        let filters = ConnectionFilters(protoFilter: .tcp)
        let rows = [
            sample(proto: .tcp),
            sample(pid: 101, proto: .udp, remote: "", remotePort: 0, state: ""),
            sample(pid: 102, proto: .tcp6, local: "::1", remote: "2001:db8::1"),
        ]
        let filtered = filters.filtered(rows)
        XCTAssertEqual(filtered.count, 2)
        XCTAssertTrue(filtered.allSatisfy(\.proto.isTCP))
    }

    func testListeningOnlyKeepsEmptyRemote() {
        let filters = ConnectionFilters(listeningOnly: true)
        let rows = [
            sample(state: "ESTABLISHED"),
            sample(pid: 101, remote: "", remotePort: 0, state: "LISTEN"),
            sample(pid: 102, proto: .udp, remote: "", remotePort: 0, state: ""),
        ]
        let filtered = filters.filtered(rows)
        XCTAssertEqual(filtered.map(\.pid), [101, 102])
    }
}

final class ConnectionIDTests: XCTestCase {
    func testMakeIDStableAndDistinct() {
        let a = Connection.makeID(
            pid: 1,
            proto: .tcp,
            localAddress: "127.0.0.1",
            localPort: 80,
            remoteAddress: "1.1.1.1",
            remotePort: 443
        )
        let b = Connection.makeID(
            pid: 1,
            proto: .tcp,
            localAddress: "127.0.0.1",
            localPort: 80,
            remoteAddress: "1.1.1.1",
            remotePort: 443
        )
        let c = Connection.makeID(
            pid: 2,
            proto: .tcp,
            localAddress: "127.0.0.1",
            localPort: 80,
            remoteAddress: "1.1.1.1",
            remotePort: 443
        )
        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
    }
}
