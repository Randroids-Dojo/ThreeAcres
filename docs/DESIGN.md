# Three Acres: design

Three separate farming games under one roof, to find out which kind of farming game is the most fun. Each one is its own world with its own rules, controls, look, music and save. The player can switch between them at any time from the shell's corner button (or the ` key), and each game picks up exactly where it was left.

| Game | Kind | Doc |
| --- | --- | --- |
| Thistledown | First-person creature ranch: catch, pen and feed downies, sell their down, open up the valley | `docs/RANCH.md` |
| Sunup | Third-person homestead life sim: real-time days, watering and harvesting, seasons, town requests, tool upgrades | `docs/SUNUP.md` |
| Seedbound | Roguelike deckbuilder: seed, tool and weather cards on a four by four plot, scoring cascades, seasonal quotas | `docs/DECK.md` |

An earlier version made the three games presets over one set of shared switches on one farm. They felt too similar, so each game now stands alone. The lesson: different verbs, camera, session shape and look matter more than rule tweaks.

## The shell

- The title is also the switcher: three cards, each with its save summary. Settings (volume, music, sounds, graphics, reduced motion) are shared.
- Games started in a session stay alive, paused, so switching back is instant. Each game saves through its own slot.
- The shell tracks the input device (touch, mouse, keyboard, pad) for every game and sets `data-device` on `#app`.
- Touch controls follow the same conventions in every game: a floating left thumbstick that follows a drifting thumb, buttons that track their own pointer, short haptic buzzes, and controls shown only while the last input was touch.
