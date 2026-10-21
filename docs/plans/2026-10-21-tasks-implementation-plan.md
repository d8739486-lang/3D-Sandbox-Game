# [Tasks.md Full Scope] Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all requirements from `tasks.md` (Sections 1–6): fix update modal z-index and simplify UI, eliminate all neon glows and enforce single Baseplate map, fix Tool Gun / Hands active weapon detection in spawn menu, isolate multiplayer rooms and update pause exit button, enable chat on T/Ь/Enter without timestamps, update graphify and verify stability.

**Architecture:** Frontend web application with Three.js, Cannon-es, PeerJS, and retro Windows-style DOM overlays. Modular UI updates in `index.html`, `src/style.css`, and `src/main.js`.

**Tech Stack:** JavaScript (ES6+), Three.js, Cannon-es, PeerJS, CSS3, Vite / Electron.

---

### Task 1: Update System Simplification & Z-Index Layering Fix (Section 1)
**Files:**
- Modify: `src/style.css:2406-2475`
- Modify: `src/main.js:9810-9980`
- Modify: `index.html:502-523`

- Change `#update-dialog-modal` z-index from `1000` to `25000` (above `#main-menu` 15000 and modals).
- Remove technical changelog, build numbers, and verbose commit descriptions.
- Simplify update prompt to "Доступно обновление (v1.0.6)" with buttons "Обновить" and "Закрыть".
- Clean up progress bar: remove neon cyan, use clean matte retro progress bar with concise "Загрузка... XX%".
- Synchronize current version in `src/main.js`.

---

### Task 2: Graphics, Design & Single Baseplate Map (Section 2)
**Files:**
- Modify: `src/style.css` (lines 500-580, 2200-2240, 2340-2375, 2460-2500, 2640-2750)
- Modify: `src/main.js:2890-2970`
- Modify: `index.html:229-253`

- Remove all neon glows: replace cyan `#00f0ff` glow `box-shadow` and bright text-shadows with matte borders and dark neutral backgrounds.
- Remove all map selection grids and cards; ensure world creation directly creates Baseplate without extra map selection steps.

---

### Task 3: Weapon Slots & Spawn Menu Tool Gun / Hands Behavior (Section 3)
**Files:**
- Modify: `src/main.js:3560-3620, 4125-4185, 5940-6040, 7080-7090`
- Modify: `index.html:465-500`

- Fast weapon switch on digit keys (1, 2, 3...) immediately equips weapon.
- Tool Gun mode in spawn menu (`B`) ONLY active when physically holding Tool Gun (`1-2` or `5-1`).
- When holding Hands (`1-1`) or Glock (`2-1`), spawn menu shows standard "Предметы", no `[РЕЖИМ TOOL GUN]` banner/footer, and button is "Создать".
- When holding Tool Gun, buttons show "Выбрать" (or "[Выбрано]"), clicking changes `toolGunSelectedItem`, which persists when putting Tool Gun away and re-equipping.

---

### Task 4: Multiplayer Room Isolation & Pause Button Text (Section 4)
**Files:**
- Modify: `src/main.js:3420-3530, 8000-8060, 8430-8540`
- Modify: `index.html:455-464`

- In pause menu (`openPause`), set exit button text to "Выйти" if in multiplayer, and "Выйти в меню" in singleplayer.
- Complete room isolation: players strictly join via room ID (`sbx-...`).
- Clean disconnect on exit: leave room, destroy peer, clean up all remote player avatars from Three.js scene so no phantom avatars can spawn or remain in main menu.

---

### Task 5: Notifications & Chat (Key T/Ь/Enter, No Timestamps) (Section 5)
**Files:**
- Modify: `src/main.js:7090-7170, 7390-7500`

- Open chat on `KeyT` (when `!isHoldingOrRotating`), `KeyM` (Ь), and `Enter`.
- Remove `toolGunRotY` hijacking `KeyT`.
- Ensure no timestamps are displayed in chat or notifications.

---

### Task 6: Graphify Knowledge Graph Update & Final Stability Verification (Section 6)
**Commands:**
- Run `graphify update .` to update graph knowledge base.
- Verify game starts cleanly without syntax or console errors.
