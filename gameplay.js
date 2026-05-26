(function () {
  const TILE_TYPES = [
    { cls: "tile-soap", emoji: "🧼", name: "soap" },
    { cls: "tile-duck", emoji: "🦆", name: "duck" },
    { cls: "tile-plunger", emoji: "🪠", name: "plunger" },
    { cls: "tile-paper", emoji: "🧻", name: "paper" },
    { cls: "tile-brush", emoji: "🪥", name: "brush" },
    { cls: "tile-shampoo", emoji: "🧴", name: "shampoo" },
    { cls: "tile-toothbrush", emoji: "🧽", name: "toothbrush" },
  ];

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

    buildInitialBoard() {
      this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.board[r][c] = this.getSafeRandomType(r, c);
        }
      }

      // Hard guard: initial map must not contain any existing match.
      while (this.findMatches().size > 0) {
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            this.board[r][c] = this.getSafeRandomType(r, c);
          }
        }
      }
    }

    getSafeRandomType(r, c) {
      const banned = new Set();

      if (c >= 2 && this.board[r][c - 1] === this.board[r][c - 2]) {
        banned.add(this.board[r][c - 1]);
      }
      if (r >= 2 && this.board[r - 1][c] === this.board[r - 2][c]) {
        banned.add(this.board[r - 1][c]);
      }

      const candidates = [];
      for (let i = 0; i < TILE_TYPES.length; i++) {
        if (!banned.has(i)) {
          candidates.push(i);
        }
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
      const dr = Math.abs(a.row - b.row);
      const dc = Math.abs(a.col - b.col);
      return dr + dc === 1;
    }

    async trySwap(a, b) {
      this.isResolving = true;
      this.gridEl.classList.add("is-busy");

      this.swap(a, b);
      this.selected = null;
      this.render();

      await this.delay(100);

      const matches = this.findMatches();
      if (matches.size === 0) {
        this.swap(a, b);
        this.render();
        this.isResolving = false;
        this.gridEl.classList.remove("is-busy");
        return;
      }

      await this.resolveCascades();

      this.isResolving = false;
      this.gridEl.classList.remove("is-busy");
    }

    async resolveCascades() {
      let chain = 0;

      while (true) {
        const matches = this.findMatches();
        if (matches.size === 0) {
          this.clearSet.clear();
          this.render();
          break;
        }

        chain += 1;
        this.clearSet = matches;
        this.render();

        this.updateScore(matches.size * 20 * chain);

        // 1) Play clear animation first.
        await this.delay(this.clearAnimMs);

        this.clearMatches(matches);
        const dropMap = this.applyGravityAndRefillWithDropMap();

        this.clearSet.clear();
        // 2) Then play top-to-bottom falling/refill animation.
        this.render(dropMap);
        const staggerTailMs = this.fallColumnDelayMs * (this.cols - 1);
        await this.delay(this.fallAnimMs + staggerTailMs);
      }
    }

    findMatches() {
      const matches = new Set();

      for (let r = 0; r < this.rows; r++) {
        let start = 0;
        for (let c = 1; c <= this.cols; c++) {
          const same = c < this.cols && this.board[r][c] === this.board[r][start];
          if (!same) {
            const len = c - start;
            if (this.board[r][start] !== null && len >= 3) {
              for (let i = start; i < c; i++) {
                matches.add(`${r},${i}`);
              }
            }
            start = c;
          }
        }
      }

      for (let c = 0; c < this.cols; c++) {
        let start = 0;
        for (let r = 1; r <= this.rows; r++) {
          const same = r < this.rows && this.board[r][c] === this.board[start][c];
          if (!same) {
            const len = r - start;
            if (this.board[start][c] !== null && len >= 3) {
              for (let i = start; i < r; i++) {
                matches.add(`${i},${c}`);
              }
            }
            start = r;
          }
        }
      }

      return matches;
    }

    clearMatches(matches) {
      for (const key of matches) {
        const [r, c] = key.split(",").map(Number);
        this.board[r][c] = null;
      }
    }

    applyGravityAndRefillWithDropMap() {
      const dropMap = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));

      for (let c = 0; c < this.cols; c++) {
        const kept = [];
        for (let r = 0; r < this.rows; r++) {
          if (this.board[r][c] !== null) {
            kept.push({ value: this.board[r][c], fromRow: r });
          }
        }

        const missing = this.rows - kept.length;

        for (let r = 0; r < this.rows; r++) {
          let value;
          let fromRow;

          if (r < missing) {
            value = Math.floor(Math.random() * TILE_TYPES.length);
            fromRow = r - missing;
          } else {
            const keptItem = kept[r - missing];
            value = keptItem.value;
            fromRow = keptItem.fromRow;
          }

          this.board[r][c] = value;
          dropMap[r][c] = Math.max(0, r - fromRow);
        }
      }

      return dropMap;
    }

    swap(a, b) {
      const tmp = this.board[a.row][a.col];
      this.board[a.row][a.col] = this.board[b.row][b.col];
      this.board[b.row][b.col] = tmp;
    }

    render(dropMap) {
      const frag = document.createDocumentFragment();

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const typeIndex = this.board[r][c];
          const tile = TILE_TYPES[typeIndex];

          const el = document.createElement("div");
          el.className = `tile ${tile.cls}`;
          el.dataset.row = String(r);
          el.dataset.col = String(c);
          el.title = tile.name;
          el.textContent = tile.emoji;

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
