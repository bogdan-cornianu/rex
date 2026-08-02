import SwiftUI

struct KillConfirmSheet: View {
    let target: KillTarget
    let killer: ProcessKiller
    let onFinished: () -> Void
    let onError: (String) -> Void

    @State private var statusMessage = "Terminate sends SIGTERM. Force Quit sends SIGKILL."
    @State private var didAttemptTerminate = false
    @State private var stillAliveAfterTerminate = false
    @State private var isWorking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Kill Process")
                .font(.title2.bold())

            LabeledContent("Process", value: target.processName)
            LabeledContent("PID", value: String(target.pid))
            LabeledContent("Listed connections", value: String(target.connectionCount))

            Text(statusMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Button("Cancel") {
                    onFinished()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                if didAttemptTerminate && stillAliveAfterTerminate {
                    Button("Force Quit", role: .destructive) {
                        Task { await forceQuit() }
                    }
                    .disabled(isWorking)
                }

                Button("Terminate", role: .destructive) {
                    Task { await terminate() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(isWorking)
            }
        }
        .padding(24)
        .frame(width: 420)
    }

    private func terminate() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try killer.terminate(pid: target.pid)
            didAttemptTerminate = true
            statusMessage = "Sent SIGTERM. Checking whether the process exited…"
            try? await Task.sleep(for: .seconds(2))
            stillAliveAfterTerminate = killer.isAlive(pid: target.pid)
            if stillAliveAfterTerminate {
                statusMessage = "Process still running. Use Force Quit to send SIGKILL."
            } else {
                statusMessage = "Process exited."
                try? await Task.sleep(for: .milliseconds(400))
                onFinished()
            }
        } catch let error as KillError {
            onError(error.localizedDescription ?? "Kill failed")
            onFinished()
        } catch {
            onError(error.localizedDescription)
            onFinished()
        }
    }

    private func forceQuit() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try killer.forceQuit(pid: target.pid)
            statusMessage = "Sent SIGKILL."
            try? await Task.sleep(for: .milliseconds(400))
            onFinished()
        } catch let error as KillError {
            onError(error.localizedDescription ?? "Force quit failed")
            onFinished()
        } catch {
            onError(error.localizedDescription)
            onFinished()
        }
    }
}
