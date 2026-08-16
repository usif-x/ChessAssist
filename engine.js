// --- LEGACY ENGINE RESTORED + PROMOTION SUPPORT + LICHESS SUPPORT ---

// --- SITE DETECTION ---
const IS_LICHESS = location.hostname.includes('lichess.org');
const IS_CHESSCOM = location.hostname.includes('chess.com');

// --- HELPERS ---
const pieceToFen = {
    'wp': 'P', 'wn': 'N', 'wb': 'B', 'wr': 'R', 'wq': 'Q', 'wk': 'K',
    'bp': 'p', 'bn': 'n', 'bb': 'b', 'br': 'r', 'bq': 'q', 'bk': 'k'
};
const colToNum = { 'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, 'f': 6, 'g': 7, 'h': 8 };

// Lichess piece roles -> FEN letters
const LICHESS_ROLE_TO_FEN = { 'pawn': 'p', 'knight': 'n', 'bishop': 'b', 'rook': 'r', 'queen': 'q', 'king': 'k' };
const LICHESS_ROLES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[ChessEngine] ${msg}`); }

// Valid UCI like "e2e4" or "e7e8q"
function isValidUci(uci) {
    return typeof uci === 'string' && /^[a-h][1-8][a-h][1-8][nbrqNBRQ]?$/.test(uci);
}

// --- DOM UTILS ---
function getBoard() {
    if (IS_LICHESS) return document.querySelector('cg-board');
    return document.querySelector('wc-chess-board') || document.querySelector('.board') || document.querySelector('chess-board');
}

// Whether the board is shown from black's perspective
function boardIsFlipped() {
    if (IS_LICHESS) {
        const wrap = document.querySelector('.cg-wrap');
        return !!wrap && wrap.classList.contains('orientation-black');
    }
    const board = getBoard();
    return !!board && board.classList.contains('flipped');
}

function getSquareRect(square) {
    const board = getBoard();
    if (!board) return null;

    const rect = board.getBoundingClientRect();
    const size = rect.width / 8;
    const isFlipped = boardIsFlipped();

    const file = colToNum[square[0]];
    const rank = parseInt(square[1]);

    let x, y;
    if (isFlipped) {
        x = (8 - file) * size;
        y = (rank - 1) * size;
    } else {
        x = (file - 1) * size;
        y = (8 - rank) * size;
    }

    return {
        centerX: rect.left + x + size / 2,
        centerY: rect.top + y + size / 2
    };
}

function algToSquareClass(sq) {
    return `square-${colToNum[sq[0]]}${sq[1]}`;
}

function getPieceElementOnSquare(sq) {
    const cls = algToSquareClass(sq);
    return document.querySelector(`.piece.${cls}`);
}

function isMyPieceOnSquare(sq) {
    if (IS_LICHESS) {
        const grid = getLichessGrid();
        if (!grid) return false;
        const file = colToNum[sq[0]] - 1;
        const rank = parseInt(sq[1]);
        const ch = grid[8 - rank][file];
        if (!ch) return false;
        const my = getMyColor();
        return my === 'w' ? ch === ch.toUpperCase() : ch === ch.toLowerCase();
    }

    const el = getPieceElementOnSquare(sq);
    if (!el) return false;
    const my = getMyColor();
    return el.classList.contains(`${my}p`) ||
        el.classList.contains(`${my}n`) ||
        el.classList.contains(`${my}b`) ||
        el.classList.contains(`${my}r`) ||
        el.classList.contains(`${my}q`) ||
        el.classList.contains(`${my}k`);
}

// --- FEN & STATE ---
function getMyColor() {
    if (IS_LICHESS) {
        const wrap = document.querySelector('.cg-wrap');
        if (wrap && wrap.classList.contains('orientation-black')) return 'b';
        return 'w';
    }
    const board = getBoard();
    if (!board) return 'w';
    return board.classList.contains('flipped') ? 'b' : 'w';
}

// Determine which color is to move
function getActiveColor() {
    if (IS_LICHESS) return getLichessActiveColor();

    let sideToMove = "w";
    const highlights = document.querySelectorAll('.highlight');
    for (let hl of highlights) {
        const hlClass = Array.from(hl.classList).find(c => c.startsWith('square-'));
        if (hlClass) {
            const squareNum = hlClass.split('-')[1];
            const piece = document.querySelector(`.piece.square-${squareNum}`);
            if (piece) {
                const pClasses = Array.from(piece.classList);
                if (pClasses.some(c => c.startsWith('w'))) { sideToMove = "b"; break; }
                else if (pClasses.some(c => c.startsWith('b'))) { sideToMove = "w"; break; }
            }
        }
    }
    return sideToMove;
}

// --- LICHESS SPECIFIC ---

// Returns an 8x8 array (row 0 = rank 8, col 0 = a-file) of FEN letters or null
function getLichessGrid() {
    const board = getBoard();
    if (!board) return null;
    const pieces = board.querySelectorAll('piece');
    if (!pieces.length) return null;

    const boardRect = board.getBoundingClientRect();
    const size = boardRect.width / 8;
    const flipped = boardIsFlipped();

    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    pieces.forEach(p => {
        const isWhite = p.classList.contains('white');
        const isBlack = p.classList.contains('black');
        if (!isWhite && !isBlack) return;
        let role = null;
        for (const r of LICHESS_ROLES) {
            if (p.classList.contains(r)) { role = r; break; }
        }
        if (!role) return;
        const sq = lichessPieceSquare(p, boardRect, size, flipped);
        if (!sq) return;
        const ch = LICHESS_ROLE_TO_FEN[role];
        grid[8 - sq.rank][sq.file] = isWhite ? ch.toUpperCase() : ch;
    });
    return grid;
}

// Derive a piece's board square (file 0..7 a->h, rank 1..8) from its DOM position.
function lichessPieceSquare(pieceEl, boardRect, size, flipped) {
    let col, rowTop;

    const st = pieceEl.style && pieceEl.style.transform;
    if (st && st.includes('translate')) {
        const m = st.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
        if (m) {
            col = Math.round(parseFloat(m[1]) / size);
            rowTop = Math.round(parseFloat(m[2]) / size);
        }
    }
    if (col === undefined && pieceEl.style && pieceEl.style.top && pieceEl.style.top.includes('%')) {
        col = Math.round(parseFloat(pieceEl.style.left) / 12.5);
        rowTop = Math.round(parseFloat(pieceEl.style.top) / 12.5);
    }
    if (col === undefined) {
        const r = pieceEl.getBoundingClientRect();
        col = Math.floor((r.left + r.width / 2 - boardRect.left) / size);
        rowTop = Math.floor((r.top + r.height / 2 - boardRect.top) / size);
    }

    if (col === undefined || rowTop === undefined) return null;
    col = Math.max(0, Math.min(7, col));
    rowTop = Math.max(0, Math.min(7, rowTop));

    let file, rank;
    if (flipped) {
        file = 7 - col;
        rank = rowTop + 1;
    } else {
        file = col;
        rank = 8 - rowTop;
    }
    return { file, rank };
}

function getLichessActiveColor() {
    // 1. Live game: the ticking clock belongs to the side to move.
    const running = document.querySelector('.rclock.running');
    if (running) {
        if (running.classList.contains('rclock-white')) return 'w';
        if (running.classList.contains('rclock-black')) return 'b';
    }

    // 2. Fallback: infer from the piece that made the last move.
    const board = getBoard();
    if (board) {
        const grid = getLichessGrid();
        const lms = board.querySelectorAll('square.last-move');
        if (lms.length && grid) {
            const boardRect = board.getBoundingClientRect();
            const size = boardRect.width / 8;
            const flipped = boardIsFlipped();
            for (let i = lms.length - 1; i >= 0; i--) {
                const r = lms[i].getBoundingClientRect();
                let col = Math.floor((r.left + r.width / 2 - boardRect.left) / size);
                let rowTop = Math.floor((r.top + r.height / 2 - boardRect.top) / size);
                col = Math.max(0, Math.min(7, col));
                rowTop = Math.max(0, Math.min(7, rowTop));
                let file, rank;
                if (flipped) { file = 7 - col; rank = rowTop + 1; }
                else { file = col; rank = 8 - rowTop; }
                const ch = grid[8 - rank] && grid[8 - rank][file];
                if (ch) return ch === ch.toUpperCase() ? 'b' : 'w';
            }
        }
    }

    return 'w';
}

function getLichessFEN() {
    const grid = getLichessGrid();
    if (!grid) return null;
    const rows = grid.map(row => {
        let s = "", empty = 0;
        for (const c of row) {
            if (c === null) empty++;
            else {
                if (empty) { s += empty; empty = 0; }
                s += c;
            }
        }
        if (empty) s += empty;
        return s;
    });
    return rows.join('/') + ` ${getLichessActiveColor()} - - 0 1`;
}

// --- FEN & ENGINE ---
function getFEN() {
    if (IS_LICHESS) return getLichessFEN();

    const pieces = document.querySelectorAll('.piece');
    if (pieces.length === 0) return null;

    let board = Array(8).fill(null).map(() => Array(8).fill(null));
    pieces.forEach(piece => {
        const classes = Array.from(piece.classList);
        const typeClass = classes.find(c => pieceToFen[c]);
        const squareClass = classes.find(c => c.startsWith('square-'));
        if (typeClass && squareClass) {
            const coords = squareClass.split('-')[1];
            board[8 - parseInt(coords[1])][parseInt(coords[0]) - 1] = pieceToFen[typeClass];
        }
    });

    let fenRows = [];
    for (let r = 0; r < 8; r++) {
        let empty = 0; let rowStr = "";
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === null) empty++;
            else {
                if (empty > 0) { rowStr += empty; empty = 0; }
                rowStr += board[r][c];
            }
        }
        if (empty > 0) rowStr += empty;
        fenRows.push(rowStr);
    }
    const side = getActiveColor();
    return fenRows.join('/') + ` ${side} - - 0 1`;
}

// --- LOCAL STOCKFISH (bundled WASM engine, runs in a Web Worker) ---
const LocalEngine = (() => {
    let worker = null;
    let ready = false;
    let failed = false;
    let initPromise = null;
    let pending = null; // { matcher, info: [] }
    let opChain = Promise.resolve();

    function handle(line) {
        line = String(line == null ? '' : line);
        if (!pending) return;
        if (line.startsWith('info ')) { pending.info.push(line); return; }
        if (pending.matcher(line)) {
            const p = pending;
            pending = null;
            p.resolve({ line, info: p.info });
        }
    }

    function wait(matcher, timeoutMs) {
        return new Promise((resolve, reject) => {
            const p = { matcher, resolve, reject, info: [] };
            pending = p;
            setTimeout(() => {
                if (pending === p) { pending = null; reject(new Error('Local engine timeout')); }
            }, timeoutMs || 30000);
        });
    }

    function withTimeout(p, ms, msg) {
        return Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
        ]);
    }

    function toBase64(bytes) {
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
    }

    async function init() {
        if (ready) return true;
        if (failed) return false;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            try {
                if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
                    throw new Error('no chrome runtime');
                }
                // Load the WASM build (much faster than the asm.js fallback).
                const [loader, wasmBuf] = await Promise.all([
                    withTimeout(
                        fetch(chrome.runtime.getURL('stockfish.wasm.js')).then(r => {
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            return r.text();
                        }),
                        8000, 'stockfish.wasm.js fetch timeout'
                    ),
                    withTimeout(
                        fetch(chrome.runtime.getURL('stockfish.wasm')).then(r => {
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            return r.arrayBuffer();
                        }),
                        8000, 'stockfish.wasm fetch timeout'
                    )
                ]);

                // Embed the WASM directly via Module.wasmBinary (bypasses any
                // fetch/relative-URL resolution inside the blob worker).
                const b64 = toBase64(new Uint8Array(wasmBuf));
                const inject = `wasmBinary:(function(){var b=atob("${b64}");var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;})(),`;
                const patched = loader.replace(
                    '{locateFile:function(e){return e},',
                    '{' + inject + 'locateFile:function(e){return e},'
                );

                const blob = new Blob([patched], { type: 'text/javascript' });
                worker = new Worker(URL.createObjectURL(blob));
                worker.onmessage = e => handle(e.data);
                worker.onerror = () => {
                    failed = true;
                    ready = false;
                    // Fail the current wait fast so callers can fall back instead of hanging.
                    if (pending) { const p = pending; pending = null; p.reject(new Error('worker error')); }
                };
                worker.postMessage('uci');
                await wait(l => l === 'uciok', 15000);
                worker.postMessage('setoption name Hash value 16'); // leave headroom in the 32MB memory
                worker.postMessage('isready');
                await wait(l => l === 'readyok', 15000);
                ready = true;
                log('Local Stockfish ready (WASM)');
                return true;
            } catch (e) {
                console.error('[ChessEngine] local engine init failed:', e);
                failed = true;
                return false;
            }
        })();
        return initPromise;
    }

    function parseInfo(infoLines) {
        const latest = new Map(); // multipv -> move
        for (const line of infoLines) {
            const pv = line.match(/ pv ([a-h][1-8][a-h][1-8][nbrqNBRQ]?)/);
            if (!pv) continue;
            const mpvMatch = line.match(/multipv (\d+)/);
            const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1; // no "multipv" when MultiPV=1
            const uci = pv[1];
            let isMate = false, mateIn = null, score = null;
            const mate = line.match(/score mate ([-\d]+)/);
            const cp = line.match(/score cp ([-\d]+)/);
            if (mate) { isMate = true; mateIn = parseInt(mate[1], 10); }
            else if (cp) { score = parseInt(cp[1], 10); }
            latest.set(mpv, { multipv: mpv, uci, score, isMate, mateIn });
        }
        return [...latest.values()]
            .sort((a, b) => a.multipv - b.multipv)
            .map(m => ({ uci: m.uci, san: m.uci, score: m.score, winrate: null, isMate: m.isMate, mateIn: m.mateIn }));
    }

    async function searchInternal(fen, depth, count) {
        const ok = await init();
        if (!ok) return [];
        try {
            worker.postMessage('stop'); // cancel any leftover search (no-op if idle)
            worker.postMessage('ucinewgame'); // clear TT => deterministic result for the same FEN
            worker.postMessage('setoption name MultiPV value ' + count);
            worker.postMessage('position fen ' + fen);
            const p = wait(l => l.startsWith('bestmove '), 60000);
            worker.postMessage('go depth ' + depth);
            const res = await p;
            return parseInfo(res.info);
        } catch (e) {
            try { worker.postMessage('stop'); } catch (_) {}
            console.error('[ChessEngine] local search error:', e);
            return [];
        }
    }

    // Serialize searches so concurrent callers don't overlap UCI commands.
    function search(fen, depth, count = 1) {
        const run = () => searchInternal(fen, depth, count);
        const p = opChain.then(run, run);
        opChain = p.then(() => {}, () => {});
        return p;
    }

    return { init, search, isReady: () => ready, isFailed: () => failed };
})();

// --- ENGINE QUERIES ---

async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

// ChessDB returns multiple moves with evaluations (score in centipawns,
// from the side-to-move's perspective). Fast when the position is in its DB,
// but returns "unknown" for novel positions.
async function fetchChessdbTopMoves(fen, count = 3) {
    if (!fen) return [];
    try {
        const url = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(fen)}&json=1`;
        const data = await fetchJson(url, 4000);
        if (data && data.status === 'ok' && Array.isArray(data.moves) && data.moves.length) {
            return data.moves.slice(0, count).map(m => {
                const rawScore = m.score;
                // ChessDB encodes a forced mate as ±(30000 - movesToMate), e.g. M1 -> 29999
                const isMate = typeof rawScore === 'number' && Math.abs(rawScore) >= 29000;
                const mateIn = isMate ? Math.sign(rawScore) * (30000 - Math.abs(rawScore)) : null;
                return {
                    uci: m.uci,
                    san: m.san || m.uci,
                    score: isMate ? null : rawScore,
                    winrate: m.winrate,
                    isMate,
                    mateIn
                };
            }).filter(m => isValidUci(m.uci));
        }
    } catch (e) { console.error('[ChessEngine] chessdb error', e); }
    return [];
}

