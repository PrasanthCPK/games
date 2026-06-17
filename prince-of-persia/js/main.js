/*
 * main.js — Bootstrap. Creates the Game once the DOM is ready and starts the
 * loop. Must be the last script loaded.
 */
(function (global) {
  'use strict';
  function boot() {
    var canvas = document.getElementById('game');
    var game = new global.Game(canvas);
    global.GAME = game; // handy for debugging in the console
    game.boot().then(function () { game.start(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
