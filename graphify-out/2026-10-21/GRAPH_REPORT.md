# Graph Report - 3D Sandbox - old game style  (2026-10-21)

## Corpus Check
- 15 files · ~61,198 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .glb 3, (none) 2, .b64 1)

## Summary
- 549 nodes · 862 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4aea5b71`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- updateMenuChaos
- loadWorldAndEnterGame
- package.json
- nsis
- tauri.conf.json
- animate
- playCustomOrSynth
- renderWorldsListUI
- cleanupMenuChaosObjects
- startPreloaderSequence
- default.json
- requestPointerLockSafely
- handleNetworkPacket
- createRobloxStudTexture
- app
- getAudioContext
- playMenuSound
- updateNukeGag
- supabaseClient.js
- triggerNextBigMenuEvent
- createNukePhysicsInstance
- Сводный план задач и правок проекта (TODO & Requirements)

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
10. `equipWeapon()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `3. МУЛЬТИПЛЕЕР, ОРУЖИЕ, ПРОПЫ И ПИРАМИДЫ [ВЫПОЛНЕНО]` --references--> `cleanupMenuChaosObjects()`  [INFERRED]
  TASKS_TODO.md → src/main.js
- `Task 4: Multiplayer Room Isolation & Pause Button Text (Section 4)` --references--> `openPause()`  [INFERRED]
  docs/plans/2026-10-21-tasks-implementation-plan.md → src/main.js

## Import Cycles
- None detected.

## Communities (26 total, 5 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.01
Nodes (229): activeBulletDecals, activeBulletTracers, activePeerConnections, activeServerList, activeShellCasings, activeSmokePuffs, aligningObjects, ALL_WEAPON_SLOTS (+221 more)

### Community 1 - "updateMenuChaos"
Cohesion: 0.25
Nodes (11): addMenuPhysicsItem(), buildMenuTowerAt(), checkJumpPadCollisions(), getRandomChaosColor(), setupJumpPad(), shootCannonballAtTower(), spawnDominoSequence(), spawnMenuCascadeBall() (+3 more)

### Community 2 - "loadWorldAndEnterGame"
Cohesion: 0.15
Nodes (27): clearGameplayWorldObjects(), createEquilateralPrismGeometry(), createRampGeometry(), fireToolGun(), getItemDisplayName(), getToolGunGeometry(), loadWorldAndEnterGame(), notifySpawnBlock() (+19 more)

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
Cohesion: 0.13
Nodes (16): animate(), checkEasterEggFormation(), createSubtleReverbNode(), getObjectSnapFacePoints(), getWeldClusterForBody(), playSpatialSecretCubeFall(), releaseGrabbedBody(), setWeldClusterVelocity() (+8 more)

### Community 7 - "playCustomOrSynth"
Cohesion: 0.08
Nodes (34): applyObjectRotationPreset(), confirmWeaponSelection(), equipWeapon(), getMuzzleWorldPosition(), playButtonClickSound(), playCustomOrSynth(), playEmptyClickSound(), playGrabSound() (+26 more)

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

### Community 12 - "requestPointerLockSafely"
Cohesion: 0.14
Nodes (15): Task 1: Update System Simplification & Z-Index Layering Fix (Section 1), Task 2: Graphics, Design & Single Baseplate Map (Section 2), Task 3: Weapon Slots & Spawn Menu Tool Gun / Hands Behavior (Section 3), Task 4: Multiplayer Room Isolation & Pause Button Text (Section 4), Task 5: Notifications & Chat (Key T/Ь/Enter, No Timestamps) (Section 5), Task 6: Graphify Knowledge Graph Update & Final Stability Verification (Section 6), [Tasks.md Full Scope] Implementation Plan, closeMenu() (+7 more)

### Community 13 - "handleNetworkPacket"
Cohesion: 0.12
Nodes (28): appendChatMessageToUI(), broadcastNetworkPacket(), closeGameChat(), connectToMultiplayerHost(), createNewWorldFlow(), createPlayerAvatar(), doDirectConnect(), escapeHtml() (+20 more)

### Community 19 - "getAudioContext"
Cohesion: 0.20
Nodes (10): detonateNukeProp(), getAudioContext(), getAudioDestination(), playImpactSound(), playKaboomSound(), playLaunchSound(), playOminousRumbleSound(), playRitualHumSound() (+2 more)

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

### Community 25 - "Сводный план задач и правок проекта (TODO & Requirements)"
Cohesion: 0.25
Nodes (7): 1. Система обновления игры [ВЫПОЛНЕНО], 2. Графика, дизайн и интерфейс [ВЫПОЛНЕНО], 3. Режимы экипировки и меню предметов (Spawn Menu / Tool Gun / Руки) [ВЫПОЛНЕНО], 4. Мультиплеер и сетевая изоляция [ВЫПОЛНЕНО], 5. Уведомления и чат [ВЫПОЛНЕНО], 6. Резервное копирование и стабильность [ВЫПОЛНЕНО], Сводный план задач и правок проекта (TODO & Requirements)

## Knowledge Gaps
- **308 isolated node(s):** `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs`, `name`, `version` (+303 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 337 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `nsis` to `package.json`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `{ app, BrowserWindow, Menu, ipcMain }`, `path`, `fs` to the rest of the system?**
  _308 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.008264462809917356 - nodes in this community are weakly interconnected._
- **Why does `cannon-es` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `loadWorldAndEnterGame` be split into smaller, more focused modules?**
  _Cohesion score 0.1452991452991453 - nodes in this community are weakly interconnected._
- **Why does `peerjs` connect `package.json` to `main.js`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._