/* ============================================================
   main.js — bootstrap
   Waits for the DOM, creates the Game, and wires a couple of
   convenience behaviours (prevent scroll/zoom gestures on mobile,
   first-gesture audio unlock).
   ============================================================ */
(function () {
  "use strict";

  function boot() {
    const canvas = document.getElementById("game-canvas");
    const game = new Game(canvas);
    window.__circus = game; // handy for debugging in the console

    // Unlock the AudioContext on the very first user interaction
    // (browsers require a gesture before audio can play).
    const unlock = () => {
      game.audio.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    // Stop iOS/Android from scrolling or pinch-zooming the page while
    // playing. Touches on the controls themselves are handled there.
    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
