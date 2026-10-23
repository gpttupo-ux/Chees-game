(function (root) {
  'use strict';

  const FILES = 'abcdefgh';
  const PROMOTIONS = ['q', 'r', 'b', 'n'];

  const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_OFFSETS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);

  function onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function index(r, c) { return r * 8 + c; }
  function sqName(r, c) { return FILES[c] + (8 - r); }

  function initialState() {
    const board = new Array(64).fill(null);
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
      board[index(0, c)] = 'b' + back[c];
      board[index(1, c)] = 'bp';
      board[index(6, c)] = 'wp';
      board[index(7, c)] = 'w' + back[c];
    }
    return {
      board,
      turn: 'w',
      castling: { K: true, Q: true, k: true, q: true },
      ep: null,
      halfmove: 0,
      fullmove: 1
    };
  }

  function findKing(board, color) {
    const target = color + 'k';
    for (let i = 0; i < 64; i++) {
      if (board[i] === target) return { r: (i / 8) | 0, c: i % 8 };
    }
    return null;
  }

  function isSquareAttacked(board, r, c, by) {
    const pawnRow = by === 'w' ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      const pc = c + dc;
      if (onBoard(pawnRow, pc) && board[index(pawnRow, pc)] === by + 'p') return true;
    }
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const nr = r + dr, nc = c + dc;
      if (onBoard(nr, nc) && board[index(nr, nc)] === by + 'n') return true;
    }
    for (const [dr, dc] of KING_OFFSETS) {
      const nr = r + dr, nc = c + dc;
      if (onBoard(nr, nc) && board[index(nr, nc)] === by + 'k') return true;
    }
    for (const [dr, dc] of ROOK_DIRS) {
      let nr = r + dr, nc = c + dc;
      while (onBoard(nr, nc)) {
        const p = board[index(nr, nc)];
        if (p) {
          if (p[0] === by && (p[1] === 'r' || p[1] === 'q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_DIRS) {
      let nr = r + dr, nc = c + dc;
      while (onBoard(nr, nc)) {
        const p = board[index(nr, nc)];
        if (p) {
          if (p[0] === by && (p[1] === 'b' || p[1] === 'q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  function genPseudoMoves(state, color) {
    const board = state.board;
    const side = color || state.turn;
    const enemy = side === 'w' ? 'b' : 'w';
    const moves = [];

    const add = (from, to, opts) => {
      const target = board[index(to.r, to.c)];
      moves.push({
        from,
        to,
        captured: opts && opts.ep ? enemy + 'p' : (target || null),
        promotion: opts && opts.promotion ? opts.promotion : null,
        castle: opts && opts.castle ? opts.castle : null,
        ep: !!(opts && opts.ep)
      });
    };

    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (!piece || piece[0] !== side) continue;
      const r = (i / 8) | 0, c = i % 8;
      const type = piece[1];

      if (type === 'p') {
        const dir = side === 'w' ? -1 : 1;
        const startRow = side === 'w' ? 6 : 1;
        const promoRow = side === 'w' ? 0 : 7;
        const one = r + dir;

        if (onBoard(one, c) && !board[index(one, c)]) {
          if (one === promoRow) {
            for (const p of PROMOTIONS) add({ r, c }, { r: one, c }, { promotion: p });
          } else {
            add({ r, c }, { r: one, c });
            const two = r + 2 * dir;
            if (r === startRow && !board[index(two, c)]) add({ r, c }, { r: two, c });
          }
        }

        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!onBoard(one, nc)) continue;
          const target = board[index(one, nc)];
          if (target && target[0] === enemy) {
            if (one === promoRow) {
              for (const p of PROMOTIONS) add({ r, c }, { r: one, c: nc }, { promotion: p });
            } else {
              add({ r, c }, { r: one, c: nc });
            }
          } else if (!target && state.ep && state.ep.r === one && state.ep.c === nc) {
            add({ r, c }, { r: one, c: nc }, { ep: true });
          }
        }
      } else if (type === 'n' || type === 'k') {
        const offsets = type === 'n' ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (const [dr, dc] of offsets) {
          const nr = r + dr, nc = c + dc;
          if (!onBoard(nr, nc)) continue;
          const target = board[index(nr, nc)];
          if (target && target[0] === side) continue;
          add({ r, c }, { r: nr, c: nc });
        }
      } else {
        const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : QUEEN_DIRS;
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (onBoard(nr, nc)) {
            const target = board[index(nr, nc)];
            if (target) {
              if (target[0] === enemy) add({ r, c }, { r: nr, c: nc });
              break;
            }
            add({ r, c }, { r: nr, c: nc });
            nr += dr; nc += dc;
          }
        }
      }
    }

    const row = side === 'w' ? 7 : 0;
    const kRight = side === 'w' ? 'K' : 'k';
    const qRight = side === 'w' ? 'Q' : 'q';
    if (board[index(row, 4)] === side + 'k') {
      if (state.castling[kRight] && board[index(row, 7)] === side + 'r' &&
          !board[index(row, 5)] && !board[index(row, 6)] &&
          !isSquareAttacked(board, row, 4, enemy) && !isSquareAttacked(board, row, 5, enemy)) {
        add({ r: row, c: 4 }, { r: row, c: 6 }, { castle: 'K' });
      }
      if (state.castling[qRight] && board[index(row, 0)] === side + 'r' &&
          !board[index(row, 1)] && !board[index(row, 2)] && !board[index(row, 3)] &&
          !isSquareAttacked(board, row, 4, enemy) && !isSquareAttacked(board, row, 3, enemy)) {
        add({ r: row, c: 4 }, { r: row, c: 2 }, { castle: 'Q' });
      }
    }

    return moves;
  }

  function applyMove(state, move) {
    const board = state.board.slice();
    const from = index(move.from.r, move.from.c);
    const to = index(move.to.r, move.to.c);
    const piece = board[from];
    const color = piece[0];
    const type = piece[1];

    board[from] = null;
    if (move.ep) board[index(move.from.r, move.to.c)] = null;
    board[to] = move.promotion ? color + move.promotion : piece;

    if (move.castle) {
      const row = move.from.r;
      if (move.castle === 'K') {
        board[index(row, 7)] = null;
        board[index(row, 5)] = color + 'r';
      } else {
        board[index(row, 0)] = null;
        board[index(row, 3)] = color + 'r';
      }
    }

    let castling = state.castling;
    const drop = (key) => {
      if (castling[key]) {
        if (castling === state.castling) castling = Object.assign({}, state.castling);
        castling[key] = false;
      }
    };
    if (type === 'k') {
      if (color === 'w') { drop('K'); drop('Q'); }
      else { drop('k'); drop('q'); }
    }
    if (type === 'r') {
      const f = move.from;
      if (f.r === 7 && f.c === 0) drop('Q');
      if (f.r === 7 && f.c === 7) drop('K');
      if (f.r === 0 && f.c === 0) drop('q');
      if (f.r === 0 && f.c === 7) drop('k');
    }
    if (move.to.r === 7 && move.to.c === 0) drop('Q');
    if (move.to.r === 7 && move.to.c === 7) drop('K');
    if (move.to.r === 0 && move.to.c === 0) drop('q');
    if (move.to.r === 0 && move.to.c === 7) drop('k');

    const isPawn = type === 'p';
    const halfmove = (isPawn || move.captured) ? 0 : state.halfmove + 1;
    const ep = (isPawn && Math.abs(move.to.r - move.from.r) === 2)
      ? { r: (move.to.r + move.from.r) / 2, c: move.from.c }
      : null;

    return {
      board,
      turn: color === 'w' ? 'b' : 'w',
      castling,
      ep,
      halfmove,
      fullmove: state.fullmove + (color === 'b' ? 1 : 0)
    };
  }

  function genLegalMoves(state) {
    const color = state.turn;
    const enemy = color === 'w' ? 'b' : 'w';
    const legal = [];
    for (const move of genPseudoMoves(state, color)) {
      const next = applyMove(state, move);
      const king = findKing(next.board, color);
      if (!king) continue;
      if (!isSquareAttacked(next.board, king.r, king.c, enemy)) legal.push(move);
    }
    return legal;
  }

  function isInCheck(state) {
    const king = findKing(state.board, state.turn);
    if (!king) return false;
    return isSquareAttacked(state.board, king.r, king.c, state.turn === 'w' ? 'b' : 'w');
  }

  function stateKey(state) {
    const c = state.castling;
    return state.board.map(p => p || '.').join('') +
      '|' + state.turn +
      '|' + (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') +
      '|' + (state.ep ? state.ep.r + ',' + state.ep.c : '-');
  }

  function toSAN(state, move, legalMoves) {
    const piece = state.board[index(move.from.r, move.from.c)];
    const type = piece[1];
    let san = '';

    if (move.castle) {
      san = move.castle === 'K' ? 'O-O' : 'O-O-O';
    } else {
      if (type === 'p') {
        if (move.captured) san += FILES[move.from.c] + 'x';
      } else {
        san += type.toUpperCase();
        const legal = legalMoves || genLegalMoves(state);
        const rivals = legal.filter(m =>
          m.from.r !== move.from.r || m.from.c !== move.from.c
        ).filter(m =>
          m.to.r === move.to.r && m.to.c === move.to.c &&
          state.board[index(m.from.r, m.from.c)] === piece
        );
        if (rivals.length) {
          const sameFile = rivals.some(m => m.from.c === move.from.c);
          const sameRank = rivals.some(m => m.from.r === move.from.r);
          if (!sameFile) san += FILES[move.from.c];
          else if (!sameRank) san += String(8 - move.from.r);
          else san += FILES[move.from.c] + String(8 - move.from.r);
        }
        if (move.captured) san += 'x';
      }
      san += sqName(move.to.r, move.to.c);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    }

    const next = applyMove(state, move);
    const replies = genLegalMoves(next);
    if (isInCheck(next)) san += replies.length ? '+' : '#';
    return san;
  }

  function isInsufficientMaterial(board) {
    const pieces = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p || p[1] === 'k') continue;
      if (p[1] === 'p' || p[1] === 'r' || p[1] === 'q') return false;
      pieces.push({ color: p[0], type: p[1], square: (i / 8) | 0, file: i % 8 });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1) return true;
    if (pieces.length === 2 && pieces[0].type === 'b' && pieces[1].type === 'b') {
      const a = pieces[0], b = pieces[1];
      if (a.color !== b.color) {
        const aDark = (a.square + a.file) % 2 === 0;
        const bDark = (b.square + b.file) % 2 === 0;
        return aDark === bDark;
      }
    }
    return false;
  }

  function getStatus(state, keys) {
    const moves = genLegalMoves(state);
    const check = isInCheck(state);

    if (!moves.length) {
      if (check) {
        return { over: true, type: 'checkmate', check: true, winner: state.turn === 'w' ? 'b' : 'w' };
      }
      return { over: true, type: 'stalemate', check: false };
    }
    if (isInsufficientMaterial(state.board)) return { over: true, type: 'material', check };
    if (state.halfmove >= 100) return { over: true, type: 'fifty', check };
    if (keys && keys.length) {
      const key = stateKey(state);
      let count = 0;
      for (const k of keys) if (k === key) count++;
      if (count >= 3) return { over: true, type: 'repetition', check };
    }
    return { over: false, check, moves };
  }

  const Chess = {
    FILES,
    PROMOTIONS,
    initialState,
    findKing,
    isSquareAttacked,
    genPseudoMoves,
    genLegalMoves,
    applyMove,
    isInCheck,
    stateKey,
    toSAN,
    isInsufficientMaterial,
    getStatus,
    onBoard,
    index,
    sqName
  };

  root.Chess = Chess;
  if (typeof module !== 'undefined' && module.exports) module.exports = Chess;
})(typeof globalThis !== 'undefined' ? globalThis : this);