// Fallback engine (single move, always computes for any position).
// Evaluation is in pawns from white's POV. Retried once because the free
// stockfish.online service can be slow or briefly rate-limited.
async function fetchStockfishMove(fen, depth = 12) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
            const data = await fetchJson(url, 20000);
            if (data && data.success && typeof data.bestmove === 'string') {
                const uci = data.bestmove.split(' ')[1];
                if (!isValidUci(uci)) return null; // e.g. "(none)" when the game is over
                const side = fen.split(' ')[1];
                let score = null, isMate = false, mateIn = null;
                if (data.mate != null) {
                    // e.g. "3" (we mate in 3) or "-2" (we get mated in 2)
                    isMate = true;
                    mateIn = parseInt(data.mate);
                } else if (data.evaluation != null) {
                    let cp = Math.round(data.evaluation * 100);
                    if (side === 'b') cp = -cp;
                    score = cp;
                }
                return { uci, san: uci, score, winrate: null, isMate, mateIn };
            }
        } catch (e) { console.error('[ChessEngine] stockfish error', e); }
    }
    return null;
}

// Top-N moves (public). Prefers the bundled local Stockfish engine,
// falling back to ChessDB and then the stockfish.online API. Memoized so the
// displayed "top 3" line stays consistent with what auto-play uses.
const _topMovesCache = new Map();

