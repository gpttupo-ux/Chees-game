(function (root) {
  'use strict';

  const Chess = root.Chess || (typeof require !== 'undefined' ? require('./engine.js') : null);

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;
  const MAX_QDEPTH = 4;

  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20
    ],
    ke: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50
    ]
  };

  let nodes = 0;

  function evaluate(state) {
    const board = state.board;
    let nonPawn = 0;
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      const t = p[1];
      if (t !== 'p' && t !== 'k') nonPawn += VALUE[t];
    }
    const endgame = nonPawn <= 1300;

    let score = 0;
    const bishops = { w: 0, b: 0 };
    const pawnFiles = {
      w: [0, 0, 0, 0, 0, 0, 0, 0],
      b: [0, 0, 0, 0, 0, 0, 0, 0]
    };

    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      const t = p[1];
      const color = p[0];
      const pi = color === 'w' ? i : 63 - i;
      let val = VALUE[t];

      if (t === 'k') val += (endgame ? PST.ke : PST.k)[pi];
      else val += (PST[t] || [0])[pi] || 0;

      score += color === 'w' ? val : -val;
      if (t === 'b') bishops[color]++;
      if (t === 'p') pawnFiles[color][i % 8]++;
    }

    if (bishops.w >= 2) score += 25;
    if (bishops.b >= 2) score -= 25;

    for (let f = 0; f < 8; f++) {
      if (pawnFiles.w[f] > 1) score -= 12 * (pawnFiles.w[f] - 1);
      if (pawnFiles.b[f] > 1) score += 12 * (pawnFiles.b[f] - 1);
    }

    return state.turn === 'w' ? score : -score;
  }

  function moveScore(state, move) {
    let s = 0;
    if (move.captured) {
      const victim = VALUE[move.captured[1]] || 0;
      const attacker = VALUE[state.board[move.from.r * 8 + move.from.c][1]] || 0;
      s += 1000 + victim * 10 - attacker;
    }
    if (move.promotion) s += 900 + (VALUE[move.promotion] || 0);
    if (move.castle) s += 40;
    return s;
  }

  function orderMoves(state, moves) {
    const scored = moves.map((m, i) => ({ m, i, s: moveScore(state, m) }));
    scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
    return scored.map(x => x.m);
  }

  function quiesce(state, alpha, beta, qdepth) {
    nodes++;
    const inCheck = Chess.isInCheck(state);

    if (!inCheck) {
      const stand = evaluate(state);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
    }

    if (qdepth >= MAX_QDEPTH) return inCheck ? evaluate(state) : alpha;

    let moves = Chess.genLegalMoves(state);
    if (!moves.length) return inCheck ? -MATE + 50 : 0;
    if (!inCheck) moves = moves.filter(m => m.captured || m.promotion);
    if (!moves.length) return alpha;

    moves = orderMoves(state, moves);
    for (const m of moves) {
      const score = -quiesce(Chess.applyMove(state, m), -beta, -alpha, qdepth + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(state, depth, alpha, beta, ply) {
    nodes++;
    if (depth <= 0) return quiesce(state, alpha, beta, 0);

    const moves = Chess.genLegalMoves(state);
    if (!moves.length) return Chess.isInCheck(state) ? -MATE + ply : 0;

    const ordered = orderMoves(state, moves);
    let best = -Infinity;

    for (const m of ordered) {
      const score = -search(Chess.applyMove(state, m), depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove(state, level) {
    const depth = Math.max(1, Math.min(3, parseInt(level, 10) || 2));
    nodes = 0;

    const rootMoves = Chess.genLegalMoves(state);
    if (!rootMoves.length) return { move: null, score: 0, nodes, depth };

    if (depth === 1 && Math.random() < 0.2) {
      const pick = rootMoves[(Math.random() * rootMoves.length) | 0];
      return { move: pick, score: 0, nodes, depth };
    }

    const ordered = orderMoves(state, rootMoves);
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of ordered) {
      let score = -search(Chess.applyMove(state, move), depth - 1, -Infinity, Infinity, 1);
      if (depth === 1) score += (Math.random() * 60 - 30);
      if (score > bestScore + 0.001) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) <= 0.001) {
        bestMoves.push(move);
      }
    }

    const pick = bestMoves[(Math.random() * bestMoves.length) | 0] || ordered[0];
    return { move: pick, score: bestScore, nodes, depth };
  }

  const ChessAI = { chooseMove, evaluate };
  root.ChessAI = ChessAI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ChessAI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
