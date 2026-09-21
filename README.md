# Kilnheart

A clay-toy isometric action RPG that runs in the browser, plain ES modules on Three.js.

**Play it live:** https://kilnheart.bles-software.com/

![Kilnheart](docs/cover.jpg)

You are a little clay hero. The Kiln is firing your world hard and hollow. Take the mallet, dash, burst and smash the husks back into soft clay.

## Controls

A desktop game at heart. Phones and tablets get their own scheme.

| | Desktop | Touch |
|---|---|---|
| Move | W runs to the cursor, S backs away, A / D strafe around it (arrow keys too) | Floating stick: touch anywhere on the left half |
| Aim | The hero faces the cursor, a ring on the ground shows where W leads | Aim assist: HIT strikes the nearest husk in reach |
| Mallet / dash / burst | Click, Space, E | HIT, DASH, BURST |
| Pause | P or Esc | II |

`node controls.check.mjs` checks the movement math.

## Run it

No build step. Serve the folder with any static server:

```bash
npx serve .
```

## Make it yours

MIT licensed. Fork it, reskin it, ship it, sell it. More open game worlds: https://worlds.bles-software.com/

Built by [Bles Software](https://bles-software.com).