function fetchTopMoves(fen, count = 3) {
    const depth = (window.chessHelper && window.chessHelper.depth) || 12;
    const key = count + '|' + depth + '|' + fen;
    if (_topMovesCache.has(key)) return _topMovesCache.get(key);

    const p = (async () => {
        const local = await LocalEngine.search(fen, depth, count);
        if (local.length) return local;
        const cd = await fetchChessdbTopMoves(fen, count);
        if (cd.length) return cd;
        const sf = await fetchStockfishMove(fen, depth);
        return sf && sf.uci ? [sf] : [];
    })();

    _topMovesCache.set(key, p);
    p.then(moves => {
        if (moves.length) setTimeout(() => { if (_topMovesCache.get(key) === p) _topMovesCache.delete(key); }, 30000);
        else _topMovesCache.delete(key);
    }).catch(() => _topMovesCache.delete(key));

    return p;
}

// Best move as a move object {uci, san, score, winrate, isMate}.
// Prefers the bundled local Stockfish engine (accurate + fast), then the
// stockfish.online API, then ChessDB. Memoized so auto-play and the
// "show best" line share the same result.
const _bestMoveCache = new Map();

function fetchBestMove(fen, depth = 12) {
    const key = depth + '|' + fen;
    if (_bestMoveCache.has(key)) return _bestMoveCache.get(key);

    const p = (async () => {
        const local = await LocalEngine.search(fen, depth, 1);
        if (local.length) return local[0];

        const sf = await fetchStockfishMove(fen, depth);
        if (sf) return sf;

        const cd = await fetchChessdbTopMoves(fen, 1);
        return cd.length ? cd[0] : null;
    })();

    _bestMoveCache.set(key, p);
    p.then(move => {
        if (move) {
            setTimeout(() => { if (_bestMoveCache.get(key) === p) _bestMoveCache.delete(key); }, 30000);
        } else {
            _bestMoveCache.delete(key); // don't cache a miss — retry on next call
        }
    }).catch(() => {
        _bestMoveCache.delete(key);
    });

    return p;
}

