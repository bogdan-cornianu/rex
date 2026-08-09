import Darwin
import Foundation

enum KillError: Error, LocalizedError, Equatable, Sendable {
    case permissionDenied
    case notFound
    case failed(errno: Int32)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Permission denied — can’t kill this process"
        case .notFound:
            return "Process is no longer running"
        case .failed(let errno):
            return "Kill failed (errno \(errno))"
        }
    }
}

struct ProcessKiller: Sendable {
    func terminate(pid: Int32) throws {
        try send(signal: SIGTERM, to: pid)
    }

    func forceQuit(pid: Int32) throws {
        try send(signal: SIGKILL, to: pid)
    }

    func isAlive(pid: Int32) -> Bool {
        if kill(pid, 0) == 0 {
            return true
        }
        return errno != ESRCH
    }

    private func send(signal: Int32, to pid: Int32) throws {
        if kill(pid, signal) == 0 {
            return
        }
        switch errno {
        case EPERM:
            throw KillError.permissionDenied
        case ESRCH:
            throw KillError.notFound
        default:
            throw KillError.failed(errno: errno)
        }
    }
}
