// --- CONFIG & STATE ---
window.chessHelper = {
    autoPlay: false,
    alwaysShow: false,
    showTop3: false,
    depth: 12,
    moveDelay: 0,          // seconds (0 = instant, humanizing delay)
    displayMode: 'eval',   // 'eval' | 'winrate'
    debug: true
};

function log(msg) {
    if (window.chessHelper.debug) console.log(`[ChessHelper] ${msg}`);
}
window.chessHelperLog = log;

// --- DOM ELEMENTS REFERENCE ---
let rootEl, bubbleEl, panelEl;

// --- DRAG PHYSICS STATE ---
let drag = {
    active: false,
    currentX: 0, currentY: 0,
    initialX: 0, initialY: 0,
    xOffset: 0, yOffset: 0,
    velocityX: 0, velocityY: 0,
    lastX: 0, lastY: 0,
    lastTime: 0
};

// --- MOVE COLORS (best = green, 2nd = yellow, 3rd = gray) ---
const MOVE_COLORS = ['#22c55e', '#eab308', '#9ca3af'];
let currentOverlay = null;   // {fen, key, wrap}
let displayCache = null;     // {key, moves}
let fetchingKey = null;

// --- SETTINGS PERSISTENCE ---
const SETTINGS_KEY = 'chessHelperSettings';

function loadSettings() {
    return new Promise(resolve => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(SETTINGS_KEY, res => resolve(res[SETTINGS_KEY] || {}));
            } else {
                resolve(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
            }
        } catch (e) { resolve({}); }
    });
}

function saveSettings(s) {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ [SETTINGS_KEY]: s });
        } else {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        }
    } catch (e) { /* ignore */ }
}

function persist() {
    saveSettings({
        autoPlay: window.chessHelper.autoPlay,
        alwaysShow: window.chessHelper.alwaysShow,
        showTop3: window.chessHelper.showTop3,
        depth: window.chessHelper.depth,
        moveDelay: window.chessHelper.moveDelay,
        displayMode: window.chessHelper.displayMode
    });
}

// --- INITIALIZATION ---
function initUI() {
    const oldRoot = document.getElementById('chess-helper-root');
    if (oldRoot) oldRoot.remove();

    rootEl = document.createElement('div');
    rootEl.id = 'chess-helper-root';
    rootEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;';

    // Bubble (inline SVG knight — no external asset, so it works on every site)
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'chess-helper-bubble';
    bubbleEl.style.cssText = 'position:fixed;width:52px;height:52px;background:rgba(20,20,23,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:2147483647;pointer-events:auto;user-select:none;box-shadow:0 10px 40px -10px rgba(0,0,0,0.5);';
    bubbleEl.innerHTML = `
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; pointer-events:none; display:block;">
            <g style="fill:#ffffff; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round;">
                <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="stroke-linecap:butt;" />
                <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="stroke-linecap:butt;" />
                <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#000000; stroke:#000000;" />
                <path d="M 14.933,15.75 A 0.5 1.5 30 1 1 14.066,15.25 A 0.5 1.5 30 1 1 14.933,15.75 z" style="fill:#000000; stroke:#000000;" />
                <path d="M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z" style="stroke-linecap:butt;" />
            </g>
        </svg>`;

    drag.xOffset = window.innerWidth - 80;
    drag.yOffset = 80;
    updateBubbleTransform();

    // Panel
    panelEl = document.createElement('div');
    panelEl.id = 'chess-helper-panel';
    panelEl.innerHTML = `
        <div class="ch-header">
            <div>
                <div class="ch-title">Chess Assist</div>
                <div class="ch-subtitle">Moves for your turn</div>
            </div>
            <div class="ch-header-actions">
                <button class="ch-icon-btn" id="ch-btn-copyfen" title="Copy FEN">⧉</button>
                <span class="ch-status-dot" id="ch-status-dot" title="Your turn"></span>
            </div>
        </div>

        <div class="ch-row">
            <span class="ch-label">Auto-play</span>
            <label class="ch-switch">
                <input type="checkbox" id="ch-toggle-autoplay">
                <span class="ch-slider"></span>
            </label>
        </div>

        <div class="ch-row">
            <span class="ch-label">Show best move</span>
            <label class="ch-switch">
                <input type="checkbox" id="ch-toggle-always">
                <span class="ch-slider"></span>
            </label>
        </div>

        <div class="ch-row">
            <span class="ch-label">Show top 3 moves</span>
            <label class="ch-switch">
                <input type="checkbox" id="ch-toggle-top3">
                <span class="ch-slider"></span>
            </label>
        </div>

        <div class="ch-row ch-depth-row">
            <span class="ch-label">Engine depth</span>
            <div class="ch-depth-control">
                <input type="range" id="ch-depth-slider" min="10" max="15" step="1" value="12">
                <span class="ch-depth-value" id="ch-depth-value">12</span>
            </div>
        </div>

        <div class="ch-row ch-depth-row" id="ch-delay-row" style="display:none">
            <span class="ch-label">Move delay</span>
            <div class="ch-depth-control">
                <input type="range" id="ch-delay-slider" min="0" max="15" step="1" value="0">
                <span class="ch-depth-value" id="ch-delay-value">0s</span>
            </div>
        </div>

        <div class="ch-row">
            <span class="ch-label">Display</span>
            <select id="ch-display-mode" class="ch-select">
                <option value="eval">Evaluation</option>
                <option value="winrate">Winrate %</option>
            </select>
        </div>

        <div id="ch-moves-container"></div>
    `;

    rootEl.appendChild(bubbleEl);
    rootEl.appendChild(panelEl);
    document.body.appendChild(rootEl);

    log("ChessHelper UI initialized");

    setupDragEvents();
    setupControls();
    loadAndApplySettings();
}