// --- DISPATCH EVENTS ---
function dispatchPointer(type, elem, coords) {
    const evt = new PointerEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: coords.x, clientY: coords.y,
        buttons: 1, pointerId: 1, isPrimary: true,
        width: 1, height: 1, pressure: 0.5
    });
    elem.dispatchEvent(evt);
}

function dispatchMouse(type, elem, coords) {
    const isUp = type === 'mouseup';
    const evt = new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: coords.x, clientY: coords.y,
        button: 0,
        buttons: isUp ? 0 : 1
    });
    elem.dispatchEvent(evt);
}

// --- CDP (trusted) input, required by lichess ---
function cdpSend(events) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return Promise.resolve(false);
    }
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage({ type: 'chess-helper-mouse', events }, res => {
                resolve(!!(res && res.ok));
            });
        } catch (e) {
            console.error('[ChessEngine] cdp send error', e);
            resolve(false);
        }
    });
}

function cdpDrag(startCoords, endCoords) {
    return cdpSend([
        { type: 'mousePressed', x: startCoords.x, y: startCoords.y },
        { type: 'mouseMoved', x: endCoords.x, y: endCoords.y },
        { type: 'mouseReleased', x: endCoords.x, y: endCoords.y }
    ]);
}

function cdpClick(x, y) {
    return cdpSend([
        { type: 'mousePressed', x, y },
        { type: 'mouseReleased', x, y }
    ]);
}

