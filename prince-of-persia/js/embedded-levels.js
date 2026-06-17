/*
 * embedded-levels.js — Level data embedded as a JS global so the game runs
 * directly from file:// (where fetch() of local JSON is blocked). The
 * levels/*.json files contain identical data for the "load from JSON" path.
 *
 * Tile legend: '#'=floor/wall  '='=ledge(grab)  '^'=spikes  'L'=loose floor
 *   'G'=gate  'P'=pressure plate  'T'=torch  '+'=potion  ':'=secret wall
 *   'E'=exit  'S'=spawn  '.'=air  (empty below the map = deadly pit)
 */
(function (global) {
  'use strict';

  var LEVEL1 = {
    id: 'level1',
    name: 'The Dungeons',
    timeLimit: 90,
    tiles: [
      '##############################',
      '#............................#',
      '#...T.......T.......T.....T..#',
      '#............................#',
      '#....===........===..........#',
      '#S..........................E#',
      '#######LL##..##^^#####..######',
      '#######..##..#########..######',
    ],
    spawn: { x: 1, y: 5 },
    entities: [
      { type: 'guard', x: 24, y: 5, hp: 3, patrol: [20, 28] },
    ],
    potions: [
      { x: 17, y: 5, effect: 'heal' },
    ],
    objects: [],
    secrets: [],
  };

  var LEVEL2 = {
    id: 'level2',
    name: 'The Palace Halls',
    timeLimit: 120,
    tiles: [
      '########################################',
      '#......................................#',
      '#....T.........T.........T.........T...#',
      '#......................................#',
      '#.....===.....................===......#',
      '#S....................................E#',
      '####P####G####^^####......####LL########',
      '####################......####..########',
    ],
    spawn: { x: 1, y: 5 },
    entities: [
      { type: 'guard', x: 12, y: 5, hp: 3, patrol: [10, 18] },
      { type: 'guard', x: 33, y: 5, hp: 4, patrol: [30, 38] },
    ],
    potions: [
      { x: 7, y: 3, effect: 'heal' },
      { x: 27, y: 5, effect: 'maxhp' },
    ],
    objects: [
      { type: 'gate', id: 'g1', x: 9, y: 6, state: 'closed' },
      { type: 'plate', x: 4, y: 6, targets: ['g1'], mode: 'latch' },
      { type: 'mover', x: 20, y: 6, speed: 2, path: [[20, 6], [25, 6]] },
    ],
    secrets: [],
  };

  var LEVEL3 = {
    id: 'level3',
    name: 'The Tower of Jaffar',
    timeLimit: 150,
    tiles: [
      '##############################',
      '#............................#',
      '#....T........T........T.....#',
      '#........:...................#',
      '#.......===.........===......#',
      '#S..........................E#',
      '###P##LL..###^^G###..###^^####',
      '########..#########..#########',
    ],
    spawn: { x: 1, y: 5 },
    entities: [
      { type: 'guard', x: 12, y: 5, hp: 4, patrol: [10, 13] },
      { type: 'boss', x: 26, y: 5, hp: 8 },
    ],
    potions: [
      { x: 9, y: 3, effect: 'maxhp' },
      { x: 21, y: 5, effect: 'heal' },
    ],
    objects: [
      { type: 'gate', id: 'g1', x: 15, y: 6, state: 'closed' },
      { type: 'plate', x: 3, y: 6, targets: ['g1'], mode: 'latch' },
    ],
    secrets: [
      { x: 9, y: 3, reveals: 'potion' },
    ],
  };

  global.EMBEDDED_LEVELS = {
    level1: LEVEL1,
    level2: LEVEL2,
    level3: LEVEL3,
  };
})(window);
