(function () {
  'use strict';

  const C = window.Chess;
  const AI = window.ChessAI;
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const SAVE_KEY = 'chess-uk-v1';

  const boardEl = document.getElementById('board');
  const statusTextEl = document.getElementById('statusText');
  const statusSubEl = document.getElementById('statusSub');
  const turnDotEl = document.getElementById('turnDot');
  const moveListEl = document.getElementById('moveList');
  const modeSegEl = document.getElementById('modeSeg');
  const difficultyEl = document.getElementById('difficulty');
  const btnNew = document.getElementById('btnNew');
  const btnUndo = document.getElementById('btnUndo');
  const btnFlip = document.getElementById('btnFlip');
  const btnSound = document.getElementById('btnSound');
  const btnPgn = document.getElementById('btnPgn');
  const gameOverEl = document.getElementById('gameOver');
  const overTitleEl = document.getElementById('overTitle');
  const overTextEl = document.getElementById('overText');
  const overNewEl = document.getElementById('overNew');
  const overCloseEl = document.getElementById('overClose');
  const promoOverlayEl = document.getElementById('promoOverlay');
  const promoOptionsEl = document.getElementById('promoOptions');
  const toastEl = document.getElementById('toast');
  const topStrip = document.getElementById('topStrip');
  const bottomStrip = document.getElementById('bottomStrip');
  const topAvatar = document.getElementById('topAvatar');
  const bottomAvatar = document.getElementById('bottomAvatar');
  const topName = document.getElementById('topName');
  const bottomName = document.getElementById('bottomName');
  const topCaptured = document.getElementById('topCaptured');
  const bottomCaptured = document.getElementById('bottomCaptured');

  const game = {
    state: C.initialState(),
    moves: [],
    keys: [C.stateKey(C.initialState())],
    lastMove: null
  };

  let selected = null;
  let selectedMoves = [];
  let status = { over: false, check: false };
  let flipped = false;
  let mode = 'ai';
  let difficulty = 2;
  let soundOn = true;
  let thinking = false;
  let aiToken = 0;
  let pendingPromotion = null;
  let cells = [];
  let toastTimer = null;
  let audioCtx = null;

  /* ---------- board rendering ---------- */

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const square = document.createElement('div');
        square.className = 'square';
        square.dataset.vr = String(vr);
        square.dataset.vc = String(vc);

        const piece = document.createElement('span');
        piece.className = 'piece';
        const file = document.createElement('span');
        file.className = 'coord file';
        const rank = document.createElement('span');
        rank.className = 'coord rank';

        square.append(piece, file, rank);
        boardEl.appendChild(square);
        cells.push({ square, piece, file, rank });
      }
    }
  }

  function rcFromView(vr, vc) {
    return flipped ? [7 - vr, 7 - vc] : [vr, vc];
  }

  function render() {
    const state = game.state;
    const targets = new Set();
    for (const m of selectedMoves) targets.add(m.to.r * 8 + m.to.c);
    const king = status.check ? C.findKing(state.board, state.turn) : null;

    for (let vi = 0; vi < 64; vi++) {
      const cell = cells[vi];
      const vr = (vi / 8) | 0;
      const vc = vi % 8;
      const rc = rcFromView(vr, vc);
      const r = rc[0];
      const c = rc[1];
      const idx = r * 8 + c;
      const p = state.board[idx];

      let cls = 'square ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      if (selected && selected.r === r && selected.c === c) cls += ' selected';
      if (game.lastMove && (
        (game.lastMove.from.r === r && game.lastMove.from.c === c) ||
        (game.lastMove.to.r === r && game.lastMove.to.c === c)
      )) cls += ' last';
      if (king && king.r === r && king.c === c) cls += ' check';
      if (targets.has(idx)) cls += p ? ' capture' : ' target';

      cell.square.className = cls;

      if (p) {
        cell.piece.textContent = GLYPHS[p[1]];
        cell.piece.className = 'piece ' + p[0];
      } else {
        cell.piece.textContent = '';
        cell.piece.className = 'piece';
      }

      cell.file.textContent = vr === 7 ? C.FILES[c] : '';
      cell.rank.textContent = vc === 0 ? String(8 - r) : '';
    }

    boardEl.classList.toggle('thinking', thinking);
  }

  /* ---------- move handling ---------- */

  function onSquareClick(r, c) {
    if (status.over || thinking || pendingPromotion) return;
    if (mode === 'ai' && game.state.turn !== 'w') return;

    const targetMove = selectedMoves.find(m => m.to.r === r && m.to.c === c);
    if (targetMove) {
      if (targetMove.promotion) {
        openPromotion(selectedMoves.filter(m => m.to.r === r && m.to.c === c));
        return;
      }
      playMove(targetMove);
      return;
    }

    const piece = game.state.board[r * 8 + c];

    if (!piece || piece[0] !== game.state.turn) {
      if (selected) {
        selected = null;
        selectedMoves = [];
        render();
      }
      return;
    }

    if (selected && selected.r === r && selected.c === c) {
      selected = null;
      selectedMoves = [];
      render();
      return;
    }

    selected = { r, c };
    selectedMoves = C.genLegalMoves(game.state).filter(m => m.from.r === r && m.from.c === c);
    render();
  }

  function playMove(move) {
    const legal = C.genLegalMoves(game.state);
    const san = C.toSAN(game.state, move, legal);
    const wasCapture = !!move.captured;

    game.moves.push({ move, san });
    game.state = C.applyMove(game.state, move);
    game.keys.push(C.stateKey(game.state));
    game.lastMove = move;

    selected = null;
    selectedMoves = [];
    pendingPromotion = null;
    hidePromotion();

    status = C.getStatus(game.state, game.keys);
    beep(status.check ? 'check' : (wasCapture ? 'capture' : 'move'));
    refresh();

    if (status.over) showGameOver();
    else if (mode === 'ai' && game.state.turn === 'b') scheduleAI();
  }

  function scheduleAI() {
    if (mode !== 'ai' || status.over || game.state.turn !== 'b') return;
    thinking = true;
    const token = ++aiToken;
    render();
    updateStatusUI();

    setTimeout(() => {
      if (token !== aiToken) return;

      let result = null;
      try {
        result = AI.chooseMove(game.state, difficulty);
      } catch (err) {
        console.error('AI error:', err);
      }
      if (token !== aiToken) return;

      thinking = false;
      if (!result || !result.move) {
        refresh();
        return;
      }

      const move = result.move;
      const legal = C.genLegalMoves(game.state);
      const san = C.toSAN(game.state, move, legal);
      const wasCapture = !!move.captured;

      game.moves.push({ move, san });
      game.state = C.applyMove(game.state, move);
      game.keys.push(C.stateKey(game.state));
      game.lastMove = move;

      status = C.getStatus(game.state, game.keys);
      beep(status.check ? 'check' : (wasCapture ? 'capture' : 'move'));
      refresh();

      if (status.over) showGameOver();
    }, 180);
  }

  /* ---------- game lifecycle ---------- */

  function newGame() {
    aiToken++;
    thinking = false;
    pendingPromotion = null;
    hidePromotion();
    hideGameOver();

    game.state = C.initialState();
    game.moves = [];
    game.keys = [C.stateKey(game.state)];
    game.lastMove = null;
    selected = null;
    selectedMoves = [];
    status = C.getStatus(game.state, game.keys);

    refresh();
  }

  function undo() {
    if (!game.moves.length) return;
    aiToken++;
    thinking = false;
    pendingPromotion = null;
    hidePromotion();
    hideGameOver();

    const popCount = (mode === 'ai' && game.state.turn === 'w') ? 2 : 1;
    for (let i = 0; i < popCount && game.moves.length; i++) game.moves.pop();

    let state = C.initialState();
    const keys = [C.stateKey(state)];
    for (const entry of game.moves) {
      state = C.applyMove(state, entry.move);
      keys.push(C.stateKey(state));
    }

    game.state = state;
    game.keys = keys;
    game.lastMove = game.moves.length ? game.moves[game.moves.length - 1].move : null;
    selected = null;
    selectedMoves = [];
    status = C.getStatus(state, keys);

    refresh();
  }

  function rebuildKeys() {
    let state = C.initialState();
    const keys = [C.stateKey(state)];
    for (const entry of game.moves) {
      state = C.applyMove(state, entry.move);
      keys.push(C.stateKey(state));
    }
    game.state = state;
    game.keys = keys;
    game.lastMove = game.moves.length ? game.moves[game.moves.length - 1].move : null;
  }

  /* ---------- side panels ---------- */

  function refresh() {
    render();
    renderMoves();
    updatePlayers();
    updateStatusUI();
    updateButtons();
    save();
  }

  function updateStatusUI() {
    if (status.over) {
      statusTextEl.textContent = resultTitle(status);
      statusSubEl.textContent = resultText(status);
    } else {
      const turnLabel = game.state.turn === 'w' ? 'Хід білих' : 'Хід чорних';
      statusTextEl.textContent = turnLabel + (status.check ? ' · шах' : '');
      if (mode === 'ai') {
        statusSubEl.textContent = thinking ? 'Комп\u2019ютер думає…' : (game.state.turn === 'w' ? 'Ваш хід' : 'Хід комп\u2019ютера');
      } else {
        statusSubEl.textContent = 'Гравець проти гравця';
      }
    }

    turnDotEl.classList.toggle('white', game.state.turn === 'w');
    turnDotEl.classList.toggle('black', game.state.turn === 'b');
    turnDotEl.classList.toggle('thinking', thinking);
  }

  function updateButtons() {
    btnUndo.disabled = !game.moves.length;
    difficultyEl.value = String(difficulty);
    btnSound.textContent = soundOn ? '🔊 Звук' : '🔇 Без звуку';
    for (const btn of modeSegEl.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
  }

  function sideName(color) {
    if (mode === 'ai') return color === 'w' ? 'Ви' : 'Комп\u2019ютер';
    return color === 'w' ? 'Білі' : 'Чорні';
  }

  function updatePlayers() {
    const bottomColor = flipped ? 'b' : 'w';
    const topColor = flipped ? 'w' : 'b';

    bottomAvatar.textContent = GLYPHS.k;
    bottomAvatar.className = 'avatar ' + bottomColor;
    topAvatar.textContent = GLYPHS.k;
    topAvatar.className = 'avatar ' + topColor;

    bottomName.textContent = sideName(bottomColor);
    topName.textContent = sideName(topColor);

    const captured = { w: [], b: [] };
    for (const entry of game.moves) {
      const cap = entry.move.captured;
      if (cap) captured[cap[0] === 'b' ? 'w' : 'b'].push(cap);
    }

    fillCaptured(bottomCaptured, captured[bottomColor]);
    fillCaptured(topCaptured, captured[topColor]);

    bottomStrip.classList.toggle('active', !status.over && game.state.turn === bottomColor);
    topStrip.classList.toggle('active', !status.over && game.state.turn === topColor);
  }

  function fillCaptured(el, pieces) {
    el.innerHTML = '';
    for (const p of pieces) {
      const span = document.createElement('span');
      span.className = p[0];
      span.textContent = GLYPHS[p[1]];
      el.appendChild(span);
    }
  }

  function renderMoves() {
    moveListEl.innerHTML = '';

    if (!game.moves.length) {
      const empty = document.createElement('div');
      empty.className = 'moves-empty';
      empty.textContent = 'Партія ще не почалась';
      moveListEl.appendChild(empty);
      return;
    }

    for (let i = 0; i < game.moves.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const no = document.createElement('span');
      no.className = 'move-no';
      no.textContent = (i / 2 + 1) + '.';

      const white = document.createElement('span');
      white.className = 'move-san';
      white.textContent = game.moves[i] ? game.moves[i].san : '';

      const black = document.createElement('span');
      black.className = 'move-san';
      black.textContent = game.moves[i + 1] ? game.moves[i + 1].san : '';

      row.append(no, white, black);
      moveListEl.appendChild(row);
    }

    const all = moveListEl.querySelectorAll('.move-san');
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].textContent) {
        all[i].classList.add('latest');
        break;
      }
    }

    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  /* ---------- overlays ---------- */

  function resultTitle(st) {
    if (st.type === 'checkmate') {
      if (mode === 'ai') return st.winner === 'w' ? 'Ви перемогли!' : 'Комп\u2019ютер переміг';
      return st.winner === 'w' ? 'Перемога білих' : 'Перемога чорних';
    }
    if (st.type === 'stalemate') return 'Пат';
    return 'Нічия';
  }

  function resultText(st) {
    switch (st.type) {
      case 'checkmate': return 'Король під матом — партію завершено.';
      case 'stalemate': return 'Немає доступних ходів, але король не під шахом.';
      case 'repetition': return 'Позиція повторилася тричі — нічия.';
      case 'fifty': return '50 ходів без взяття та ходу пішаком — нічия.';
      case 'material': return 'Недостатньо фігур для мату — нічия.';
      default: return '';
    }
  }

  function showGameOver() {
    overTitleEl.textContent = resultTitle(status);
    overTextEl.textContent = resultText(status);
    gameOverEl.classList.add('show');
  }

  function hideGameOver() {
    gameOverEl.classList.remove('show');
  }

  function openPromotion(moves) {
    pendingPromotion = moves;
    const color = game.state.turn;
    promoOptionsEl.innerHTML = '';

    for (const type of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-btn';
      btn.title = { q: 'Ферзь', r: 'Тура', b: 'Слон', n: 'Кінь' }[type];

      const glyph = document.createElement('span');
      glyph.className = 'piece ' + color;
      glyph.textContent = GLYPHS[type];

      btn.appendChild(glyph);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        choosePromotion(type);
      });
      promoOptionsEl.appendChild(btn);
    }

    promoOverlayEl.classList.add('show');
  }

  function hidePromotion() {
    promoOverlayEl.classList.remove('show');
  }

  function choosePromotion(type) {
    if (!pendingPromotion) return;
    const move = pendingPromotion.find(m => m.promotion === type);
    pendingPromotion = null;
    hidePromotion();
    if (move) playMove(move);
  }

  function cancelPromotion() {
    if (!pendingPromotion) return;
    pendingPromotion = null;
    hidePromotion();
    selected = null;
    selectedMoves = [];
    render();
  }

  /* ---------- sound ---------- */

  function beep(kind) {
    if (!soundOn) return;
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (kind === 'capture') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(78, t + 0.12);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.start(t);
        osc.stop(t + 0.18);
      } else if (kind === 'check') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.setValueAtTime(880, t + 0.09);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.24);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.exponentialRampToValueAtTime(210, t + 0.06);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.start(t);
        osc.stop(t + 0.1);
      }
    } catch (err) { /* ignore audio errors */ }
  }

  /* ---------- persistence ---------- */

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        state: game.state,
        moves: game.moves,
        keys: game.keys,
        lastMove: game.lastMove,
        mode,
        difficulty,
        flipped,
        soundOn
      }));
    } catch (err) { /* storage may be unavailable */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return false;
      if (!data.state || !Array.isArray(data.state.board) || data.state.board.length !== 64) return false;
      if (data.state.turn !== 'w' && data.state.turn !== 'b') return false;
      if (!data.state.castling || !Array.isArray(data.moves)) return false;

      game.state = data.state;
      game.moves = data.moves.filter(entry => entry && entry.move && entry.move.from && entry.move.to && typeof entry.san === 'string');
      mode = data.mode === 'pvp' ? 'pvp' : 'ai';
      difficulty = [1, 2, 3].includes(data.difficulty) ? data.difficulty : 2;
      flipped = !!data.flipped;
      soundOn = data.soundOn !== false;

      if (Array.isArray(data.keys) && data.keys.length === game.moves.length + 1) {
        game.keys = data.keys;
      } else {
        rebuildKeys();
      }
      game.lastMove = data.lastMove && data.lastMove.from ? data.lastMove : null;
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---------- utilities ---------- */

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* fall through */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  function copyPgn() {
    const result = status.over
      ? (status.type === 'checkmate' ? (status.winner === 'w' ? '1-0' : '0-1') : '1/2-1/2')
      : '*';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const head = [
      '[Event "Casual Game"]',
      '[Site "Local"]',
      '[Date "' + date + '"]',
      '[White "' + (mode === 'ai' ? 'Player' : 'White') + '"]',
      '[Black "' + (mode === 'ai' ? 'Chess AI' : 'Black') + '"]',
      '[Result "' + result + '"]',
      ''
    ];

    const body = [];
    for (let i = 0; i < game.moves.length; i += 2) {
      let chunk = (i / 2 + 1) + '. ' + game.moves[i].san;
      if (game.moves[i + 1]) chunk += ' ' + game.moves[i + 1].san;
      body.push(chunk);
    }

    const pgn = head.join('\n') + body.join(' ') + ' ' + result;
    copyText(pgn).then(ok => toast(ok ? 'PGN скопійовано' : 'Не вдалося скопіювати'));
  }

  /* ---------- events ---------- */

  boardEl.addEventListener('click', (e) => {
    const square = e.target.closest('.square');
    if (!square) return;
    const vr = parseInt(square.dataset.vr, 10);
    const vc = parseInt(square.dataset.vc, 10);
    const rc = rcFromView(vr, vc);
    onSquareClick(rc[0], rc[1]);
  });

  modeSegEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    if (mode !== 'ai') {
      aiToken++;
      thinking = false;
    }
    updateButtons();
    updatePlayers();
    updateStatusUI();
    save();
    if (mode === 'ai' && !status.over && game.state.turn === 'b') scheduleAI();
  });

  difficultyEl.addEventListener('change', () => {
    difficulty = parseInt(difficultyEl.value, 10) || 2;
    save();
  });

  btnNew.addEventListener('click', newGame);
  btnUndo.addEventListener('click', undo);

  btnFlip.addEventListener('click', () => {
    flipped = !flipped;
    render();
    updatePlayers();
    save();
  });

  btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    updateButtons();
    save();
    if (soundOn) beep('move');
  });

  btnPgn.addEventListener('click', copyPgn);
  overNewEl.addEventListener('click', newGame);
  overCloseEl.addEventListener('click', hideGameOver);

  promoOverlayEl.addEventListener('click', (e) => {
    if (e.target === promoOverlayEl) cancelPromotion();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (pendingPromotion) cancelPromotion();
      else hideGameOver();
    }
  });

  /* ---------- boot ---------- */

  function init() {
    buildBoard();
    const restored = load();
    if (!restored) {
      game.state = C.initialState();
      game.moves = [];
      game.keys = [C.stateKey(game.state)];
      game.lastMove = null;
    }
    status = C.getStatus(game.state, game.keys);
    selected = null;
    selectedMoves = [];
    thinking = false;

    refresh();

    if (status.over) showGameOver();
    else if (mode === 'ai' && game.state.turn === 'b') scheduleAI();
  }

  init();
})();
