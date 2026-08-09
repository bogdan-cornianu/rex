import XCTest
@testable import Rex

final class RelativeUpdatedTests: XCTestCase {
    func testJustNow() {
        let now = Date()
        XCTAssertEqual(relativeUpdated(lastUpdatedAt: now, now: now), "just now")
        XCTAssertEqual(relativeUpdated(lastUpdatedAt: now.addingTimeInterval(-1), now: now), "just now")
    }

    func testSecondsAgo() {
        let now = Date()
        XCTAssertEqual(relativeUpdated(lastUpdatedAt: now.addingTimeInterval(-5), now: now), "5s ago")
        XCTAssertEqual(relativeUpdated(lastUpdatedAt: now.addingTimeInterval(-59), now: now), "59s ago")
    }

    func testNilShowsDash() {
        XCTAssertEqual(relativeUpdated(lastUpdatedAt: nil, now: Date()), "—")
    }
}
