# Manual Smoke Checklist — Rex

Run the app from Xcode (`Rex` scheme) or:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -scheme Rex -project Rex.xcodeproj -destination 'platform=macOS' build
open ~/Library/Developer/Xcode/DerivedData/*/Build/Products/Debug/Rex.app
```

## Checks

- [ ] App window opens; table populates within ~1–2 seconds
- [ ] Open a browser to any site → at least one **ESTABLISHED** TCP row for that browser process
- [ ] Search by process name filters the table
- [ ] Proto segmented control (All / TCP / UDP) changes visible rows
- [ ] **Listening only** shows LISTEN / unbound-remote rows
- [ ] Select a disposable process you own (e.g. a `sleep 999` Terminal process with a connection, or quit via a test helper) → **Kill Process…** → Terminate → row gone on next poll
- [ ] Attempt Kill on a SIP-protected process (e.g. find a system daemon you do not own) → permission-denied alert; app stays up
- [ ] With many rows, typing in search stays responsive

## Unit tests

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild test -scheme Rex -project Rex.xcodeproj -destination 'platform=macOS'
```
