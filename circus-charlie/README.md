# 🎪 Circus Charlie — Browser Remake

A polished, modern browser remake of the classic 1984 arcade game **Circus
Charlie**, built with **only** HTML5, CSS3, vanilla JavaScript and the HTML5
Canvas — no frameworks, no build step, no external assets. All graphics are
drawn procedurally and all audio is synthesised at runtime with the Web Audio
API.

Just open `index.html` in any modern desktop or mobile browser and play.

```
circus/
├── index.html        # game shell + script load order
├── styles.css        # responsive arcade-cabinet styling
└── js/
    ├── utils.js      # math + drawing helpers
    ├── audio.js      # AudioManager — synth SFX & procedural circus music
    ├── input.js      # InputManager — keyboard + on-screen touch controls
    ├── particles.js  # ParticleSystem — fire, sparkles, dust, confetti
    ├── camera.js     # Camera — smooth scrolling + screen shake
    ├── player.js     # Player (Charlie) — physics & animation
    ├── sprites.js    # Sprites — procedural drawing for every prop & mount
    ├── ui.js         # UI — HUD and all menus/overlays
    ├── stages.js     # Stage classes (the six circus acts)
    ├── game.js       # Game controller — state machine + main loop
    └── main.js       # bootstrap
```

## ▶️ How to play

Get Charlie through six circus acts without running out of lives. Each stage
ends at a goal; clearing one awards bonus points (and a bonus life).

### Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move left | `←` / `A` | ◀ button |
| Move right | `→` / `D` | ▶ button |
| Jump | `Space` / `W` / `↑` | JUMP button |
| Start / Confirm | `Enter` / `Space` | Tap screen |
| Pause | `P` | II button |

In menus, use the arrow keys (or the ◀ ▶ touch buttons) to move the selection
and `Space`/`Enter`/JUMP/tap to confirm.

## 🎬 The six stages

1. **Lion Ride** – Auto-running lion; jump *through* flaming hoops. Consecutive
   clears build a score **combo**.
2. **Tightrope Walk** – Inch across the rope; **jump over** monkeys but **stay
   grounded** under the swooping birds, all while keeping your **balance** meter
   from filling.
3. **Trampoline** – Bounce automatically; steer in the air to land on the next
   trampoline, collect balloons and avoid the spike pits.
4. **Horse Riding** – A faster auto-run; leap over barriers and pits.
5. **Flying Trapeze** – Time your release from each swinging bar to catch the
   next one, then land safely on the platform.
6. **Final Circus Challenge** – A long, fast survival run mixing hoops,
   barriers, pits, monkeys and swinging trapezes.

## ✨ Features

- **Six distinct stages** with their own mechanics, art and difficulty.
- **Progressive difficulty** — speed, obstacle density and timing tighten as you
  advance (the jump arc stays constant so timing is always learnable).
- **Lives, score, combos and checkpoints** — respawn where you fell.
- **Procedural retro audio** — synthesised jump/coin/hoop/damage/etc. sound
  effects plus a looping chiptune circus tune, with a mute toggle.
- **Full menu suite** — main menu, controls, high scores, pause menu, game-over
  and animated stage-complete tally screens.
- **High scores** persisted to `localStorage`.
- **Polish** — particle effects, fire animation, screen shake, smooth camera,
  parallax background (tents, audience, spotlights), combo popups and stage
  transition cards.
- **Responsive** — scales to any screen and shows large on-screen controls on
  touch devices.

## 🧱 Extending the game

Stages implement a small common interface (`init` / `update` / `render` /
`respawn`, plus `complete` and `progress`). The auto-running acts (Lion, Horse,
Final) are all instances of a single configurable `AutoRunStage`, so adding a
new running act is just another config. Add a stage class (or factory) to the
array returned by `Stages.build()` in `js/stages.js` and it slots straight into
the progression, HUD and menus.

No dependencies, no tooling — it's all in the folder.