// --- MAKE MOVE ---
async function makeMove(move) {
    if (!move) return;
    if (IS_LICHESS) return makeLichessMove(move);

    const board = getBoard();
    if (!board) return;

    const fromSq = move.substring(0, 2);
    if (!isMyPieceOnSquare(fromSq)) {
        log(`Abort: from-square ${fromSq} is not my piece`);
        return;
    }

    const toSq = move.substring(2, 4);
    const isPromotion = move.length === 5;
    const promotionPiece = isPromotion ? move[4] : null;

    log(`Playing move: ${fromSq} -> ${toSq}${isPromotion ? ' (promotion: ' + promotionPiece + ')' : ''}`);

    const fromRect = getSquareRect(fromSq);
    const toRect = getSquareRect(toSq);

    if (!fromRect || !toRect) return;

    const startCoords = { x: fromRect.centerX, y: fromRect.centerY };
    const endCoords = { x: toRect.centerX, y: toRect.centerY };

    let targetEl = document.elementFromPoint(startCoords.x, startCoords.y) || board;

    dispatchPointer('pointerdown', targetEl, startCoords);
    await sleep(60);
    dispatchPointer('pointermove', document.body, endCoords);
    await sleep(60);
    dispatchPointer('pointerup', document.body, endCoords);

    if (isPromotion) {
        await handlePromotion(promotionPiece);
    }
}

