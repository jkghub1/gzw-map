# GZW Lamang Map Viewer (patch 0.5)

An unofficial, fan-made zoomable map of Lamang for **Gray Zone Warfare** patch 0.5 "Rogue Ops", with campsites, building material crates, buried caches, landing zones, COPs and suggested loot routes.

**Live map:** https://jkghub1.github.io/gzw-map/

> This is a fan project. It is not affiliated with, endorsed by, or sponsored by MADFINGER Games or GZW Tac Map.
> Marker positions and camp ratings can be out of date or wrong. Always check in game.

## Using the map

- **Mouse wheel:** zoom. **Drag:** pan. **Double-click:** zoom in. **0:** reset the view.
- **Right-click:** copy the in-game grid coordinates under the cursor (to 0.01 of a square, which is 1 m).
- The buttons along the top turn layers on and off and pick a loot route.
- **ⓘ About** (end of the top bar) shows the full credits, disclaimer and data date. A short credit line sits in the bottom-left corner.
- Grid: each 1×1 square is 100 m × 100 m, and each 10×10 block is 1 km. Coordinates read like the in-game map (e.g. `197,165`).

## Credits and sources

| What | Source |
|---|---|
| Gray Zone Warfare, the Lamang map and all game content | © [MADFINGER Games](https://madfingergames.com/). Gray Zone Warfare and related names are trademarks of their owner. |
| Map imagery (0.5 tiles) and marker positions: locations, campsites, building material crates, buried caches, landing zones, COPs, bases | [GZW Tac Map](https://gzwtacmap.com/) and its contributors |
| Zoomable image viewer | [OpenSeadragon](https://openseadragon.github.io/) 4.1.0 (BSD 3-Clause licence), loaded from [cdnjs](https://cdnjs.com/) |
| Distance and grid checks, camp ratings (good/bad), the empty-marker review | In-game measurements and play by the map's author |
| Loot routes, campsite lettering (A–BH), labels and the viewer itself | Made for this project from the data above |

Background research on 0.5 features (not used as map data) came from the community wikis:
[Gray Zone Warfare Fandom wiki](https://gray-zone-warfare.fandom.com/) and [grayzonewarfaregame.wiki](https://grayzonewarfaregame.wiki/).

If you own any of the content here and want it changed, credited differently or removed, please [open an issue](https://github.com/jkghub1/gzw-map/issues).

## About the loot routes

The routes are a travelling-salesman-style circuit for a **Lamang Recovery Initiative** player. They:
- start and end at the LRI base and walk legs of 800 m or less;
- take a helicopter hop between landing zones for longer gaps;
- unload at COPs and LZs at least every 10 stops;
- skip Ground Zero, camps rated "bad", and other factions' landing zones.

## Files

- `index.html`: the viewer
- `data.js`: markers, camp ratings and routes
- `base_files/`: map image tiles (Deep Zoom format)