// --- DRAG & PHYSICS LOGIC ---
function setupDragEvents() {
    bubbleEl.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', dragMove);

    bubbleEl.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchend', dragEnd);
    document.addEventListener('touchmove', dragMove, { passive: false });
}

function dragStart(e) {
    if (e.target.closest('#chess-helper-panel')) return;
    drag.active = true;
    drag.lastTime = Date.now();

    if (e.type === "touchstart") {
        drag.initialX = e.touches[0].clientX - drag.xOffset;
        drag.initialY = e.touches[0].clientY - drag.yOffset;
    } else {
        drag.initialX = e.clientX - drag.xOffset;
        drag.initialY = e.clientY - drag.yOffset;
    }
}

function dragEnd(e) {
    if (!drag.active) return;
    drag.active = false;
    startInertia();
}

function dragMove(e) {
    if (drag.active) {
        e.preventDefault();
        let cx = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        let cy = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

        drag.currentX = cx - drag.initialX;
        drag.currentY = cy - drag.initialY;

        const now = Date.now();
        const dt = now - drag.lastTime;
        if (dt > 0) {
            drag.velocityX = (drag.currentX - drag.xOffset) / dt;
            drag.velocityY = (drag.currentY - drag.yOffset) / dt;
        }
        drag.lastTime = now;

        drag.xOffset = drag.currentX;
        drag.yOffset = drag.currentY;

        updateBubbleTransform();
        if (panelEl.classList.contains('visible')) closePanel();
    }
}

function updateBubbleTransform() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = 52;

    if (drag.xOffset < 0) drag.xOffset = 0;
    if (drag.yOffset < 0) drag.yOffset = 0;
    if (drag.xOffset > w - size) drag.xOffset = w - size;
    if (drag.yOffset > h - size) drag.yOffset = h - size;

    bubbleEl.style.transform = `translate3d(${drag.xOffset}px, ${drag.yOffset}px, 0)`;
}