async function makeLichessMove(move) {
    const fromSq = move.substring(0, 2);
    if (!isMyPieceOnSquare(fromSq)) {
        log(`Abort: from-square ${fromSq} is not my piece`);
        return;
    }

    const uci = move;
    const toSq = move.substring(2, 4);
    const isPromotion = move.length === 5;
    log(`Playing move: ${uci}`);

    // Analysis board exposes an official API for programmatic moves.
    if (window.lichess && window.lichess.analysis && typeof window.lichess.analysis.playUci === 'function') {
        window.lichess.analysis.playUci(uci);
        return;
    }

    // Live game: simulate a mouse drag.
    const fromRect = getSquareRect(fromSq);
    const toRect = getSquareRect(toSq);
    if (!fromRect || !toRect) return;

    const board = getBoard();
    const startCoords = { x: fromRect.centerX, y: fromRect.centerY };
    const endCoords = { x: toRect.centerX, y: toRect.centerY };

    // Retry a few times and verify the piece actually landed on the target square
    // (a drag can occasionally be misread by chessground).
    for (let attempt = 0; attempt < 3; attempt++) {
        // 1) Trusted input via CDP (required by lichess)
        const cdpOk = await cdpDrag(startCoords, endCoords);

        // 2) Fallback: synthetic events (chess.com only; lichess rejects untrusted input)
        if (!cdpOk) {
            const targetEl = document.elementFromPoint(startCoords.x, startCoords.y) || board;
            dispatchMouse('mousedown', targetEl, startCoords);
            await sleep(60);
            dispatchMouse('mousemove', document.body, endCoords);
            await sleep(60);
            dispatchMouse('mouseup', document.body, endCoords);
        }

        // Give chessground time to register the move, then verify.
        await sleep(500);
        if (isMyPieceOnSquare(toSq)) {
            if (isPromotion) {
                await handleLichessPromotion(move[4]);
            }
            return;
        }
        log(`Move ${uci} did not land (attempt ${attempt + 1}), retrying...`);
    }

    if (isPromotion) {
        await handleLichessPromotion(move[4]);
    }
}

