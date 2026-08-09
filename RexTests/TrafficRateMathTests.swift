import XCTest
@testable import Rex

final class TrafficRateMathTests: XCTestCase {
    func testFirstSampleReturnsNil() {
        let rate = TrafficRateMath.rateBytesPerSecond(
            previousBytes: nil,
            previousTime: nil,
            currentBytes: 1_000,
            currentTime: Date()
        )
        XCTAssertNil(rate)
    }

    func testDeltaOverOneSecond() {
        let t0 = Date(timeIntervalSince1970: 1_000)
        let t1 = Date(timeIntervalSince1970: 1_001)
        let rate = TrafficRateMath.rateBytesPerSecond(
            previousBytes: 100,
            previousTime: t0,
            currentBytes: 100 + 2_500_000,
            currentTime: t1
        )
        XCTAssertEqual(rate ?? -1, 2_500_000, accuracy: 0.001)
    }

    func testNegativeDeltaClampedToZero() {
        let t0 = Date(timeIntervalSince1970: 1_000)
        let t1 = Date(timeIntervalSince1970: 1_002)
        let rate = TrafficRateMath.rateBytesPerSecond(
            previousBytes: 5_000,
            previousTime: t0,
            currentBytes: 1_000,
            currentTime: t1
        )
        XCTAssertEqual(rate ?? -1, 0, accuracy: 0.001)
    }

    func testFormatNilIsDash() {
        XCTAssertEqual(formatRateMBPS(nil), "—")
    }

    func testFormatMegabytesPerSecond() {
        XCTAssertEqual(formatRateMBPS(1_250_000), "1.25")
        XCTAssertEqual(formatRateMBPS(0), "0.00")
    }

    func testFlowKeyMatchesConnectionMakeID() {
        let key = Connection.makeID(
            pid: 42,
            proto: .tcp,
            localAddress: "192.168.1.2",
            localPort: 5555,
            remoteAddress: "1.2.3.4",
            remotePort: 443
        )
        XCTAssertEqual(key, "42|tcp|192.168.1.2|5555|1.2.3.4|443")
    }
}
