import XCTest
@testable import ShowConnections

final class ConnectionPollerSmokeTests: XCTestCase {
    func testSnapshotSucceeds() {
        let result = ConnectionPoller().snapshot()
        switch result {
        case .success(let connections):
            XCTAssertGreaterThanOrEqual(connections.count, 0)
            for connection in connections.prefix(20) {
                XCTAssertFalse(connection.id.isEmpty)
                XCTAssertFalse(connection.processName.isEmpty)
                XCTAssertGreaterThan(connection.pid, 0)
            }
        case .failure(let error):
            XCTFail("snapshot failed: \(error)")
        }
    }
}
