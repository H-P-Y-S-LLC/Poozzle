(function () {
  const TILE_TYPES = [
    { cls: "tile-fly", emoji: "🪰", name: "苍蝇" },
    { cls: "tile-poop", emoji: "💩", name: "屎" },
    { cls: "tile-plunger", emoji: "🪠", name: "皮搋子" },
    { cls: "tile-maggot", emoji: "🐛", name: "肉虫子" },
    { cls: "tile-paper", emoji: "🧻", name: "卫生纸" },
  ];

  const SPECIAL = {
    LINE_H: "line-h",
    LINE_V: "line-v",
    BOMB: "bomb",
    RAINBOW: "rainbow",
  };

  class Match3Game {
    constructor(options) {
      this.rows = options.rows || 6;
      this.cols = options.cols || 6;
      this.gridEl = document.getElementById(options.gridId || "game-grid");
      this.scoreEl = document.getElementById(options.scoreId || "score-display");

      this.board = [];
      this.score = 0;
      this.isResolving = false;
      this.selected = null;
      this.clearSet = new Set();

      this.clearAnimMs = 220;
      this.fallAnimMs = 260;
      this.fallColumnDelayMs = 26;

      this.onGridClick = this.onGridClick.bind(this);
    }

    init() {
      if (!this.gridEl) return;
      this.buildInitialBoard();
      this.render();
      this.updateScore(0);
      this.gridEl.addEventListener("click", this.onGridClick);
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
      for (let i = 0; i < TILE_TYPES.length; i++) {
        if (!banned.has(i)) candidates.push(i);
      }

      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    onGridClick(event) {
      if (this.isResolving) return;

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

      this.swap(a, b);
      this.selected = null;
      this.render();

      await this.delay(100);

      const tileA = this.board[a.row][a.col];
      const tileB = this.board[b.row][b.col];
      const rainbowPair = this.getRainbowSwapPair(a, b, tileA, tileB);

      if (rainbowPair) {
        await this.resolveRainbowSwap(rainbowPair);
        this.isResolving = false;
        this.gridEl.classList.remove("is-busy");
        return;
      }

      const matchInfo = this.findMatchInfo();
      if (matchInfo.matchSet.size === 0) {
        this.swap(a, b);
        this.render();
        this.isResolving = false;
        this.gridEl.classList.remove("is-busy");
        return;
      }

      await this.resolveCascades({ swapPair: [a, b] });

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

      const clearSet = this.getSpecialClearSet(pos, tile.special);
      await this.resolveForcedClear(clearSet, 25);

      this.isResolving = false;
      this.gridEl.classList.remove("is-busy");
    }

    getSpecialClearSet(pos, special) {
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
      this.updateScore(clearSet.size * pointPerCell);

      await this.delay(this.clearAnimMs);

      this.clearMatches(clearSet);
      const dropMap = this.applyGravityAndRefillWithDropMap();

      this.clearSet.clear();
      this.render(dropMap);
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
        this.updateScore(matchInfo.matchSet.size * 20 * chain);

        await this.delay(this.clearAnimMs);

        this.clearMatches(clearSet);
        this.applySpecialSpawns(specialSpawns);

        const dropMap = this.applyGravityAndRefillWithDropMap();
        this.clearSet.clear();
        this.render(dropMap);

        await this.delay(this.fallAnimMs + this.fallColumnDelayMs * (this.cols - 1));
      }
    }

    findMatchInfo() {
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
          const leftType = this.getTileTypeForMatch(this.board[r][start]);
          const currType = c < this.cols ? this.getTileTypeForMatch(this.board[r][c]) : null;
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
          const topType = this.getTileTypeForMatch(this.board[start][c]);
          const currType = r < this.rows ? this.getTileTypeForMatch(this.board[r][c]) : null;
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
            tile = this.makeNormal(Math.floor(Math.random() * TILE_TYPES.length));
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

    getDisplayEmoji(tile, typeDef) {
      if (!tile.special) return typeDef.emoji;
      if (tile.special === SPECIAL.RAINBOW) return "🌈";
      if (tile.special === SPECIAL.BOMB) return "💣";
      if (tile.special === SPECIAL.LINE_H) return "↔";
      if (tile.special === SPECIAL.LINE_V) return "↕";
      return typeDef.emoji;
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
          el.textContent = this.getDisplayEmoji(cell, typeDef);

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
      if (this.scoreEl) {
        this.scoreEl.textContent = String(this.score).padStart(6, "0");
      }
    }

    delay(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
  }

  window.Match3Game = Match3Game;
})();
