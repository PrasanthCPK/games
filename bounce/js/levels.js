/* ============================================================
   Level data.
   ------------------------------------------------------------
   Levels are authored as ASCII tile maps for readability. Legend:

     #  solid block (earth / wall)
     =  platform brick (solid, decorated top)
     ^  spike (hazard — touching it costs a life)
     o  ring (collect them all to open the goal)
     S  start / spawn point
     G  goal hoop (reach it once all rings are collected)
     ~  water (buoyant — the ball floats up slowly, classic Bounce)
     *  checkpoint (updates respawn point)
     (space) empty air

   World tile size is defined by TILE. The renderer recreates all
   art programmatically on the canvas — no external image assets.
   ============================================================ */

export const TILE = 36;

export const Tile = Object.freeze({
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2,
  SPIKE: 3,
  RING: 4,
  START: 5,
  GOAL: 6,
  WATER: 7,
  CHECKPOINT: 8,
});

export const CHAR_TO_TILE = {
  ' ': Tile.EMPTY,
  '#': Tile.SOLID,
  '=': Tile.PLATFORM,
  '^': Tile.SPIKE,
  'o': Tile.RING,
  'S': Tile.START,
  'G': Tile.GOAL,
  '~': Tile.WATER,
  '*': Tile.CHECKPOINT,
};

/** True for tiles the ball cannot pass through. */
export const SOLID_TILES = new Set([Tile.SOLID, Tile.PLATFORM]);

const LEVELS = [
  {
    name: 'First Steps',
    rows: [
      '                                          ',
      '                                          ',
      '                  o o o                   ',
      '                ==========                ',
      '                                          ',
      '        o                          o      ',
      '     =======                    =======   ',
      '                                          ',
      '   o                                   G  ',
      '  ===          o     o                 =  ',
      '            =======================       ',
      '  S                                       ',
      '#####       ^^^        ^^^         ########',
      '#####################################  ###',
      '##########################################',
      '##########################################',
    ],
  },
  {
    name: 'Over the Gap',
    rows: [
      '                                              ',
      '         o o                       o o        ',
      '       =======                   =======      ',
      '                    o o                       ',
      '                  =======                     ',
      '   o                                      o   ',
      '  ===                                    ===  ',
      '          o                  o                ',
      '   S    =====      o       =====        G     ',
      '######         ========              ===  === ',
      '######  ^^^^^             ^^^^^^             ##',
      '######~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~##',
      '######~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~##',
      '##############################################',
    ],
  },
  {
    name: 'Spike Alley',
    rows: [
      '                                                  ',
      '                       o                          ',
      '                    =======                       ',
      '       o o                          o o           ',
      '     =======                      =======         ',
      '                  o      *     o                  ',
      '            o   ===== === ===   o            G    ',
      '   S      =====               =====        ====   ',
      '  ====                                            ',
      '########   ^^^ ^^^ ^^^ ^^^ ^^^ ^^^ ^^^   #########',
      '#################################################',
      '#################################################',
    ],
  },
  {
    name: 'The Climb',
    rows: [
      '                                      o o   G ',
      '                                    ========= ',
      '                              o o             ',
      '                            =======           ',
      '                      o o                     ',
      '                    =======                   ',
      '              o o            *                ',
      '            =======      =======              ',
      '      o o                                     ',
      '    =======                                   ',
      '  S            ^^^^^^^^^^^^^^                  ',
      '====        ===============                   ',
      '####                          ^^^^^^          ',
      '####~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '##############################################',
    ],
  },
  {
    name: 'Grand Finale',
    rows: [
      '                                                        ',
      '      o o o                                  o o o      ',
      '    ===========              *             ===========  ',
      '                          =======                       ',
      '            o o o                       o o o           ',
      '          =========                   =========         ',
      '                       o   o   o                        ',
      '    o          ^^^   =====================       o      ',
      '  =====      =======                   ====     =====   ',
      '   S                  ^^^^^^^^^^^^^               G     ',
      '====      ====================================        ==',
      '####  ^^^                            ^^^      ^^^   ^^ ##',
      '####~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~##',
      '####~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~##',
      '#######################################################',
    ],
  },
];

/**
 * Parse a level definition into a grid plus extracted metadata.
 * Returns { name, cols, rows, grid (Tile[][]), start, goal, rings[] }.
 */
export function parseLevel(def) {
  const cols = Math.max(...def.rows.map((r) => r.length));
  const rows = def.rows.length;
  const grid = [];
  let start = { x: 1, y: 1 };
  let goal = null;
  const rings = [];

  for (let y = 0; y < rows; y++) {
    const line = def.rows[y];
    const row = [];
    for (let x = 0; x < cols; x++) {
      const ch = line[x] ?? ' ';
      let tile = CHAR_TO_TILE[ch] ?? Tile.EMPTY;

      if (tile === Tile.START) {
        start = { x, y };
        tile = Tile.EMPTY; // spawn marker is not a physical tile
      } else if (tile === Tile.GOAL) {
        goal = { x, y };
        // keep GOAL tile so the renderer/collision can find it
      } else if (tile === Tile.RING) {
        rings.push({ x, y });
        tile = Tile.EMPTY; // rings tracked as entities, not grid collision
      }
      row.push(tile);
    }
    grid.push(row);
  }

  if (!goal) goal = { x: cols - 2, y: 1 };

  return { name: def.name, cols, rows, grid, start, goal, rings };
}

export const LEVEL_COUNT = LEVELS.length;
export { LEVELS };