// --- PROMOTION (chess.com) ---
async function handlePromotion(piece) {
    log(`Handling promotion to: ${piece}`);

    const deadline = Date.now() + 2500;
    let promotionWindow = null;

    while (Date.now() < deadline) {
        promotionWindow = document.querySelector('.promotion-window');
        if (promotionWindow) break;
        await sleep(50);
    }

    if (!promotionWindow) {
        log(`ERROR: Promotion window not found`);
        return;
    }

    await sleep(80);

    const p = piece.toLowerCase();
    const myColor = getMyColor();

    const candidates = [
        `.promotion-piece.${myColor}${p}`,
        `.promotion-piece.w${p}`,
        `.promotion-piece.b${p}`,
        `.promotion-window .promotion-piece.${myColor}${p}`,
        `.promotion-window .promotion-piece.w${p}`,
        `.promotion-window .promotion-piece.b${p}`
    ];

    const allPromo = promotionWindow.querySelectorAll('.promotion-piece');
    log(`Promotion pieces in DOM: ${[...allPromo].map(x => x.className).join(' | ')}`);

    let btn = null;
    for (const sel of candidates) {
        btn = document.querySelector(sel);
        if (btn) {
            log(`FOUND promotion button: ${sel}`);
            break;
        }
    }

    if (!btn) {
        const order = { 'b': 0, 'n': 1, 'q': 2, 'r': 3 };
        const idx = order[p] ?? 2;
        btn = allPromo[idx] || null;
        if (btn) log(`Fallback promotion by index: ${idx}`);
    }

    if (!btn) {
        log(`ERROR: Could not find promotion button for ${piece}`);
        return;
    }

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btn.click();

    log(`Promotion clicked: ${p.toUpperCase()}`);
}

// --- PROMOTION (lichess) ---
async function handleLichessPromotion(piece) {
    const roleMap = { 'q': 'queen', 'r': 'rook', 'b': 'bishop', 'n': 'knight' };
    const role = roleMap[piece.toLowerCase()] || 'queen';
    const colorClass = getMyColor() === 'w' ? 'white' : 'black';

    log(`Handling lichess promotion to: ${role}`);

    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
        const chooser = document.querySelector('#promotion-choice');
        if (chooser) {
            const pieceEl = chooser.querySelector(`piece.${role}.${colorClass}`);
            const squareEl = pieceEl ? pieceEl.closest('square') : null;
            const target = squareEl || pieceEl;
            if (target) {
                const r = target.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const cdpOk = await cdpClick(cx, cy);
                if (!cdpOk) {
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
                log(`Promotion selected: ${role}`);
                return;
            }
        }
        await sleep(50);
    }
    log(`ERROR: lichess promotion choice not found for ${role}`);
}

