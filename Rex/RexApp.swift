import SwiftUI

@main
struct RexApp: App {
    @State private var store = ConnectionStore()

    var body: some Scene {
        WindowGroup("Rex") {
            ContentView(store: store)
                .frame(minWidth: 900, minHeight: 520)
        }
        .defaultSize(width: 1100, height: 640)
    }
}
