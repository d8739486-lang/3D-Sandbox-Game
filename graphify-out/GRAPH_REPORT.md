# Graph Report - Sandbox  (2026-10-20)

## Corpus Check
- 13 files · ~59,470 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .glb 3, (none) 2, .b64 1)

## Summary
- 533 nodes · 844 edges · 25 communities (20 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d9e64b7e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- updateMenuChaos
- playCustomOrSynth
- package.json
- nsis
- tauri.conf.json
- animate
- shootPistol
- renderWorldsListUI
- cleanupMenuChaosObjects
- startPreloaderSequence
- default.json
- playSlotSwitchSound
- handleNetworkPacket
- createRobloxStudTexture
- app
- getAudioContext
- playMenuSound
- updateNukeGag
- supabaseClient.js
- triggerNextBigMenuEvent
- createNukePhysicsInstance

## God Nodes (most connected - your core abstractions)
1. `handleNetworkPacket()` - 26 edges
2. `getAudioContext()` - 19 edges
3. `playCustomOrSynth()` - 18 edges
4. `updateMenuChaos()` - 17 edges
5. `loadWorldAndEnterGame()` - 17 edges
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

## Communities (25 total, 5 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.01
Nodes (229): activeBulletDecals, activeBulletTracers, activePeerConnections, activeServerList, activeShellCasings, activeSmokePuffs, aligningObjects, ALL_WEAPON_SLOTS (+221 more)

### Community 1 - "updateMenuChaos"
Cohesion: 0.25
Nodes (11): addMenuPhysicsItem(), buildMenuTowerAt(), checkJumpPadCollisions(), getRandomChaosColor(), setupJumpPad(), shootCannonballAtTower(), spawnDominoSequence(), spawnMenuCascadeBall() (+3 more)

### Community 2 - "playCustomOrSynth"
Cohesion: 0.09
Nodes (43): applyObjectRotationPreset(), clearGameplayWorldObjects(), confirmWeaponSelection(), createEquilateralPrismGeometry(), createRampGeometry(), equipWeapon(), fireToolGun(), getItemDisplayName() (+35 more)

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
Cohesion: 0.10
Nodes (22): animate(), checkEasterEggFormation(), closeGameChat(), closeMenu(), closePause(), closeRotateMenu(), getObjectSnapFacePoints(), getWeldClusterForBody() (+14 more)

### Community 7 - "shootPistol"
Cohesion: 0.13
Nodes (16): detonateNukeProp(), getMuzzleWorldPosition(), playEmptyClickSound(), playPistolShootSound(), shootPistol(), spawnBulletHole(), spawnBulletImpactSparks(), spawnBulletTracer() (+8 more)

### Community 8 - "renderWorldsListUI"
Cohesion: 0.36
Nodes (9): deleteWorldById(), exportWorldById(), getAllWorlds(), importWorldFromFile(), renderWorldsListUI(), saveAllWorlds(), saveCurrentActiveWorld(), serializeCurrentWorldState() (+1 more)

### Community 9 - "cleanupMenuChaosObjects"
Cohesion: 0.29
Nodes (6): cleanupMenuChaosObjects(), 1. СТРОГИЕ ПРАВИЛА СТИЛЯ (OG WINDOWS / RETRO 90s) [ВЫПОЛНЕНО], 2. КРИТИЧЕСКИЙ БАГ ФИЗИКИ (ПРИЛИПАНИЕ БЛОКОВ ПРИ БРОСКЕ) [ВЫПОЛНЕНО], 3. МУЛЬТИПЛЕЕР, ОРУЖИЕ, ПРОПЫ И ПИРАМИДЫ [ВЫПОЛНЕНО], 4. СИСТЕМА ОБНОВЛЕНИЙ И GRAPHIFY [ВЫПОЛНЕНО], ПЛАН РАБОТ (3D SANDBOX)

### Community 10 - "startPreloaderSequence"
Cohesion: 0.33
Nodes (6): checkForGameUpdates(), loadEssentialAssets(), startMenuMusic(), startPreloaderSequence(), finishPreloader(), tickPreloader()

### Community 11 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 12 - "playSlotSwitchSound"
Cohesion: 0.67
Nodes (4): playSlotSwitchSound(), selectWeaponSlotByStep(), showWeaponSelector(), updateWeaponHudHighlight()

### Community 13 - "handleNetworkPacket"
Cohesion: 0.13
Nodes (27): appendChatMessageToUI(), broadcastNetworkPacket(), connectToMultiplayerHost(), createNewWorldFlow(), createPlayerAvatar(), doDirectConnect(), escapeHtml(), handleChatCommand() (+19 more)

### Community 19 - "getAudioContext"
Cohesion: 0.18
Nodes (11): createSubtleReverbNode(), getAudioContext(), getAudioDestination(), playImpactSound(), playKaboomSound(), playLaunchSound(), playOminousRumbleSound(), playRitualHumSound() (+3 more)

### Community 20 - "playMenuSound"
Cohesion: 0.18
Nodes (11): playMenuSound(), strikeLightning(), synthExtinguishSteam(), synthLaserZap(), synthNukeAlarm(), synthThunder(), triggerNukeEvent(), triggerNukePileupEvent() (+3 more)

### Community 21 - "updateNukeGag"
Cohesion: 0.24
Nodes (10): detonateAllNukes(), getMissingTextureMaterial(), playGlitchWinError(), playWinErrorSound(), resetNukeGagToNormal(), synthNukeWarningBeep(), synthWinErrorSound(), toggleNukeGlitchTextures() (+2 more)

### Community 22 - "supabaseClient.js"
Cohesion: 0.31
Nodes (6): currentUserSession, isSupabaseReady(), loginSupabaseAccount(), registerSupabaseAccount(), SUPABASE_CONFIG, supabaseRest()

### Community 23 - "triggerNextBigMenuEvent"
Cohesion: 0.40
Nodes (5): triggerFireMeteorEvent(), triggerNextBigMenuEvent(), triggerOrbitalLaserEvent(), triggerThunderstormEvent(), triggerVortexEvent()

### Community 24 - "createNukePhysicsInstance"
Cohesion: 0.50
Nodes (4): createNukePhysicsInstance(), createProceduralNukeModel(), previewNukeObj, synthNukeThud()

## Knowledge Gaps
- **297 isolated node(s):** `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs`, `name`, `version` (+292 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 324 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `nsis` to `package.json`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **What connects `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs` to the rest of the system?**
  _297 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.008264462809917356 - nodes in this community are weakly interconnected._
- **Why does `cannon-es` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `playCustomOrSynth` be split into smaller, more focused modules?**
  _Cohesion score 0.08970099667774087 - nodes in this community are weakly interconnected._
- **Why does `peerjs` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._