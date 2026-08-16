// background.js — dispatches trusted mouse input through the Chrome Debugger
// Protocol. Lichess's chessground rejects synthetic (untrusted) DOM events via
// `e.isTrusted`, so CDP is the only way a content script can move a piece there.
//
// If the extension has NOT been granted the "debugger" permission, this worker
// stays registered but simply reports failure, and the content script falls back
// to synthetic events (which work on chess.com only).

const sleep = ms => new Promise(r => setTimeout(r, ms));

const hasDebugger = typeof chrome !== 'undefined' && !!chrome.debugger;

function debuggerCall(method, ...args) {
    return new Promise((resolve, reject) => {
        chrome.debugger[method](...args, result => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(result);
        });
    });
}

// Keep the debugger attached once (instead of attach/detach per move) to avoid
// the "is debugging this tab" infobar flickering on every move.
const attached = new Set();

async function ensureAttached(tabId) {
    if (attached.has(tabId)) return;
    try {
        await debuggerCall('attach', { tabId }, '1.3');
    } catch (e) {
        try { await debuggerCall('detach', { tabId }); } catch (_) {}
        await debuggerCall('attach', { tabId }, '1.3');
    }
    attached.add(tabId);
}

async function sendEvent(tabId, params) {
    try {
        await debuggerCall('sendCommand', { tabId }, 'Input.dispatchMouseEvent', params);
    } catch (e) {
        attached.delete(tabId);
        await ensureAttached(tabId);
        await debuggerCall('sendCommand', { tabId }, 'Input.dispatchMouseEvent', params);
    }
}

async function handleMouse(tabId, events) {
    await ensureAttached(tabId);
    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const params = {
            type: ev.type,
            x: Math.round(ev.x),
            y: Math.round(ev.y)
        };
        if (ev.type === 'mouseMoved') {
            params.button = 'none';
            params.buttons = 1;
        } else {
            params.button = 'left';
            params.buttons = ev.type === 'mouseReleased' ? 0 : 1;
            params.clickCount = ev.type === 'mousePressed' ? 1 : 0;
        }
        await sendEvent(tabId, params);
        if (i < events.length - 1) await sleep(150);
    }
}

if (hasDebugger) {
    chrome.debugger.onDetach.addListener(source => {
        if (source.tabId != null) attached.delete(source.tabId);
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'chess-helper-mouse') {
        if (!hasDebugger) {
            sendResponse({ ok: false, err: 'debugger-not-available' });
            return;
        }
        const tabId = sender.tab && sender.tab.id;
        if (tabId == null) { sendResponse({ ok: false, err: 'no-tab' }); return; }
        handleMouse(tabId, msg.events || [])
            .then(() => sendResponse({ ok: true }))
            .catch(e => sendResponse({ ok: false, err: String((e && e.message) || e) }));
        return true; // async response
    }
});
