# Bounce — Cross-Platform Testing Checklist

Serve the app over HTTP first (`python3 -m http.server 8000`). For PWA install
and offline tests, use HTTPS or `localhost` (service workers require a secure
context).

Mark each item as you verify it.

## Desktop — Keyboard Controls
- [ ] `←` / `A` moves the ball left.
- [ ] `→` / `D` moves the ball right.
- [ ] `↑` / `W` / `Space` makes the ball jump higher (held on landing).
- [ ] `P` pauses and resumes.
- [ ] `R` restarts the current level.
- [ ] Arrow keys / Space do **not** scroll the page.
- [ ] Works in **Chrome**, **Edge**, **Firefox**, **Safari**.

## Desktop — Resolution & Performance
- [ ] Plays correctly at 1280×720.
- [ ] Plays correctly at 1920×1080.
- [ ] Plays correctly at a 4K (3840×2160) resolution.
- [ ] Holds ~60 FPS on modern hardware (check DevTools → Rendering → FPS meter).
- [ ] No layout distortion when the window is resized mid-game.

## Mobile — Touch Controls
- [ ] On-screen ◄ / ► / ▲ / ❚❚ buttons appear on touch devices.
- [ ] Left / Right buttons move the ball.
- [ ] Jump button jumps.
- [ ] Pause button (top-right) pauses.
- [ ] Touch targets are large and comfortable for thumbs.
- [ ] **Multi-touch**: holding a direction *and* tapping jump works together.
- [ ] Page does **not** scroll or rubber-band while playing.
- [ ] Pinch-zoom and double-tap-zoom are disabled over the play area.
- [ ] Works in **Chrome on Android**, **Safari on iPhone/iPad**,
      **Samsung Internet**, **Edge mobile**.

## Responsive Design
- [ ] **Portrait** orientation: gameplay is visible and playable.
- [ ] **Landscape** orientation: gameplay is visible and playable.
- [ ] Rotating the device re-lays-out correctly.
- [ ] UI / HUD / buttons scale sensibly on a small phone.
- [ ] UI / HUD scale sensibly on a tablet and on a large monitor.
- [ ] Notch / safe-area insets are respected (buttons not under the notch).

## Window Resizing
- [ ] Dragging the browser window to any size keeps the game centred and
      undistorted.
- [ ] The canvas stays crisp on high-DPI / Retina displays.

## PWA
- [ ] An install prompt / "Add to Home Screen" is offered (Chrome/Edge/Android).
- [ ] Installs on Android with the correct icon and name.
- [ ] "Add to Home Screen" works on iOS Safari with the app icon.
- [ ] Launches in **standalone full-screen** mode (no browser chrome).
- [ ] After first load, the game **works offline** (toggle airplane mode / go
      offline in DevTools and reload).
- [ ] Splash screen / theme color show on launch.

## Save / Load Across Sessions
- [ ] Clearing a level unlocks the next one.
- [ ] Level-select shows cleared levels and locks future ones.
- [ ] Best times persist after a full page reload.
- [ ] Best times persist after closing and reopening the browser/app.
- [ ] Sound on/off setting persists across sessions.

## Tab / Focus Behaviour
- [ ] Switching to another tab auto-pauses the game.
- [ ] Returning to the tab does not cause a physics "jump" (no dt spike).

## Input Abstraction
- [ ] A connected **gamepad** can move, jump, pause and restart (bonus).
- [ ] Mouse-clicking the on-screen buttons works on desktop touch-emulation.

---

### Quick automated sanity check (logic only, no browser)

```bash
node /tmp/test.mjs   # see the harness in the PR description / commit
```

This parses every level and simulates the ball to confirm the physics is
finite, in-bounds and bounces — useful as a fast regression gate, though the
real cross-platform checks above must be done in actual browsers.
