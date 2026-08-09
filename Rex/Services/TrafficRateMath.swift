import Foundation

struct FlowRate: Hashable, Sendable {
    var downloadBytesPerSecond: Double
    var uploadBytesPerSecond: Double
}

enum TrafficRateMath {
    /// Returns nil on the first sample (no prior baseline).
    static func rateBytesPerSecond(
        previousBytes: UInt64?,
        previousTime: Date?,
        currentBytes: UInt64,
        currentTime: Date
    ) -> Double? {
        guard let previousBytes, let previousTime else { return nil }
        let dt = currentTime.timeIntervalSince(previousTime)
        guard dt > 0 else { return nil }
        let delta = currentBytes >= previousBytes ? currentBytes - previousBytes : 0
        return Double(delta) / dt
    }
}

func formatRateMBPS(_ bytesPerSecond: Double?) -> String {
    guard let bytesPerSecond else { return "—" }
    let mbps = bytesPerSecond / 1_000_000.0
    return String(format: "%.2f", mbps)
}