// --- LOOP & LOGIC ---

let isProcessing = false;
let lastProcessedFen = "";
let moveInProgress = false;

async function checkTurnAndPlay() {
    if (!window.chessHelper || !window.chessHelper.autoPlay) return;
    if (isProcessing) return;

    const fen = getFEN();
    if (!fen) return;

    const activeColor = fen.split(' ')[1];
    const myColor = getMyColor();

    if (activeColor !== myColor) {
        lastProcessedFen = "";
        return;
    }

    if (fen === lastProcessedFen) return;

    isProcessing = true;
    lastProcessedFen = fen;

    try {
        log("My turn...");
        // Let the DOM settle (board animations on lichess/chess.com)
        await sleep(IS_LICHESS ? 250 : 120);

        if (getFEN() === fen && window.chessHelper.autoPlay) {
            const depth = window.chessHelper?.depth || 12;
            // Pick a good-but-sometimes-not-perfect move so auto-play looks human
            // and doesn't trip cheat detection by always playing the exact best move.
            const move = await pickAutoMove(fen, depth);
            if (move && move.uci) {
                const fenNow = getFEN();
                if (fenNow !== fen || !window.chessHelper.autoPlay) {
                    log("Abort: position changed or autoplay disabled");
                    return;
                }
                // Humanizing delay: wait a random 50%–100% of the configured time
                const delay = window.chessHelper?.moveDelay || 0;
                if (delay > 0) {
                    const waitMs = (0.5 + Math.random() * 0.5) * delay * 1000;
                    log(`Humanizing delay: ${Math.round(waitMs)}ms`);
                    await sleep(waitMs);
                    if (getFEN() !== fen || !window.chessHelper.autoPlay) {
                        log("Abort: position changed during delay or autoplay disabled");
                        return;
                    }
                }

                moveInProgress = true;
                await makeMove(move.uci);
                moveInProgress = false;
            }
        }
    } catch (e) {
        console.error(e);
        lastProcessedFen = "";
    } finally {
        isProcessing = false;
    }
}

// Pick the move auto-play will make. To avoid always playing the identical
// stockfish best move (which looks robotic and attracts cheat detection), this
// picks randomly among the top ~4 engine moves, weighted toward the best one.
// All candidates are still winning/good, so the game is still comfortably won.
async function pickAutoMove(fen, depth) {
    const top = await fetchTopMoves(fen, 4);
    if (!top.length) return null;

    // Weight the best move highest (e.g. 4 pts) and taper down; picks the best
    // move ~40% of the time, a top-2..4 move the rest.
    const weights = top.map((_, i) => Math.max(4 - i, 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < top.length; i++) {
        r -= weights[i];
        if (r <= 0) return top[i];
    }
    return top[top.length - 1];
}

// Observer
const observer = new MutationObserver(() => {
    if (window.chessHelper?.autoPlay) checkTurnAndPlay();
});
function initObserver() {
    const board = getBoard();
    if (board) {
        observer.observe(board, { childList: true, subtree: true, attributes: true });
    } else {
        setTimeout(initObserver, 1000);
    }
}
initObserver();
setInterval(() => { if (window.chessHelper?.autoPlay) checkTurnAndPlay(); }, 1500);

// EXPORT
window.chessHelperEngine = {
    triggerAutoPlay: () => {
        isProcessing = false;
        lastProcessedFen = "";
        checkTurnAndPlay();
    },
    getFEN: getFEN,
    fetchBestMove: fetchBestMove,
    fetchTopMoves: fetchTopMoves,
    fetchStockfishMove: fetchStockfishMove,
    getMyColor: getMyColor,
    engineReady: () => LocalEngine.isReady(),
    engineFailed: () => LocalEngine.isFailed(),
    isMoveInProgress: () => moveInProgress
};

// Pre-warm the local engine in the background so the first analysis is instant.
LocalEngine.init();
