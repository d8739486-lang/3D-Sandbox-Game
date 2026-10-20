# Graph Report - Sandbox  (2026-10-20)

## Corpus Check
- 12 files · ~56,433 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .glb 3, (none) 2, .b64 1)

## Summary
- 488 nodes · 773 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `88782702`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- getAudioContext
- handleNetworkPacket
- package.json
- nsis
- tauri.conf.json
- animate
- shootPistol
- renderWorldsListUI
- ПЛАН РАБОТ (3D SANDBOX)
- startPreloaderSequence
- default.json
- playSlotSwitchSound
- renderServerList
- createRobloxStudTexture
- app

## God Nodes (most connected - your core abstractions)
1. `handleNetworkPacket()` - 21 edges
2. `getAudioContext()` - 19 edges
3. `updateMenuChaos()` - 17 edges
4. `loadWorldAndEnterGame()` - 17 edges
5. `playCustomOrSynth()` - 17 edges
6. `animate()` - 15 edges
7. `spawnItemByType()` - 13 edges
8. `fireToolGun()` - 13 edges
9. `setupBodyCollisionAudio()` - 13 edges
10. `shootPistol()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `3. МУЛЬТИПЛЕЕР, ОРУЖИЕ, ПРОПЫ И ПИРАМИДЫ [ВЫПОЛНЕНО]` --references--> `cleanupMenuChaosObjects()`  [INFERRED]
  TASKS_TODO.md → src/main.js

## Import Cycles
- None detected.

## Communities (19 total, 5 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.01
Nodes (205): activeBulletDecals, activeBulletTracers, activePeerConnections, activeServerList, activeShellCasings, activeSmokePuffs, aligningObjects, ALL_WEAPON_SLOTS (+197 more)

### Community 1 - "getAudioContext"
Cohesion: 0.06
Nodes (49): addMenuPhysicsItem(), buildMenuTowerAt(), checkJumpPadCollisions(), createNukePhysicsInstance(), createProceduralNukeModel(), detonateAllNukes(), getAudioContext(), getAudioDestination() (+41 more)

### Community 2 - "handleNetworkPacket"
Cohesion: 0.08
Nodes (55): applyObjectRotationPreset(), broadcastNetworkPacket(), cleanupMenuChaosObjects(), clearGameplayWorldObjects(), confirmWeaponSelection(), connectToMultiplayerHost(), createEquilateralPrismGeometry(), createPlayerAvatar() (+47 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (33): { app, BrowserWindow, Menu, ipcMain }, fs, path, author, dependencies, cannon-es, peerjs, three (+25 more)

### Community 4 - "nsis"
Cohesion: 0.10
Nodes (21): build, appId, compression, copyright, files, nsis, productName, win (+13 more)

### Community 5 - "tauri.conf.json"
Cohesion: 0.10
Nodes (19): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 6 - "animate"
Cohesion: 0.08
Nodes (28): animate(), checkEasterEggFormation(), closeMenu(), closePause(), closeRotateMenu(), createSubtleReverbNode(), getWeldClusterForBody(), openMenu() (+20 more)

### Community 7 - "shootPistol"
Cohesion: 0.20
Nodes (11): detonateNukeProp(), getMuzzleWorldPosition(), playEmptyClickSound(), playPistolShootSound(), shootPistol(), spawnBulletHole(), spawnBulletImpactSparks(), spawnBulletTracer() (+3 more)

### Community 8 - "renderWorldsListUI"
Cohesion: 0.27
Nodes (11): createNewWorldFlow(), deleteWorldById(), exportWorldById(), getAllWorlds(), importWorldFromFile(), openCreateWorldDialog(), renderWorldsListUI(), saveAllWorlds() (+3 more)

### Community 9 - "ПЛАН РАБОТ (3D SANDBOX)"
Cohesion: 0.33
Nodes (5): 1. СТРОГИЕ ПРАВИЛА СТИЛЯ (OG WINDOWS / RETRO 90s) [ВЫПОЛНЕНО], 2. КРИТИЧЕСКИЙ БАГ ФИЗИКИ (ПРИЛИПАНИЕ БЛОКОВ ПРИ БРОСКЕ) [ВЫПОЛНЕНО], 3. МУЛЬТИПЛЕЕР, ОРУЖИЕ, ПРОПЫ И ПИРАМИДЫ [ВЫПОЛНЕНО], 4. СИСТЕМА ОБНОВЛЕНИЙ И GRAPHIFY [ВЫПОЛНЕНО], ПЛАН РАБОТ (3D SANDBOX)

### Community 10 - "startPreloaderSequence"
Cohesion: 0.33
Nodes (6): checkForGameUpdates(), loadEssentialAssets(), startMenuMusic(), startPreloaderSequence(), finishPreloader(), tickPreloader()

### Community 11 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 12 - "playSlotSwitchSound"
Cohesion: 0.67
Nodes (4): playSlotSwitchSound(), selectWeaponSlotByStep(), showWeaponSelector(), updateWeaponHudHighlight()

### Community 13 - "renderServerList"
Cohesion: 0.33
Nodes (6): doDirectConnect(), queryActiveServers(), registerDiscoveredServer(), renderServerList(), showRetroPrompt(), switchToConnectScreen()

## Knowledge Gaps
- **271 isolated node(s):** `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs`, `name`, `version` (+266 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 294 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `nsis` to `package.json`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs` to the rest of the system?**
  _271 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.009259259259259259 - nodes in this community are weakly interconnected._
- **Why does `cannon-es` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `getAudioContext` be split into smaller, more focused modules?**
  _Cohesion score 0.055272108843537414 - nodes in this community are weakly interconnected._
- **Why does `peerjs` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `handleNetworkPacket` be split into smaller, more focused modules?**
  _Cohesion score 0.07946127946127945 - nodes in this community are weakly interconnected._