function startInertia() {
    const speed = Math.sqrt(drag.velocityX * drag.velocityX + drag.velocityY * drag.velocityY);
    if (speed < 0.15) {
        togglePanel();
        return;
    }
    function step() {
        if (drag.active) return;
        drag.velocityX *= 0.92;
        drag.velocityY *= 0.92;
        drag.xOffset += drag.velocityX * 16;
        drag.yOffset += drag.velocityY * 16;
        updateBubbleTransform();
        if (Math.abs(drag.velocityX) > 0.05 || Math.abs(drag.velocityY) > 0.05) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

// --- PANEL LOGIC ---
function togglePanel() {
    if (panelEl.classList.contains('visible')) closePanel();
    else openPanel();
}

function openPanel() {
    updatePanelPosition();
    panelEl.classList.add('visible');
}

function closePanel() {
    panelEl.classList.remove('visible');
}

function updatePanelPosition() {
    const bubbleRect = bubbleEl.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const panelW = panelEl.offsetWidth || 280;
    const panelH = panelEl.offsetHeight || 320;
    const margin = 16;

    let top, left, originX, originY;

    if (bubbleRect.left > w / 2) {
        left = bubbleRect.left - panelW - margin;
        originX = "right";
    } else {
        left = bubbleRect.right + margin;
        originX = "left";
    }

    if (bubbleRect.top > h / 2) {
        top = bubbleRect.bottom - panelH;
        originY = "bottom";
    } else {
        top = bubbleRect.top;
        originY = "top";
    }

    if (left < margin) left = margin;
    if (left + panelW > w - margin) left = w - panelW - margin;
    if (top < margin) top = margin;
    if (top + panelH > h - margin) top = h - panelH - margin;

    panelEl.style.top = `${top}px`;
    panelEl.style.left = `${left}px`;
    panelEl.style.transformOrigin = `${originX} ${originY}`;
}

// --- EVALUATION FORMAT ---
function formatEval(m) {
    if (!m) return '';
    if (m.isMate) {
        const n = m.mateIn != null ? Math.abs(m.mateIn) : Math.abs(m.score);
        const sign = m.mateIn != null ? Math.sign(m.mateIn) : Math.sign(m.score);
        return sign > 0 ? `M${n}` : `-M${n}`;
    }
    const s = m.score;
    if (s == null || isNaN(s)) return '';
    const v = (s / 100).toFixed(2);
    return (s > 0 ? '+' : '') + v;
}

// Display value based on the selected mode (eval or winrate)
function cpToWinrate(cp) {
    return Math.round(100 / (1 + Math.pow(10, -cp / 400)));
}

function formatValue(m) {
    if (!m) return '';
    if (window.chessHelper.displayMode === 'winrate') {
        if (m.winrate != null) return m.winrate + '%';
        if (m.isMate) return formatEval(m);
        if (m.score != null) return cpToWinrate(m.score) + '%';
    }
    return formatEval(m);
}

// White's expected win probability in [0,1] from a move's evaluation
function evalToWhiteProb(m, side) {
    if (m.isMate) {
        const sideToMoveMates = m.mateIn > 0;
        const whiteMates = (side === 'w') ? sideToMoveMates : !sideToMoveMates;
        return whiteMates ? 1 : 0;
    }
    if (m.score == null || isNaN(m.score)) return 0.5;
    const whiteCp = side === 'w' ? m.score : -m.score;
    return 1 / (1 + Math.pow(10, -whiteCp / 400));
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- PANEL MOVE LIST ---
function updateMovesList(moves, title) {
    const c = document.getElementById('ch-moves-container');
    if (!c) return;
    if (!moves || !moves.length) {
        c.innerHTML = '';
        return;
    }

    let banner = '';
    const best = moves[0];
    if (best && best.isMate) {
        const n = Math.abs(best.mateIn);
        banner = best.mateIn > 0
            ? `<div class="ch-mate-banner ch-mate-win">Mate in ${n}</div>`
            : `<div class="ch-mate-banner ch-mate-lose">Getting mated in ${n}</div>`;
    }

    const header = title ? `<div class="ch-moves-title">${escapeHtml(title)}</div>` : '';
    const rows = moves.map((m, i) => {
        const color = MOVE_COLORS[i % MOVE_COLORS.length];
        const mateCls = m.isMate ? (m.mateIn > 0 ? ' mate-win' : ' mate-lose') : '';
        const valueStr = formatValue(m);
        return `<div class="ch-move-row">
            <span class="ch-move-dot" style="background:${color}"></span>
            <span class="ch-move-rank">${i + 1}</span>
            <span class="ch-move-san">${escapeHtml(m.san || m.uci)}</span>
            <span class="ch-move-eval${mateCls}">${escapeHtml(valueStr)}</span>
        </div>`;
    }).join('');
    c.innerHTML = banner + header + rows;
}

// --- IS IT MY TURN ---
function isMyTurn() {
    const engine = window.chessHelperEngine;
    if (!engine) return false;
    const fen = engine.getFEN();
    if (!fen) return false;
    return fen.split(' ')[1] === engine.getMyColor();
}

function updateStatusDot(myTurn) {
    const dot = document.getElementById('ch-status-dot');
    if (dot) dot.classList.toggle('on', myTurn);
}

function updateDelayVisibility() {
    const row = document.getElementById('ch-delay-row');
    if (row) row.style.display = window.chessHelper.autoPlay ? '' : 'none';
}

// --- COPY FEN ---
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (e2) { return false; }
    }
}

// --- CONTROLS ---
function setupControls() {
    document.getElementById('ch-toggle-autoplay').addEventListener('change', (e) => {
        window.chessHelper.autoPlay = e.target.checked;
        persist();
        updateDelayVisibility();
        if (window.chessHelper.autoPlay && window.chessHelperEngine?.triggerAutoPlay) {
            window.chessHelperEngine.triggerAutoPlay();
        }
    });

    document.getElementById('ch-toggle-always').addEventListener('change', (e) => {
        window.chessHelper.alwaysShow = e.target.checked;
        persist();
        displayCache = null;
        if (!e.target.checked) { clearOverlays(); updateMovesList([]); }
        else displayTick();
    });

    document.getElementById('ch-toggle-top3').addEventListener('change', (e) => {
        window.chessHelper.showTop3 = e.target.checked;
        persist();
        displayCache = null;
        if (!e.target.checked) { clearOverlays(); updateMovesList([]); }
        else displayTick();
    });

    document.getElementById('ch-depth-slider').addEventListener('input', (e) => {
        window.chessHelper.depth = parseInt(e.target.value, 10);
        document.getElementById('ch-depth-value').textContent = e.target.value;
        persist();
        displayCache = null; // refetch with the new depth
        displayTick();
    });

    document.getElementById('ch-delay-slider').addEventListener('input', (e) => {
        window.chessHelper.moveDelay = parseInt(e.target.value, 10);
        document.getElementById('ch-delay-value').textContent = e.target.value + 's';
        persist();
    });

    document.getElementById('ch-display-mode').addEventListener('change', (e) => {
        window.chessHelper.displayMode = e.target.value;
        persist();
        // just re-render labels (no refetch needed)
        if (displayCache) {
            drawMoves(displayCache.moves);
            updateMovesList(displayCache.moves, titleFor(displayCache.moves));
        }
    });

    document.getElementById('ch-btn-copyfen').addEventListener('click', async () => {
        const fen = window.chessHelperEngine?.getFEN();
        const btn = document.getElementById('ch-btn-copyfen');
        if (!fen) { btn.textContent = '✗'; setTimeout(() => btn.textContent = '⧉', 1200); return; }
        const ok = await copyText(fen);
        btn.textContent = ok ? '✓' : '✗';
        setTimeout(() => btn.textContent = '⧉', 1200);
    });
}

async function loadAndApplySettings() {
    const s = await loadSettings();
    window.chessHelper.autoPlay = !!s.autoPlay;
    window.chessHelper.alwaysShow = !!s.alwaysShow;
    window.chessHelper.showTop3 = !!s.showTop3;
    window.chessHelper.depth = (typeof s.depth === 'number' && s.depth >= 10 && s.depth <= 15) ? s.depth : 12;
    window.chessHelper.moveDelay = (typeof s.moveDelay === 'number' && s.moveDelay >= 0 && s.moveDelay <= 15) ? Math.round(s.moveDelay) : 0;
    window.chessHelper.displayMode = (s.displayMode === 'winrate') ? 'winrate' : 'eval';

    const el = id => document.getElementById(id);
    el('ch-toggle-autoplay').checked = window.chessHelper.autoPlay;
    el('ch-toggle-always').checked = window.chessHelper.alwaysShow;
    el('ch-toggle-top3').checked = window.chessHelper.showTop3;
    el('ch-depth-slider').value = window.chessHelper.depth;
    el('ch-depth-value').textContent = window.chessHelper.depth;
    el('ch-delay-slider').value = window.chessHelper.moveDelay;
    el('ch-delay-value').textContent = window.chessHelper.moveDelay + 's';
    el('ch-display-mode').value = window.chessHelper.displayMode;

    updateDelayVisibility();

    if (window.chessHelper.autoPlay && window.chessHelperEngine?.triggerAutoPlay) {
        window.chessHelperEngine.triggerAutoPlay();
    }
    if (window.chessHelper.alwaysShow || window.chessHelper.showTop3) {
        displayTick();
    }
}

// --- DISPLAY LOOP (best move / top 3, for MY turn only) ---
async function displayTick() {
    const ch = window.chessHelper;
    const engine = window.chessHelperEngine;
    if (!engine) return;

    // Skip while a move is being played — the board is transient mid-drag.
    if (engine.isMoveInProgress && engine.isMoveInProgress()) return;

    const myTurn = isMyTurn();
    updateStatusDot(myTurn);
    const active = myTurn && (ch.alwaysShow || ch.showTop3);

    if (!active) {
        clearOverlays();
        updateMovesList([]);
        displayCache = null;
        fetchingKey = null;
        return;
    }

    const fen = engine.getFEN();
    if (!fen) { clearOverlays(); return; }

    if (engine.engineReady && !engine.engineReady()) {
        showStatus('Warming up engine…');
        return;
    }

    const count = ch.showTop3 ? 3 : 1;
    const key = count + '|' + fen;

    // Serve from cache if we already have this position's moves
    if (displayCache && displayCache.key === key) {
        drawMoves(displayCache.moves);
        updateMovesList(displayCache.moves, titleFor(displayCache.moves));
        return;
    }

    // Skip if a fetch for this exact key is already in flight
    if (fetchingKey === key) return;
    fetchingKey = key;

    let moves;
    try {
        if (count === 1) {
            const m = await engine.fetchBestMove(fen, ch.depth);
            moves = m && m.uci ? [m] : [];
        } else {
            moves = await engine.fetchTopMoves(fen, 3);
            if (!moves.length) {
                const m = await engine.fetchStockfishMove(fen, ch.depth);
                moves = m && m.uci ? [m] : [];
            }
        }
    } finally {
        if (fetchingKey === key) fetchingKey = null;
    }

    // Re-check state after the async fetch (turn may have changed)
    if (!isMyTurn() || !(ch.alwaysShow || ch.showTop3)) {
        clearOverlays();
        return;
    }

    if (moves.length) {
        displayCache = { key, moves };
        drawMoves(moves);
        updateMovesList(moves, titleFor(moves));
    } else {
        // Don't cache empty results — retry on the next tick
        clearOverlays();
        updateMovesList([]);
    }
}

function titleFor(moves) {
    return moves.length > 1 ? 'Top moves' : 'Best move';
}

function showStatus(text) {
    const c = document.getElementById('ch-moves-container');
    if (c) c.innerHTML = `<div class="ch-moves-title">${escapeHtml(text)}</div>`;
}

// Polling fallback (catches turn changes that don't mutate the board)
setInterval(displayTick, 1500);

// React quickly to board changes (opponent move, our move, etc.)
let displayTimer = null;
function scheduleDisplay() {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(displayTick, 150);
}

function initDisplayObserver() {
    const board = getBoard();
    if (board) {
        new MutationObserver(scheduleDisplay).observe(board, { childList: true, subtree: true });
    } else {
        setTimeout(initDisplayObserver, 1000);
    }
}
initDisplayObserver();

// Lichess emits a 'ply' event on every move — analyze immediately after the opponent moves.
if (window.lichess && window.lichess.events && typeof window.lichess.events.on === 'function') {
    try {
        window.lichess.events.on('ply', () => scheduleDisplay());
    } catch (e) { /* ignore */ }
}

// --- VISUALIZATION ---
// Draws arrows/highlights, an eval bar, and eval labels for the moves.
function drawMoves(moves) {
    const board = getBoard();
    if (!board || !moves || !moves.length) { clearOverlays(); return; }

    const boardRect = board.getBoundingClientRect();
    const fen = window.chessHelperEngine.getFEN() || '';
    const side = fen.split(' ')[1] || 'w';
    const key = moves.map(m => m.uci).join(',');

    // Reposition existing overlay without flicker if nothing changed
    if (currentOverlay && currentOverlay.fen === fen && currentOverlay.key === key) {
        const w = currentOverlay.wrap;
        w.style.top = boardRect.top + 'px';
        w.style.left = boardRect.left + 'px';
        w.style.width = boardRect.width + 'px';
        w.style.height = boardRect.height + 'px';
        return;
    }

    clearOverlays();

    const wrap = document.createElement('div');
    wrap.className = 'ch-overlay';
    wrap.style.cssText = `position:fixed;top:${boardRect.top}px;left:${boardRect.left}px;width:${boardRect.width}px;height:${boardRect.height}px;pointer-events:none;z-index:2147483646;`;

    const isFlipped = boardIsFlipped();

    const squarePos = (sq) => {
        const file = colToNum[sq[0]] - 1;
        const rank = parseInt(sq[1]) - 1;
        let col, row;
        if (isFlipped) { col = 7 - file; row = rank; }
        else { col = file; row = 7 - rank; }
        const size = 12.5;
        return { left: col * size, top: row * size, cx: col * size + size / 2, cy: row * size + size / 2 };
    };

    // Eval bar (based on the best move's evaluation)
    if (moves[0] && (moves[0].isMate || moves[0].score != null)) {
        drawEvalBar(wrap, moves[0], side);
    }

    moves.forEach((m, i) => {
        if (!m || !m.uci || !/^[a-h][1-8][a-h][1-8][nbrqNBRQ]?$/.test(m.uci)) return;
        const color = MOVE_COLORS[i % MOVE_COLORS.length];
        const startSq = m.uci.substring(0, 2);
        const endSq = m.uci.substring(2, 4);
        const s = squarePos(startSq);
        const e = squarePos(endSq);

        // Highlight destination square
        const hl = document.createElement('div');
        hl.className = 'ch-highlight';
        hl.style.cssText = `position:absolute;left:${e.left}%;top:${e.top}%;width:12.5%;height:12.5%;background-color:${color};pointer-events:none;`;
        wrap.appendChild(hl);

        // Arrow
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.classList.add('ch-arrow-svg');

        const dx = e.cx - s.cx;
        const dy = e.cy - s.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const px = -uy, py = ux; // perpendicular

        const headLen = Math.min(5, len * 0.35);
        const headWidth = headLen * 0.72;
        const ex = e.cx - ux * headLen; // line end (before arrowhead)
        const ey = e.cy - uy * headLen;

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", s.cx); line.setAttribute("y1", s.cy);
        line.setAttribute("x2", ex); line.setAttribute("y2", ey);
        line.style.stroke = color;
        line.classList.add('ch-arrow-line');

        const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const b1x = ex + px * headWidth, b1y = ey + py * headWidth;
        const b2x = ex - px * headWidth, b2y = ey - py * headWidth;
        head.setAttribute("points", `${e.cx},${e.cy} ${b1x},${b1y} ${b2x},${b2y}`);
        head.style.fill = color;
        head.classList.add('ch-arrow-head');

        svg.appendChild(line);
        svg.appendChild(head);
        wrap.appendChild(svg);

        // Evaluation label pill above the destination square
        const valueStr = formatValue(m);
        if (valueStr) {
            let labelColor = color;
            if (m.isMate) labelColor = m.mateIn > 0 ? '#7ee787' : '#ff6b6b';
            const label = document.createElement('div');
            label.className = 'ch-eval-label';
            label.style.cssText = `position:absolute;left:${e.cx}%;top:${e.cy}%;transform:translate(-50%,-140%);pointer-events:none;color:${labelColor};`;
            label.textContent = `${m.san || m.uci} ${valueStr}`;
            wrap.appendChild(label);
        }
    });

    document.body.appendChild(wrap);
    currentOverlay = { fen, key, wrap };
}

function drawEvalBar(wrap, move, side) {
    const whiteProb = evalToWhiteProb(move, side);
    const bar = document.createElement('div');
    bar.className = 'ch-eval-bar';
    bar.style.cssText = 'position:absolute;left:-16px;top:0;width:9px;height:100%;pointer-events:none;border-radius:4px;overflow:hidden;background:#1a1a1a;box-shadow:0 2px 6px rgba(0,0,0,0.4);';

    const whiteFill = document.createElement('div');
    whiteFill.className = 'ch-eval-bar-white';
    whiteFill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${Math.round(whiteProb * 100)}%;background:#f5f5f5;transition:height 0.3s ease;`;
    bar.appendChild(whiteFill);

    wrap.appendChild(bar);
}

function clearOverlays() {
    document.querySelectorAll('.ch-overlay, .ch-highlight, .ch-arrow-svg, .ch-eval-label, .ch-eval-bar').forEach(el => el.remove());
    currentOverlay = null;
}

// Reposition overlay on resize
window.addEventListener('resize', () => {
    if (window.chessHelper.alwaysShow || window.chessHelper.showTop3) {
        const board = getBoard();
        if (board && currentOverlay) {
            const r = board.getBoundingClientRect();
            currentOverlay.wrap.style.top = r.top + 'px';
            currentOverlay.wrap.style.left = r.left + 'px';
            currentOverlay.wrap.style.width = r.width + 'px';
            currentOverlay.wrap.style.height = r.height + 'px';
        }
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}
