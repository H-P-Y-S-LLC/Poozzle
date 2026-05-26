(function () {
  const TILE_ICON_BASE_URL = "https://assets.poozzle.com/guis";

  const TILE_TYPES = [
    { cls: "tile-fly", iconFile: "Tile1.png", name: "苍蝇" },
    { cls: "tile-poop", iconFile: "Tile2.png", name: "屎" },
    { cls: "tile-plunger", iconFile: "Tile3.png", name: "皮搋子" },
    { cls: "tile-maggot", iconFile: "Tile4.png", name: "肉虫子" },
    { cls: "tile-paper", iconFile: "Tile5.png", name: "卫生纸" },
    { cls: "tile-slipper", iconFile: "Tile6.png", name: "拖鞋" },
  ];

  const SPECIAL = {
    LINE_H: "line-h",
    LINE_V: "line-v",
    BOMB: "bomb",
    RAINBOW: "rainbow",
  };

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.enabled = true;
      this.isUnlocked = false;
    }

    ensureCtx() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          this.enabled = false;
          return false;
        }
        this.ctx = new Ctx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1;
        this.masterGain.connect(this.ctx.destination);
      }
      return this.enabled;
    }

    unlock() {
      if (!this.ensureCtx()) return;
      if (this.ctx.state !== "running") {
        this.ctx.resume().catch(() => {});
      }
      this.isUnlocked = true;
    }

    getStartTime() {
      if (!this.ensureCtx()) return null;
      const now = this.ctx.currentTime;
      return this.ctx.state === "running" ? now : now + 0.03;
    }

    tone({ freq = 440, duration = 0.08, type = "sine", volume = 1, slideTo = null }) {
      if (!this.ensureCtx()) return;
      if (this.ctx.state !== "running") this.unlock();
      const now = this.getStartTime();
      if (now === null) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    noise({ duration = 0.08, volume = 1 }) {
      if (!this.ensureCtx()) return;
      if (this.ctx.state !== "running") this.unlock();
      const sampleRate = this.ctx.sampleRate;
      const length = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }

      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const biquad = this.ctx.createBiquadFilter();

      biquad.type = "highpass";
      biquad.frequency.value = 600;

      const now = this.getStartTime();
      if (now === null) return;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.buffer = buffer;
      source.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.masterGain);
      source.start(now);
      source.stop(now + duration + 0.01);
    }

    playSwap() {
      this.tone({ freq: 440, slideTo: 520, duration: 0.07, type: "triangle", volume: 1 });
    }

    playSelect() {
      this.tone({ freq: 560, slideTo: 640, duration: 0.05, type: "triangle", volume: 1 });
    }

    playInvalid() {
      this.tone({ freq: 250, slideTo: 180, duration: 0.1, type: "sawtooth", volume: 1 });
    }

    playClear(count) {
      this.noise({ duration: 0.06 + Math.min(0.06, count * 0.003), volume: 1 });
      this.tone({ freq: 620, slideTo: 300, duration: 0.09, type: "square", volume: 1 });
    }

    playSpecial() {
      this.tone({ freq: 780, slideTo: 980, duration: 0.09, type: "square", volume: 1 });
      this.tone({ freq: 980, slideTo: 640, duration: 0.1, type: "triangle", volume: 1 });
    }

    playFall() {
      this.tone({ freq: 260, slideTo: 220, duration: 0.08, type: "sine", volume: 1 });
    }

    playLevelStart() {
      this.tone({ freq: 520, duration: 0.07, type: "triangle", volume: 1 });
      window.setTimeout(() => this.tone({ freq: 660, duration: 0.08, type: "triangle", volume: 1 }), 60);
    }

    playWin() {
      this.tone({ freq: 660, duration: 0.1, type: "triangle", volume: 1 });
      window.setTimeout(() => this.tone({ freq: 880, duration: 0.12, type: "triangle", volume: 1 }), 90);
      window.setTimeout(() => this.tone({ freq: 1100, duration: 0.14, type: "triangle", volume: 1 }), 200);
    }

    playOutOfMoves() {
      this.tone({ freq: 280, duration: 0.1, slideTo: 220, type: "sawtooth", volume: 1 });
      window.setTimeout(() => this.tone({ freq: 220, duration: 0.12, slideTo: 180, type: "sawtooth", volume: 1 }), 90);
    }

    playUnlockPing() {
      this.tone({ freq: 740, duration: 0.06, slideTo: 860, type: "triangle", volume: 1 });
    }
  }

  class Match3Game {
    constructor(options) {
      this.rows = options.rows || 6;
      this.cols = options.cols || 6;
      this.gridEl = document.getElementById(options.gridId || "game-grid");
      this.boardEl = document.getElementById(options.boardId || "board-el");
      this.scoreEl = document.getElementById(options.scoreId || "score-display");
      this.movesEl = document.getElementById(options.movesId || "moves-display");
      this.levelEl = document.getElementById(options.levelId || "level-display");
      this.targetEl = document.getElementById(options.targetId || "target-display");

      this.board = [];
      this.score = 0;
      this.level = 1;
      this.moves = 0;
      this.goal = { type: 0, target: 0, collected: 0 };
      this.isResolving = false;
      this.selected = null;
      this.clearSet = new Set();
      this.levelTransitioning = false;

      this.sfx = new SoundEngine();

      this.clearAnimMs = 220;
      this.fallAnimMs = 260;
      this.fallColumnDelayMs = 26;

      this.onGridClick = this.onGridClick.bind(this);
    }

    init() {
      if (!this.gridEl) return;
      this.bindAudioUnlock();
      this.setupLevel(1, { keepScore: false });
      this.gridEl.addEventListener("click", this.onGridClick);
    }

    bindAudioUnlock() {
      const unlockOnce = () => {
        this.sfx.unlock();
        this.sfx.playUnlockPing();
        document.removeEventListener("pointerdown", unlockOnce);
        document.removeEventListener("keydown", unlockOnce);
        document.removeEventListener("touchstart", unlockOnce);
      };

      document.addEventListener("pointerdown", unlockOnce, { passive: true });
      document.addEventListener("keydown", unlockOnce, { passive: true });
      document.addEventListener("touchstart", unlockOnce, { passive: true });
    }

    getGoalTypeForLevel(level) {
      return (level - 1) % this.getActiveTileCount(level);
    }

    getActiveTileCount(level = this.level) {
      return level > 20 ? TILE_TYPES.length : TILE_TYPES.length - 1;
    }

    getGoalCountForLevel(level) {
      return Math.min(30, 8 + level * 2);
    }

    getMovesForLevel(level) {
      return Math.max(12, 18 - Math.floor((level - 1) / 3));
    }

    setupLevel(level, { keepScore = true } = {}) {
      this.level = level;
      this.moves = this.getMovesForLevel(level);
      this.goal = {
        type: this.getGoalTypeForLevel(level),
        target: this.getGoalCountForLevel(level),
        collected: 0,
      };
      this.selected = null;
      this.clearSet.clear();
      if (!keepScore) this.score = 0;
      this.buildInitialBoard();
      this.render();
      this.updateHud();
      this.sfx.playLevelStart();
    }

    makeNormal(type) {
      return { type, special: null };
    }

    keyOf(pos) {
      return `${pos.row},${pos.col}`;
    }

    parseKey(key) {
      const [row, col] = key.split(",").map(Number);
      return { row, col };
    }

    getTileTypeForMatch(tile) {
      if (!tile || tile.special === SPECIAL.RAINBOW) return null;
      return tile.type;
    }

    buildInitialBoard() {
      this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.board[r][c] = this.makeNormal(this.getSafeRandomType(r, c));
        }
      }

      while (this.findMatchInfo().matchSet.size > 0) {
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            this.board[r][c] = this.makeNormal(this.getSafeRandomType(r, c));
          }
        }
      }

      if (!this.hasAnyPlayableAction(this.board)) {
        this.reshuffleBoardUntilPlayable();
      }
    }

    getSafeRandomType(r, c) {
      const banned = new Set();

      if (c >= 2) {
        const a = this.getTileTypeForMatch(this.board[r][c - 1]);
        const b = this.getTileTypeForMatch(this.board[r][c - 2]);
        if (a !== null && a === b) banned.add(a);
      }
      if (r >= 2) {
        const a = this.getTileTypeForMatch(this.board[r - 1][c]);
        const b = this.getTileTypeForMatch(this.board[r - 2][c]);
        if (a !== null && a === b) banned.add(a);
      }

      const candidates = [];
      for (let i = 0; i < this.getActiveTileCount(); i++) {
        if (!banned.has(i)) candidates.push(i);
      }

      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    onGridClick(event) {
      if (this.isResolving) return;
      this.sfx.unlock();

      const tileEl = event.target.closest(".tile");
      if (!tileEl || !this.gridEl.contains(tileEl)) return;

      const row = Number(tileEl.dataset.row);
      const col = Number(tileEl.dataset.col);
      const point = { row, col };
      const tile = this.board[row][col];
      if (!tile) return;

      if (tile.special === SPECIAL.LINE_H || tile.special === SPECIAL.LINE_V || tile.special === SPECIAL.BOMB) {
        this.activateClickableSpecial(point);
        return;
      }

      if (!this.selected) {
        this.selected = point;
        this.sfx.playSelect();
        this.render();
        return;
      }

      if (this.selected.row === row && this.selected.col === col) {
        this.selected = null;
        this.render();
        return;
      }

      if (!this.isAdjacent(this.selected, point)) {
        this.selected = point;
        this.sfx.playSelect();
        this.render();
        return;
      }

      this.trySwap(this.selected, point);
    }

    isAdjacent(a, b) {
      return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
    }

    async trySwap(a, b) {
      this.isResolving = true;
      this.gridEl.classList.add("is-busy");
      this.sfx.playSwap();

      this.swap(a, b);
      this.selected = null;
      this.render();

      await this.delay(100);

      const tileA = this.board[a.row][a.col];
      const tileB = this.board[b.row][b.col];
      const rainbowPair = this.getRainbowSwapPair(a, b, tileA, tileB);

      if (rainbowPair) {
        this.consumeMove();
        await this.resolveRainbowSwap(rainbowPair);
        await this.handlePostAction();
        this.isResolving = false;
        this.gridEl.classList.remove("is-busy");
        return;
      }

      const matchInfo = this.findMatchInfo();
      if (matchInfo.matchSet.size === 0) {
        this.swap(a, b);
        this.render();
        this.sfx.playInvalid();
        this.isResolving = false;
        this.gridEl.classList.remove("is-busy");
        return;
      }

      this.consumeMove();
      await this.resolveCascades({ swapPair: [a, b] });
      await this.handlePostAction();

      this.isResolving = false;
      this.gridEl.classList.remove("is-busy");
    }

    getRainbowSwapPair(a, b, tileA, tileB) {
      const aRainbow = tileA && tileA.special === SPECIAL.RAINBOW;
      const bRainbow = tileB && tileB.special === SPECIAL.RAINBOW;

      if (aRainbow && tileB && tileB.special !== SPECIAL.RAINBOW) {
        return { rainbowPos: a, otherPos: b, targetType: tileB.type };
      }
      if (bRainbow && tileA && tileA.special !== SPECIAL.RAINBOW) {
        return { rainbowPos: b, otherPos: a, targetType: tileA.type };
      }
      return null;
    }

    async activateClickableSpecial(pos) {
      if (this.isResolving) return;
      const tile = this.board[pos.row][pos.col];
      if (!tile) return;

      this.isResolving = true;
      this.gridEl.classList.add("is-busy");
      this.selected = null;

      this.consumeMove();
      this.sfx.playSpecial();

      const clearSet = this.getSpecialChainClearSet(pos, tile.special);
      await this.resolveForcedClear(clearSet, 25);
      await this.handlePostAction();

      this.isResolving = false;
      this.gridEl.classList.remove("is-busy");
    }

    getSpecialClearSetByKind(pos, special) {
      const clearSet = new Set();
      if (special === SPECIAL.LINE_H) {
        for (let c = 0; c < this.cols; c++) clearSet.add(`${pos.row},${c}`);
      } else if (special === SPECIAL.LINE_V) {
        for (let r = 0; r < this.rows; r++) clearSet.add(`${r},${pos.col}`);
      } else if (special === SPECIAL.BOMB) {
        for (let r = pos.row - 1; r <= pos.row + 1; r++) {
          for (let c = pos.col - 1; c <= pos.col + 1; c++) {
            if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) clearSet.add(`${r},${c}`);
          }
        }
      }
      return clearSet;
    }

    getTriggeredSpecial(sourceSpecial, targetSpecial) {
      if (sourceSpecial === SPECIAL.LINE_H && targetSpecial === SPECIAL.LINE_H) return SPECIAL.LINE_V;
      if (sourceSpecial === SPECIAL.LINE_V && targetSpecial === SPECIAL.LINE_V) return SPECIAL.LINE_H;
      return targetSpecial;
    }

    getSpecialChainClearSet(startPos, startSpecial) {
      const clearSet = new Set();
      const queue = [{ pos: startPos, special: startSpecial }];
      const processed = new Set();

      while (queue.length > 0) {
        const { pos, special } = queue.shift();
        const nodeKey = `${this.keyOf(pos)}|${special}`;
        if (processed.has(nodeKey)) continue;
        processed.add(nodeKey);

        const local = this.getSpecialClearSetByKind(pos, special);
        local.forEach((key) => clearSet.add(key));

        for (const key of local) {
          const { row, col } = this.parseKey(key);
          const tile = this.board[row][col];
          if (!tile || !tile.special) continue;
          if (tile.special === SPECIAL.RAINBOW) continue;
          if (row === pos.row && col === pos.col) continue;

          queue.push({
            pos: { row, col },
            special: this.getTriggeredSpecial(special, tile.special),
          });
        }
      }

      return clearSet;
    }

    async resolveRainbowSwap({ rainbowPos, otherPos, targetType }) {
      const clearSet = new Set();
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const tile = this.board[r][c];
          if (tile && tile.type === targetType) {
            clearSet.add(`${r},${c}`);
          }
        }
      }
      clearSet.add(this.keyOf(rainbowPos));
      clearSet.add(this.keyOf(otherPos));

      await this.resolveForcedClear(clearSet, 30);
    }

    async resolveForcedClear(clearSet, pointPerCell) {
      this.clearSet = clearSet;
      this.render();
      this.applyGoalProgressFromSet(clearSet);
      this.updateScore(clearSet.size * pointPerCell);
      this.sfx.playClear(clearSet.size);

      await this.delay(this.clearAnimMs);

      this.clearMatches(clearSet);
      const dropMap = this.applyGravityAndRefillWithDropMap();

      this.clearSet.clear();
      this.render(dropMap);
      this.sfx.playFall();
      await this.delay(this.fallAnimMs + this.fallColumnDelayMs * (this.cols - 1));

      await this.resolveCascades({ swapPair: null });
    }

    async resolveCascades({ swapPair }) {
      let chain = 0;

      while (true) {
        const matchInfo = this.findMatchInfo();
        if (matchInfo.matchSet.size === 0) {
          this.clearSet.clear();
          this.render();
          break;
        }

        chain += 1;

        const specialSpawns = this.buildSpecialSpawns(matchInfo, swapPair);
        swapPair = null;

        const clearSet = new Set(matchInfo.matchSet);
        specialSpawns.forEach((_, key) => clearSet.delete(key));

        this.clearSet = clearSet;
        this.render();
        this.applyGoalProgressFromSet(clearSet);
        this.updateScore(matchInfo.matchSet.size * 20 * chain);
        this.sfx.playClear(clearSet.size);

        await this.delay(this.clearAnimMs);

        this.clearMatches(clearSet);
        this.applySpecialSpawns(specialSpawns);

        const dropMap = this.applyGravityAndRefillWithDropMap();
        this.clearSet.clear();
        this.render(dropMap);
        this.sfx.playFall();

        await this.delay(this.fallAnimMs + this.fallColumnDelayMs * (this.cols - 1));
      }
    }

    consumeMove() {
      this.moves = Math.max(0, this.moves - 1);
      this.updateHud();
    }

    applyGoalProgressFromSet(clearSet) {
      let gained = 0;
      for (const key of clearSet) {
        const { row, col } = this.parseKey(key);
        const tile = this.board[row][col];
        if (tile && tile.type === this.goal.type) {
          gained += 1;
        }
      }
      if (gained > 0) {
        this.goal.collected = Math.min(this.goal.target, this.goal.collected + gained);
        this.updateHud();
      }
    }

    async handlePostAction() {
      if (this.levelTransitioning) return;

      if (this.goal.collected >= this.goal.target) {
        this.levelTransitioning = true;
        await this.playLevelWin();
        this.setupLevel(this.level + 1, { keepScore: true });
        this.levelTransitioning = false;
        return;
      }

      if (this.moves <= 0) {
        this.levelTransitioning = true;
        await this.playOutOfMoves();
        this.setupLevel(1, { keepScore: false });
        this.levelTransitioning = false;
        return;
      }

      await this.ensurePlayableBoard();
    }

    async ensurePlayableBoard() {
      if (this.hasAnyPlayableAction(this.board)) return;
      await this.playDeadlockShuffle();
    }

    async playDeadlockShuffle() {
      this.selected = null;
      this.clearSet.clear();
      this.gridEl.classList.add("is-busy", "is-shuffling");
      if (this.boardEl) this.boardEl.classList.add("is-board-shuffling");
      this.render();

      await this.delay(360);

      this.reshuffleBoardUntilPlayable();
      this.sfx.playFall();

      this.gridEl.classList.remove("is-shuffling");
      this.gridEl.classList.add("is-shuffling-in");
      this.render();

      await this.delay(380);

      this.gridEl.classList.remove("is-shuffling-in", "is-busy");
      if (this.boardEl) this.boardEl.classList.remove("is-board-shuffling");
      this.render();
    }

    async playLevelWin() {
      if (this.boardEl) this.boardEl.classList.add("is-level-win");
      this.sfx.playWin();
      await this.delay(760);
      if (this.boardEl) this.boardEl.classList.remove("is-level-win");
    }

    async playOutOfMoves() {
      if (this.boardEl) this.boardEl.classList.add("is-level-fail");
      this.sfx.playOutOfMoves();
      await this.delay(620);
      if (this.boardEl) this.boardEl.classList.remove("is-level-fail");
    }

    findMatchInfo(board = this.board) {
      const groups = [];
      const matchSet = new Set();
      const cellMeta = new Map();

      const addMeta = (key, orientation) => {
        if (!cellMeta.has(key)) cellMeta.set(key, { h: false, v: false });
        cellMeta.get(key)[orientation] = true;
      };

      for (let r = 0; r < this.rows; r++) {
        let start = 0;
        for (let c = 1; c <= this.cols; c++) {
          const leftType = this.getTileTypeForMatch(board[r][start]);
          const currType = c < this.cols ? this.getTileTypeForMatch(board[r][c]) : null;
          const same = currType !== null && currType === leftType;

          if (!same) {
            const len = c - start;
            if (leftType !== null && len >= 3) {
              const cells = [];
              for (let i = start; i < c; i++) {
                const key = `${r},${i}`;
                matchSet.add(key);
                addMeta(key, "h");
                cells.push({ row: r, col: i });
              }
              groups.push({ orientation: "h", length: len, cells });
            }
            start = c;
          }
        }
      }

      for (let c = 0; c < this.cols; c++) {
        let start = 0;
        for (let r = 1; r <= this.rows; r++) {
          const topType = this.getTileTypeForMatch(board[start][c]);
          const currType = r < this.rows ? this.getTileTypeForMatch(board[r][c]) : null;
          const same = currType !== null && currType === topType;

          if (!same) {
            const len = r - start;
            if (topType !== null && len >= 3) {
              const cells = [];
              for (let i = start; i < r; i++) {
                const key = `${i},${c}`;
                matchSet.add(key);
                addMeta(key, "v");
                cells.push({ row: i, col: c });
              }
              groups.push({ orientation: "v", length: len, cells });
            }
            start = r;
          }
        }
      }

      return { groups, matchSet, cellMeta };
    }

    hasAnyClickableSpecial(board = this.board) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const tile = board[r][c];
          if (!tile) continue;
          if (tile.special === SPECIAL.LINE_H || tile.special === SPECIAL.LINE_V || tile.special === SPECIAL.BOMB) {
            return true;
          }
        }
      }
      return false;
    }

    canSwapCreateMatch(board, a, b) {
      const tileA = board[a.row][a.col];
      const tileB = board[b.row][b.col];
      if (!tileA || !tileB) return false;

      const aRainbow = tileA.special === SPECIAL.RAINBOW;
      const bRainbow = tileB.special === SPECIAL.RAINBOW;
      if ((aRainbow && !bRainbow) || (bRainbow && !aRainbow)) return true;

      board[a.row][a.col] = tileB;
      board[b.row][b.col] = tileA;
      const hasMatch = this.findMatchInfo(board).matchSet.size > 0;
      board[a.row][a.col] = tileA;
      board[b.row][b.col] = tileB;
      return hasMatch;
    }

    hasAnyPlayableAction(board = this.board) {
      if (this.hasAnyClickableSpecial(board)) return true;

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const current = { row: r, col: c };

          if (c + 1 < this.cols) {
            const right = { row: r, col: c + 1 };
            if (this.canSwapCreateMatch(board, current, right)) return true;
          }

          if (r + 1 < this.rows) {
            const down = { row: r + 1, col: c };
            if (this.canSwapCreateMatch(board, current, down)) return true;
          }
        }
      }

      return false;
    }

    cloneTile(tile) {
      if (!tile) return null;
      return { type: tile.type, special: tile.special || null };
    }

    buildBoardFromFlatTiles(flatTiles) {
      const nextBoard = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      let idx = 0;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          nextBoard[r][c] = flatTiles[idx++];
        }
      }
      return nextBoard;
    }

    shuffleArrayInPlace(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    reshuffleBoardUntilPlayable() {
      const originalTiles = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          originalTiles.push(this.cloneTile(this.board[r][c]));
        }
      }

      const maxAttempts = 220;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateTiles = this.shuffleArrayInPlace(originalTiles.map((tile) => this.cloneTile(tile)));
        const candidateBoard = this.buildBoardFromFlatTiles(candidateTiles);

        if (this.findMatchInfo(candidateBoard).matchSet.size > 0) continue;
        if (!this.hasAnyPlayableAction(candidateBoard)) continue;

        this.board = candidateBoard;
        return;
      }

      // Fallback: generate a brand-new clean board that guarantees at least one playable action.
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateBoard = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            candidateBoard[r][c] = this.makeNormal(Math.floor(Math.random() * this.getActiveTileCount()));
          }
        }

        if (this.findMatchInfo(candidateBoard).matchSet.size > 0) continue;
        if (!this.hasAnyPlayableAction(candidateBoard)) continue;

        this.board = candidateBoard;
        return;
      }
    }

    buildSpecialSpawns(matchInfo, swapPair) {
      const spawns = new Map();
      const priority = new Map();

      const getPriority = (special) => {
        if (special === SPECIAL.RAINBOW) return 4;
        if (special === SPECIAL.BOMB) return 3;
        return 2;
      };

      const chooseSpawn = (cells) => {
        if (Array.isArray(swapPair)) {
          for (const p of swapPair) {
            const key = this.keyOf(p);
            if (cells.some((cell) => this.keyOf(cell) === key)) return p;
          }
        }
        return cells[Math.floor(cells.length / 2)];
      };

      const setSpawn = (pos, special) => {
        const key = this.keyOf(pos);
        const current = priority.get(key) || 0;
        const next = getPriority(special);
        if (next >= current) {
          spawns.set(key, { special, baseType: this.board[pos.row][pos.col]?.type ?? 0 });
          priority.set(key, next);
        }
      };

      for (const group of matchInfo.groups) {
        if (group.length >= 5) {
          setSpawn(chooseSpawn(group.cells), SPECIAL.RAINBOW);
        }
      }

      for (const [key, meta] of matchInfo.cellMeta.entries()) {
        if (meta.h && meta.v) {
          setSpawn(this.parseKey(key), SPECIAL.BOMB);
        }
      }

      for (const group of matchInfo.groups) {
        if (group.length === 4) {
          setSpawn(chooseSpawn(group.cells), group.orientation === "h" ? SPECIAL.LINE_H : SPECIAL.LINE_V);
        }
      }

      return spawns;
    }

    applySpecialSpawns(spawns) {
      for (const [key, data] of spawns.entries()) {
        const { row, col } = this.parseKey(key);
        const baseType = this.board[row][col]?.type ?? data.baseType;
        this.board[row][col] = { type: baseType, special: data.special };
      }
    }

    clearMatches(clearSet) {
      for (const key of clearSet) {
        const { row, col } = this.parseKey(key);
        this.board[row][col] = null;
      }
    }

    applyGravityAndRefillWithDropMap() {
      const dropMap = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));

      for (let c = 0; c < this.cols; c++) {
        const kept = [];
        for (let r = 0; r < this.rows; r++) {
          if (this.board[r][c] !== null) kept.push({ tile: this.board[r][c], fromRow: r });
        }

        const missing = this.rows - kept.length;
        for (let r = 0; r < this.rows; r++) {
          let tile;
          let fromRow;

          if (r < missing) {
            tile = this.makeNormal(Math.floor(Math.random() * this.getActiveTileCount()));
            fromRow = r - missing;
          } else {
            const keptItem = kept[r - missing];
            tile = keptItem.tile;
            fromRow = keptItem.fromRow;
          }

          this.board[r][c] = tile;
          dropMap[r][c] = Math.max(0, r - fromRow);
        }
      }

      return dropMap;
    }

    swap(a, b) {
      const temp = this.board[a.row][a.col];
      this.board[a.row][a.col] = this.board[b.row][b.col];
      this.board[b.row][b.col] = temp;
    }

    getTileIconUrl(typeDef) {
      return `${TILE_ICON_BASE_URL}/${typeDef.iconFile}`;
    }

    getSpecialMarker(tile) {
      if (!tile.special) return "";
      if (tile.special === SPECIAL.RAINBOW) return "🌈";
      if (tile.special === SPECIAL.BOMB) return "💣";
      if (tile.special === SPECIAL.LINE_H) return "↔";
      if (tile.special === SPECIAL.LINE_V) return "↕";
      return "";
    }

    render(dropMap) {
      const frag = document.createDocumentFragment();

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.board[r][c];
          if (!cell) continue;

          const typeDef = TILE_TYPES[cell.type];
          const el = document.createElement("div");
          el.className = `tile ${typeDef.cls}`;
          if (cell.special) el.classList.add(`special-${cell.special}`);

          el.dataset.row = String(r);
          el.dataset.col = String(c);
          el.title = cell.special ? `${typeDef.name} (${cell.special})` : typeDef.name;

          const specialMarker = this.getSpecialMarker(cell);
          if (specialMarker) {
            const specialEmoji = document.createElement("span");
            specialEmoji.className = "tile-special-emoji";
            specialEmoji.textContent = specialMarker;
            specialEmoji.setAttribute("aria-label", `${cell.special} special`);
            el.appendChild(specialEmoji);
          } else {
            const icon = document.createElement("img");
            icon.className = "tile-icon";
            icon.src = this.getTileIconUrl(typeDef);
            icon.alt = typeDef.name;
            icon.loading = "lazy";
            icon.decoding = "async";
            el.appendChild(icon);
          }

          if (this.selected && this.selected.row === r && this.selected.col === c) {
            el.classList.add("is-selected");
          }
          if (this.clearSet.has(`${r},${c}`)) {
            el.classList.add("is-clearing");
          }
          if (dropMap && dropMap[r] && dropMap[r][c] > 0) {
            el.classList.add("is-falling");
            el.style.setProperty("--drop-rows", String(dropMap[r][c]));
            el.style.setProperty("--fall-delay", `${c * this.fallColumnDelayMs}ms`);
          }

          frag.appendChild(el);
        }
      }

      this.gridEl.innerHTML = "";
      this.gridEl.appendChild(frag);
    }

    updateScore(add) {
      this.score += add;
      this.updateHud();
    }

    updateHud() {
      if (this.scoreEl) {
        this.scoreEl.textContent = String(this.score).padStart(6, "0");
      }
      if (this.movesEl) {
        this.movesEl.textContent = String(this.moves).padStart(2, "0");
      }
      if (this.levelEl) {
        this.levelEl.textContent = String(this.level).padStart(2, "0");
      }
      if (this.targetEl) {
        const goalType = TILE_TYPES[this.goal.type];
        const iconUrl = this.getTileIconUrl(goalType);
        this.targetEl.innerHTML = `<img class="hud-target-icon" src="${iconUrl}" alt="${goalType.name}" /> ${this.goal.collected}/${this.goal.target}`;
      }
    }

    delay(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
  }

  window.Match3Game = Match3Game;
})();
