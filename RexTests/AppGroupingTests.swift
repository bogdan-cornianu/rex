import XCTest
@testable import Rex

final class AppGroupingTests: XCTestCase {
    private func connection(
        name: String,
        path: String?,
        pid: Int32,
        localPort: UInt16,
        download: Double? = nil,
        upload: Double? = nil
    ) -> Connection {
        Connection(
            id: Connection.makeID(
                pid: pid,
                proto: .tcp,
                localAddress: "127.0.0.1",
                localPort: localPort,
                remoteAddress: "1.2.3.4",
                remotePort: 443
            ),
            pid: pid,
            processName: name,
            processPath: path,
            proto: .tcp,
            localAddress: "127.0.0.1",
            localPort: localPort,
            remoteAddress: "1.2.3.4",
            remotePort: 443,
            state: "ESTABLISHED",
            family: .ipv4,
            downloadBytesPerSecond: download,
            uploadBytesPerSecond: upload
        )
    }

    func testBundlePathKeyAndDisplayName() {
        let path = "/Applications/Firefox.app/Contents/MacOS/firefox"
        let key = AppGrouping.groupKey(processName: "firefox", processPath: path)
        let name = AppGrouping.displayName(processName: "firefox", processPath: path)
        XCTAssertEqual(key, "/Applications/Firefox.app")
        XCTAssertEqual(name, "Firefox")
    }

    func testNameFallbackWhenNoAppBundle() {
        let key = AppGrouping.groupKey(processName: "ssh", processPath: "/usr/bin/ssh")
        let name = AppGrouping.displayName(processName: "ssh", processPath: "/usr/bin/ssh")
        XCTAssertEqual(key, "name:ssh")
        XCTAssertEqual(name, "ssh")
    }

    func testNameFallbackWhenPathNil() {
        XCTAssertEqual(AppGrouping.groupKey(processName: "node", processPath: nil), "name:node")
        XCTAssertEqual(AppGrouping.displayName(processName: "node", processPath: nil), "node")
    }

    func testBuildGroupsAggregatesAndSorts() {
        let rows = [
            connection(
                name: "chrome",
                path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                pid: 10,
                localPort: 1,
                download: 1_000_000,
                upload: nil
            ),
            connection(
                name: "ssh",
                path: "/usr/bin/ssh",
                pid: 20,
                localPort: 2,
                download: 500_000,
                upload: 100_000
            ),
            connection(
                name: "chrome",
                path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                pid: 11,
                localPort: 3,
                download: nil,
                upload: 250_000
            ),
            connection(
                name: "aaa",
                path: nil,
                pid: 30,
                localPort: 4
            ),
        ]

        let groups = AppGrouping.buildGroups(from: rows)
        XCTAssertEqual(groups.map(\.displayName), ["aaa", "Google Chrome", "ssh"])

        let chrome = groups.first { $0.displayName == "Google Chrome" }
        XCTAssertNotNil(chrome)
        XCTAssertEqual(chrome?.id, "/Applications/Google Chrome.app")
        XCTAssertEqual(chrome?.connectionCount, 2)
        XCTAssertEqual(chrome?.downloadBytesPerSecond ?? -1, 1_000_000, accuracy: 0.001)
        XCTAssertEqual(chrome?.uploadBytesPerSecond ?? -1, 250_000, accuracy: 0.001)
        XCTAssertEqual(chrome?.connections.map(\.pid), [10, 11])

        let ssh = groups.first { $0.displayName == "ssh" }
        XCTAssertEqual(ssh?.id, "name:ssh")
        XCTAssertEqual(ssh?.connectionCount, 1)
        XCTAssertEqual(ssh?.downloadBytesPerSecond ?? -1, 500_000, accuracy: 0.001)
        XCTAssertEqual(ssh?.uploadBytesPerSecond ?? -1, 100_000, accuracy: 0.001)
    }

    func testBuildGroupsPreservesChildOrderFromInput() {
        let rows = [
            connection(name: "ssh", path: "/usr/bin/ssh", pid: 1, localPort: 10),
            connection(name: "ssh", path: "/usr/bin/ssh", pid: 2, localPort: 11),
            connection(name: "ssh", path: "/usr/bin/ssh", pid: 3, localPort: 12),
        ]
        let groups = AppGrouping.buildGroups(from: rows)
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].connections.map(\.pid), [1, 2, 3])
    }
}
