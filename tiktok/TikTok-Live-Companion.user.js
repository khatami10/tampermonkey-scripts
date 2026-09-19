// ==UserScript==
// @name         TikTok LIVE Companion
// @namespace    local.tiktok.live.companion
// @version      0.1.0
// @description  Modular TikTok LIVE tools, beginning with reliable 1v1/2v2 Battle/PK UI repair.
// @match        https://www.tiktok.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/khatami10/tampermonkey-scripts
// @supportURL   https://github.com/khatami10/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/khatami10/tampermonkey-scripts/main/tiktok/TikTok-Live-Companion.user.js
// @downloadURL  https://raw.githubusercontent.com/khatami10/tampermonkey-scripts/main/tiktok/TikTok-Live-Companion.user.js
// ==/UserScript==

/* ---- src/core.js ---- */
(() => {
  'use strict';

  if (window.__TTLC__) return;

  const STORAGE_KEY = 'ttlc.settings.v1';
  const HOST_ID = 'ttlc-control-host';
  const modules = new Map();
  const listeners = new Set();
  const defaults = { modules: { 'battle-pk': true }, panelCollapsed: false };

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...defaults,
        ...saved,
        modules: { ...defaults.modules, ...(saved.modules || {}) }
      };
    } catch (_) {
      return structuredClone(defaults);
    }
  }

  let settings = readSettings();

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function notify() {
    for (const listener of listeners) listener(snapshot());
  }

  function snapshot() {
    return [...modules.values()].map((module) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      enabled: isEnabled(module.id),
      status: module.status?.() || (isEnabled(module.id) ? 'Running' : 'Off')
    }));
  }

  function isEnabled(id) {
    return settings.modules[id] !== false;
  }

  async function setEnabled(id, enabled) {
    const module = modules.get(id);
    if (!module) throw new Error(`Unknown module: ${id}`);
    settings.modules[id] = Boolean(enabled);
    saveSettings();
    await (enabled ? module.start?.() : module.stop?.());
    notify();
  }

  function register(module) {
    if (!module?.id || modules.has(module.id)) return;
    modules.set(module.id, module);
    Promise.resolve(isEnabled(module.id) ? module.start?.() : module.stop?.())
      .catch((error) => console.error(`[TikTok LIVE Companion] ${module.id}`, error))
      .finally(notify);
  }

  window.__TTLC__ = Object.freeze({
    register,
    isEnabled,
    setEnabled,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }
  });

  function mountUI() {
    if (!document.documentElement || document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .launcher, .panel { position: fixed; right: 18px; z-index: 2147483647; font: 13px/1.35 system-ui, sans-serif; }
        .launcher { top: 88px; border: 1px solid #7447a8; border-radius: 999px; padding: 9px 12px;
          color: #fff; background: #17121f; cursor: pointer; box-shadow: 0 7px 24px #0008; }
        .panel { top: 88px; width: 310px; color: #f7f4fb; background: #17121f; border: 1px solid #7447a8;
          border-radius: 12px; box-shadow: 0 12px 34px #000a; overflow: hidden; }
        header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px;
          background: #21172c; border-bottom: 1px solid #3d2c50; }
        h2 { margin: 0; font-size: 14px; } .close { border: 0; color: #bbb; background: transparent; cursor: pointer; font-size: 20px; }
        .modules { padding: 10px; } .module { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px;
          padding: 10px; border-radius: 9px; background: #221b2b; }
        .name { font-weight: 700; } .desc, .status { color: #aaa; font-size: 11px; }
        .status { color: #b48cff; } input { width: 38px; height: 20px; accent-color: #b48cff; cursor: pointer; }
        .roadmap { padding: 0 12px 12px; color: #8f8897; font-size: 11px; }
        [hidden] { display: none !important; }
      </style>
      <button class="launcher" type="button">LIVE Companion</button>
      <section class="panel" aria-label="TikTok LIVE Companion" hidden>
        <header><h2>TikTok LIVE Companion</h2><button class="close" type="button" aria-label="Close">×</button></header>
        <div class="modules"></div>
        <div class="roadmap">Next: chat, gifts, viewer activity, LIVE stats, player controls, and shortcuts.</div>
      </section>`;

    const launcher = shadow.querySelector('.launcher');
    const panel = shadow.querySelector('.panel');
    const list = shadow.querySelector('.modules');
    const show = (visible) => {
      panel.hidden = !visible;
      launcher.hidden = visible;
    };
    launcher.addEventListener('click', () => show(true));
    shadow.querySelector('.close').addEventListener('click', () => show(false));
    shadow.addEventListener('change', async (event) => {
      const toggle = event.target.closest('[data-module]');
      if (!toggle) return;
      toggle.disabled = true;
      try { await setEnabled(toggle.dataset.module, toggle.checked); }
      finally { toggle.disabled = false; }
    });
    window.__TTLC__.subscribe((items) => {
      list.replaceChildren(...items.map((item) => {
        const row = document.createElement('div');
        row.className = 'module';
        row.innerHTML = `<div class="name"></div><input type="checkbox" data-module="${item.id}">
          <div class="desc"></div><span></span><div class="status"></div>`;
        row.querySelector('.name').textContent = item.name;
        row.querySelector('.desc').textContent = item.description;
        row.querySelector('.status').textContent = item.status;
        row.querySelector('input').checked = item.enabled;
        return row;
      }));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI, { once: true });
  else mountUI();
})();

/* ---- src/modules/battle-pk.module.js ---- */
(function () {
    'use strict';

    const PANEL_ID = 'tt-1v1-auto-repair-v22';
    const REPORT_ID = 'tt-1v1-auto-repair-v22-report';

    // Keep v2.0 position so upgrading does not reset your panel location.
    const POS_KEY = 'tt_1v1_auto_repair_v20_pos';

    let hidden = false;
    let collapsed = false;
    let lastReport = null;
    let running = false;
    let moduleEnabled = window.__TTLC__?.isEnabled('battle-pk') !== false;

    const objectIds = new WeakMap();
    let nextObjectId = 1;

    function oid(v) {
        if (!v || (typeof v !== 'object' && typeof v !== 'function')) {
            return null;
        }

        if (!objectIds.has(v)) {
            objectIds.set(v, nextObjectId++);
        }

        return objectIds.get(v);
    }

    function sid(v) {
        if (v === null || v === undefined || v === '') return null;
        return String(v);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function fnSource(fn) {
        if (typeof fn !== 'function') return null;

        try {
            return Function.prototype.toString.call(fn).slice(0, 3000);
        } catch (_) {
            return '[unavailable]';
        }
    }

    function reactKey(node) {
        if (!node) return null;

        return Object.getOwnPropertyNames(node).find(key =>
            key.startsWith('__reactFiber$') ||
            key.startsWith('__reactInternalInstance$')
        ) || null;
    }

    function fiberOf(node) {
        const key = reactKey(node);
        return key ? node[key] : null;
    }

    function bestVideo() {
        const videos = [...document.querySelectorAll('video')];

        if (!videos.length) return null;

        return videos
            .map(video => {
                const r = video.getBoundingClientRect();

                let score = 0;

                if (r.width > 180 && r.height > 180) score += 50;
                if (!video.paused) score += 20;
                if (video.readyState >= 2) score += 20;
                if (r.top < innerHeight && r.bottom > 0) score += 20;

                return { video, score };
            })
            .sort((a, b) => b.score - a.score)[0].video;
    }

    function committedRoot() {
        const video = bestVideo();
        if (!video) return null;

        let node = video;
        let fiber = null;

        for (let i = 0; node && i < 35; i++, node = node.parentElement) {
            fiber = fiberOf(node);

            if (fiber) break;
        }

        if (!fiber) return null;

        while (fiber.return) {
            fiber = fiber.return;
        }

        return fiber?.stateNode?.current || fiber;
    }

    function allFibers(root) {
        const out = [];
        const stack = [root];
        const seen = new Set();

        while (stack.length) {
            const fiber = stack.pop();

            if (!fiber || typeof fiber !== 'object' || seen.has(fiber)) {
                continue;
            }

            seen.add(fiber);
            out.push(fiber);

            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
        }

        return out;
    }

    function hookAt(fiber, index) {
        let hook = fiber?.memoizedState;
        const seen = new Set();

        for (
            let i = 0;
            hook &&
            typeof hook === 'object' &&
            !seen.has(hook);
            i++, hook = hook.next
        ) {
            seen.add(hook);

            if (i === index) return hook;
        }

        return null;
    }

    function callbackAt(fiber, index) {
        const state = hookAt(fiber, index)?.memoizedState;

        if (Array.isArray(state) && typeof state[0] === 'function') {
            return state[0];
        }

        return null;
    }

    function getRoomId(obj) {
        return sid(
            obj?.roomId ??
            obj?.room_id_str ??
            obj?.room_id ??
            obj?.roomInfo?.id_str ??
            obj?.roomInfo?.id
        );
    }

    function getAnchorId(obj) {
        return sid(
            obj?.anchorId ??
            obj?.anchor_id_str ??
            obj?.anchor_id ??
            obj?.roomInfo?.owner?.id_str ??
            obj?.roomInfo?.owner?.id
        );
    }

    function getBattle(obj) {
        return (
            obj?.roomInfo?.link_mic?.battle_info ??
            obj?.link_mic?.battle_info ??
            obj?.battle_info ??
            null
        );
    }

    function getBattleId(battle) {
        return sid(
            battle?.battle_id_str ??
            battle?.battle_id ??
            battle?.battleId
        );
    }

    function getChannelId(battle) {
        return sid(
            battle?.channel_id_str ??
            battle?.channel_id ??
            battle?.channelId
        );
    }

    function getSocialUsers(obj) {
        const users =
            obj?.roomInfo?.social_interaction?.cohost?.linked_users ??
            obj?.social_interaction?.cohost?.linked_users ??
            null;

        return Array.isArray(users) ? users : null;
    }

    function summarizeUser(user) {
        return {
            id: sid(
                user?.user_id_str ??
                user?.user_id ??
                user?.id_str ??
                user?.id
            ),

            name:
                user?.nick_name ??
                user?.nickname ??
                user?.display_name ??
                user?.display_id ??
                null,

            roomId: sid(
                user?.room_id_str ??
                user?.room_id ??
                user?.roomId
            )
        };
    }

    function summarizeIMRoom(im) {
        if (!im || typeof im !== 'object') return null;

        return {
            configRoomId: sid(
                im?._config?.roomId ??
                im?._config?.room_id
            ),

            messageRoomId: sid(
                im?._messageEvents?.roomId ??
                im?._messageEvents?.room_id
            ),

            socketRoomId: sid(
                im?._socket?.socketProps?.roomId ??
                im?._socket?.socketProps?.room_id
            )
        };
    }

    function imMatchesRoom(im, roomId) {
        const s = summarizeIMRoom(im);

        return !!(
            s &&
            roomId &&
            (
                s.configRoomId === roomId ||
                s.messageRoomId === roomId ||
                s.socketRoomId === roomId
            )
        );
    }

    function domState() {
        return {
            battleRoot:
                !!document.querySelector(
                    '.tiktok-1dshqiq.ed2qype2'
                ),

            scoreBar:
                !!document.querySelector(
                    '.tiktok-f7u9mb.ecft6fa7'
                ),

            scores:
                [
                    ...document.querySelectorAll(
                        '.tiktok-3zkaam.ecft6fa17'
                    )
                ].map(el => el.textContent?.trim()),

            participantText:
                [
                    ...document.querySelectorAll(
                        '.tiktok-9sijbr.e1h62bb50, .tiktok-2obcil.e1h62bb53'
                    )
                ].map(el => el.textContent?.trim())
        };
    }

    /*
     * v2.1 change:
     * also expose the native controller destroy callback at hook 5.
     */
    function findController(fibers) {
        for (const fiber of fibers) {
            const refs =
                hookAt(fiber, 0)
                    ?.memoizedState
                    ?.current;

            const shown =
                hookAt(fiber, 1)
                    ?.memoizedState
                    ?.current;

            if (
                !refs ||
                typeof refs !== 'object' ||
                !refs.Cohost ||
                typeof refs.Cohost.init !== 'function' ||
                typeof refs.Cohost.update !== 'function' ||
                typeof refs.Cohost.destroy !== 'function' ||
                !Array.isArray(shown)
            ) {
                continue;
            }

            const updateFn = callbackAt(fiber, 3);
            const showFn = callbackAt(fiber, 4);
            const destroyFn = callbackAt(fiber, 5);

            if (
                typeof updateFn !== 'function' ||
                typeof showFn !== 'function' ||
                typeof destroyFn !== 'function'
            ) {
                continue;
            }

            const updateSource = fnSource(updateFn) || '';
            const showSource = fnSource(showFn) || '';
            const destroySource = fnSource(destroyFn) || '';

            if (
                updateSource.includes('.update(') &&
                showSource.includes('.init(') &&
                destroySource.includes('.destroy(')
            ) {
                return {
                    fiber,
                    refs,
                    shown,

                    updateFn,
                    showFn,
                    destroyFn,

                    updateSource,
                    showSource,
                    destroySource
                };
            }
        }

        return null;
    }

    function looksLikeModuleData(obj) {
        if (!obj || typeof obj !== 'object') return false;

        return (
            !!getRoomId(obj) &&
            !!getAnchorId(obj) &&
            !!obj.player &&
            !!obj.liveIMInstance &&
            !!obj.match &&
            'initialLinkedUsers' in obj &&
            typeof obj.onCohostStart === 'function' &&
            typeof obj.onCohostEnd === 'function'
        );
    }

    function collectCandidates(root) {
        const fibers = allFibers(root);
        const seen = new WeakSet();

        const rooms = [];
        const modules = [];
        const imCandidates = [];

        function walk(obj, path, depth, fiberId) {
            if (
                !obj ||
                typeof obj !== 'object' ||
                seen.has(obj) ||
                depth > 8
            ) {
                return;
            }

            seen.add(obj);

            try {
                if (looksLikeModuleData(obj)) {
                    modules.push({
                        object: obj,
                        path,
                        fiberId
                    });
                }
            } catch (_) {}

            try {
                const roomId = getRoomId(obj);
                const anchorId = getAnchorId(obj);
                const battle = getBattle(obj);
                const users = getSocialUsers(obj);

                const status =
                    obj?.liveRoomStatus ??
                    obj?.live_room_status;

                const reportLinkType =
                    obj?.reportLinkType ??
                    obj?.report_link_type;

                if (
                    roomId &&
                    anchorId &&
                    (
                        battle ||
                        users ||
                        status !== undefined ||
                        reportLinkType !== undefined
                    )
                ) {
                    rooms.push({
                        object: obj,
                        path,
                        fiberId,
                        roomId,
                        anchorId,
                        battle,
                        users,
                        status,
                        reportLinkType
                    });
                }
            } catch (_) {}

            try {
                if (
                    obj._config &&
                    (
                        obj._messageEvents ||
                        obj._socket
                    )
                ) {
                    imCandidates.push({
                        object: obj,
                        path,
                        fiberId
                    });
                }
            } catch (_) {}

            let entries = [];

            try {
                entries = Object.entries(obj);
            } catch (_) {
                return;
            }

            for (const [key, value] of entries) {
                if (value && typeof value === 'object') {
                    walk(
                        value,
                        `${path}.${key}`,
                        depth + 1,
                        fiberId
                    );
                }
            }
        }

        for (const fiber of fibers) {
            const fid = oid(fiber);

            walk(
                fiber.memoizedProps,
                `fiber${fid}.memoizedProps`,
                0,
                fid
            );

            walk(
                fiber.memoizedState,
                `fiber${fid}.memoizedState`,
                0,
                fid
            );

            walk(
                fiber.updateQueue,
                `fiber${fid}.updateQueue`,
                0,
                fid
            );
        }

        return {
            fibers,
            rooms,
            modules,
            imCandidates
        };
    }

    function chooseCurrentRoom(rooms) {
        const groups = new Map();

        for (const room of rooms) {
            if (!room.roomId || !room.anchorId) continue;

            const battleId =
                getBattleId(room.battle) || '-';

            const channelId =
                getChannelId(room.battle) || '-';

            const key =
                `${room.roomId}|${room.anchorId}|${battleId}|${channelId}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    score: 0,
                    items: []
                });
            }

            const group = groups.get(key);

            group.items.push(room);

            if (room.status === 2) group.score += 20;

            if (
                room.reportLinkType ===
                'video_anchor_pk'
            ) {
                group.score += 20;
            }

            if (room.battle) group.score += 20;

            if (Array.isArray(room.users)) {
                group.score += room.users.length * 15;
            }

            group.score += 1;
        }

        const ranked =
            [...groups.values()]
                .sort(
                    (a, b) =>
                        b.score - a.score
                );

        if (!ranked.length) return null;

        const best = ranked[0];

        return (
            best.items.find(
                item =>
                    item.status === 2 &&
                    item.reportLinkType === 'video_anchor_pk' &&
                    item.battle &&
                    Array.isArray(item.users)
            )
            ??
            best.items.find(
                item =>
                    item.status === 2 &&
                    item.battle
            )
            ??
            best.items[0]
        );
    }

    function chooseMountedModule(modules, roomId, anchorId) {
        const exact = modules.filter(item => {
            const obj = item.object;

            return (
                getRoomId(obj) === roomId &&
                getAnchorId(obj) === anchorId
            );
        });

        if (!exact.length) return null;

        return (
            exact.find(item =>
                /\.memoizedState\.memoizedState$/.test(item.path)
            )
            ??
            exact[0]
        );
    }

    function chooseBaseModule(modules, currentRoomId) {
        if (!modules.length) return null;

        return (
            modules.find(item =>
                imMatchesRoom(
                    item.object.liveIMInstance,
                    currentRoomId
                )
            )
            ??
            modules[0]
        );
    }

    function findCurrentIM(imCandidates, roomId) {
        const item =
            imCandidates.find(candidate =>
                imMatchesRoom(
                    candidate.object,
                    roomId
                )
            );

        return item?.object || null;
    }

    function makeReportBase() {
        return {
            time:
                new Date().toLocaleTimeString(),

            capturedAt:
                new Date().toISOString(),

            version: '2.6.10',

            page:
                location.href
        };
    }

    // Read-only diagnostics: never substitute a different room's module.
    function captureNativeState() {
        const result = { capturedAt: new Date().toISOString(), page: location.href,
            version: '2.6.10', dom: domState(), modules: [], partialModules: [] };
        try {
            const root = committedRoot();
            if (!root) return { ...result, discovery: 'NO_REACT_ROOT' };
            const data = collectCandidates(root);
            const current = chooseCurrentRoom(data.rooms);
            const controller = findController(data.fibers);
            result.current = current ? { roomId: current.roomId, anchorId: current.anchorId,
                battleId: getBattleId(current.battle), channelId: getChannelId(current.battle),
                status: current.status, path: current.path,
                battle: current.battle ? {
                    action: current.battle.action ?? null,
                    status: current.battle.status ?? current.battle.battle_status ?? null,
                    type: current.battle.battle_type ?? current.battle.battle_settings?.battle_type ?? null,
                    anchorCount: current.battle.anchors_info?.length ?? null,
                    teamCount: current.battle.team_member?.length ?? null
                } : null,
                users: current.users?.map(summarizeUser) } : null;
            result.controller = controller ? { objectId: oid(controller.fiber),
                shown: [...controller.shown], moduleRefKeys: Object.keys(controller.refs.Cohost) } : null;
            function summarize(obj, path) {
                return { path, objectId: oid(obj), roomId: getRoomId(obj), anchorId: getAnchorId(obj),
                    groupChannelId: sid(obj.groupChannelId), hasPlayer: !!obj.player,
                    hasMatch: !!obj.match, imRoom: summarizeIMRoom(obj.liveIMInstance),
                    matchesCurrentIM: !!current && imMatchesRoom(obj.liveIMInstance, current.roomId),
                    initialUsers: Array.isArray(obj.initialLinkedUsers)
                        ? obj.initialLinkedUsers.map(summarizeUser) : null,
                    battleId: getBattleId(obj.match?.initialBattleInfo),
                    callbacks: { start: typeof obj.onCohostStart, end: typeof obj.onCohostEnd,
                        matchStart: typeof obj.match?.onMatchStart, matchEnd: typeof obj.match?.onMatchEnd } };
            }
            result.modules = data.modules.slice(0, 30).map(x => summarize(x.object, x.path));
            result.roomCandidates = data.rooms.slice(0, 30).map(x => ({
                roomId: x.roomId, anchorId: x.anchorId, path: x.path, status: x.status,
                battleId: getBattleId(x.battle), userCount: x.users?.length ?? null }));
            if (controller && current) {
                const handler = findHandler(controller.fiber);
                result.handler = handler ? { index: handler.index, objectId: oid(handler.fn) } : null;
                result.storeGroups = handler ? findGroups(controller.fiber, current.roomId, handler.index)
                    .map(g => ({ index: g.index, roomId: sid(g.snapshot.roomId),
                        isSubscriber: g.snapshot.isSubscriber })) : [];
            }
            // Broader shape search reveals incomplete data excluded by baseline discovery.
            const seen = new WeakSet();
            let visited = 0;
            function walk(obj, path, depth) {
                if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 12 || visited >= 60000) return;
                seen.add(obj); visited++;
                try {
                    if (('initialLinkedUsers' in obj || 'onCohostStart' in obj) &&
                        result.partialModules.length < 30 && !looksLikeModuleData(obj))
                        result.partialModules.push(summarize(obj, path));
                    for (const [key, value] of Object.entries(obj)) {
                        if (['return', 'alternate', 'child', 'sibling', 'stateNode'].includes(key)) continue;
                        if (value && typeof value === 'object') walk(value, path + '.' + key, depth + 1);
                    }
                } catch (_) {}
            }
            if (controller) walk(controller.refs, 'controller.refs', 0);
            data.fibers.forEach((fiber, i) => {
                walk(fiber.memoizedProps, 'f' + i + '.props', 0);
                walk(fiber.memoizedState, 'f' + i + '.state', 0);
                walk(fiber.updateQueue, 'f' + i + '.queue', 0);
            });
            result.visitedObjects = visited;
            result.scanLimitReached = visited >= 60000;
        } catch (error) { result.error = String(error); }
        return result;
    }

    // Bounded event observation. No emit interception, replay, or native-state mutation.
    const liveCapture = { active: false, report: null, listeners: [], emitters: new WeakSet(),
        timer: null, scans: 0, page: null, started: 0, baseline: null };

    function diagnosticValue(value) {
        const seen = new WeakSet();
        let budget = 600;
        function visit(v, depth) {
            if (--budget < 0) return '[Limit]';
            if (v == null || typeof v === 'boolean') return v;
            if (typeof v === 'string') return v.length > 1500 ? v.slice(0, 1500) + '[Truncated]' : v;
            if (typeof v === 'bigint') return String(v);
            if (typeof v === 'number') {
                return Number.isInteger(v) && !Number.isSafeInteger(v)
                    ? { unsafeNumber: String(v), precisionAlreadyLost: true } : v;
            }
            if (typeof v !== 'object') return '[' + typeof v + ']';
            if (depth > 6) return '[Depth limit]';
            if (seen.has(v)) return '[Reference]';
            seen.add(v);
            if (Array.isArray(v)) return v.slice(0, 20).map(x => visit(x, depth + 1));
            const out = {};
            let count = 0;
            try {
                for (const key of Object.keys(v)) {
                    if (++count > 70) { out._truncated = true; break; }
                    if (/token|cookie|authorization|password|signature|headers|avatar|url/i.test(key)) continue;
                    const descriptor = Object.getOwnPropertyDescriptor(v, key);
                    if (descriptor && 'value' in descriptor) out[key] = visit(descriptor.value, depth + 1);
                }
            } catch (_) { out._unreadable = true; }
            return out;
        }
        return visit(value, 0);
    }

    function captureEvent(emitterPath, eventName, args) {
        if (!liveCapture.active || location.href !== liveCapture.page) return;
        const report = liveCapture.report;
        report.totalEvents++;
        // Keep SEI at one sample/second per emitter, and significant named events individually.
        const now = Date.now();
        const stampKey = emitterPath + '|' + eventName;
        if (eventName === 'sei_parsed') {
            const previous = report.lastSEIAt[stampKey] ?? -Infinity;
            if (now - previous < 1000) { report.throttledSEI++; return; }
            report.lastSEIAt[stampKey] = now;
        }
        if (eventName !== 'sei_parsed') {
            report.imEvents.push({ ms: now - liveCapture.started, emitterPath, eventName, payload: diagnosticValue(args) });
            if (report.imEvents.length > 160) { report.imEvents.shift(); report.droppedIMEvents++; }
            return;
        }
        // Raw video bytes obscured useful evidence in the previous report.
        args = args.map(value => value && typeof value === 'object' ? {
            seiContent: value.seiContent, combineRegions: value.combineRegions,
            isInChatting: value.isInChatting, hasChatEndMark: value.hasChatEndMark
        } : value);
        const app = args[0]?.seiContent?.app_data;
        const group = app?.group_channel_id;
        const matching = group == null ? null : report.observedGroupChannels.includes(String(group));
        report.events.push({ ms: now - liveCapture.started, emitterPath, eventName,
            matchingObservedGroup: matching, payload: diagnosticValue(args) });
        if (report.events.length > 120) { report.events.shift(); report.droppedOldEvents++; }
    }

    const imCapture = { subscriptions: new WeakMap(), inspected: new WeakSet(), seenPayloads: new WeakSet() };
    const battleEventName = name => /battle|link.?mic|co.?host|participant|Webcast.*Match/i.test(String(name));

    function recordIMMessage(path, eventName, args) {
        if (!liveCapture.active || location.href !== liveCapture.page) return;
        const report = liveCapture.report;
        report.imMessagesObserved++;
        const seen = new WeakSet();
        let visited = 0, relevant = false;
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || depth > 5 || seen.has(value) || visited++ > 150) return;
            seen.add(value);
            const method = value.method ?? value.messageType ?? value.message_type ?? value.type ?? value.event;
            if (typeof method === 'string') {
                // Store only a bounded inventory for unrelated messages, not their bodies.
                if (Object.keys(report.imMessageTypes).length < 100 || method in report.imMessageTypes)
                    report.imMessageTypes[method] = (report.imMessageTypes[method] || 0) + 1;
                if (battleEventName(method)) {
                    relevant = true;
                    if (!imCapture.seenPayloads.has(value)) {
                        imCapture.seenPayloads.add(value);
                        captureEvent(path, method, [value]);
                    }
                    return;
                }
            }
            if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
            for (const key of Object.keys(value).slice(0, 40)) {
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor && 'value' in descriptor && descriptor.value && typeof descriptor.value === 'object')
                    walk(descriptor.value, depth + 1);
            }
        }
        args.forEach(arg => walk(arg, 0));
        if (!relevant && report.imEnvelopeShapes.length < 12) {
            const shape = args.map(x => ({
                type: typeof x,
                kind: x?.constructor?.name ?? null,
                keys: x && typeof x === 'object' ? Object.keys(x).slice(0, 30) : [],
                byteLength: ArrayBuffer.isView(x) || x instanceof ArrayBuffer ? x.byteLength : undefined
            }));
            const signature = JSON.stringify(shape);
            if (!report.imEnvelopeShapes.some(x => x.signature === signature))
                report.imEnvelopeShapes.push({ path, eventName, signature, shape });
        }
    }

    function scanCurrentIM(fibers) {
        const report = liveCapture.report;
        const seen = new WeakSet();
        const ims = [];
        let visited = 0;
        const expectedRoom = report.before.current?.roomId;
        function discover(obj, path, depth) {
            if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 8 || visited++ > 30000) return;
            seen.add(obj);
            if (expectedRoom && imMatchesRoom(obj, expectedRoom)) ims.push({ obj, path });
            for (const key of Object.keys(obj)) {
                if (['return','alternate','child','sibling','stateNode','window','document'].includes(key)) continue;
                const d = Object.getOwnPropertyDescriptor(obj, key);
                if (d && 'value' in d && d.value && typeof d.value === 'object') discover(d.value, path + '.' + key, depth + 1);
            }
        }
        // Scan committed store queues first; don't spend the budget in global app dependencies.
        for (const [i, fiber] of fibers.entries()) {
            for (const [j, store] of (fiber.updateQueue?.stores || []).entries())
                discover(store.value, 'f' + i + '.stores.' + j, 0);
        }
        for (const [i, fiber] of fibers.entries()) {
            discover(fiber.memoizedProps, 'f' + i + '.props', 0);
            discover(fiber.memoizedState, 'f' + i + '.state', 0);
        }
        function inspect(obj, path, depth, localSeen) {
            if (!obj || typeof obj !== 'object' || depth > 4 || localSeen.has(obj)) return;
            localSeen.add(obj);
            const names = new Set();
            if (typeof obj.eventNames === 'function') {
                try { for (const name of obj.eventNames()) if (typeof name === 'string') names.add(name); } catch (_) {}
            }
            const registries = [];
            for (const key of Object.keys(obj).slice(0, 100)) {
                const d = Object.getOwnPropertyDescriptor(obj, key);
                const registry = d && 'value' in d ? d.value : null;
                if (!registry || typeof registry !== 'object') continue;
                const keys = registry instanceof Map ? [...registry.keys()].filter(x => typeof x === 'string') : Object.keys(registry);
                if (/event|listen|handler|callback|message/i.test(key)) {
                    registries.push({ key, kind: registry.constructor?.name, keys: keys.slice(0, 80) });
                    for (const name of keys) {
                        if (battleEventName(name) || (name === 'message' && /event/i.test(key))) names.add(name);
                    }
                }
            }
            if (!imCapture.inspected.has(obj) && report.imObjects.length < 60) {
                imCapture.inspected.add(obj);
                report.imObjects.push({ path, keys: Object.keys(obj).slice(0, 80), registries,
                    onSource: typeof obj.on === 'function' ? fnSource(obj.on) : null,
                    emitSource: typeof obj.emit === 'function' ? fnSource(obj.emit) : null });
            }
            if (typeof obj.on === 'function' && typeof obj.off === 'function') {
                let subscribed = imCapture.subscriptions.get(obj);
                if (!subscribed) { subscribed = new Set(); imCapture.subscriptions.set(obj, subscribed); }
                for (const name of names) {
                    if ((!battleEventName(name) && name !== 'message') || subscribed.has(name) ||
                        report.imSubscriptions.length >= 100) continue;
                    const listener = (...args) => {
                        try {
                            if (battleEventName(name)) captureEvent(path, name, args);
                            else recordIMMessage(path, name, args);
                        } catch (_) {}
                    };
                    try {
                        obj.on(name, listener);
                        liveCapture.listeners.push({ obj, name, listener });
                        subscribed.add(name);
                        report.imSubscriptions.push({ path, eventName: name });
                    } catch (_) {}
                }
            }
            for (const key of Object.keys(obj).slice(0, 100)) {
                if (!/event|socket|message|handler|dispatch/i.test(key)) continue;
                const d = Object.getOwnPropertyDescriptor(obj, key);
                if (d && 'value' in d) inspect(d.value, path + '.' + key, depth + 1, localSeen);
            }
        }
        for (const { obj, path } of ims) inspect(obj, path, 0, new WeakSet());
        report.imDiscovery = { expectedRoom, matchedInstances: ims.length, visited, scanLimitReached: visited > 30000 };
    }


    function scanLiveCapture() {
        if (!liveCapture.active) return;
        if (location.href !== liveCapture.page) { finishLiveCapture('NAVIGATION', false); return; }
        try {
            const root = committedRoot();
            if (!root) return;
            const fibers = allFibers(root);
            scanCurrentIM(fibers);
            const seen = new WeakSet();
            let visited = 0;
            function walk(obj, path, depth) {
                if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 10 || visited >= 50000) return;
                seen.add(obj); visited++;
                try {
                    if (looksLikeModuleData(obj) && obj.groupChannelId != null) {
                        const id = sid(obj.groupChannelId);
                        if (!liveCapture.report.observedGroupChannels.includes(id))
                            liveCapture.report.observedGroupChannels.push(id);
                    }
                    if (typeof obj.on === 'function' && typeof obj.off === 'function' &&
                        !liveCapture.emitters.has(obj) && liveCapture.report.emitters.length < 80) {
                        const names = new Set(['sei_parsed']);
                        if (typeof obj.eventNames === 'function') {
                            for (const name of obj.eventNames()) if (typeof name === 'string') names.add(name);
                        }
                        for (const key of ['_events', '_eventMap']) {
                            const registry = obj[key];
                            if (registry && typeof registry === 'object')
                                for (const name of Object.keys(registry)) names.add(name);
                        }
                        const selected = /playerInstance/.test(path) ? ['sei_parsed'] : [];
                        const subscribed = [];
                        for (const name of selected.slice(0, 30)) {
                            const listener = (...args) => {
                                try { captureEvent(path, name, args); } catch (_) {}
                            };
                            try {
                                obj.on(name, listener);
                                liveCapture.listeners.push({ obj, name, listener });
                                subscribed.push(name);
                            } catch (_) {}
                        }
                        liveCapture.emitters.add(obj);
                        liveCapture.report.emitters.push({ path, discoveredEventNames: [...names].slice(0, 100),
                            subscribedEventNames: subscribed });
                    }
                    for (const key of Object.keys(obj)) {
                        if (['return', 'alternate', 'child', 'sibling', 'stateNode'].includes(key)) continue;
                        const descriptor = Object.getOwnPropertyDescriptor(obj, key);
                        if (descriptor && 'value' in descriptor && descriptor.value && typeof descriptor.value === 'object')
                            walk(descriptor.value, path + '.' + key, depth + 1);
                    }
                } catch (_) {}
            }
            fibers.forEach((fiber, i) => {
                walk(fiber.updateQueue, 'f' + i + '.queue', 0);
                walk(fiber.memoizedProps, 'f' + i + '.props', 0);
                walk(fiber.memoizedState, 'f' + i + '.state', 0);
            });
            liveCapture.report.samples.push({ ms: Date.now() - liveCapture.started,
                dom: domState(), visited, scanLimitReached: visited >= 50000 });
            liveCapture.scans++;
            const label = document.getElementById('tt-live-capture');
            if (label) label.textContent = 'Stop & view capture (' + liveCapture.report.imEvents.length + ' messages, ' + liveCapture.report.events.length + ' SEI)';
        } catch (error) { liveCapture.report.scanError = String(error); }
    }

    function finishLiveCapture(reason = 'USER_STOPPED', open = true) {
        if (!liveCapture.active) return;
        liveCapture.active = false;
        clearInterval(liveCapture.timer);
        for (const { obj, name, listener } of liveCapture.listeners) {
            try { obj.off(name, listener); } catch (_) {}
        }
        liveCapture.listeners = [];
        const report = liveCapture.report;
        report.stage = reason;
        report.durationMs = Date.now() - liveCapture.started;
        report.after = captureNativeState();
        delete report.lastSEIAt;
        lastReport = report;
        const label = document.getElementById('tt-live-capture');
        if (label) label.textContent = 'Record live events (90s)';
        if (open) showReport();
    }

    function startLiveCapture() {
        if (liveCapture.active) { finishLiveCapture(); return; }
        if (running) { updateStatus('WAIT FOR REPAIR TO FINISH', '#ffd43b'); return; }
        liveCapture.active = true;
        liveCapture.page = location.href;
        liveCapture.started = Date.now();
        liveCapture.emitters = new WeakSet();
        imCapture.subscriptions = new WeakMap();
        imCapture.inspected = new WeakSet();
        imCapture.seenPayloads = new WeakSet();
        liveCapture.listeners = [];
        liveCapture.report = { ...makeReportBase(), mode: 'LIVE_EVENT_DIAGNOSTIC', stage: 'RECORDING',
            note: 'Read-only event observation. Repair actions are blocked during capture. Empty capture does not prove no events were sent.',
            before: captureNativeState(), imEvents: [], imObjects: [], imSubscriptions: [],
            imMessageTypes: Object.create(null), imEnvelopeShapes: [], imMessagesObserved: 0, droppedIMEvents: 0, observedGroupChannels: [], emitters: [], events: [], samples: [],
            totalEvents: 0, throttledSEI: 0, droppedOldEvents: 0, lastSEIAt: {} };
        scanLiveCapture();
        liveCapture.timer = setInterval(() => {
            if (Date.now() - liveCapture.started >= 90000) finishLiveCapture('CAPTURE_COMPLETE');
            else scanLiveCapture();
        }, 5000);
    }


    function inspectParticipantState() {
        const report = { ...makeReportBase(), mode: 'NATIVE_PARTICIPANT_INSPECTOR',
            stage: 'READ_ONLY', nativeState: captureNativeState(), subscriptions: [],
            fibers: [], limits: { fibers: 16, hooksPerFiber: 130, callbacks: 45, sourceChars: 10000 } };
        const root = committedRoot();
        if (!root) { report.reason = 'No committed React root'; return report; }
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        if (!current) { report.reason = 'Current room unavailable'; return report; }
        const inspectedIM = new WeakSet();
        const ownListeners = new Set(liveCapture.listeners.map(x => x.listener));
        let callbackCount = 0;
        function callback(fn) {
            if (typeof fn !== 'function' || ownListeners.has(fn)) return null;
            if (callbackCount >= report.limits.callbacks) { report.callbackLimitReached = true; return null; }
            callbackCount++;
            let full;
            try { full = Function.prototype.toString.call(fn); } catch (_) { return null; }
            return { objectId: oid(fn), name: fn.name, source: full.slice(0, report.limits.sourceChars),
                sourceTruncated: full.length > report.limits.sourceChars };
        }
        for (const item of data.imCandidates) {
            const im = item.object;
            if (!imMatchesRoom(im, current.roomId) || inspectedIM.has(im._messageEvents)) continue;
            const bus = im._messageEvents;
            if (!bus) continue;
            inspectedIM.add(bus);
            const registry = bus.eventsMap;
            if (!(registry instanceof Map)) continue;
            for (const [eventName, listeners] of registry) {
                if (!/battle|link|co.?host|participant/i.test(String(eventName))) continue;
                const list = Array.isArray(listeners) ? listeners : [listeners];
                report.subscriptions.push({ path: item.path + '._messageEvents.eventsMap',
                    roomId: current.roomId, eventName: String(eventName), totalListeners: list.length,
                    callbacks: list.map(value => callback(typeof value === 'function' ? value : value?.fn))
                        .filter(Boolean) });
            }
        }
        const selected = new Map();
        function select(fiber, reason) {
            if (!fiber || typeof fiber !== 'object') return;
            if (selected.has(fiber)) { selected.get(fiber).push(reason); return; }
            if (selected.size < report.limits.fibers) selected.set(fiber, [reason]);
        }
        // Inspect the actual score/name component ancestors first.
        for (const selector of ['.tiktok-3zkaam.ecft6fa17', '.tiktok-f7u9mb.ecft6fa7',
            '.tiktok-9sijbr.e1h62bb50', '.tiktok-1dshqiq.ed2qype2']) {
            const node = document.querySelector(selector);
            let fiber = fiberOf(node);
            for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
                if (typeof fiber.type === 'function') select(fiber, selector + ' ancestor ' + depth);
            }
        }
        const controller = findController(data.fibers);
        select(controller?.fiber, 'Cohost controller');
        for (const module of data.modules) {
            if (getRoomId(module.object) !== current.roomId) continue;
            select(data.fibers.find(f => oid(f) === module.fiberId), 'Mounted module ' + module.path);
        }
        function summary(value) {
            if (!value || typeof value !== 'object') return diagnosticValue(value);
            if (Array.isArray(value)) return diagnosticValue(value.slice(0, 12));
            const keys = Object.keys(value);
            const fields = {};
            for (const key of keys) {
                if (!/user|anchor|opponent|participant|linked|room|battle|score|armies|current|state|data|value|status|id$|name/i.test(key))
                    continue;
                if (/token|cookie|password|signature|url/i.test(key)) continue;
                const d = Object.getOwnPropertyDescriptor(value, key);
                if (d && 'value' in d && typeof d.value !== 'function') fields[key] = d.value;
                if (Object.keys(fields).length >= 25) break;
            }
            return { keys: keys.slice(0, 50), fields: diagnosticValue(fields) };
        }
        for (const [fiber, reasons] of selected) {
            const entry = { objectId: oid(fiber), reasons,
                component: fiber.type?.displayName || fiber.type?.name || null,
                props: summary(fiber.memoizedProps), hooks: [] };
            let hook = fiber.memoizedState;
            const seen = new Set();
            for (let index = 0; hook && typeof hook === 'object' && !seen.has(hook) &&
                index < report.limits.hooksPerFiber; index++, hook = hook.next) {
                seen.add(hook);
                const state = hook.memoizedState;
                const functions = typeof state === 'function' ? [state] :
                    Array.isArray(state) ? state.filter(x => typeof x === 'function') :
                    typeof state?.current === 'function' ? [state.current] : [];
                const callbacks = functions.map(callback).filter(Boolean);
                entry.hooks.push({ index, state: summary(state), callbacks,
                    queueValue: hook.queue && 'value' in hook.queue ? summary(hook.queue.value) : undefined });
            }
            report.fibers.push(entry);
        }
        report.callbackCount = callbackCount;
        report.note = 'Read-only: no callback, effect, dispatch, update, show or destroy was invoked.';
        return report;
    }

    function captureParticipantState() {
        try {
            lastReport = inspectParticipantState();
        } catch (error) {
            lastReport = { ...makeReportBase(), mode: 'NATIVE_PARTICIPANT_INSPECTOR',
                stage: 'ERROR', error: String(error) };
        }
        showReport();
    }


    function inspectBattleHandlerRefs() {
        const report = { ...makeReportBase(), mode: 'BATTLE_HANDLER_REF_INSPECTOR',
            stage: 'READ_ONLY', nativeState: captureNativeState(), matches: [], effects: [],
            limits: { fibers: 12000, hooksPerFiber: 160, matches: 100, sourceChars: 16000 } };
        const root = committedRoot();
        if (!root) { report.reason = 'No committed React root'; return report; }
        const fibers = allFibers(root);
        const needles = [
            'LinkMicBattle', 'LinkMicArmies', 'anchors_info', 'anchorsInfo',
            'hostScore', 'initialLinkedUsers', 'linkedUsers', 'battle_id',
            'battleId', 'groupChannelId', 'onMatchStart'
        ];
        const seenFunctions = new WeakSet();
        const seenObjects = new WeakSet();
        let inspectedHooks = 0;
        function sourceInfo(fn, fiberIndex, hookIndex, location) {
            if (typeof fn !== 'function' || seenFunctions.has(fn) || report.matches.length >= report.limits.matches)
                return;
            seenFunctions.add(fn);
            let full;
            try { full = Function.prototype.toString.call(fn); } catch (_) { return; }
            const found = needles.filter(needle => full.includes(needle));
            if (!found.length) return;
            report.matches.push({ fiberIndex, hookIndex, location, objectId: oid(fn),
                name: fn.name || null, found, source: full.slice(0, report.limits.sourceChars),
                sourceTruncated: full.length > report.limits.sourceChars });
        }
        function inspectValue(value, fiberIndex, hookIndex, location, depth) {
            if (typeof value === 'function') { sourceInfo(value, fiberIndex, hookIndex, location); return; }
            if (!value || typeof value !== 'object' || seenObjects.has(value) || depth > 3) return;
            seenObjects.add(value);
            if (Array.isArray(value)) {
                value.slice(0, 30).forEach((item, index) =>
                    inspectValue(item, fiberIndex, hookIndex, location + '[' + index + ']', depth + 1));
                return;
            }
            for (const key of Object.keys(value).slice(0, 80)) {
                if (/token|cookie|password|signature|url/i.test(key)) continue;
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor || !('value' in descriptor)) continue;
                inspectValue(descriptor.value, fiberIndex, hookIndex, location + '.' + key, depth + 1);
            }
        }
        for (let fiberIndex = 0; fiberIndex < fibers.length && fiberIndex < report.limits.fibers; fiberIndex++) {
            const fiber = fibers[fiberIndex];
            let hook = fiber?.memoizedState;
            const hookSeen = new Set();
            for (let hookIndex = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) &&
                hookIndex < report.limits.hooksPerFiber; hookIndex++, hook = hook.next) {
                hookSeen.add(hook); inspectedHooks++;
                inspectValue(hook.memoizedState, fiberIndex, hookIndex, 'memoizedState', 0);
                inspectValue(hook.queue, fiberIndex, hookIndex, 'queue', 0);
                const effect = hook.memoizedState;
                if (effect && typeof effect === 'object' && typeof effect.create === 'function') {
                    let full = '';
                    try { full = Function.prototype.toString.call(effect.create); } catch (_) {}
                    const found = needles.filter(needle => full.includes(needle));
                    if (found.length && report.effects.length < 60) {
                        report.effects.push({ fiberIndex, hookIndex, tag: effect.tag, found,
                            createObjectId: oid(effect.create), source: full.slice(0, report.limits.sourceChars),
                            sourceTruncated: full.length > report.limits.sourceChars,
                            deps: diagnosticValue(effect.deps) });
                    }
                }
            }
        }
        report.fiberCount = fibers.length;
        report.inspectedHooks = inspectedHooks;
        report.matchLimitReached = report.matches.length >= report.limits.matches;
        report.note = 'Read-only: functions were converted to source text only; none were invoked.';
        return report;
    }

    function captureBattleHandlerRefs() {
        try { lastReport = inspectBattleHandlerRefs(); }
        catch (error) { lastReport = { ...makeReportBase(), mode: 'BATTLE_HANDLER_REF_INSPECTOR',
            stage: 'ERROR', error: String(error) }; }
        showReport();
    }


    // Targeted, non-destructive partial-state test. It retains the latest real
    // battle message and SEI, then updates the mounted Cohost module in place.
    const opponentData = { page: null, roomId: null, battle: null, battleAt: 0, battleOpen: null, battleOpenAt: 0, armies: null, armiesAt: 0,
        sei: null, seiAt: 0, listeners: [], buses: new WeakSet(), emitters: new WeakSet(), busy: false };

    function resetOpponentData() {
        for (const { target, event, listener } of opponentData.listeners) {
            try { target.off(event, listener); } catch (_) {}
        }
        opponentData.listeners = [];
        opponentData.buses = new WeakSet();
        opponentData.emitters = new WeakSet();
        opponentData.page = opponentData.roomId = null;
        opponentData.battle = opponentData.battleOpen = opponentData.armies = opponentData.sei = null;
        opponentData.battleAt = opponentData.battleOpenAt = opponentData.armiesAt = opponentData.seiAt = 0;
    }

    function observeOpponentData() {
        if (document.hidden) return;
        if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) { resetOpponentData(); return; }
        const root = committedRoot();
        if (!root) return;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        if (!current?.roomId) return;
        if (opponentData.page !== location.href || opponentData.roomId !== current.roomId) {
            resetOpponentData();
            opponentData.page = location.href;
            opponentData.roomId = current.roomId;
        }
        for (const item of data.imCandidates) {
            const im = item.object;
            if (!imMatchesRoom(im, current.roomId)) continue;
            const bus = im._messageEvents;
            if (!bus || typeof bus.on !== 'function' || typeof bus.off !== 'function' || opponentData.buses.has(bus)) continue;
            const listener = message => {
                const roomId = sid(message?.common?.room_id);
                const channelId = sid(message?.battle_settings?.channel_id ?? message?.channel_id);
                if (roomId !== opponentData.roomId || !channelId || !Array.isArray(message?.anchors_info) ||
                    message.anchors_info.length !== 2) return;
                opponentData.battle = message;
                opponentData.battleAt = Date.now();
                if (Number(message.action) === 4) {
                    opponentData.battleOpen = message;
                    opponentData.battleOpenAt = Date.now();
                }
            };
            try {
                bus.on('LinkMicBattle', listener);
                opponentData.listeners.push({ target: bus, event: 'LinkMicBattle', listener });
                const armiesListener = message => {
                    const roomId = sid(message?.common?.room_id);
                    if (roomId !== opponentData.roomId) return;
                    opponentData.armies = message;
                    opponentData.armiesAt = Date.now();
                };
                bus.on('LinkMicArmies', armiesListener);
                opponentData.listeners.push({ target: bus, event: 'LinkMicArmies', listener: armiesListener });
                opponentData.buses.add(bus);
            } catch (_) {}
        }
        const modules = data.modules.filter(item => getRoomId(item.object) === current.roomId);
        const seen = new WeakSet();
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 7) return;
            seen.add(value);
            if (typeof value.on === 'function' && typeof value.off === 'function' && !opponentData.emitters.has(value)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    if (app?.ver !== 2 || !Array.isArray(app.grids) || app.grids.length !== 2) return;
                    opponentData.sei = event;
                    opponentData.seiAt = Date.now();
                };
                try {
                    value.on('sei_parsed', listener);
                    opponentData.listeners.push({ target: value, event: 'sei_parsed', listener });
                    opponentData.emitters.add(value);
                } catch (_) {}
            }
            try {
                for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, depth + 1);
            } catch (_) {}
        }
        modules.forEach(item => walk(item.object.player, 0));
    }

    function buildLinkedUsers(battle, sei, localAnchorId) {
        const app = sei?.seiContent?.app_data;
        if (!Array.isArray(app?.grids) || app.grids.length !== 2) return null;
        const anchorEntries = battle.anchors_info.map(entry => ({
            key: sid(entry?.key), user: entry?.value?.user ?? entry?.user ?? entry?.value
        })).filter(entry => entry.key && entry.user);
        if (anchorEntries.length !== 2) return null;
        const localGridId = sid(app.anchor_link_mic_id);
        const localGrid = app.grids.find(grid => sid(grid.uid_str) === localGridId) ??
            app.grids.find(grid => sid(grid.cid) === opponentData.roomId);
        const remoteGrid = app.grids.find(grid => grid !== localGrid);
        const localEntry = anchorEntries.find(entry => entry.key === localAnchorId);
        const remoteEntry = anchorEntries.find(entry => entry.key !== localAnchorId);
        if (!localGrid || !remoteGrid || !localEntry || !remoteEntry) return null;
        function make(entry, grid) {
            const user = entry.user;
            const userId = sid(user.user_id_str ?? user.user_id ?? entry.key);
            const roomId = sid(grid.cid);
            const linkmicId = sid(grid.uid_str);
            return { ...user, id: userId, id_str: userId, user_id: userId, user_id_str: userId,
                room_id: roomId, room_id_str: roomId, roomId, linkmic_id_str: linkmicId,
                nick_name: user.nick_name ?? user.nickname ?? null,
                nickname: user.nickname ?? user.nick_name ?? null };
        }
        return [make(localEntry, localGrid), make(remoteEntry, remoteGrid)];
    }

    async function repairOpponentData() {
        if (running || opponentData.busy) return;
        opponentData.busy = true;
        const before = domState();
        const report = { ...makeReportBase(), mode: 'PARTIAL_IN_PLACE_UPDATE_TEST',
            stage: 'PREPARING', success: false, beforeDOM: before, timeline: [] };
        try {
            observeOpponentData();
            const root = committedRoot();
            const data = root && collectCandidates(root);
            const current = data && chooseCurrentRoom(data.rooms);
            const controller = data && findController(data.fibers);
            if (!current || !controller || !before.battleRoot ||
                (before.scoreBar && before.participantText.some(text => text?.trim())))
                throw new Error('The current page is not a verified incomplete Cohost/battle state');
            const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
            const moduleData = moduleItem?.object;
            if (!moduleData || !controller.shown.includes('Cohost') || typeof controller.updateFn !== 'function')
                throw new Error('Mounted current-room Cohost module/update callback was not found');
            const battle = opponentData.battle;
            const sei = opponentData.sei;
            const app = sei?.seiContent?.app_data;
            const battleChannel = sid(battle?.battle_settings?.channel_id ?? battle?.channel_id);
            const moduleChannel = sid(moduleData.groupChannelId);
            if (!battle || !sei || !battleChannel || battleChannel !== moduleChannel ||
                sid(app?.group_channel_id) !== moduleChannel)
                throw new Error('Matching real battle message and SEI are unavailable');
            const users = buildLinkedUsers(battle, sei, current.anchorId);
            if (!users || users.length !== 2) throw new Error('Could not map both anchors to the two real SEI grids');
            const corrected = { ...moduleData, initialLinkedUsers: users,
                match: { ...moduleData.match, initialBattleInfo: battle } };
            report.context = { roomId: current.roomId, anchorId: current.anchorId,
                battleId: getBattleId(battle), channelId: battleChannel, groupChannelId: moduleChannel };
            report.users = users.map(summarizeUser);
            report.pre = { modulePath: moduleItem.path,
                existingUsers: moduleData.initialLinkedUsers?.map(summarizeUser) ?? [],
                existingBattleId: getBattleId(moduleData.match?.initialBattleInfo), shown: [...controller.shown] };
            report.stage = 'UPDATING_IN_PLACE';
            updateStatus('UPDATING OPPONENT DATA', '#b48cff');
            controller.updateFn('Cohost', corrected);
            const start = Date.now();
            for (const ms of [100, 300, 750, 1500, 3000, 5000]) {
                await sleep(Math.max(0, start + ms - Date.now()));
                report.timeline.push({ ms, ...domState() });
            }
            const final = report.timeline.at(-1);
            report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
                hasTwoScores: final.scores.filter(text => text?.trim()).length >= 2,
                hasOpponentName: final.participantText.some(text => text?.trim()) };
            report.success = report.usable = Object.values(report.validation).every(Boolean);
            report.stage = report.success ? 'REPAIRED' : 'NO_CHANGE';
        } catch (error) {
            report.stage = 'REFUSED'; report.error = { message: error?.message || String(error) };
        } finally {
            lastReport = report;
            updateStatus(report.success ? 'OPPONENT FIXED ✓' : 'OPPONENT UPDATE NOT CONFIRMED',
                report.success ? '#55ff88' : '#ffb84d');
            opponentData.busy = false;
            showReport();
        }
        return report;
    }


    function opponentBattleId(value) {
        return sid(value?.battle_id_str ?? value?.battle_id ?? value?.battle_settings?.battle_id_str ??
            value?.battle_settings?.battle_id);
    }

    function findStoredCohostBattle(data, roomId, anchorId) {
        const moduleItem = chooseMountedModule(data.modules, roomId, anchorId);
        const owner = moduleItem && data.fibers.find(fiber => oid(fiber) === moduleItem.fiberId);
        if (!owner) return null;
        const stack = owner.child ? [owner.child] : [];
        const seen = new Set();
        while (stack.length && seen.size < 900) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
            let hook = fiber.memoizedState;
            const hookSeen = new Set();
            for (let index = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) && index < 180;
                index++, hook = hook.next) {
                hookSeen.add(hook);
                const state = hook.memoizedState;
                if (state && typeof state === 'object' && Array.isArray(state.anchors_info) &&
                    state.anchors_info.length === 2 && state.battle_settings && opponentBattleId(state))
                    return state;
            }
        }
        return null;
    }

    function isBattleOpenMessage(message) {
        return !!message && Number(message.action) === 4 && !!opponentBattleId(message);
    }

    function selectActiveBattle(data, roomId, anchorId) {
        const stored = findStoredCohostBattle(data, roomId, anchorId);
        const candidates = [opponentData.battleOpen, stored, opponentData.battle].filter(Boolean);
        return candidates.find(isBattleOpenMessage) ?? candidates[0] ?? null;
    }

    async function replayPkStartInPlace(current, battle, armies, report) {
        if (!isBattleOpenMessage(battle))
            throw new Error('The real PK OPEN message is unavailable; in-place replay was refused');
        const root = committedRoot();
        const data = root && collectCandidates(root);
        let handlers = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
        if (!handlers?.battleOpen) throw new Error('Mounted native PK OPEN handler was not found');
        const replay = { phase: 'IN_PLACE_PK_START', battleAction: Number(battle.action),
            battleOpen: { objectId: handlers.battleOpen.objectId,
                fiberObjectId: handlers.battleOpen.fiberObjectId, hookIndex: handlers.battleOpen.hookIndex },
            armiesScore: null };
        report.replays.push(replay);
        await Promise.resolve(handlers.battleOpen.fn(battle));
        const started = Date.now();
        while (Date.now() - started < 3000) {
            await sleep(50);
            const nextRoot = committedRoot();
            const nextData = nextRoot && collectCandidates(nextRoot);
            handlers = nextData && findCohostReplayHandlers(nextData, current.roomId, current.anchorId);
            if (handlers?.armiesScore || domState().scoreBar) break;
        }
        if (armies && handlers?.armiesScore) {
            handlers.armiesScore.fn(armies);
            replay.armiesScore = { objectId: handlers.armiesScore.objectId,
                fiberObjectId: handlers.armiesScore.fiberObjectId, hookIndex: handlers.armiesScore.hookIndex };
        }
        const validationStart = Date.now();
        for (const ms of [100, 300, 750, 1500, 3000]) {
            await sleep(Math.max(0, validationStart + ms - Date.now()));
            report.timeline.push({ ms, ...domState() });
        }
        const final = report.timeline.at(-1);
        report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
            hasTwoScores: final.scores.filter(text => text?.trim()).length >= 2,
            preservedOpponentName: final.participantText.some(text => text?.trim()) };
        report.success = report.usable = Object.values(report.validation).every(Boolean);
        report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
    }


    function findCohostReplayHandlers(data, roomId, anchorId) {
        const moduleItem = chooseMountedModule(data.modules, roomId, anchorId);
        if (!moduleItem) return null;
        const owner = data.fibers.find(fiber => oid(fiber) === moduleItem.fiberId);
        if (!owner) return null;
        const stack = owner.child ? [owner.child] : [];
        const seen = new Set();
        const found = { moduleItem, nameSEI: null, battleOpen: null, armiesScore: null };
        while (stack.length && seen.size < 900) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
            let hook = fiber.memoizedState;
            const hookSeen = new Set();
            for (let index = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) && index < 180;
                index++, hook = hook.next) {
                hookSeen.add(hook);
                const state = hook.memoizedState;
                const candidates = [];
                if (typeof state === 'function') candidates.push(state);
                if (typeof state?.current === 'function') candidates.push(state.current);
                if (Array.isArray(state)) for (const item of state) if (typeof item === 'function') candidates.push(item);
                for (const fn of candidates) {
                    let source = '';
                    try { source = Function.prototype.toString.call(fn); } catch (_) { continue; }
                    if (!found.nameSEI && source.includes('linkedUsersMap') && source.includes('combineRegions'))
                        found.nameSEI = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                    if (!found.battleOpen && source.includes('BattleAction.OPEN') && source.includes('battle_settings'))
                        found.battleOpen = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                    if (!found.armiesScore && source.includes('UPDATE_SCORES_DATA') && source.includes('hostScore'))
                        found.armiesScore = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                }
            }
        }
        return found;
    }

    async function waitForCohostRemoved(controller, timeoutMs = 1600) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (!controller.shown.includes('Cohost')) return Date.now() - started;
            await sleep(20);
        }
        throw new Error('Cohost was not removed from TikTok’s shown list');
    }

    async function replayIntoFreshCohost(current, battle, armies, sei, report, phase) {
        let replay = null;
        const started = Date.now();
        while (Date.now() - started < 2500) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            replay = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
            if (replay?.nameSEI && replay?.battleOpen) break;
            await sleep(50);
        }
        if (!replay?.nameSEI || !replay?.battleOpen)
            throw new Error('Fresh native Cohost replay handlers were not found');
        const item = { phase, handlers: {
            nameSEI: { objectId: replay.nameSEI.objectId, fiberObjectId: replay.nameSEI.fiberObjectId,
                hookIndex: replay.nameSEI.hookIndex },
            battleOpen: { objectId: replay.battleOpen.objectId, fiberObjectId: replay.battleOpen.fiberObjectId,
                hookIndex: replay.battleOpen.hookIndex }, armiesScore: replay.armiesScore ? {
                objectId: replay.armiesScore.objectId, fiberObjectId: replay.armiesScore.fiberObjectId,
                hookIndex: replay.armiesScore.hookIndex } : null } };
        report.replays.push(item);
        replay.nameSEI.fn(sei);
        await Promise.resolve(replay.battleOpen.fn(battle));
        if (armies) {
            const scoreStart = Date.now();
            while (!replay.armiesScore && Date.now() - scoreStart < 2500) {
                await sleep(50);
                const root = committedRoot();
                const data = root && collectCandidates(root);
                replay = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
            }
            if (replay?.armiesScore) {
                item.handlers.armiesScore = { objectId: replay.armiesScore.objectId,
                    fiberObjectId: replay.armiesScore.fiberObjectId, hookIndex: replay.armiesScore.hookIndex };
                replay.armiesScore.fn(armies);
            }
        }
    }

    async function remountCohost(controller, moduleData, current, battle, armies, sei, report, phase) {
        controller.destroyFn('Cohost');
        const removedInMs = await waitForCohostRemoved(controller);
        await sleep(80);
        controller.showFn('Cohost', moduleData);
        report.remounts.push({ phase, removedInMs, settleMs: 80 });
        await replayIntoFreshCohost(current, battle, armies, sei, report, phase);
    }

    // Recover an active 1v1 when TikTok shows a stale root but no current-room
    // Cohost module. All identity, room, channel and score inputs must agree.
    function reconstructOneVOneBattle(data, current, armies, sei) {
        const app = sei?.seiContent?.app_data;
        const settings = armies?.battle_settings;
        const battleId = opponentBattleId(armies);
        const channelId = sid(settings?.channel_id ?? armies?.channel_id);
        const armyIds = Object.keys(armies?.armies ?? {}).map(sid);
        const users = Array.isArray(current?.users) ? current.users : null;
        if (!users || users.length !== 2 || !battleId || !channelId ||
            Number(settings?.battle_type) !== 1 || sid(armies?.common?.room_id) !== current.roomId ||
            app?.ver !== 2 || sid(app.channel_id) !== current.roomId ||
            sid(app.group_channel_id) !== channelId || !Array.isArray(app.grids) || app.grids.length !== 2 ||
            armyIds.length !== 2 || new Set(armyIds).size !== 2) return null;
        const summaries = users.map(summarizeUser);
        if (summaries.some(user => !user.id || !user.name || !armyIds.includes(user.id))) return null;
        const mapped = mapCohostUsersToGrids(users, sei, current);
        if (!mapped || mapped.length !== 2) return null;
        const anchors = mapped.map(user => {
            const summary = summarizeUser(user);
            return { key: summary.id, value: { user: { ...user,
                user_id: summary.id, user_id_str: summary.id,
                nick_name: user.nick_name ?? user.nickname ?? summary.name,
                nickname: user.nickname ?? user.nick_name ?? summary.name } } };
        });
        return { battle: { action: 4, battle_id: battleId,
                battle_settings: { ...settings, battle_id: battleId, channel_id: channelId,
                    status: 1, battle_type: 1 },
                anchors_info: anchors, armies: [], team_armies: [],
                common: { ...armies.common, room_id: current.roomId, method: 'WebcastLinkMicBattle' } },
            users: mapped, channelId };
    }

    async function recoverOneVOneWithoutCurrentModule(data, current, controller, before, report) {
        const armies = opponentData.armies;
        const sei = opponentData.sei;
        if (!armies || Date.now() - opponentData.armiesAt > 8000 ||
            !sei || Date.now() - opponentData.seiAt > 8000)
            throw new Error('Fresh 1v1 score and two-video data are unavailable');
        const rebuilt = reconstructOneVOneBattle(data, current, armies, sei);
        if (!rebuilt) throw new Error('The active 1v1 could not be reconstructed from verified live data');
        const { battle, users, channelId } = rebuilt;
        const baseItem = chooseBaseModule(data.modules, current.roomId);
        const base = baseItem?.object;
        if (!base || !base.player || !base.match ||
            typeof base.onCohostStart !== 'function' || typeof base.onCohostEnd !== 'function' ||
            typeof base.match.onMatchStart !== 'function' || typeof base.match.onMatchEnd !== 'function')
            throw new Error('A complete native Cohost base module is unavailable for 1v1 recovery');
        let liveIM = base.liveIMInstance;
        let imSource = 'base.liveIMInstance';
        if (!imMatchesRoom(liveIM, current.roomId)) {
            liveIM = findCurrentIM(data.imCandidates, current.roomId);
            imSource = 'verified-current-IM';
        }
        if (!liveIM || !imMatchesRoom(liveIM, current.roomId))
            throw new Error('The current-room live connection could not be verified for 1v1 recovery');
        const moduleData = { ...base, roomId: current.roomId, anchorId: current.anchorId,
            initialLinkedUsers: users, groupChannelId: channelId, player: base.player,
            liveIMInstance: liveIM,
            match: { ...base.match, initialBattleInfo: battle } };
        report.mode = 'STALE_ONE_V_ONE_NATIVE_REOPEN';
        report.context = { roomId: current.roomId, anchorId: current.anchorId,
            battleId: opponentBattleId(battle), channelId, hasArmies: true,
            reconstructedStart: true, battleType: 1 };
        report.users = users.map(summarizeUser);
        report.moduleOpen = { basePath: baseItem.path, baseRoomId: getRoomId(base),
            baseAnchorId: getAnchorId(base), imSource, playerObjectId: oid(base.player),
            liveIMObjectId: oid(liveIM) };
        report.stage = 'REOPENING_CURRENT_ONE_V_ONE';
        updateStatus('REOPENING 1V1 INTERFACE', '#b48cff');
        if (controller.shown.includes('Cohost')) {
            await remountCohost(controller, moduleData, current, battle, armies, sei, report, 'STALE_TO_CURRENT');
        } else {
            controller.showFn('Cohost', moduleData);
            report.remounts.push({ phase: 'OPEN_CURRENT', destroySkipped: true });
            await replayIntoFreshCohost(current, battle, armies, sei, report, 'OPEN_CURRENT');
        }
        const started = Date.now();
        for (const ms of [100, 300, 750, 1500, 3000, 5000]) {
            await sleep(Math.max(0, started + ms - Date.now()));
            report.timeline.push({ ms, ...domState() });
        }
        const final = report.timeline.at(-1);
        report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
            hasTwoScores: final.scores.filter(text => text?.trim()).length >= 2,
            hasOpponentName: final.participantText.some(text => text?.trim()) };
        report.success = report.usable = Object.values(report.validation).every(Boolean);
        report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
        return report;
    }


    async function repairOpponentByRemount(options = {}) {
        if (running || opponentData.busy) return;
        running = opponentData.busy = true;
        const before = domState();
        const report = { ...makeReportBase(), mode: 'ROOT_OR_PARTIAL_REMOUNT_REPLAY_TEST', trigger: options.automatic ? 'AUTOMATIC' : 'MANUAL', stage: 'PREPARING',
            success: false, beforeDOM: before, timeline: [], remounts: [], replays: [], rollback: null };
        let original = null, controller = null, current = null, battle = null, armies = null, sei = null;
        try {
            observeOpponentData();
            const root = committedRoot();
            const data = root && collectCandidates(root);
            current = data && chooseCurrentRoom(data.rooms);
            controller = data && findController(data.fibers);
            const beforeHasName = before.participantText.some(text => text?.trim());
            const beforeRightScore = String(before.scores[1] ?? '').trim();
            if (!current || !controller || !before.battleRoot ||
                (before.scoreBar && beforeHasName && beforeRightScore && beforeRightScore !== '0'))
                throw new Error('The PK interface is already complete or is not a verified repairable state');
            const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
            const moduleData = moduleItem?.object;
            if (!moduleData || !controller.shown.includes('Cohost'))
                return await recoverOneVOneWithoutCurrentModule(data, current, controller, before, report);
            battle = selectActiveBattle(data, current.roomId, current.anchorId);
            armies = opponentData.armies;
            sei = opponentData.sei;
            const app = sei?.seiContent?.app_data;
            let moduleChannel = sid(moduleData.groupChannelId);
            let battleChannel = sid(battle?.battle_settings?.channel_id ?? battle?.channel_id);
            let reconstructed = null;
            const exactExisting = battle && sei && moduleChannel && battleChannel === moduleChannel &&
                sid(app?.group_channel_id) === moduleChannel &&
                (!opponentBattleId(armies) || opponentBattleId(armies) === opponentBattleId(battle));
            if (!exactExisting && armies && sei && Date.now() - opponentData.armiesAt <= 8000 &&
                Date.now() - opponentData.seiAt <= 8000) {
                reconstructed = reconstructOneVOneBattle(data, current, armies, sei);
                if (reconstructed) {
                    battle = reconstructed.battle;
                    battleChannel = reconstructed.channelId;
                    moduleChannel = battleChannel;
                }
            }
            if (!battle || !sei || !moduleChannel || battleChannel !== moduleChannel ||
                sid(app?.group_channel_id) !== moduleChannel)
                throw new Error('Matching real or reconstructed battle data and SEI are unavailable');
            if (armies && opponentBattleId(armies) && opponentBattleId(armies) !== opponentBattleId(battle))
                armies = null;
            const users = reconstructed?.users ?? buildLinkedUsers(battle, sei, current.anchorId);
            if (!users || users.length !== 2) throw new Error('Both real participants could not be mapped');
            original = { ...moduleData, match: { ...moduleData.match } };
            const corrected = { ...moduleData, groupChannelId: battleChannel, initialLinkedUsers: users,
                match: { ...moduleData.match, initialBattleInfo: battle } };
            report.context = { roomId: current.roomId, anchorId: current.anchorId,
                battleId: opponentBattleId(battle), channelId: battleChannel, hasArmies: !!armies,
                reconstructedStart: !!reconstructed, replacedStaleGroupChannel: sid(moduleData.groupChannelId) !== battleChannel,
                battleAction: Number(battle.action), battleStatus: Number(battle?.battle_settings?.status),
                battleType: Number(battle?.battle_settings?.battle_type) };
            report.users = users.map(summarizeUser);
            if (!before.scoreBar && beforeHasName) {
                report.mode = 'PK_START_IN_PLACE_REPLAY';
                report.stage = 'REPLAYING_PK_OPEN';
                updateStatus('STARTING PK INTERFACE', '#b48cff');
                await replayPkStartInPlace(current, battle, armies, report);
                return report;
            }
            report.stage = 'REMOUNTING_AND_REPLAYING';
            updateStatus('RESTARTING OPPONENT VIEW', '#b48cff');
            await remountCohost(controller, corrected, current, battle, armies, sei, report, 'CORRECTED');
            const start = Date.now();
            for (const ms of [100, 300, 750, 1500, 3000, 5000]) {
                await sleep(Math.max(0, start + ms - Date.now()));
                report.timeline.push({ ms, ...domState() });
            }
            const final = report.timeline.at(-1);
            report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
                hasTwoScores: final.scores.filter(text => text?.trim()).length >= 2,
                hasOpponentName: final.participantText.some(text => text?.trim()) };
            report.success = report.usable = Object.values(report.validation).every(Boolean);
            report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
            if (!report.success && before.scoreBar && !final.scoreBar) {
                report.rollback = { attempted: true };
                try {
                    await remountCohost(controller, original, current, battle, armies, sei, report, 'ROLLBACK');
                    await sleep(1200);
                    report.rollback.dom = domState();
                    report.rollback.restoredScoreBar = report.rollback.dom.scoreBar;
                } catch (rollbackError) {
                    report.rollback.error = rollbackError?.message || String(rollbackError);
                }
            }
        } catch (error) {
            report.stage = 'REFUSED_OR_FAILED';
            report.error = { message: error?.message || String(error) };
            if (original && controller && current && before.scoreBar && !domState().scoreBar && battle && sei) {
                report.rollback = { attempted: true };
                try {
                    await remountCohost(controller, original, current, battle, armies, sei, report, 'ROLLBACK_AFTER_ERROR');
                    await sleep(1200);
                    report.rollback.dom = domState();
                    report.rollback.restoredScoreBar = report.rollback.dom.scoreBar;
                } catch (rollbackError) {
                    report.rollback.error = rollbackError?.message || String(rollbackError);
                }
            }
        } finally {
            lastReport = report;
            updateStatus(report.success ? 'OPPONENT FIXED ✓' : 'TEST FINISHED — VIEW REPORT',
                report.success ? '#55ff88' : '#ffb84d');
            running = opponentData.busy = false;
            if (!options.automatic || !report.success) showReport();
        }
        return report;
    }


    // v2.6.10: controller.shown can change before React unmounts the Cohost child.
    // Wait for both signals so useState/useMemo closures are recreated from corrected data.
    async function waitForCohostRemoved(controller, timeoutMs = 2200) {
        const started = Date.now();
        let shownRemovedAt = null;
        let domRemovedAt = null;
        while (Date.now() - started < timeoutMs) {
            const elapsed = Date.now() - started;
            if (shownRemovedAt == null && !controller.shown.includes('Cohost')) shownRemovedAt = elapsed;
            if (domRemovedAt == null && !domState().battleRoot) domRemovedAt = elapsed;
            if (shownRemovedAt != null && domRemovedAt != null)
                return { shownRemovedInMs: shownRemovedAt, domRemovedInMs: domRemovedAt };
            await sleep(20);
        }
        throw new Error('Cohost controller closed, but its React layout did not fully unmount');
    }

    async function replayIntoFreshCohost(current, battle, armies, sei, report, phase) {
        let replay = null;
        const started = Date.now();
        while (Date.now() - started < 3000) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            replay = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
            if (replay?.nameSEI && replay?.battleOpen) break;
            await sleep(50);
        }
        if (!replay?.nameSEI || !replay?.battleOpen)
            throw new Error('Fresh native Cohost replay handlers were not found');
        const item = { phase, handlers: {
            nameSEI: { objectId: replay.nameSEI.objectId, fiberObjectId: replay.nameSEI.fiberObjectId,
                hookIndex: replay.nameSEI.hookIndex },
            battleOpen: { objectId: replay.battleOpen.objectId, fiberObjectId: replay.battleOpen.fiberObjectId,
                hookIndex: replay.battleOpen.hookIndex }, armiesScore: null }, secondSEIReplay: false };
        report.replays.push(item);
        replay.nameSEI.fn(sei);
        await Promise.resolve(replay.battleOpen.fn(battle));
        // Battle OPEN mounts the score component. Re-discover after that commit and
        // replay SEI once more so participant rendering sees the initialized child.
        await sleep(250);
        const nextRoot = committedRoot();
        const nextData = nextRoot && collectCandidates(nextRoot);
        const nextReplay = nextData && findCohostReplayHandlers(nextData, current.roomId, current.anchorId);
        if (nextReplay?.nameSEI) {
            nextReplay.nameSEI.fn(sei);
            item.secondSEIReplay = true;
            item.handlers.nameSEIAfterBattle = { objectId: nextReplay.nameSEI.objectId,
                fiberObjectId: nextReplay.nameSEI.fiberObjectId, hookIndex: nextReplay.nameSEI.hookIndex };
        }
        replay = nextReplay ?? replay;
        if (armies && replay?.armiesScore) {
            item.handlers.armiesScore = { objectId: replay.armiesScore.objectId,
                fiberObjectId: replay.armiesScore.fiberObjectId, hookIndex: replay.armiesScore.hookIndex };
            replay.armiesScore.fn(armies);
        }
    }

    async function remountCohost(controller, moduleData, current, battle, armies, sei, report, phase) {
        controller.destroyFn('Cohost');
        const removal = await waitForCohostRemoved(controller);
        await sleep(120);
        controller.showFn('Cohost', moduleData);
        report.remounts.push({ phase, ...removal, settleMs: 120 });
        await replayIntoFreshCohost(current, battle, armies, sei, report, phase);
    }


    // v2.6.10: a fast DOM removal can precede full React effect cleanup. Keep the
    // destroy-to-init boundary near 500ms, matching the live-proven successful case.
    async function remountCohost(controller, moduleData, current, battle, armies, sei, report, phase) {
        controller.destroyFn('Cohost');
        const removal = await waitForCohostRemoved(controller);
        const settleMs = Math.max(150, 500 - removal.domRemovedInMs);
        await sleep(settleMs);
        controller.showFn('Cohost', moduleData);
        report.remounts.push({ phase, ...removal, settleMs,
            destroyToReopenMs: removal.domRemovedInMs + settleMs });
        await replayIntoFreshCohost(current, battle, armies, sei, report, phase);
    }

    async function replayIntoFreshCohost(current, battle, armies, sei, report, phase) {
        let replay = null;
        const started = Date.now();
        while (Date.now() - started < 3000) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            replay = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
            if (replay?.nameSEI && replay?.battleOpen) break;
            await sleep(50);
        }
        if (!replay?.nameSEI || !replay?.battleOpen)
            throw new Error('Fresh native Cohost replay handlers were not found');
        const item = { phase, handlers: {
            nameSEI: { objectId: replay.nameSEI.objectId, fiberObjectId: replay.nameSEI.fiberObjectId,
                hookIndex: replay.nameSEI.hookIndex },
            battleOpen: { objectId: replay.battleOpen.objectId, fiberObjectId: replay.battleOpen.fiberObjectId,
                hookIndex: replay.battleOpen.hookIndex }, armiesScore: null },
            secondSEIReplay: false, delayedSEIReplay: false };
        report.replays.push(item);
        replay.nameSEI.fn(sei);
        await Promise.resolve(replay.battleOpen.fn(battle));
        await sleep(250);
        let root = committedRoot();
        let data = root && collectCandidates(root);
        replay = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
        if (replay?.nameSEI) {
            replay.nameSEI.fn(sei);
            item.secondSEIReplay = true;
            item.handlers.nameSEIAfterBattle = { objectId: replay.nameSEI.objectId,
                fiberObjectId: replay.nameSEI.fiberObjectId, hookIndex: replay.nameSEI.hookIndex };
        }
        if (armies && replay?.armiesScore) {
            item.handlers.armiesScore = { objectId: replay.armiesScore.objectId,
                fiberObjectId: replay.armiesScore.fiberObjectId, hookIndex: replay.armiesScore.hookIndex };
            replay.armiesScore.fn(armies);
        }
        await sleep(500);
        root = committedRoot();
        data = root && collectCandidates(root);
        const delayed = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
        if (delayed?.nameSEI) {
            delayed.nameSEI.fn(sei);
            item.delayedSEIReplay = true;
            item.handlers.nameSEIDelayed = { objectId: delayed.nameSEI.objectId,
                fiberObjectId: delayed.nameSEI.fiberObjectId, hookIndex: delayed.nameSEI.hookIndex };
        }
        if (armies && delayed?.armiesScore) delayed.armiesScore.fn(armies);
    }


    // Fallback for the fully missing layout when TikTok exposes no Cohost module
    // or battle metadata. It captures real two-grid SEI by exact current room ID.
    const missingLayout = { page: null, roomId: null, event: null, meta: null,
        listeners: new Map(), busy: false };

    function resetMissingLayout() {
        for (const [emitter, listener] of missingLayout.listeners) {
            try { emitter.off('sei_parsed', listener); } catch (_) {}
        }
        missingLayout.listeners.clear();
        missingLayout.page = missingLayout.roomId = null;
        missingLayout.event = missingLayout.meta = null;
    }

    function discoverMissingLayout() {
        const root = committedRoot();
        if (!root) return null;
        const data = collectCandidates(root);
        const selected = chooseCurrentRoom(data.rooms);
        if (!selected?.roomId || !selected?.anchorId) return null;
        const active = data.rooms.find(item => item.roomId === selected.roomId &&
            item.anchorId === selected.anchorId && item.status === 2) ?? selected;
        const controller = findController(data.fibers);
        const handler = controller && findHandler(controller.fiber);
        if (!controller || !handler) return null;
        const groups = findGroups(controller.fiber, active.roomId, handler.index);
        if (!groups.length) return null;
        return { data, current: active, controller, handler, groups };
    }

    function attachMissingLayoutSEI(discovery) {
        if (missingLayout.page !== location.href || missingLayout.roomId !== discovery.current.roomId) {
            resetMissingLayout();
            missingLayout.page = location.href;
            missingLayout.roomId = discovery.current.roomId;
        }
        const seen = new WeakSet();
        function walk(value, path, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 9) return;
            seen.add(value);
            if (typeof value.on === 'function' && typeof value.off === 'function' &&
                !missingLayout.listeners.has(value)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    const grids = Array.isArray(app?.grids) ? app.grids : event?.combineRegions;
                    if (missingLayout.page !== location.href || app?.ver !== 2 ||
                        sid(app.channel_id) !== missingLayout.roomId || !sid(app.group_channel_id) ||
                        !Array.isArray(grids) || grids.length !== 2) return;
                    missingLayout.event = event;
                    missingLayout.meta = { capturedAt: new Date().toISOString(), timestamp: Date.now(), path,
                        ver: app.ver, roomChannelId: sid(app.channel_id),
                        groupChannelId: sid(app.group_channel_id), battleId: sid(app.battle_id),
                        gridCount: grids.length, isInChatting: event.isInChatting };
                };
                try {
                    value.on('sei_parsed', listener);
                    missingLayout.listeners.set(value, listener);
                } catch (_) {}
            }
            try {
                for (const [name, child] of Object.entries(value)) {
                    if (child && typeof child === 'object') walk(child, path + '.' + name, depth + 1);
                }
            } catch (_) {}
        }
        discovery.data.fibers.forEach((fiber, index) => {
            walk(fiber.memoizedProps, 'f' + index + '.props', 0);
            walk(fiber.memoizedState, 'f' + index + '.state', 0);
            walk(fiber.updateQueue, 'f' + index + '.queue', 0);
        });
    }

    function observeMissingLayoutSEI() {
        if (document.hidden) return;
        if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) { resetMissingLayout(); return; }
        const discovery = discoverMissingLayout();
        if (discovery) attachMissingLayoutSEI(discovery);
    }

    async function repairMissingLayout(options = {}) {
        if (running || missingLayout.busy) return;
        missingLayout.busy = true;
        const report = { ...makeReportBase(), mode: 'MISSING_LAYOUT_ROOM_SEI_TEST', trigger: options.automatic ? 'AUTOMATIC' : 'MANUAL',
            stage: 'PREPARING', success: false, timeline: [], restoredGetSnapshot: false };
        let queue, original, descriptor, cleanup, patched = false;
        const started = Date.now();
        function restore() {
            if (!patched) return;
            if (descriptor) Object.defineProperty(queue, 'getSnapshot', descriptor);
            else delete queue.getSnapshot;
            report.restoredGetSnapshot = queue.getSnapshot === original;
            patched = false;
            if (!report.restoredGetSnapshot) throw new Error('getSnapshot restoration failed');
        }
        try {
            observeMissingLayoutSEI();
            let discovery = discoverMissingLayout();
            if (!discovery) throw new Error('Current-room controller/store/handler discovery is incomplete');
            const before = domState();
            report.beforeDOM = before;
            if (before.battleRoot || before.scoreBar || discovery.controller.shown.includes('Cohost'))
                throw new Error('The layout is no longer in the fully missing state');
            const event = missingLayout.event;
            const meta = missingLayout.meta;
            const app = event?.seiContent?.app_data;
            if (!event || !meta || Date.now() - meta.timestamp > 5000 || app?.ver !== 2 ||
                sid(app.channel_id) !== discovery.current.roomId ||
                sid(app.group_channel_id) !== meta.groupChannelId)
                throw new Error('Fresh two-person SEI for the exact current room is unavailable');
            report.context = { roomId: discovery.current.roomId, anchorId: discovery.current.anchorId,
                groupChannelId: meta.groupChannelId, battleId: meta.battleId };
            report.realSEI = { ...meta };
            const group = discovery.groups[0];
            report.selectedStoreHook = group.index;
            queue = group.queue;
            original = queue.getSnapshot;
            descriptor = Object.getOwnPropertyDescriptor(queue, 'getSnapshot');
            const snapshot = original.call(queue);
            if (sid(snapshot?.roomId) !== discovery.current.roomId)
                throw new Error('External-store room changed');
            const clone = { ...snapshot, isSubscriber: true };
            const override = () => clone;
            queue.getSnapshot = override;
            patched = true;
            if (queue.getSnapshot !== override || queue.getSnapshot() !== clone)
                throw new Error('getSnapshot override verification failed');
            const oldHandler = discovery.handler.fn;
            report.stage = 'RERENDERING';
            updateStatus('TESTING MISSING LAYOUT FIX', '#b48cff');
            cleanup = group.effect.create();
            let fresh;
            for (let attempt = 0; attempt < 30; attempt++) {
                await sleep(100);
                discovery = discoverMissingLayout();
                if (!discovery || discovery.current.roomId !== report.context.roomId)
                    throw new Error('Room changed during native rerender');
                if (discovery.handler.fn !== oldHandler) { fresh = discovery.handler; break; }
            }
            if (!fresh) throw new Error('No fresh native ChatHost handler after rerender');
            report.handler = { oldObjectId: oid(oldHandler), freshObjectId: oid(fresh.fn), index: fresh.index };
            fresh.fn(event);
            restore();
            if (typeof cleanup === 'function') { const stop = cleanup; cleanup = null; stop(); }
            const validationStart = Date.now();
            const validationTimes = options.automatic ? [0, 100, 300, 750, 1500] : [0, 100, 300, 750, 1500, 3000, 5000];
            for (const ms of validationTimes) {
                await sleep(Math.max(0, validationStart + ms - Date.now()));
                report.timeline.push({ ms, shown: [...(discoverMissingLayout()?.controller?.shown ?? [])],
                    dom: domState() });
            }
            const final = report.timeline.at(-1);
            report.validation = { battleRoot: final.dom.battleRoot,
                cohostShown: final.shown.includes('Cohost') };
            report.success = report.usable = Object.values(report.validation).every(Boolean);
            report.stage = report.success ? 'REPAIRED' : 'NO_LAYOUT';
        } catch (error) {
            report.stage = 'REFUSED'; report.error = { message: error?.message || String(error) };
        } finally {
            try { restore(); } catch (error) {
                report.success = false; report.stage = 'RESTORE_ERROR'; report.restoreError = String(error);
            }
            if (typeof cleanup === 'function') try { cleanup(); } catch (error) { report.cleanupError = String(error); }
            report.durationMs = Date.now() - started;
            lastReport = report;
            updateStatus(report.success ? 'LAYOUT FIXED ✓' : 'LAYOUT TEST NOT CONFIRMED',
                report.success ? '#55ff88' : '#ffb84d');
            missingLayout.busy = false;
            if (!options.automatic || !report.success) showReport();
        }
        return report;
    }


    // v2.6.10: isolated 2v2 observer plus guarded automatic repair. The established
    // 1v1 observers and repair functions remain unchanged.
    const twoVTwo = { page: null, roomId: null, battle: null, battleAt: 0,
        armies: null, armiesAt: 0, sei: null, seiAt: 0, groupChannelId: null,
        listeners: [], buses: new WeakSet(), emitters: new WeakSet(), busy: false };
    const twoVTwoWatch = { key: null, since: 0, retryAt: 0 };

    function resetTwoVTwo() {
        for (const { target, event, listener } of twoVTwo.listeners) {
            try { target.off(event, listener); } catch (_) {}
        }
        twoVTwo.listeners = [];
        twoVTwo.buses = new WeakSet();
        twoVTwo.emitters = new WeakSet();
        twoVTwo.page = twoVTwo.roomId = twoVTwo.groupChannelId = null;
        twoVTwo.battle = twoVTwo.armies = twoVTwo.sei = null;
        twoVTwo.battleAt = twoVTwo.armiesAt = twoVTwo.seiAt = 0;
        twoVTwoWatch.key = null;
        twoVTwoWatch.since = twoVTwoWatch.retryAt = 0;
    }

    function isTwoVTwoBattle(message, roomId) {
        return sid(message?.common?.room_id) === roomId &&
            Number(message?.action) === 4 &&
            Array.isArray(message?.anchors_info) && message.anchors_info.length === 4 &&
            Array.isArray(message?.team_member) && message.team_member.length === 2 &&
            message.team_member.every(team => Array.isArray(team?.user_id) && team.user_id.length === 2) &&
            !!opponentBattleId(message);
    }

    function findStoredTwoVTwoBattle(data, roomId, targetBattleId) {
        if (!targetBattleId) return null;
        const seen = new WeakSet();
        let visited = 0;
        let found = null;
        function walk(value, depth) {
            if (found || !value || typeof value !== 'object' || seen.has(value) ||
                depth > 10 || visited++ > 75000) return;
            if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value.nodeType) return;
            seen.add(value);
            if (isTwoVTwoBattle(value, roomId) && opponentBattleId(value) === targetBattleId) {
                found = value;
                return;
            }
            let keys;
            try { keys = Object.keys(value).slice(0, 120); } catch (_) { return; }
            for (const key of keys) {
                if (['return','alternate','child','sibling','stateNode','window','document'].includes(key)) continue;
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor && 'value' in descriptor) walk(descriptor.value, depth + 1);
                if (found) return;
            }
        }
        for (const fiber of data.fibers) {
            walk(fiber.memoizedProps, 0);
            walk(fiber.memoizedState, 0);
            walk(fiber.updateQueue, 0);
            if (found || visited > 75000) break;
        }
        return found;
    }

    function observeTwoVTwo() {
        if (document.hidden) return;
        if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) { resetTwoVTwo(); return; }
        const root = committedRoot();
        if (!root) return;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        if (!current?.roomId) return;
        if (twoVTwo.page !== location.href || twoVTwo.roomId !== current.roomId) {
            resetTwoVTwo();
            twoVTwo.page = location.href;
            twoVTwo.roomId = current.roomId;
        }
        // TikTok often keeps the active OPEN message in the current-room state.
        // This lets a newly installed script join an already-running broken 2v2;
        // the message is accepted later only when its string battle ID matches a
        // freshly received LinkMicArmies update.
        if (isTwoVTwoBattle(current.battle, current.roomId)) {
            twoVTwo.battle = current.battle;
            twoVTwo.battleAt = Date.now();
            twoVTwo.groupChannelId = sid(current.battle?.battle_settings?.channel_id ?? current.battle?.channel_id);
        }
        for (const item of data.imCandidates) {
            const im = item.object;
            if (!imMatchesRoom(im, current.roomId)) continue;
            const bus = im._messageEvents;
            if (!bus || typeof bus.on !== 'function' || typeof bus.off !== 'function' || twoVTwo.buses.has(bus)) continue;
            const battleListener = message => {
                if (!isTwoVTwoBattle(message, twoVTwo.roomId)) return;
                twoVTwo.battle = message;
                twoVTwo.battleAt = Date.now();
                twoVTwo.groupChannelId = sid(message?.battle_settings?.channel_id ?? message?.channel_id);
            };
            const armiesListener = message => {
                const teams = message?.team_armies;
                if (sid(message?.common?.room_id) !== twoVTwo.roomId ||
                    Number(message?.battle_settings?.battle_type) !== 2 ||
                    !Array.isArray(teams) || teams.length !== 2 ||
                    !teams.every(team => Array.isArray(team?.team_user) && team.team_user.length === 2)) return;
                twoVTwo.armies = message;
                twoVTwo.armiesAt = Date.now();
            };
            try {
                bus.on('LinkMicBattle', battleListener);
                bus.on('LinkMicArmies', armiesListener);
                twoVTwo.listeners.push({ target: bus, event: 'LinkMicBattle', listener: battleListener },
                    { target: bus, event: 'LinkMicArmies', listener: armiesListener });
                twoVTwo.buses.add(bus);
            } catch (_) {}
        }
        const targetBattleId = opponentBattleId(twoVTwo.armies);
        if ((!twoVTwo.battle || opponentBattleId(twoVTwo.battle) !== targetBattleId) && targetBattleId) {
            const stored = findStoredTwoVTwoBattle(data, current.roomId, targetBattleId);
            if (stored) {
                twoVTwo.battle = stored;
                twoVTwo.battleAt = Date.now();
                twoVTwo.groupChannelId = sid(stored?.battle_settings?.channel_id ?? stored?.channel_id);
            }
        }
        const seen = new WeakSet();
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 9) return;
            seen.add(value);
            if (typeof value.on === 'function' && typeof value.off === 'function' && !twoVTwo.emitters.has(value)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    const match = app?.business_extra_info?.match_info;
                    if (app?.ver !== 2 || sid(app.channel_id) !== twoVTwo.roomId ||
                        !sid(app.group_channel_id) || !Array.isArray(app.grids) || app.grids.length !== 4 ||
                        (match && match.sub_match_type !== '2v2' && Number(match.match_type) !== 2)) return;
                    twoVTwo.sei = event;
                    twoVTwo.seiAt = Date.now();
                    if (!twoVTwo.groupChannelId) twoVTwo.groupChannelId = sid(app.group_channel_id);
                };
                try {
                    value.on('sei_parsed', listener);
                    twoVTwo.listeners.push({ target: value, event: 'sei_parsed', listener });
                    twoVTwo.emitters.add(value);
                } catch (_) {}
            }
            try {
                for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, depth + 1);
            } catch (_) {}
        }
        data.fibers.forEach(fiber => {
            walk(fiber.memoizedProps, 0);
            walk(fiber.memoizedState, 0);
            walk(fiber.updateQueue, 0);
        });
    }

    function summarizeTwoVTwoTeams(message) {
        return (message?.team_member ?? []).map(team => ({
            teamId: sid(team?.team_id),
            userIds: (team?.user_id ?? []).map(sid)
        }));
    }

    function summarizeTwoVTwoCapture() {
        const now = Date.now();
        const app = twoVTwo.sei?.seiContent?.app_data;
        return {
            roomId: twoVTwo.roomId,
            battle: twoVTwo.battle ? {
                ageMs: now - twoVTwo.battleAt,
                battleId: opponentBattleId(twoVTwo.battle),
                channelId: sid(twoVTwo.battle?.battle_settings?.channel_id ?? twoVTwo.battle?.channel_id),
                anchorCount: twoVTwo.battle?.anchors_info?.length ?? null,
                teams: summarizeTwoVTwoTeams(twoVTwo.battle)
            } : null,
            armies: twoVTwo.armies ? {
                ageMs: now - twoVTwo.armiesAt,
                battleId: opponentBattleId(twoVTwo.armies),
                channelId: sid(twoVTwo.armies?.battle_settings?.channel_id ?? twoVTwo.armies?.channel_id),
                battleType: twoVTwo.armies?.battle_settings?.battle_type ?? null,
                teamSizes: twoVTwo.armies?.team_armies?.map(team => team?.team_user?.length ?? null) ?? null
            } : null,
            sei: twoVTwo.sei ? {
                ageMs: now - twoVTwo.seiAt,
                roomChannelId: sid(app?.channel_id),
                groupChannelId: sid(app?.group_channel_id),
                gridCount: app?.grids?.length ?? null
            } : null,
            listenerCount: twoVTwo.listeners.length
        };
    }

    function findNamedTwoVTwoUsers(data, userIds) {
        const wanted = new Set(userIds);
        const found = new Map();
        const seen = new WeakSet();
        let visited = 0;
        function consider(value) {
            const summary = summarizeUser(value);
            if (!wanted.has(summary.id)) return;
            const previous = found.get(summary.id);
            const score = (summary.name ? 10 : 0) + (summary.roomId ? 5 : 0) +
                (value?.display_id ? 2 : 0) + (value?.avatar_thumb ? 1 : 0);
            if (!previous || score > previous.score) found.set(summary.id, { value, summary, score });
        }
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 9 || visited++ > 65000) return;
            if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value.nodeType) return;
            seen.add(value);
            consider(value);
            let keys;
            try { keys = Object.keys(value).slice(0, 120); } catch (_) { return; }
            for (const key of keys) {
                if (['return','alternate','child','sibling','stateNode','window','document'].includes(key)) continue;
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor && 'value' in descriptor) walk(descriptor.value, depth + 1);
            }
        }
        for (const fiber of data.fibers) {
            walk(fiber.memoizedProps, 0);
            walk(fiber.memoizedState, 0);
            walk(fiber.updateQueue, 0);
            if (visited > 65000) break;
        }
        return found;
    }

    function reconstructTwoVTwoBattle(data, current, armies, app) {
        const teams = armies?.team_armies;
        if (!Array.isArray(teams) || teams.length !== 2 ||
            !teams.every(team => Array.isArray(team?.team_user) && team.team_user.length === 2)) return null;
        const teamMember = teams.map(team => ({ team_id: sid(team.team_id),
            user_id: team.team_user.map(user => sid(user?.user_id_str ?? user?.user_id)).filter(Boolean) }));
        const userIds = teamMember.flatMap(team => team.user_id);
        if (userIds.length !== 4 || new Set(userIds).size !== 4) return null;
        const settings = armies.battle_settings;
        const battleId = opponentBattleId(armies);
        const channelId = sid(settings?.channel_id ?? armies?.channel_id);
        if (!battleId || !channelId || channelId !== sid(app?.group_channel_id) ||
            sid(armies?.common?.room_id) !== current.roomId || Number(settings?.battle_type) !== 2) return null;
        const users = findNamedTwoVTwoUsers(data, userIds);
        const anchors = userIds.map(id => {
            const match = users.get(id);
            const source = match?.value ?? {};
            const name = match?.summary?.name ?? '';
            return { key: id, value: { user: { ...source, id, id_str: id,
                user_id: id, user_id_str: id,
                nick_name: source.nick_name ?? source.nickname ?? name,
                nickname: source.nickname ?? source.nick_name ?? name } } };
        });
        return { battle: { action: 4, battle_id: battleId,
                battle_settings: { ...settings, battle_id: battleId, channel_id: channelId,
                    status: 1, battle_type: 2 },
                anchors_info: anchors, team_member: teamMember, armies: [], team_armies: [],
                common: { ...armies.common, room_id: current.roomId, method: 'WebcastLinkMicBattle' } },
            resolvedNames: anchors.filter(entry => entry.value.user.nick_name?.trim()).length,
            userIds, teams: teamMember };
    }

    function findTwoVTwoReplayHandlers(data, current, groupChannelId) {
        const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId) ??
            data.modules.find(item => sid(item.object?.groupChannelId) === groupChannelId);
        if (!moduleItem) return null;
        const owner = data.fibers.find(fiber => oid(fiber) === moduleItem.fiberId);
        if (!owner) return null;
        const stack = owner.child ? [owner.child] : [];
        const seen = new Set();
        const found = { moduleItem, nameSEI: null, battleOpen: null, armiesScore: null };
        while (stack.length && seen.size < 1300) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
            let hook = fiber.memoizedState;
            const hookSeen = new Set();
            for (let index = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) && index < 220;
                index++, hook = hook.next) {
                hookSeen.add(hook);
                const state = hook.memoizedState;
                const candidates = [];
                if (typeof state === 'function') candidates.push(state);
                if (typeof state?.current === 'function') candidates.push(state.current);
                if (Array.isArray(state)) for (const item of state) if (typeof item === 'function') candidates.push(item);
                for (const fn of candidates) {
                    let source = '';
                    try { source = Function.prototype.toString.call(fn); } catch (_) { continue; }
                    if (!found.nameSEI && source.includes('combineRegions') &&
                        (source.includes('linkedUsersMap') || source.includes('isInChatting')))
                        found.nameSEI = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                    if (!found.battleOpen && source.includes('battle_settings') &&
                        (source.includes('BattleAction.OPEN') || source.includes('battle_id')))
                        found.battleOpen = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                    if (!found.armiesScore &&
                        ((source.includes('UPDATE_SCORES_DATA') && source.includes('hostScore')) ||
                         (source.includes('team_armies') && source.includes('team_total_score'))))
                        found.armiesScore = { fn, objectId: oid(fn), fiberObjectId: oid(fiber), hookIndex: index };
                }
            }
        }
        return found;
    }

    async function replayTwoVTwo(current, groupChannelId, battle, armies, sei, report) {
        let handlers = null;
        const started = Date.now();
        while (Date.now() - started < 6000) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            handlers = data && findTwoVTwoReplayHandlers(data, current, groupChannelId);
            if (handlers?.nameSEI && handlers?.battleOpen) break;
            await sleep(100);
        }
        if (!handlers?.nameSEI || !handlers?.battleOpen)
            throw new Error('Fresh native 2v2 replay handlers were not found');
        const item = { phase: 'TWO_V_TWO', modulePath: handlers.moduleItem.path, handlers: {
            nameSEI: { objectId: handlers.nameSEI.objectId, fiberObjectId: handlers.nameSEI.fiberObjectId,
                hookIndex: handlers.nameSEI.hookIndex },
            battleOpen: { objectId: handlers.battleOpen.objectId, fiberObjectId: handlers.battleOpen.fiberObjectId,
                hookIndex: handlers.battleOpen.hookIndex }, armiesScore: null },
            secondSEIReplay: false, delayedSEIReplay: false };
        report.replays.push(item);
        handlers.nameSEI.fn(sei);
        await Promise.resolve(handlers.battleOpen.fn(battle));
        const scoreStarted = Date.now();
        while (Date.now() - scoreStarted < 6000) {
            await sleep(100);
            const root = committedRoot();
            const data = root && collectCandidates(root);
            handlers = data && findTwoVTwoReplayHandlers(data, current, groupChannelId);
            if (handlers?.armiesScore) break;
        }
        if (handlers?.nameSEI) {
            handlers.nameSEI.fn(sei);
            item.secondSEIReplay = true;
        }
        if (handlers?.armiesScore) {
            item.handlers.armiesScore = { objectId: handlers.armiesScore.objectId,
                fiberObjectId: handlers.armiesScore.fiberObjectId, hookIndex: handlers.armiesScore.hookIndex };
            handlers.armiesScore.fn(armies);
        }
        await sleep(1500);
        const root = committedRoot();
        const data = root && collectCandidates(root);
        const delayed = data && findTwoVTwoReplayHandlers(data, current, groupChannelId);
        if (delayed?.nameSEI) {
            delayed.nameSEI.fn(sei);
            item.delayedSEIReplay = true;
        }
        if (delayed?.armiesScore) delayed.armiesScore.fn(armies);
    }

    async function openTwoVTwoCohost(discovery, battle, groupChannelId, report) {
        const { data, current, controller } = discovery;
        const teamIds = new Set((battle.team_member ?? []).flatMap(team => team.user_id ?? []).map(sid));
        const users = Array.isArray(current.users) ? current.users : null;
        const summaries = users?.map(summarizeUser) ?? [];
        if (!users || users.length !== 4 || summaries.some(user => !user.id || !user.name) ||
            summaries.some(user => !teamIds.has(user.id)) || teamIds.size !== 4)
            throw new Error('The four named current-room creators do not exactly match the 2v2 teams');
        const baseItem = chooseBaseModule(data.modules, current.roomId);
        const base = baseItem?.object;
        if (!base || !base.player || !base.match ||
            typeof base.onCohostStart !== 'function' || typeof base.onCohostEnd !== 'function' ||
            typeof base.match.onMatchStart !== 'function' || typeof base.match.onMatchEnd !== 'function')
            throw new Error('A complete native Cohost base module is unavailable for the 2v2 reopen');
        let liveIM = base.liveIMInstance;
        let imSource = 'base.liveIMInstance';
        if (!imMatchesRoom(liveIM, current.roomId)) {
            liveIM = findCurrentIM(data.imCandidates, current.roomId);
            imSource = 'verified-current-IM';
        }
        if (!liveIM || !imMatchesRoom(liveIM, current.roomId))
            throw new Error('A current-room live connection could not be verified for the 2v2 reopen');
        const freshModuleData = { ...base, roomId: current.roomId, anchorId: current.anchorId,
            initialLinkedUsers: users, groupChannelId, player: base.player,
            liveIMInstance: liveIM,
            match: { ...base.match, initialBattleInfo: battle } };
        report.moduleOpen = { basePath: baseItem.path, baseObjectId: oid(base),
            baseRoomId: getRoomId(base), baseAnchorId: getAnchorId(base),
            currentRoomId: current.roomId, currentAnchorId: current.anchorId,
            groupChannelId, battleId: opponentBattleId(battle), imSource,
            users: summaries, playerObjectId: oid(base.player), liveIMObjectId: oid(liveIM) };
        controller.showFn('Cohost', freshModuleData);
        const started = Date.now();
        while (Date.now() - started < 5000) {
            await sleep(100);
            const next = discoverMissingLayout();
            const moduleItem = next && chooseMountedModule(next.data.modules, current.roomId, current.anchorId);
            if (next?.controller?.shown.includes('Cohost') && moduleItem) {
                report.moduleOpen.shownInMs = Date.now() - started;
                report.moduleOpen.modulePath = moduleItem.path;
                report.moduleOpen.domAfterOpen = domState();
                return next;
            }
        }
        throw new Error('The native 2v2 Cohost module did not open for the current room');
    }

    async function repairMissingTwoVTwo(options = {}) {
        if (running || twoVTwo.busy || liveCapture.active) return;
        running = twoVTwo.busy = true;
        const report = { ...makeReportBase(), mode: 'TWO_V_TWO_MISSING_LAYOUT_TEST',
            trigger: options.automatic ? 'AUTOMATIC' : 'MANUAL',
            stage: 'PREPARING', success: false, timeline: [], replays: [], restoredGetSnapshot: false };
        let queue, original, descriptor, cleanup, patched = false;
        const started = Date.now();
        function restore() {
            if (!patched) return;
            if (descriptor) Object.defineProperty(queue, 'getSnapshot', descriptor);
            else delete queue.getSnapshot;
            report.restoredGetSnapshot = queue.getSnapshot === original;
            patched = false;
            if (!report.restoredGetSnapshot) throw new Error('getSnapshot restoration failed');
        }
        try {
            observeTwoVTwo();
            let discovery = discoverMissingLayout();
            if (!discovery) throw new Error('Current-room controller/store/handler discovery is incomplete');
            const before = domState();
            report.beforeDOM = before;
            const beforeNames = [...new Set(before.participantText.filter(text => text?.trim()))];
            const beforeComplete = before.battleRoot && before.scoreBar &&
                before.scores.filter(text => text?.trim()).length >= 2 && beforeNames.length >= 3;
            if (beforeComplete) throw new Error('The 2v2 interface is already complete');
            const needsLayoutRebuild = !before.battleRoot && !discovery.controller.shown.includes('Cohost');
            let battle = twoVTwo.battle;
            let armies, sei, app;
            const captureStarted = Date.now();
            const captureLimit = options.automatic ? 0 : 6000;
            while (true) {
                observeTwoVTwo();
                armies = twoVTwo.armies;
                sei = twoVTwo.sei;
                app = sei?.seiContent?.app_data;
                const armyChannel = sid(armies?.battle_settings?.channel_id ?? armies?.channel_id);
                const validArmies = armies && Date.now() - twoVTwo.armiesAt <= 8000 &&
                    Number(armies?.battle_settings?.battle_type) === 2 &&
                    Array.isArray(armies.team_armies) && armies.team_armies.length === 2 &&
                    armies.team_armies.every(team =>
                        Array.isArray(team?.team_user) && team.team_user.length === 2);
                const validSEI = sei && Date.now() - twoVTwo.seiAt <= 8000 && app?.ver === 2 &&
                    sid(app.channel_id) === discovery.current.roomId &&
                    sid(app.group_channel_id) === armyChannel &&
                    Array.isArray(app.grids) && app.grids.length === 4;
                if (validArmies && validSEI) break;
                if (Date.now() - captureStarted >= captureLimit) break;
                report.stage = 'WAITING_FOR_CURRENT_2V2_DATA';
                updateStatus('WAITING FOR LIVE 2V2 DATA', '#b48cff');
                await sleep(250);
            }
            report.captureWaitMs = Date.now() - captureStarted;
            report.observer = summarizeTwoVTwoCapture();
            if (!armies || Date.now() - twoVTwo.armiesAt > 8000 ||
                Number(armies?.battle_settings?.battle_type) !== 2 ||
                !Array.isArray(armies.team_armies) || armies.team_armies.length !== 2 ||
                !armies.team_armies.every(team => Array.isArray(team?.team_user) && team.team_user.length === 2))
                throw new Error('No active 2v2 score event with two creators on each team is available');
            const armyChannel = sid(armies?.battle_settings?.channel_id ?? armies?.channel_id);
            if (!sei || Date.now() - twoVTwo.seiAt > 8000 || app?.ver !== 2 ||
                sid(app.channel_id) !== discovery.current.roomId || sid(app.group_channel_id) !== armyChannel ||
                !Array.isArray(app.grids) || app.grids.length !== 4)
                throw new Error('Fresh four-video layout data matching the team scores is unavailable');
            let reconstructed = null;
            if (!isTwoVTwoBattle(battle, discovery.current.roomId) ||
                opponentBattleId(battle) !== opponentBattleId(armies)) {
                reconstructed = reconstructTwoVTwoBattle(discovery.data, discovery.current, armies, app);
                if (!reconstructed)
                    throw new Error('The missing 2v2 start could not be reconstructed from verified live data');
                battle = reconstructed.battle;
            }
            const battleChannel = sid(battle?.battle_settings?.channel_id ?? battle?.channel_id);
            report.context = { roomId: discovery.current.roomId, anchorId: discovery.current.anchorId,
                battleId: opponentBattleId(battle), groupChannelId: battleChannel, gridCount: app.grids.length,
                teams: summarizeTwoVTwoTeams(battle), hasTeamScores: !!armies,
                reconstructedStart: !!reconstructed, resolvedCreatorNames: reconstructed?.resolvedNames ?? 4,
                repairPath: needsLayoutRebuild ? 'FULL_LAYOUT_REBUILD' : 'PARTIAL_NATIVE_REPLAY' };
            if (needsLayoutRebuild) {
                const group = discovery.groups[0];
                report.selectedStoreHook = group.index;
                queue = group.queue;
                original = queue.getSnapshot;
                descriptor = Object.getOwnPropertyDescriptor(queue, 'getSnapshot');
                const snapshot = original.call(queue);
                if (sid(snapshot?.roomId) !== discovery.current.roomId) throw new Error('External-store room changed');
                const clone = { ...snapshot, isSubscriber: true };
                const override = () => clone;
                queue.getSnapshot = override;
                patched = true;
                if (queue.getSnapshot !== override || queue.getSnapshot() !== clone)
                    throw new Error('getSnapshot override verification failed');
                const oldHandler = discovery.handler.fn;
                report.stage = 'REBUILDING_FOUR_VIDEO_LAYOUT';
                updateStatus('TESTING 2V2 LAYOUT FIX', '#b48cff');
                cleanup = group.effect.create();
                let fresh;
                for (let attempt = 0; attempt < 35; attempt++) {
                    await sleep(100);
                    discovery = discoverMissingLayout();
                    if (!discovery || discovery.current.roomId !== report.context.roomId)
                        throw new Error('Room changed during native rerender');
                    if (discovery.handler.fn !== oldHandler) { fresh = discovery.handler; break; }
                }
                if (!fresh) throw new Error('No fresh native four-video handler after rerender');
                report.handler = { oldObjectId: oid(oldHandler), freshObjectId: oid(fresh.fn), index: fresh.index };
                fresh.fn(sei);
                restore();
                if (typeof cleanup === 'function') { const stop = cleanup; cleanup = null; stop(); }
                await sleep(300);
                report.afterLayoutDOM = domState();
            } else {
                report.stage = 'PRESERVING_PARTIAL_LAYOUT';
                updateStatus('TESTING PARTIAL 2V2 FIX', '#b48cff');
            }
            let postLayout = discoverMissingLayout();
            const currentModule = postLayout && chooseMountedModule(postLayout.data.modules,
                discovery.current.roomId, discovery.current.anchorId);
            if (!postLayout?.controller?.shown.includes('Cohost') || !currentModule) {
                report.stage = 'OPENING_CURRENT_2V2_MODULE';
                updateStatus('OPENING 2V2 INTERFACE', '#b48cff');
                postLayout = await openTwoVTwoCohost(postLayout ?? discovery, battle, battleChannel, report);
            }
            discovery = postLayout;
            report.stage = 'REPLAYING_2V2_START_AND_SCORES';
            await replayTwoVTwo(discovery.current, battleChannel, battle, armies, sei, report);
            const afterReplay = domState();
            const namesAfterReplay = new Set(afterReplay.participantText.filter(text => text?.trim()));
            if (namesAfterReplay.size < 3) {
                report.stage = 'RESTORING_2V2_PARTICIPANT_NAMES';
                updateStatus('RESTORING 2V2 NAMES', '#b48cff');
                try {
                    await setNativeTwoVTwoParticipants(discovery.current, sei, battle, report);
                } catch (error) {
                    report.participantStateError = error?.message || String(error);
                }
            }
            const validationStart = Date.now();
            for (const ms of [100, 300, 750, 1500, 3000, 5000, 8000]) {
                await sleep(Math.max(0, validationStart + ms - Date.now()));
                report.timeline.push({ ms, shown: [...(discoverMissingLayout()?.controller?.shown ?? [])], dom: domState() });
            }
            const final = report.timeline.at(-1).dom;
            const uniqueNames = [...new Set(final.participantText.filter(text => text?.trim()))];
            report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
                hasTwoScores: final.scores.filter(text => text?.trim()).length >= 2,
                remoteNameCount: uniqueNames.length, hasThreeRemoteNames: uniqueNames.length >= 3 };
            report.success = report.usable = report.validation.battleRoot && report.validation.scoreBar &&
                report.validation.hasTwoScores && report.validation.hasThreeRemoteNames;
            report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
        } catch (error) {
            report.stage = 'REFUSED_OR_FAILED';
            report.error = { message: error?.message || String(error) };
            if (/2v2|Cohost/.test(report.error.message)) {
                try { report.failureNativeState = captureNativeState(); } catch (_) {}
            }
        } finally {
            try { restore(); } catch (error) {
                report.success = false; report.stage = 'RESTORE_ERROR'; report.restoreError = String(error);
            }
            if (typeof cleanup === 'function') try { cleanup(); } catch (error) { report.cleanupError = String(error); }
            report.durationMs = Date.now() - started;
            lastReport = report;
            updateStatus(report.success ? '2V2 FIXED ✓' : '2V2 TEST FINISHED — VIEW REPORT',
                report.success ? '#55ff88' : '#ffb84d');
            running = twoVTwo.busy = false;
            if (!options.automatic || !report.success) showReport();
        }
        return report;
    }

    async function automaticTwoVTwoTick() {
        if (document.hidden) return;
        if (!a2.enabled || running || twoVTwo.busy || liveCapture.active ||
            !/\/@[^/]+\/live\/?$/.test(location.pathname)) return;
        try {
            const armies = twoVTwo.armies;
            const sei = twoVTwo.sei;
            const app = sei?.seiContent?.app_data;
            const teams = armies?.team_armies;
            const fresh = armies && sei && Date.now() - twoVTwo.armiesAt <= 8000 &&
                Date.now() - twoVTwo.seiAt <= 8000 && Number(armies?.battle_settings?.battle_type) === 2 &&
                Array.isArray(teams) && teams.length === 2 &&
                teams.every(team => Array.isArray(team?.team_user) && team.team_user.length === 2) &&
                app?.ver === 2 && Array.isArray(app.grids) && app.grids.length === 4 &&
                sid(app.channel_id) === twoVTwo.roomId &&
                sid(app.group_channel_id) === sid(armies?.battle_settings?.channel_id ?? armies?.channel_id);
            if (!fresh) {
                twoVTwoWatch.key = null;
                twoVTwoWatch.since = 0;
                return;
            }
            const dom = domState();
            const names = new Set(dom.participantText.filter(text => text?.trim()));
            const complete = dom.battleRoot && dom.scoreBar &&
                dom.scores.filter(text => text?.trim()).length >= 2 && names.size >= 3;
            if (complete) {
                twoVTwoWatch.key = null;
                twoVTwoWatch.since = 0;
                return;
            }
            const key = location.href + '|' + opponentBattleId(armies);
            if (twoVTwoWatch.key !== key) {
                twoVTwoWatch.key = key;
                twoVTwoWatch.since = Date.now();
                return;
            }
            if (Date.now() - twoVTwoWatch.since < 10000 || Date.now() < twoVTwoWatch.retryAt) return;
            twoVTwoWatch.retryAt = Date.now() + 30000;
            const result = await repairMissingTwoVTwo({ automatic: true });
            if (result?.success) {
                twoVTwoWatch.key = null;
                twoVTwoWatch.since = 0;
            }
        } catch (_) {}
    }


    // Native pre-PK name recovery for three- and four-person cohost layouts.
    const groupCohost = { page: null, roomId: null, event: null, at: 0,
        listeners: [], emitters: new WeakSet(), busy: false };
    const groupCohostWatch = { key: null, since: 0, retryAt: 0 };

    function resetGroupCohost() {
        for (const { target, listener } of groupCohost.listeners) {
            try { target.off('sei_parsed', listener); } catch (_) {}
        }
        groupCohost.listeners = [];
        groupCohost.emitters = new WeakSet();
        groupCohost.page = groupCohost.roomId = null;
        groupCohost.event = null;
        groupCohost.at = 0;
        groupCohostWatch.key = null;
        groupCohostWatch.since = groupCohostWatch.retryAt = 0;
    }

    function observeGroupCohost() {
        if (document.hidden) return;
        if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) { resetGroupCohost(); return; }
        const root = committedRoot();
        if (!root) return;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        if (!current?.roomId) return;
        if (groupCohost.page !== location.href || groupCohost.roomId !== current.roomId) {
            resetGroupCohost();
            groupCohost.page = location.href;
            groupCohost.roomId = current.roomId;
        }
        const seen = new WeakSet();
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 9) return;
            seen.add(value);
            if (typeof value.on === 'function' && typeof value.off === 'function' &&
                !groupCohost.emitters.has(value)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    const count = app?.grids?.length;
                    if (app?.ver !== 2 || sid(app.channel_id) !== groupCohost.roomId ||
                        !sid(app.group_channel_id) || !Array.isArray(app.grids) ||
                        (count !== 3 && count !== 4)) return;
                    groupCohost.event = event;
                    groupCohost.at = Date.now();
                };
                try {
                    value.on('sei_parsed', listener);
                    groupCohost.listeners.push({ target: value, listener });
                    groupCohost.emitters.add(value);
                } catch (_) {}
            }
            try {
                for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, depth + 1);
            } catch (_) {}
        }
        data.fibers.forEach(fiber => {
            walk(fiber.memoizedProps, 0);
            walk(fiber.memoizedState, 0);
            walk(fiber.updateQueue, 0);
        });
    }

    function mapGroupUsers(current, event) {
        const grids = event?.seiContent?.app_data?.grids;
        const users = current?.users;
        if (!Array.isArray(grids) || !Array.isArray(users) ||
            users.length !== grids.length || (users.length !== 3 && users.length !== 4)) return null;
        const remaining = [...users];
        const ordered = [];
        for (const grid of [...grids].sort((a, b) => Number(a.p) - Number(b.p))) {
            const roomId = sid(grid.cid);
            const index = remaining.findIndex(user => summarizeUser(user).roomId === roomId);
            if (index < 0) return null;
            const user = remaining.splice(index, 1)[0];
            const summary = summarizeUser(user);
            if (!summary.id || !summary.name) return null;
            ordered.push({ ...user, id: summary.id, id_str: summary.id,
                user_id: summary.id, user_id_str: summary.id,
                room_id: roomId, room_id_str: roomId, roomId,
                linkmic_id_str: sid(grid.uid_str),
                nick_name: user.nick_name ?? user.nickname ?? summary.name,
                nickname: user.nickname ?? user.nick_name ?? summary.name });
        }
        return remaining.length === 0 ? ordered : null;
    }

    async function openGroupCohostModule(discovery, users, groupChannelId, report) {
        const { data, current, controller } = discovery;
        const baseItem = chooseBaseModule(data.modules, current.roomId);
        const base = baseItem?.object;
        if (!base || !base.player || !base.match ||
            typeof base.onCohostStart !== 'function' || typeof base.onCohostEnd !== 'function' ||
            typeof base.match.onMatchStart !== 'function' || typeof base.match.onMatchEnd !== 'function')
            throw new Error('A complete native Cohost base module is unavailable');
        let liveIM = base.liveIMInstance;
        let imSource = 'base.liveIMInstance';
        if (!imMatchesRoom(liveIM, current.roomId)) {
            liveIM = findCurrentIM(data.imCandidates, current.roomId);
            imSource = 'verified-current-IM';
        }
        if (!liveIM || !imMatchesRoom(liveIM, current.roomId))
            throw new Error('A current-room live connection could not be verified');
        const moduleData = { ...base, roomId: current.roomId, anchorId: current.anchorId,
            initialLinkedUsers: users, groupChannelId, player: base.player,
            liveIMInstance: liveIM, match: { ...base.match, initialBattleInfo: null } };
        report.moduleOpen = { basePath: baseItem.path, baseRoomId: getRoomId(base),
            currentRoomId: current.roomId, currentAnchorId: current.anchorId,
            groupChannelId, participantCount: users.length, imSource,
            users: users.map(summarizeUser) };
        controller.showFn('Cohost', moduleData);
        const started = Date.now();
        while (Date.now() - started < 5000) {
            await sleep(100);
            const next = discoverMissingLayout();
            const moduleItem = next && chooseMountedModule(next.data.modules, current.roomId, current.anchorId);
            if (next?.controller?.shown.includes('Cohost') && moduleItem) {
                report.moduleOpen.shownInMs = Date.now() - started;
                report.moduleOpen.modulePath = moduleItem.path;
                return next;
            }
        }
        throw new Error('The native group Cohost module did not open');
    }

    async function replayGroupCohostNames(discovery, groupChannelId, event, report) {
        let handlers;
        const started = Date.now();
        while (Date.now() - started < 5000) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            handlers = data && findTwoVTwoReplayHandlers(data, discovery.current, groupChannelId);
            if (handlers?.nameSEI) break;
            await sleep(100);
        }
        if (!handlers?.nameSEI) throw new Error('Fresh native group-name handler was not found');
        report.replay = { modulePath: handlers.moduleItem.path,
            firstHandlerObjectId: handlers.nameSEI.objectId, secondHandlerObjectId: null,
            delayedHandlerObjectId: null };
        handlers.nameSEI.fn(event);
        await sleep(300);
        let root = committedRoot();
        let data = root && collectCandidates(root);
        handlers = data && findTwoVTwoReplayHandlers(data, discovery.current, groupChannelId);
        if (handlers?.nameSEI) {
            handlers.nameSEI.fn(event);
            report.replay.secondHandlerObjectId = handlers.nameSEI.objectId;
        }
        await sleep(1200);
        root = committedRoot();
        data = root && collectCandidates(root);
        handlers = data && findTwoVTwoReplayHandlers(data, discovery.current, groupChannelId);
        if (handlers?.nameSEI) {
            handlers.nameSEI.fn(event);
            report.replay.delayedHandlerObjectId = handlers.nameSEI.objectId;
        }
    }

    async function repairGroupCohostNames(options = {}) {
        if (running || groupCohost.busy || liveCapture.active) return;
        running = groupCohost.busy = true;
        const report = { ...makeReportBase(), mode: 'GROUP_COHOST_NAME_REPAIR',
            trigger: options.automatic ? 'AUTOMATIC' : 'MANUAL', stage: 'PREPARING',
            success: false, timeline: [], remounted: false };
        try {
            observeGroupCohost();
            let discovery = discoverMissingLayout();
            if (!discovery) throw new Error('Current-room native controller discovery is incomplete');
            const before = domState();
            report.beforeDOM = before;
            if (before.scoreBar) throw new Error('A PK scoreboard is active; group pre-PK repair was refused');
            const event = groupCohost.event;
            const app = event?.seiContent?.app_data;
            const battleId = sid(app?.battle_id);
            if (!event || Date.now() - groupCohost.at > 8000 || app?.ver !== 2 ||
                sid(app.channel_id) !== discovery.current.roomId || !sid(app.group_channel_id) ||
                !Array.isArray(app.grids) || ![3, 4].includes(app.grids.length) ||
                (battleId && battleId !== '0'))
                throw new Error('Fresh pre-PK three/four-person layout data is unavailable');
            const users = mapGroupUsers(discovery.current, event);
            if (!users) throw new Error('Named creators do not exactly match all current video positions');
            const expectedRemoteNames = users.length - 1;
            const existingNames = new Set(before.participantText.filter(text => text?.trim()));
            report.context = { roomId: discovery.current.roomId, anchorId: discovery.current.anchorId,
                groupChannelId: sid(app.group_channel_id), participantCount: users.length,
                expectedRemoteNames, users: users.map(summarizeUser) };
            if (before.battleRoot && existingNames.size >= expectedRemoteNames) {
                report.success = report.usable = true;
                report.stage = 'ALREADY_COMPLETE';
                return report;
            }
            let moduleItem = chooseMountedModule(discovery.data.modules,
                discovery.current.roomId, discovery.current.anchorId);
            const needsNativeOpen = !moduleItem ||
                !discovery.controller.shown.includes('Cohost') || !before.battleRoot;
            if (needsNativeOpen) {
                if (discovery.controller.shown.includes('Cohost')) {
                    discovery.controller.destroyFn('Cohost');
                    const waitStarted = Date.now();
                    while (Date.now() - waitStarted < 2500 && discovery.controller.shown.includes('Cohost'))
                        await sleep(50);
                    if (discovery.controller.shown.includes('Cohost'))
                        throw new Error('The stale Cohost module did not close');
                    await sleep(500);
                    report.remounted = true;
                }
                report.stage = 'OPENING_GROUP_COHOST';
                discovery = await openGroupCohostModule(discovery, users, sid(app.group_channel_id), report);
            }
            report.stage = 'REPLAYING_GROUP_NAMES';
            await replayGroupCohostNames(discovery, sid(app.group_channel_id), event, report);
            const validationStart = Date.now();
            for (const ms of [100, 300, 750, 1500, 3000, 5000]) {
                await sleep(Math.max(0, validationStart + ms - Date.now()));
                report.timeline.push({ ms, ...domState() });
            }
            const final = report.timeline.at(-1);
            const names = [...new Set(final.participantText.filter(text => text?.trim()))];
            report.validation = { battleRoot: final.battleRoot, noScoreBar: !final.scoreBar,
                remoteNameCount: names.length, expectedRemoteNames,
                hasAllRemoteNames: names.length >= expectedRemoteNames };
            report.success = report.usable = report.validation.battleRoot &&
                report.validation.noScoreBar && report.validation.hasAllRemoteNames;
            report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
        } catch (error) {
            report.stage = 'REFUSED_OR_FAILED';
            report.error = { message: error?.message || String(error) };
            if (/group-name handler|group Cohost module/.test(report.error.message)) {
                try { report.failureNativeState = captureNativeState(); } catch (_) {}
            }
        } finally {
            lastReport = report;
            updateStatus(report.success ? 'GROUP NAMES FIXED ✓' : 'GROUP NAME TEST FINISHED',
                report.success ? '#55ff88' : '#ffb84d');
            running = groupCohost.busy = false;
            if (!options.automatic || !report.success) showReport();
        }
        return report;
    }

    async function automaticGroupCohostTick() {
        if (document.hidden) return;
        if (!a2.enabled || running || groupCohost.busy || liveCapture.active) return;
        try {
            const event = groupCohost.event;
            const app = event?.seiContent?.app_data;
            const battleId = sid(app?.battle_id);
            if (!event || Date.now() - groupCohost.at > 8000 || ![3, 4].includes(app?.grids?.length) ||
                (battleId && battleId !== '0') || domState().scoreBar) {
                groupCohostWatch.key = null; groupCohostWatch.since = 0; return;
            }
            const discovery = discoverMissingLayout();
            const users = discovery && mapGroupUsers(discovery.current, event);
            if (!users) { groupCohostWatch.key = null; groupCohostWatch.since = 0; return; }
            const dom = domState();
            const names = new Set(dom.participantText.filter(text => text?.trim()));
            if (dom.battleRoot && names.size >= users.length - 1) {
                groupCohostWatch.key = null; groupCohostWatch.since = 0; return;
            }
            const key = location.href + '|' + sid(app.group_channel_id) + '|' + users.length;
            if (groupCohostWatch.key !== key) {
                groupCohostWatch.key = key; groupCohostWatch.since = Date.now(); return;
            }
            if (Date.now() - groupCohostWatch.since < 6000 || Date.now() < groupCohostWatch.retryAt) return;
            groupCohostWatch.retryAt = Date.now() + 30000;
            const result = await repairGroupCohostNames({ automatic: true });
            if (result?.success) { groupCohostWatch.key = null; groupCohostWatch.since = 0; }
        } catch (_) {}
    }


    function inspectCohostBridge() {
        const report = { ...makeReportBase(), mode: 'COHOST_BRIDGE_INSPECTOR', stage: 'READ_ONLY',
            nativeState: captureNativeState(), controller: null, bridge: null, module: null,
            relevantHooks: [], limits: { descendants: 800, hooksPerFiber: 180, sourceChars: 30000 } };
        const root = committedRoot();
        if (!root) { report.reason = 'No committed React root'; return report; }
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        const controller = findController(data.fibers);
        if (!current || !controller) { report.reason = 'Current room/controller unavailable'; return report; }
        const source = fn => {
            if (typeof fn !== 'function') return null;
            try {
                const text = Function.prototype.toString.call(fn);
                return { objectId: oid(fn), name: fn.name || null,
                    source: text.slice(0, report.limits.sourceChars),
                    sourceTruncated: text.length > report.limits.sourceChars };
            } catch (error) { return { error: String(error) }; }
        };
        report.controller = { shown: [...controller.shown], update: source(controller.updateFn),
            show: source(controller.showFn), destroy: source(controller.destroyFn) };
        const bridge = controller.refs?.Cohost;
        function describeObject(value) {
            if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
            const out = { objectId: oid(value), constructor: value.constructor?.name ?? null,
                ownKeys: Reflect.ownKeys(value).map(String), functions: {} };
            let cursor = value;
            for (let depth = 0; cursor && depth < 4; depth++, cursor = Object.getPrototypeOf(cursor)) {
                for (const key of Reflect.ownKeys(cursor)) {
                    if (key === 'constructor' || key in out.functions) continue;
                    const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
                    if (descriptor && typeof descriptor.value === 'function')
                        out.functions[String(key)] = { prototypeDepth: depth, ...source(descriptor.value) };
                }
            }
            return out;
        }
        report.bridge = describeObject(bridge);
        const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
        if (!moduleItem) { report.reason = 'Mounted current-room module unavailable'; return report; }
        const moduleData = moduleItem.object;
        report.module = { path: moduleItem.path, objectId: oid(moduleData),
            roomId: getRoomId(moduleData), anchorId: getAnchorId(moduleData),
            groupChannelId: sid(moduleData.groupChannelId),
            initialUsers: moduleData.initialLinkedUsers?.map(summarizeUser) ?? null,
            initialBattleId: getBattleId(moduleData.match?.initialBattleInfo),
            keys: Object.keys(moduleData).slice(0, 100) };
        const owner = data.fibers.find(fiber => oid(fiber) === moduleItem.fiberId);
        if (!owner) { report.reason = 'Mounted module owner fiber unavailable'; return report; }
        const descendants = [];
        const stack = owner.child ? [owner.child] : [];
        const seen = new Set();
        while (stack.length && descendants.length < report.limits.descendants) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber); descendants.push(fiber);
            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
        }
        const needles = ['LinkMicBattle','LinkMicArmies','initialLinkedUsers','linkedUsers','hostScore'];
        for (const [fiberIndex, fiber] of descendants.entries()) {
            let hook = fiber.memoizedState;
            const hookSeen = new Set();
            for (let hookIndex = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) &&
                hookIndex < report.limits.hooksPerFiber; hookIndex++, hook = hook.next) {
                hookSeen.add(hook);
                const candidates = [];
                const state = hook.memoizedState;
                if (typeof state === 'function') candidates.push({ location: 'state', fn: state });
                if (typeof state?.current === 'function') candidates.push({ location: 'state.current', fn: state.current });
                if (Array.isArray(state)) state.forEach((item, index) => {
                    if (typeof item === 'function') candidates.push({ location: 'state[' + index + ']', fn: item });
                });
                if (typeof hook.queue?.dispatch === 'function') candidates.push({ location: 'queue.dispatch', fn: hook.queue.dispatch });
                const functions = candidates.map(item => ({ location: item.location, ...source(item.fn) }));
                const matched = functions.filter(item => needles.some(needle => item.source?.includes(needle)));
                const stateKeys = state && typeof state === 'object' ? Object.keys(state).slice(0, 60) : [];
                if (matched.length || typeof hook.queue?.dispatch === 'function' ||
                    stateKeys.some(key => /user|battle|score|match|linked|participant/i.test(key))) {
                    report.relevantHooks.push({ fiberIndex, fiberObjectId: oid(fiber),
                        component: fiber.type?.displayName || fiber.type?.name || null,
                        hookIndex, stateType: Array.isArray(state) ? 'array' : typeof state,
                        stateKeys, state: diagnosticValue(state), functions });
                }
            }
        }
        report.descendantCount = descendants.length;
        report.note = 'Read-only: bridge and hook functions were converted to source text only; none were invoked.';
        return report;
    }

    function captureCohostBridge() {
        try { lastReport = inspectCohostBridge(); }
        catch (error) { lastReport = { ...makeReportBase(), mode: 'COHOST_BRIDGE_INSPECTOR',
            stage: 'ERROR', error: String(error) }; }
        showReport();
    }


    function diagnoseBattle() {
        const previousRepair = lastReport;
        lastReport = { ...makeReportBase(), version: '2.6.10', mode: 'READ_ONLY_DIAGNOSTIC',
            nativeState: captureNativeState(), previousRepair };
        showReport();
    }


    function fail(reason, extra = {}) {
        lastReport = {
            ...makeReportBase(),

            success: false,

            reason,

            ...(reason.includes('moduleData was not found') ? { nativeState: captureNativeState() } : {}),

            ...extra
        };

        console.warn(
            '[1V1 AUTO v2.1]',
            lastReport
        );

        updateStatus(
            'REFUSED',
            '#ff6b6b'
        );

        return lastReport;
    }

    async function validateAfter(actionType) {
        const delays = [
            50,
            250,
            750,
            1500,
            3000
        ];

        const timeline = [];
        let previous = 0;

        for (const delay of delays) {
            await sleep(delay - previous);
            previous = delay;

            timeline.push({
                ms: delay,
                ...domState()
            });
        }

        const scoreBarMounted =
            timeline.some(x => x.scoreBar);

        const hasScores =
            timeline.some(
                x =>
                    Array.isArray(x.scores) &&
                    x.scores.length >= 2
            );

        const hasParticipantText =
            timeline.some(
                x =>
                    Array.isArray(x.participantText) &&
                    x.participantText.length > 0
            );

        return {
            actionType,
            timeline,

            afterDOM:
                timeline[
                    timeline.length - 1
                ],

            scoreBarMounted,
            hasScores,
            hasParticipantText,

            usable:
                scoreBarMounted &&
                hasScores
        };
    }

    /*
     * TYPE-A1
     *
     * Same behavior as v2.0.
     */
    async function runTypeA(ctx) {
        const {
            data,
            controller,
            current
        } = ctx;

        const currentRoomId =
            current.roomId;

        const currentAnchorId =
            current.anchorId;

        const currentBattle =
            current.battle;

        const currentBattleId =
            getBattleId(currentBattle);

        const currentChannelId =
            getChannelId(currentBattle);

        const currentUsers =
            current.users;

        const baseItem =
            chooseBaseModule(
                data.modules,
                currentRoomId
            );

        if (!baseItem) {
            return fail(
                'AUTO detected Type-A, but no native Cohost base moduleData was found.'
            );
        }

        const base =
            baseItem.object;

        if (
            !base.player ||
            !base.match ||
            typeof base.onCohostStart !== 'function' ||
            typeof base.onCohostEnd !== 'function' ||
            typeof base.match.onMatchStart !== 'function' ||
            typeof base.match.onMatchEnd !== 'function'
        ) {
            return fail(
                'Type-A native base object is incomplete.'
            );
        }

        let liveIM =
            base.liveIMInstance;

        let imSource =
            'base.liveIMInstance';

        if (
            !imMatchesRoom(
                liveIM,
                currentRoomId
            )
        ) {
            liveIM =
                findCurrentIM(
                    data.imCandidates,
                    currentRoomId
                );

            imSource =
                'verified-current-IM';
        }

        if (
            !liveIM ||
            !imMatchesRoom(
                liveIM,
                currentRoomId
            )
        ) {
            return fail(
                'Type-A could not verify a current liveIMInstance.'
            );
        }

        const freshModuleData = {
            ...base,

            roomId:
                currentRoomId,

            anchorId:
                currentAnchorId,

            initialLinkedUsers:
                currentUsers,

            /*
             * 1v1 only.
             */
            groupChannelId:
                currentChannelId,

            player:
                base.player,

            liveIMInstance:
                liveIM,

            match: {
                ...base.match,

                initialBattleInfo:
                    currentBattle
            }
        };

        const pre = {
            type:
                'TYPE_A_REOPEN',

            baseModuleObjectId:
                oid(base),

            baseRoomId:
                getRoomId(base),

            baseAnchorId:
                getAnchorId(base),

            currentRoomId,
            currentAnchorId,
            currentBattleId,
            currentChannelId,

            currentUsers:
                currentUsers.map(
                    summarizeUser
                ),

            playerObjectId:
                oid(base.player),

            liveIMObjectId:
                oid(liveIM),

            imSource
        };

        updateStatus(
            'TYPE-A',
            '#ffd43b'
        );

        try {
            controller.showFn(
                'Cohost',
                freshModuleData
            );
        } catch (error) {
            return fail(
                `Type-A native show() threw: ${
                    error?.message ??
                    String(error)
                }`,
                { pre }
            );
        }

        const result =
            await validateAfter(
                'TYPE_A_REOPEN'
            );

        lastReport = {
            ...makeReportBase(),

            success:
                result.usable,

            detectedType:
                'TYPE_A',

            pre,

            ...result
        };

        updateStatus(
            result.usable
                ? 'SUCCESS A'
                : (
                    result.scoreBarMounted
                        ? 'PARTIAL A'
                        : 'NO UI A'
                ),

            result.usable
                ? '#55ff88'
                : '#ffb84d'
        );

        return lastReport;
    }

    /*
     * TYPE-B1 v2.1
     *
     * v2.0 shallow update() was tested on a real B1 and failed.
     *
     * New path:
     * 1. Use current mounted moduleData as the native base.
     * 2. Correct only initialLinkedUsers + match.initialBattleInfo.
     * 3. Preserve player, liveIM, room, anchor, callbacks, tracking,
     *    groupChannelId, reporting, etc.
     * 4. Native destroy("Cohost").
     * 5. Wait until controller.shown no longer contains Cohost.
     * 6. Allow a short React settle period.
     * 7. Native show("Cohost", correctedModuleData).
     */
    async function runTypeB1(ctx) {
        const {
            data,
            controller,
            current
        } = ctx;

        const currentRoomId =
            current.roomId;

        const currentAnchorId =
            current.anchorId;

        const currentBattle =
            current.battle;

        const currentBattleId =
            getBattleId(currentBattle);

        const currentChannelId =
            getChannelId(currentBattle);

        const currentUsers =
            current.users;

        const moduleItem =
            chooseMountedModule(
                data.modules,
                currentRoomId,
                currentAnchorId
            );

        if (!moduleItem) {
            return fail(
                'AUTO detected Type-B1, but mounted Cohost moduleData was not found.'
            );
        }

        const moduleData =
            moduleItem.object;

        const existingUsers =
            Array.isArray(
                moduleData.initialLinkedUsers
            )
                ? moduleData.initialLinkedUsers
                : null;

        const existingBattle =
            moduleData
                ?.match
                ?.initialBattleInfo ??
            null;

        const existingBattleId =
            getBattleId(
                existingBattle
            );

        const usersMissing =
            !existingUsers ||
            existingUsers.length === 0;

        const battleMissing =
            !existingBattleId;

        if (
            !usersMissing &&
            !battleMissing
        ) {
            return fail(
                'Type-B1 candidate already has both linked users and battle state.'
            );
        }

        if (
            !moduleData.player ||
            !moduleData.liveIMInstance ||
            !moduleData.match ||
            typeof moduleData.match !== 'object' ||
            typeof moduleData.onCohostStart !== 'function' ||
            typeof moduleData.onCohostEnd !== 'function' ||
            typeof moduleData.match.onMatchStart !== 'function' ||
            typeof moduleData.match.onMatchEnd !== 'function'
        ) {
            return fail(
                'Mounted Type-B1 Cohost native moduleData/callbacks are incomplete.'
            );
        }

        /*
         * Important:
         * Do NOT replace player or IM with generic current-store objects.
         * Keep the exact identities TikTok mounted originally.
         */
        const correctedModuleData = {
            ...moduleData,

            initialLinkedUsers:
                currentUsers,

            match: {
                ...moduleData.match,

                initialBattleInfo:
                    currentBattle
            }
        };

        const pre = {
            type:
                'TYPE_B1_REINIT',

            moduleObjectId:
                oid(moduleData),

            modulePath:
                moduleItem.path,

            roomId:
                getRoomId(moduleData),

            anchorId:
                getAnchorId(moduleData),

            groupChannelId:
                sid(moduleData.groupChannelId),

            existingUsersLength:
                existingUsers
                    ? existingUsers.length
                    : null,

            existingBattleId,

            currentBattleId,
            currentChannelId,

            currentUsers:
                currentUsers.map(
                    summarizeUser
                ),

            playerObjectId:
                oid(moduleData.player),

            liveIMObjectId:
                oid(moduleData.liveIMInstance),

            shownBeforeDestroy:
                [...controller.shown]
        };

        updateStatus(
            'B1 DESTROY',
            '#59a8ff'
        );

        /*
         * Step 1: native interaction destroy.
         */
        try {
            controller.destroyFn(
                'Cohost'
            );
        } catch (error) {
            return fail(
                `Type-B1 native destroy() threw: ${
                    error?.message ??
                    String(error)
                }`,
                { pre }
            );
        }

        /*
         * Step 2:
         * Wait for native onInteractDestroy to remove Cohost
         * from the controller's shown list.
         *
         * This array is mutated by TikTok's own callback:
         * indexOf(name) -> splice(index, 1)
         */
        const waitStarted =
            performance.now();

        let removed =
            !controller.shown.includes(
                'Cohost'
            );

        let destroyWaitMs = 0;

        while (
            !removed &&
            destroyWaitMs < 1500
        ) {
            await sleep(25);

            destroyWaitMs =
                Math.round(
                    performance.now() -
                    waitStarted
                );

            removed =
                !controller.shown.includes(
                    'Cohost'
                );
        }

        if (!removed) {
            return fail(
                'Type-B1 native destroy() ran, but Cohost was not removed from controller.shown within 1500ms.',
                {
                    pre,

                    destroy: {
                        removed: false,
                        waitMs: destroyWaitMs,
                        shownAfterWait:
                            [...controller.shown]
                    }
                }
            );
        }

        /*
         * Give the bridge's closed=true state a brief chance
         * to commit before calling init again.
         */
        await sleep(80);

        updateStatus(
            'B1 REOPEN',
            '#b48cff'
        );

        /*
         * Step 3: native show/init with corrected data.
         */
        try {
            controller.showFn(
                'Cohost',
                correctedModuleData
            );
        } catch (error) {
            return fail(
                `Type-B1 native re-show() threw: ${
                    error?.message ??
                    String(error)
                }`,
                {
                    pre,

                    destroy: {
                        removed: true,
                        waitMs: destroyWaitMs,
                        shownBeforeShow:
                            [...controller.shown]
                    }
                }
            );
        }

        const shownAfterShow =
            [...controller.shown];

        const result =
            await validateAfter(
                'TYPE_B1_REINIT'
            );

        lastReport = {
            ...makeReportBase(),

            success:
                result.usable,

            detectedType:
                'TYPE_B1',

            pre,

            reinit: {
                destroyRemovedCohost: true,
                destroyWaitMs,

                settleMs:
                    80,

                shownAfterShow
            },

            ...result
        };

        updateStatus(
            result.usable
                ? 'SUCCESS B1'
                : (
                    result.scoreBarMounted
                        ? 'PARTIAL B1'
                        : 'NO UI B1'
                ),

            result.usable
                ? '#55ff88'
                : '#ffb84d'
        );

        return lastReport;
    }

function findHandler(fiber){
    let h=
        fiber?.memoizedState;

    const seen=
        new Set();

    for(
        let index=0;
        h &&
        !seen.has(h) &&
        index<180;
        index++,h=h.next
    ){
        seen.add(h);

        const state=
            h.memoizedState;

        const funcs=[];

        if(typeof state==='function'){
            funcs.push(state);
        }

        if(
            state &&
            typeof state==='object' &&
            typeof state.current==='function'
        ){
            funcs.push(
                state.current
            );
        }

        if(Array.isArray(state)){
            funcs.push(
                ...state.filter(
                    x=>typeof x==='function'
                )
            );
        }

        for(const fn of funcs){
            const s=
                source(fn) || '';

            if(
                s.includes(
                    'VoiceChatType.ChatHost'
                ) &&
                s.includes(
                    'groupChannelId'
                ) &&
                s.includes(
                    'liveIMInstance'
                ) &&
                s.includes(
                    '"Cohost"'
                )
            ){
                return{
                    fn,
                    index,
                    source:s
                };
            }
        }
    }

    return null;
}

function findGroups(
    controllerFiber,
    roomId,
    handlerIndex
){
    const groups=[];

    for(
        let syncIndex=0;
        syncIndex<handlerIndex;
        syncIndex++
    ){
        const h=
            hookAt(
                controllerFiber,
                syncIndex
            );

        const queue=
            h?.queue;

        if(
            !queue ||
            typeof queue
                .getSnapshot!==
                'function'
        ){
            continue;
        }

        let snapshot;

        try{
            snapshot=
                queue.getSnapshot();
        }catch{
            continue;
        }

        if(
            !snapshot ||
            typeof snapshot!=='object' ||
            sid(snapshot.roomId)!==roomId ||
            !(
                'isSubscriber'
                in snapshot
            )
        ){
            continue;
        }

        const subState=
            hookAt(
                controllerFiber,
                syncIndex-1
            )?.memoizedState;

        const subscribeFn=
            Array.isArray(subState)
            ? subState[0]
            : null;

        const effect=
            hookAt(
                controllerFiber,
                syncIndex+1
            )?.memoizedState;

        if(
            typeof subscribeFn!=='function' ||
            !source(subscribeFn)
                ?.includes('.subscribe(') ||
            typeof effect
                ?.create!=='function'
        ){
            continue;
        }

        groups.push({
            index:
                syncIndex,

            queue,

            snapshot,

            subscribeFn,

            effect,

            distance:
                handlerIndex-
                syncIndex
        });
    }

    return groups.sort(
        (a,b)=>
            a.distance-
            b.distance
    );
}


    // v2.2: real-SEI A2 path. A1 and B1 implementations below are unchanged.
    const a2 = { enabled: false, key: null, page: null, event: null, meta: null,
        listeners: new Map(), retryAt: 0, scanning: false };

    function source(fn) {
        try { return Function.prototype.toString.call(fn); } catch (_) { return ''; }
    }

    function a2Key(current) {
        return [current.roomId, current.anchorId, getBattleId(current.battle),
            getChannelId(current.battle)].join('|');
    }

    function resetA2() {
        for (const [emitter, listener] of a2.listeners) {
            try { emitter.off('sei_parsed', listener); } catch (_) {}
        }
        a2.listeners.clear();
        a2.event = a2.meta = null;
        a2.key = null;
        a2.retryAt = 0;
    }

    function a1Available(data, current) {
        const base = chooseBaseModule(data.modules, current.roomId)?.object;
        return !!(base?.player && base.match &&
            typeof base.onCohostStart === 'function' &&
            typeof base.onCohostEnd === 'function' &&
            typeof base.match.onMatchStart === 'function' &&
            typeof base.match.onMatchEnd === 'function' &&
            (imMatchesRoom(base.liveIMInstance, current.roomId) ||
                findCurrentIM(data.imCandidates, current.roomId)));
    }

    function inspectA2() {
        const root = committedRoot();
        if (!root) return null;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        const controller = findController(data.fibers);
        if (!current || !controller || current.users?.length !== 2 ||
            !getBattleId(current.battle) || !getChannelId(current.battle)) return null;
        const handler = findHandler(controller.fiber);
        if (!handler) return null;
        const groups = findGroups(controller.fiber, current.roomId, handler.index);
        return { data, current, controller, handler, groups };
    }

    function attachA2SEI(d) {
        const key = a2Key(d.current);
        if (a2.key !== key || a2.page !== location.href) {
            resetA2();
            a2.key = key;
            a2.page = location.href;
        }
        const channel = getChannelId(d.current.battle);
        const seen = new WeakSet();
        function walk(obj, path, depth) {
            if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 9) return;
            seen.add(obj);
            if (typeof obj.on === 'function' && typeof obj.off === 'function' &&
                !a2.listeners.has(obj)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    if (a2.key !== key || a2.page !== location.href ||
                        app?.ver !== 2 || sid(app.group_channel_id) !== channel) return;
                    // Retain the real event unchanged; never rebuild IDs through Number().
                    a2.event = event;
                    a2.meta = { capturedAt: new Date().toISOString(), timestamp: Date.now(),
                        path, ver: app.ver, groupChannelId: sid(app.group_channel_id),
                        battleId: sid(app.battle_id), channelId: sid(app.channel_id),
                        isInChatting: event.isInChatting,
                        combineRegionsLength: event.combineRegions?.length ?? null };
                };
                try {
                    obj.on('sei_parsed', listener);
                    a2.listeners.set(obj, listener);
                } catch (_) {}
            }
            try {
                for (const [name, value] of Object.entries(obj)) {
                    if (value && typeof value === 'object') walk(value, path + '.' + name, depth + 1);
                }
            } catch (_) {}
        }
        d.data.fibers.forEach((f, i) => {
            walk(f.memoizedProps, 'f' + i + '.props', 0);
            walk(f.memoizedState, 'f' + i + '.state', 0);
            walk(f.updateQueue, 'f' + i + '.queue', 0);
        });
    }

    async function runTypeA2(d) {
        const report = { ...makeReportBase(), mode: 'A2_AUTO_NATIVE_REPAIR',
            detectedType: 'TYPE_A2', success: false, stage: 'PREPARING',
            context: { roomId: d.current.roomId, anchorId: d.current.anchorId,
                battleId: getBattleId(d.current.battle), channelId: getChannelId(d.current.battle) },
            timeline: [], restoredGetSnapshot: false };
        const key = a2Key(d.current), page = location.href, start = Date.now();
        let queue, original, descriptor, cleanup, patched = false;
        function verifyContext() {
            if (location.href !== page) throw new Error('Navigation interrupted A2 repair');
            const next = inspectA2();
            if (!next || a2Key(next.current) !== key) throw new Error('Room/battle changed during A2 repair');
            return next;
        }
        function restore() {
            if (!patched) return;
            if (descriptor) Object.defineProperty(queue, 'getSnapshot', descriptor);
            else delete queue.getSnapshot;
            report.restoredGetSnapshot = queue.getSnapshot === original;
            patched = false;
            if (!report.restoredGetSnapshot) throw new Error('getSnapshot restoration failed');
        }
        try {
            attachA2SEI(d);
            updateStatus('A2 WAIT SEI', '#ffd43b');
            const deadline = Date.now() + 10000;
            while (!a2.event || !a2.meta || Date.now() - a2.meta.timestamp > 5000) {
                if (Date.now() >= deadline) throw new Error('Timed out waiting for matching real ChatHost SEI');
                await sleep(100);
                d = verifyContext();
                attachA2SEI(d);
            }
            d = verifyContext();
            const before = domState();
            if (before.battleRoot || before.scoreBar || d.controller.shown.includes('Cohost'))
                throw new Error('A2 state changed before repair');
            const event = a2.event;
            if (event?.seiContent?.app_data?.ver !== 2 ||
                sid(event.seiContent.app_data.group_channel_id) !== report.context.channelId)
                throw new Error('Real SEI no longer matches current group channel');
            report.realSEI = { ...a2.meta };
            const group = d.groups[0];
            if (!group) throw new Error('No current-room native external-store group');
            report.selectedStoreHook = group.index;
            queue = group.queue;
            original = queue.getSnapshot;
            descriptor = Object.getOwnPropertyDescriptor(queue, 'getSnapshot');
            const snapshot = original.call(queue);
            if (sid(snapshot?.roomId) !== report.context.roomId)
                throw new Error('External-store room changed');
            const clone = { ...snapshot, isSubscriber: true };
            const override = () => clone;
            queue.getSnapshot = override;
            patched = true;
            if (queue.getSnapshot !== override || queue.getSnapshot() !== clone)
                throw new Error('getSnapshot override verification failed');
            report.stage = 'RERENDERING';
            updateStatus('REPAIRING A2', '#b48cff');
            const old = d.handler.fn;
            cleanup = group.effect.create();
            let fresh = null;
            for (let i = 0; i < 30; i++) {
                await sleep(100);
                const next = verifyContext();
                if (next.handler.fn !== old) { fresh = next.handler; break; }
            }
            if (!fresh) throw new Error('No fresh native H88 handler identity after rerender');
            report.handler = { oldObjectId: oid(old), freshObjectId: oid(fresh.fn), index: fresh.index };
            verifyContext();
            fresh.fn(event);
            restore();
            if (typeof cleanup === 'function') { const stop = cleanup; cleanup = null; stop(); }
            report.stage = 'VALIDATING';
            const validationStart = Date.now();
            for (const ms of [0, 50, 250, 750, 1500, 3000, 5000]) {
                await sleep(Math.max(0, validationStart + ms - Date.now()));
                const next = verifyContext();
                report.timeline.push({ ms, shown: [...next.controller.shown], dom: domState() });
            }
            const final = report.timeline.at(-1).dom;
            report.validation = { battleRoot: final.battleRoot, scoreBar: final.scoreBar,
                hasScores: final.scores.filter(x => typeof x === 'string' && x.trim()).length >= 2,
                hasParticipantNames: final.participantText.some(x => typeof x === 'string' && x.trim()) };
            report.usable = Object.values(report.validation).every(Boolean);
            report.success = report.usable;
            report.stage = report.success ? 'REPAIRED' : 'PARTIAL';
        } catch (error) {
            report.stage = 'ERROR';
            report.error = { message: error?.message || String(error) };
        } finally {
            try { restore(); } catch (error) {
                report.success = false; report.stage = 'RESTORE_ERROR';
                report.restoreError = String(error);
            }
            if (typeof cleanup === 'function') {
                try { cleanup(); } catch (error) { report.cleanupError = String(error); }
            }
            report.durationMs = Date.now() - start;
            lastReport = report;
            a2.retryAt = Date.now() + 30000;
            updateStatus(report.success ? 'A2 FIXED ✓' : 'A2 ' + report.stage,
                report.success ? '#55ff88' : '#ffb84d');
        }
        return report;
    }

    // Automatic two-person Cohost repair before a PK starts. This uses the same
    // native external-store rerender path as A2, but validates only Cohost layout.
    const preCohost = { key: null, page: null, event: null, meta: null,
        listeners: new Map(), candidateSince: 0, retryAt: 0, busy: false };

    function resetPreCohost() {
        for (const [emitter, listener] of preCohost.listeners) {
            try { emitter.off('sei_parsed', listener); } catch (_) {}
        }
        preCohost.listeners.clear();
        preCohost.key = preCohost.page = preCohost.event = preCohost.meta = null;
        preCohost.candidateSince = 0;
    }

    function discoverPreCohost() {
        const root = committedRoot();
        if (!root) return null;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        if (!current?.roomId || !current?.anchorId) return null;
        const controller = findController(data.fibers);
        if (!controller) return null;
        const handler = findHandler(controller.fiber);
        if (!handler) return null;
        const base = chooseBaseModule(data.modules, current.roomId)?.object;
        const groupChannelId = sid(base?.groupChannelId);
        if (!groupChannelId) return null;
        const groups = findGroups(controller.fiber, current.roomId, handler.index);
        if (!groups.length) return null;
        return { data, current, controller, handler, base, groupChannelId, groups };
    }

    function attachPreCohostSEI(discovery) {
        const key = discovery.current.roomId + '|' + discovery.groupChannelId;
        if (preCohost.key !== key || preCohost.page !== location.href) {
            resetPreCohost();
            preCohost.key = key;
            preCohost.page = location.href;
        }
        const seen = new WeakSet();
        function walk(value, path, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 9) return;
            seen.add(value);
            if (typeof value.on === 'function' && typeof value.off === 'function' &&
                !preCohost.listeners.has(value)) {
                const listener = event => {
                    const app = event?.seiContent?.app_data;
                    const regions = Array.isArray(event?.combineRegions) ? event.combineRegions : app?.grids;
                    if (preCohost.key !== key || preCohost.page !== location.href ||
                        app?.ver !== 2 || sid(app.group_channel_id) !== discovery.groupChannelId ||
                        !Array.isArray(regions) || regions.length !== 2 ||
                        ![null, '0'].includes(sid(app.battle_id))) return;
                    preCohost.event = event;
                    preCohost.meta = { capturedAt: new Date().toISOString(), timestamp: Date.now(), path,
                        ver: app.ver, groupChannelId: sid(app.group_channel_id),
                        channelId: sid(app.channel_id), battleId: sid(app.battle_id),
                        regionCount: regions.length, isInChatting: event.isInChatting };
                };
                try {
                    value.on('sei_parsed', listener);
                    preCohost.listeners.set(value, listener);
                } catch (_) {}
            }
            try {
                for (const [name, child] of Object.entries(value)) {
                    if (child && typeof child === 'object') walk(child, path + '.' + name, depth + 1);
                }
            } catch (_) {}
        }
        discovery.data.fibers.forEach((fiber, index) => {
            walk(fiber.memoizedProps, 'f' + index + '.props', 0);
            walk(fiber.memoizedState, 'f' + index + '.state', 0);
            walk(fiber.updateQueue, 'f' + index + '.queue', 0);
        });
    }

    async function runPreCohostRepair(discovery) {
        const report = { ...makeReportBase(), mode: 'PREBATTLE_COHOST_AUTO_REPAIR',
            detectedType: 'PREBATTLE_COHOST_MISSING', stage: 'PREPARING', success: false,
            context: { roomId: discovery.current.roomId, anchorId: discovery.current.anchorId,
                groupChannelId: discovery.groupChannelId }, timeline: [], restoredGetSnapshot: false };
        const page = location.href;
        const key = discovery.current.roomId + '|' + discovery.groupChannelId;
        const started = Date.now();
        let queue, original, descriptor, cleanup, patched = false;
        function verify() {
            if (location.href !== page) throw new Error('Navigation interrupted Cohost repair');
            const next = discoverPreCohost();
            if (!next || next.current.roomId + '|' + next.groupChannelId !== key)
                throw new Error('Room or Cohost channel changed during repair');
            return next;
        }
        function restore() {
            if (!patched) return;
            if (descriptor) Object.defineProperty(queue, 'getSnapshot', descriptor);
            else delete queue.getSnapshot;
            report.restoredGetSnapshot = queue.getSnapshot === original;
            patched = false;
            if (!report.restoredGetSnapshot) throw new Error('getSnapshot restoration failed');
        }
        try {
            const event = preCohost.event;
            const meta = preCohost.meta;
            const app = event?.seiContent?.app_data;
            if (!event || !meta || Date.now() - meta.timestamp > 5000 || app?.ver !== 2 ||
                sid(app.group_channel_id) !== discovery.groupChannelId ||
                ![null, '0'].includes(sid(app.battle_id)))
                throw new Error('Fresh matching pre-battle Cohost SEI is unavailable');
            report.realSEI = { ...meta };
            if (domState().battleRoot || discovery.controller.shown.includes('Cohost'))
                throw new Error('Cohost layout appeared before repair');
            const group = discovery.groups[0];
            report.selectedStoreHook = group.index;
            queue = group.queue;
            original = queue.getSnapshot;
            descriptor = Object.getOwnPropertyDescriptor(queue, 'getSnapshot');
            const snapshot = original.call(queue);
            if (sid(snapshot?.roomId) !== discovery.current.roomId)
                throw new Error('External-store room changed');
            const clone = { ...snapshot, isSubscriber: true };
            const override = () => clone;
            queue.getSnapshot = override;
            patched = true;
            if (queue.getSnapshot !== override || queue.getSnapshot() !== clone)
                throw new Error('getSnapshot override verification failed');
            const oldHandler = discovery.handler.fn;
            updateStatus('REPAIRING COHOST', '#b48cff');
            cleanup = group.effect.create();
            let fresh;
            for (let attempt = 0; attempt < 30; attempt++) {
                await sleep(100);
                const next = verify();
                if (next.handler.fn !== oldHandler) { fresh = next.handler; break; }
            }
            if (!fresh) throw new Error('No fresh native ChatHost handler after rerender');
            report.handler = { oldObjectId: oid(oldHandler), freshObjectId: oid(fresh.fn), index: fresh.index };
            verify();
            fresh.fn(event);
            restore();
            if (typeof cleanup === 'function') { const stop = cleanup; cleanup = null; stop(); }
            const validationStart = Date.now();
            for (const ms of [0, 100, 300, 750, 1500, 3000, 5000]) {
                await sleep(Math.max(0, validationStart + ms - Date.now()));
                const next = verify();
                report.timeline.push({ ms, shown: [...next.controller.shown], dom: domState() });
            }
            const final = report.timeline.at(-1);
            report.validation = { battleRoot: final.dom.battleRoot,
                cohostShown: final.shown.includes('Cohost') };
            report.success = report.usable = Object.values(report.validation).every(Boolean);
            report.stage = report.success ? 'REPAIRED' : 'PARTIAL';
        } catch (error) {
            report.stage = 'ERROR';
            report.error = { message: error?.message || String(error) };
        } finally {
            try { restore(); } catch (error) {
                report.success = false; report.stage = 'RESTORE_ERROR'; report.restoreError = String(error);
            }
            if (typeof cleanup === 'function') try { cleanup(); } catch (error) { report.cleanupError = String(error); }
            report.durationMs = Date.now() - started;
            lastReport = report;
            preCohost.retryAt = Date.now() + 30000;
            updateStatus(report.success ? 'COHOST FIXED ✓' : 'COHOST REPAIR NOT CONFIRMED',
                report.success ? '#55ff88' : '#ffb84d');
        }
        return report;
    }

    async function preCohostTick() {
        if (running || liveCapture.active || preCohost.busy || !a2.enabled || document.hidden ||
            !/\/@[^/]+\/live\/?$/.test(location.pathname)) return;
        preCohost.busy = true;
        try {
            const discovery = discoverPreCohost();
            if (!discovery) { resetPreCohost(); return; }
            const key = discovery.current.roomId + '|' + discovery.groupChannelId;
            if (preCohost.key !== key || preCohost.page !== location.href) resetPreCohost();
            attachPreCohostSEI(discovery);
            const dom = domState();
            if (dom.battleRoot || discovery.controller.shown.includes('Cohost')) {
                preCohost.candidateSince = 0;
                return;
            }
            const meta = preCohost.meta;
            if (!preCohost.event || !meta || Date.now() - meta.timestamp > 5000) return;
            if (!preCohost.candidateSince) { preCohost.candidateSince = Date.now(); return; }
            if (Date.now() - preCohost.candidateSince < 3000 || Date.now() < preCohost.retryAt) return;
            running = true;
            try { await runPreCohostRepair(discovery); }
            finally { running = false; preCohost.candidateSince = 0; }
        } catch (error) {
            preCohost.retryAt = Date.now() + 30000;
            lastReport = { ...makeReportBase(), mode: 'PREBATTLE_COHOST_AUTO_REPAIR',
                success: false, stage: 'DISCOVERY_ERROR', error: String(error) };
        } finally { preCohost.busy = false; }
    }


    // Shared watcher for A1, A2 and B1. Native repair implementations stay unchanged.
    let partialDiagnosticKey = null;
    const autoWatch = { key: null, candidate: null, since: 0, retryAt: 0, busy: false };
    async function automaticTick() {
        if (document.hidden) return;
        if (running || liveCapture.active || autoWatch.busy || !a2.enabled || document.hidden) return;
        autoWatch.busy = true;
        try {
            if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) {
                autoWatch.key = autoWatch.candidate = null;
                resetA2();
                return;
            }
            const root = committedRoot();
            if (!root) { autoWatch.candidate = null; return; }
            const data = collectCandidates(root);
            const current = chooseCurrentRoom(data.rooms);
            const controller = findController(data.fibers);
            if (!current || !controller || current.users?.length !== 2 ||
                !getBattleId(current.battle) || !getChannelId(current.battle)) {
                autoWatch.candidate = null;
                return;
            }
            const key = location.href + '|' + a2Key(current);
            if (autoWatch.key !== key) {
                autoWatch.key = key;
                autoWatch.candidate = null;
                autoWatch.retryAt = 0;
                resetA2();
            }
            const dom = domState();
            const shown = controller.shown.includes('Cohost');
            // A visible but incomplete scorebar is diagnostic-only. Never destroy it.
            if (dom.scoreBar) {
                if (incompleteBattle(dom) && partialDiagnosticKey !== key) {
                    partialDiagnosticKey = key;
                    reportPartialBattle('AUTOMATIC_OBSERVATION');
                } else if (!incompleteBattle(dom)) {
                    partialDiagnosticKey = null;
                }
                autoWatch.candidate = null;
                return;
            }
            let type = null;
            if (!dom.scoreBar && !dom.battleRoot && !shown) {
                if (a1Available(data, current)) type = 'A1';
                else {
                    const handler = findHandler(controller.fiber);
                    const groups = handler && findGroups(controller.fiber, current.roomId, handler.index);
                    if (groups?.length) {
                        type = 'A2';
                        attachA2SEI({ data, current, controller, handler, groups });
                    }
                }
            } else if (!dom.scoreBar && dom.battleRoot && shown) {
                type = 'B1';
            }
            if (!type) { autoWatch.candidate = null; return; }
            if (autoWatch.candidate !== type) {
                autoWatch.candidate = type;
                autoWatch.since = Date.now();
                return;
            }
            // Require the same broken state for 4.5 seconds before intervening.
            if (Date.now() - autoWatch.since < 4500 || Date.now() < autoWatch.retryAt) return;
            // autoRepair re-discovers the current room and owns the shared running lock.
            autoWatch.retryAt = Date.now() + 30000;
            try {
                const result = await autoRepair();
                if (result) result.trigger = 'AUTOMATIC';
            } finally {
                autoWatch.candidate = null;
                autoWatch.retryAt = Date.now() + 30000;
            }
        } catch (error) {
            autoWatch.retryAt = Date.now() + 30000;
            lastReport = { ...makeReportBase(), success: false, trigger: 'AUTOMATIC',
                stage: 'DISCOVERY_ERROR', error: String(error) };
        } finally { autoWatch.busy = false; }
    }


    function automaticOpponentReady(data, current, controller) {
        if (!controller.shown.includes('Cohost')) return false;
        const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
        const moduleData = moduleItem?.object;
        const battle = selectActiveBattle(data, current.roomId, current.anchorId);
        const sei = opponentData.sei;
        const app = sei?.seiContent?.app_data;
        const moduleChannel = sid(moduleData?.groupChannelId);
        const battleChannel = sid(battle?.battle_settings?.channel_id ?? battle?.channel_id);
        if (!moduleData || !battle || !sei || !moduleChannel || battleChannel !== moduleChannel ||
            sid(app?.group_channel_id) !== moduleChannel) return false;
        const users = buildLinkedUsers(battle, sei, current.anchorId);
        return Array.isArray(users) && users.length === 2;
    }

    function capturedOpponentScore(armiesMessage, currentAnchorId) {
        const armies = armiesMessage?.armies;
        const values = Array.isArray(armies) ? armies :
            armies && typeof armies === 'object' ? Object.values(armies) : [];
        for (const raw of values) {
            const item = raw?.value ?? raw;
            const anchorId = sid(item?.anchor_id_str ?? item?.anchor_id ?? raw?.key);
            if (!anchorId || anchorId === currentAnchorId) continue;
            const value = Number(item?.hostScore ?? item?.host_score ?? item?.score);
            if (Number.isFinite(value)) return value;
        }
        return null;
    }

    function hasVerifiedOpponentScoreMismatch(dom, currentAnchorId) {
        if (!dom.scoreBar || opponentData.armiesAt <= 0 ||
            Date.now() - opponentData.armiesAt > 15000) return false;
        const displayed = Number(String(dom.scores[1] ?? '').replace(/[^0-9.-]/g, ''));
        const actual = capturedOpponentScore(opponentData.armies, currentAnchorId);
        return Number.isFinite(displayed) && displayed === 0 && Number.isFinite(actual) && actual > 0;
    }


    // v2.6.10 watcher: the full-unmount + native replay path is now live-proven.
    // It handles missing-name/zero-score states automatically and can use the
    // proven room-SEI bootstrap when the entire Cohost layout is absent.
    async function automaticTick() {
        if (document.hidden) return;
        if (running || liveCapture.active || autoWatch.busy || !a2.enabled || document.hidden) return;
        autoWatch.busy = true;
        try {
            if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) {
                autoWatch.key = autoWatch.candidate = null;
                resetA2();
                return;
            }
            observeOpponentData();
            observeMissingLayoutSEI();
            const root = committedRoot();
            if (!root) { autoWatch.candidate = null; return; }
            const data = collectCandidates(root);
            const current = chooseCurrentRoom(data.rooms);
            const controller = findController(data.fibers);
            if (!current || !controller) { autoWatch.candidate = null; return; }
            const observedBattle = opponentData.battle ??
                findStoredCohostBattle(data, current.roomId, current.anchorId);
            const identity = opponentBattleId(observedBattle) || missingLayout.meta?.battleId ||
                getBattleId(current.battle) || 'cohost';
            const key = location.href + '|' + current.roomId + '|' + identity;
            if (autoWatch.key !== key) {
                autoWatch.key = key;
                autoWatch.candidate = null;
                autoWatch.retryAt = 0;
                resetA2();
            }
            const dom = domState();
            const shown = controller.shown.includes('Cohost');
            const hasName = dom.participantText.some(text => text?.trim());
            const scoreMismatch = hasVerifiedOpponentScoreMismatch(dom, current.anchorId);
            if (dom.scoreBar && hasName && !scoreMismatch) {
                autoWatch.candidate = null;
                partialDiagnosticKey = null;
                return;
            }
            let type = null;
            const standardBattleReady = current.users?.length === 2 &&
                getBattleId(current.battle) && getChannelId(current.battle);
            if (dom.battleRoot && shown && (!dom.scoreBar || !hasName || scoreMismatch) &&
                automaticOpponentReady(data, current, controller)) {
                type = 'OPPONENT_REMOUNT_REPLAY';
            } else if (!dom.scoreBar && !dom.battleRoot && !shown) {
                if (standardBattleReady && a1Available(data, current)) type = 'A1';
                else if (standardBattleReady) {
                    const handler = findHandler(controller.fiber);
                    const groups = handler && findGroups(controller.fiber, current.roomId, handler.index);
                    if (groups?.length) {
                        type = 'A2';
                        attachA2SEI({ data, current, controller, handler, groups });
                    }
                }
                if (!type && missingLayout.page === location.href &&
                    missingLayout.roomId === current.roomId && missingLayout.event &&
                    missingLayout.meta && Date.now() - missingLayout.meta.timestamp < 5000)
                    type = 'MISSING_LAYOUT_ROOM_SEI';
            } else if (!dom.scoreBar && dom.battleRoot && shown && standardBattleReady) {
                type = 'B1';
            }
            if (!type) { autoWatch.candidate = null; return; }
            if (autoWatch.candidate !== type) {
                autoWatch.candidate = type;
                autoWatch.since = Date.now();
                return;
            }
            // Three seconds filters normal TikTok mount latency while keeping the
            // proven production repair substantially faster than the diagnostic run.
            const stableMs = type === 'MISSING_LAYOUT_ROOM_SEI' ? 1500 : 3000;
            if (Date.now() - autoWatch.since < stableMs || Date.now() < autoWatch.retryAt) return;
            autoWatch.retryAt = Date.now() + 30000;
            let result;
            if (type === 'OPPONENT_REMOUNT_REPLAY') result = await repairOpponentByRemount({ automatic: true });
            else if (type === 'MISSING_LAYOUT_ROOM_SEI') result = await repairMissingLayout({ automatic: true });
            else result = await autoRepair();
            if (result) result.trigger = 'AUTOMATIC';
            autoWatch.candidate = null;
            autoWatch.retryAt = Date.now() + 30000;
        } catch (error) {
            autoWatch.retryAt = Date.now() + 30000;
            lastReport = { ...makeReportBase(), success: false, trigger: 'AUTOMATIC',
                stage: 'DISCOVERY_ERROR', error: String(error) };
        } finally { autoWatch.busy = false; }
    }


    function findCurrentCohostUsers(data, current) {
        const lists = [];
        if (Array.isArray(current.users)) lists.push(current.users);
        for (const room of data.rooms) {
            if (room.roomId === current.roomId && room.anchorId === current.anchorId &&
                Array.isArray(room.users)) lists.push(room.users);
        }
        for (const item of data.modules) {
            if (getRoomId(item.object) === current.roomId &&
                Array.isArray(item.object.initialLinkedUsers)) lists.push(item.object.initialLinkedUsers);
        }
        return lists.find(users => users.length === 2 && users.every(user => {
            const summary = summarizeUser(user);
            return summary.id && summary.name;
        })) ?? null;
    }

    function scanNamedCohostUsers(data, current, event) {
        const grids = event?.seiContent?.app_data?.grids;
        if (!Array.isArray(grids) || grids.length !== 2) return null;
        const targetRooms = new Set(grids.map(grid => sid(grid.cid)).filter(Boolean));
        const targetLinkmicIds = new Set(grids.map(grid => sid(grid.uid_str)).filter(Boolean));
        const candidates = new Map();
        const seen = new WeakSet();
        let visited = 0;
        function consider(value) {
            const summary = summarizeUser(value);
            if (!summary.id || !summary.name) return;
            const linkmicId = sid(value?.linkmic_id_str ?? value?.linkmic_id ?? value?.linkMicId);
            let score = 0;
            if (summary.id === current.anchorId) score += 100;
            if (summary.roomId && targetRooms.has(summary.roomId)) score += 80;
            if (linkmicId && targetLinkmicIds.has(linkmicId)) score += 80;
            if (!score) return;
            if (value.display_id) score += 5;
            if (value.avatar_thumb) score += 5;
            const previous = candidates.get(summary.id);
            if (!previous || score > previous.score) candidates.set(summary.id, { value, score });
        }
        function walk(value, depth) {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > 8 || visited++ > 45000) return;
            if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value.nodeType) return;
            seen.add(value);
            consider(value);
            let keys;
            try { keys = Object.keys(value).slice(0, 100); } catch (_) { return; }
            for (const key of keys) {
                if (['return','alternate','child','sibling','stateNode','window','document'].includes(key)) continue;
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor && 'value' in descriptor && descriptor.value && typeof descriptor.value === 'object')
                    walk(descriptor.value, depth + 1);
            }
        }
        for (const fiber of data.fibers) {
            walk(fiber.memoizedProps, 0);
            walk(fiber.memoizedState, 0);
            walk(fiber.updateQueue, 0);
            if (visited > 45000) break;
        }
        const ranked = [...candidates.values()].sort((a, b) => b.score - a.score).map(item => item.value);
        const local = ranked.find(user => summarizeUser(user).id === current.anchorId);
        const remote = ranked.find(user => summarizeUser(user).id !== current.anchorId &&
            (targetRooms.has(summarizeUser(user).roomId) ||
             targetLinkmicIds.has(sid(user?.linkmic_id_str ?? user?.linkmic_id ?? user?.linkMicId))));
        return local && remote ? [local, remote] : null;
    }


    function findCurrentCohostSEI(current, groupChannelId) {
        for (const event of [opponentData.sei, missingLayout.event, preCohost.event]) {
            const app = event?.seiContent?.app_data;
            const battleId = sid(app?.battle_id);
            if (app?.ver === 2 && sid(app.channel_id) === current.roomId &&
                sid(app.group_channel_id) === groupChannelId &&
                Array.isArray(app.grids) && app.grids.length === 2 &&
                (!battleId || battleId === '0')) return event;
        }
        return null;
    }

    function mapCohostUsersToGrids(users, event, current) {
        const app = event?.seiContent?.app_data;
        if (!Array.isArray(app?.grids) || app.grids.length !== 2) return null;
        const remaining = [...users];
        const mapped = [];
        for (const grid of app.grids) {
            const gridRoom = sid(grid.cid);
            const gridLinkmic = sid(grid.uid_str);
            let index = remaining.findIndex(user => summarizeUser(user).roomId === gridRoom);
            if (index < 0 && (gridRoom === current.roomId || gridLinkmic === sid(app.anchor_link_mic_id)))
                index = remaining.findIndex(user => summarizeUser(user).id === current.anchorId);
            if (index < 0 && remaining.length === 1) index = 0;
            if (index < 0) return null;
            const user = remaining.splice(index, 1)[0];
            const summary = summarizeUser(user);
            mapped.push({ ...user, id: summary.id, id_str: summary.id,
                user_id: summary.id, user_id_str: summary.id,
                room_id: gridRoom, room_id_str: gridRoom, roomId: gridRoom,
                linkmic_id_str: gridLinkmic,
                nick_name: user.nick_name ?? user.nickname ?? summary.name,
                nickname: user.nickname ?? user.nick_name ?? summary.name });
        }
        return mapped.length === 2 ? mapped : null;
    }

    function discoverCohostNameRepair() {
        const root = committedRoot();
        if (!root) return null;
        const data = collectCandidates(root);
        const current = chooseCurrentRoom(data.rooms);
        const controller = findController(data.fibers);
        if (!current || !controller || !controller.shown.includes('Cohost')) return null;
        const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
        const moduleData = moduleItem?.object;
        const groupChannelId = sid(moduleData?.groupChannelId);
        const event = groupChannelId && findCurrentCohostSEI(current, groupChannelId);
        const directUsers = findCurrentCohostUsers(data, current);
        const users = directUsers ?? (event && scanNamedCohostUsers(data, current, event));
        const mappedUsers = users && event && mapCohostUsersToGrids(users, event, current);
        if (!moduleData || !groupChannelId || !mappedUsers) return null;
        return { data, current, controller, moduleItem, moduleData, groupChannelId, event, users: mappedUsers };
    }

    async function replayCohostName(current, event, report, phase) {
        let handlers = null;
        const started = Date.now();
        while (Date.now() - started < 3000) {
            const root = committedRoot();
            const data = root && collectCandidates(root);
            handlers = data && findCohostReplayHandlers(data, current.roomId, current.anchorId);
            if (handlers?.nameSEI) break;
            await sleep(50);
        }
        if (!handlers?.nameSEI) throw new Error('Fresh native Cohost name handler was not found');
        const replay = { phase, firstHandlerObjectId: handlers.nameSEI.objectId,
            secondHandlerObjectId: null };
        report.replays.push(replay);
        handlers.nameSEI.fn(event);
        await sleep(250);
        const nextRoot = committedRoot();
        const nextData = nextRoot && collectCandidates(nextRoot);
        const next = nextData && findCohostReplayHandlers(nextData, current.roomId, current.anchorId);
        if (next?.nameSEI) {
            next.nameSEI.fn(event);
            replay.secondHandlerObjectId = next.nameSEI.objectId;
        }
    }

    function buildNativeCohostParticipants(users, event) {
        const app = event?.seiContent?.app_data;
        const grids = app?.grids;
        const participantCount = Array.isArray(grids) ? grids.length : 0;
        const regions = Array.isArray(event?.combineRegions) &&
            event.combineRegions.length === participantCount ?
            event.combineRegions : grids;
        if ((participantCount !== 2 && participantCount !== 4) ||
            !Array.isArray(users) || users.length !== participantCount ||
            !Array.isArray(regions) || regions.length !== participantCount)
            return null;
        const byPosition = new Map(grids.map(grid => [Number(grid.p), grid]));
        const byLinkmic = new Map(users.map(user => [sid(user.linkmic_id_str), user]));
        const participants = [];
        regions.forEach((region, index) => {
            const grid = byPosition.get(index) ?? grids[index];
            const user = byLinkmic.get(sid(grid?.uid_str));
            if (!grid || !user) return;
            const summary = summarizeUser(user);
            participants.push({ userId: summary.id, isAudioMuted: !!grid.mute_a,
                isAnchor: sid(app.anchor_link_mic_id) === sid(grid.uid_str),
                isSharedScreen: false, isSharedScreenLandscape: Number(grid.content_type) === 3,
                isSharedScreenUser: false, nickName: summary.name,
                displayId: user.display_id ?? '', avatarThumb: user.avatar_thumb ?? null, region });
        });
        return participants.length === participantCount ? participants : null;
    }

    function findNativeParticipantStateTarget(data, current) {
        const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
        const owner = moduleItem && data.fibers.find(fiber => oid(fiber) === moduleItem.fiberId);
        if (!owner) return null;
        const stack = owner.child ? [owner.child] : [];
        const seen = new Set();
        while (stack.length && seen.size < 900) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            if (fiber.sibling) stack.push(fiber.sibling);
            if (fiber.child) stack.push(fiber.child);
            const hooks = [];
            let hook = fiber.memoizedState;
            const hookSeen = new Set();
            for (let index = 0; hook && typeof hook === 'object' && !hookSeen.has(hook) && index < 80;
                index++, hook = hook.next) {
                hookSeen.add(hook);
                hooks.push({ index, hook });
                const fn = typeof hook.memoizedState?.current === 'function' ? hook.memoizedState.current : null;
                if (!fn) continue;
                let source = '';
                try { source = Function.prototype.toString.call(fn); } catch (_) {}
                if (!source.includes('linkedUsersMap') || !source.includes('combineRegions')) continue;
                const candidates = hooks.filter(item => item.index < index &&
                    index - item.index <= 10 && Array.isArray(item.hook.memoizedState) &&
                    typeof item.hook.queue?.dispatch === 'function');
                const target = candidates.at(-1);
                if (target) return { dispatch: target.hook.queue.dispatch,
                    fiberObjectId: oid(fiber), handlerHookIndex: index,
                    stateHookIndex: target.index, dispatchObjectId: oid(target.hook.queue.dispatch) };
            }
        }
        return null;
    }

    async function setNativeCohostParticipants(current, users, event, report) {
        const participants = buildNativeCohostParticipants(users, event);
        if (!participants) throw new Error('Native participant objects could not be built from the verified grids');
        const root = committedRoot();
        const data = root && collectCandidates(root);
        const target = data && findNativeParticipantStateTarget(data, current);
        if (!target) throw new Error('Native Cohost participant state dispatcher was not found');
        target.dispatch(participants);
        report.directParticipantState = { fiberObjectId: target.fiberObjectId,
            handlerHookIndex: target.handlerHookIndex, stateHookIndex: target.stateHookIndex,
            dispatchObjectId: target.dispatchObjectId,
            participants: participants.map(item => ({ userId: item.userId,
                nickName: item.nickName, isAnchor: item.isAnchor })) };
        await sleep(250);
    }

    function mapTwoVTwoParticipantUsers(data, current, event, battle) {
        const direct = mapGroupUsers(current, event);
        if (direct?.length === 4) return direct;
        const grids = event?.seiContent?.app_data?.grids;
        const userIds = (battle?.team_member ?? []).flatMap(team => team?.user_id ?? []).map(sid);
        if (!Array.isArray(grids) || grids.length !== 4 || userIds.length !== 4 ||
            new Set(userIds).size !== 4) return null;
        const found = findNamedTwoVTwoUsers(data, userIds);
        const remaining = userIds.map(id => found.get(id)).filter(Boolean);
        if (remaining.length !== 4) return null;
        const ordered = [];
        for (const grid of [...grids].sort((a, b) => Number(a.p) - Number(b.p))) {
            const roomId = sid(grid.cid);
            let index = remaining.findIndex(item => item.summary.roomId === roomId);
            if (index < 0 && roomId === current.roomId)
                index = remaining.findIndex(item => item.summary.id === current.anchorId);
            if (index < 0) return null;
            const match = remaining.splice(index, 1)[0];
            const user = match.value;
            const summary = match.summary;
            if (!summary.id || !summary.name) return null;
            ordered.push({ ...user, id: summary.id, id_str: summary.id,
                user_id: summary.id, user_id_str: summary.id,
                room_id: roomId, room_id_str: roomId, roomId,
                linkmic_id_str: sid(grid.uid_str),
                nick_name: user.nick_name ?? user.nickname ?? summary.name,
                nickname: user.nickname ?? user.nick_name ?? summary.name });
        }
        return remaining.length === 0 ? ordered : null;
    }

    async function setNativeTwoVTwoParticipants(current, event, battle, report) {
        const root = committedRoot();
        const data = root && collectCandidates(root);
        const liveCurrent = data && chooseCurrentRoom(data.rooms);
        if (!data || !liveCurrent || liveCurrent.roomId !== current.roomId)
            throw new Error('Current room changed before the 2v2 participant-state repair');
        const users = mapTwoVTwoParticipantUsers(data, liveCurrent, event, battle);
        if (!users || users.length !== 4)
            throw new Error('Four exact current-room creators could not be mapped to the four video positions');
        await setNativeCohostParticipants(liveCurrent, users, event, report);
        report.directParticipantState.mode = 'FOUR_CREATOR_NATIVE_STATE';
    }


    function inspectCohostNameSources() {
        const result = { current: null, controllerShown: null, module: null,
            roomUserSources: [], cachedSEI: [], matchedDeepUsers: null };
        try {
            const root = committedRoot();
            if (!root) { result.error = 'No committed React root'; return result; }
            const data = collectCandidates(root);
            const current = chooseCurrentRoom(data.rooms);
            const controller = findController(data.fibers);
            if (!current) { result.error = 'No current room'; return result; }
            result.current = { roomId: current.roomId, anchorId: current.anchorId,
                users: Array.isArray(current.users) ? current.users.map(summarizeUser) : null };
            result.controllerShown = controller ? [...controller.shown] : null;
            const moduleItem = chooseMountedModule(data.modules, current.roomId, current.anchorId);
            const moduleData = moduleItem?.object;
            result.module = moduleData ? { path: moduleItem.path, roomId: getRoomId(moduleData),
                anchorId: getAnchorId(moduleData), groupChannelId: sid(moduleData.groupChannelId),
                initialUsers: Array.isArray(moduleData.initialLinkedUsers) ?
                    moduleData.initialLinkedUsers.map(summarizeUser) : null } : null;
            data.rooms.forEach((room, index) => {
                if (room.roomId === current.roomId && Array.isArray(room.users))
                    result.roomUserSources.push({ index, status: room.status,
                        reportLinkType: room.reportLinkType ?? null,
                        users: room.users.map(summarizeUser) });
            });
            const namedEvents = [['opponentData', opponentData.sei], ['missingLayout', missingLayout.event],
                ['preCohost', preCohost.event]];
            for (const [source, event] of namedEvents) {
                const app = event?.seiContent?.app_data;
                result.cachedSEI.push({ source, present: !!event, ver: app?.ver ?? null,
                    roomChannelId: sid(app?.channel_id), groupChannelId: sid(app?.group_channel_id),
                    battleId: sid(app?.battle_id), appGridCount: Array.isArray(app?.grids) ? app.grids.length : null,
                    combineRegionCount: Array.isArray(event?.combineRegions) ? event.combineRegions.length : null,
                    gridIds: Array.isArray(app?.grids) ? app.grids.map(grid => ({
                        uid: sid(grid.uid_str), roomId: sid(grid.cid), position: grid.p ?? null })) : [] });
            }
            const groupChannelId = sid(moduleData?.groupChannelId);
            const event = groupChannelId && findCurrentCohostSEI(current, groupChannelId);
            result.selectedSEI = !!event;
            if (event) {
                const deepUsers = scanNamedCohostUsers(data, current, event);
                result.matchedDeepUsers = deepUsers ? deepUsers.map(summarizeUser) : [];
            }
        } catch (error) { result.error = String(error); }
        return result;
    }


    async function repairCohostName(options = {}) {
        if (running || opponentData.busy || missingLayout.busy) return;
        running = true;
        const before = domState();
        const report = { ...makeReportBase(), mode: 'COHOST_NATIVE_NAME_REPAIR',
            trigger: options.automatic ? 'AUTOMATIC' : 'MANUAL', stage: 'PREPARING',
            success: false, beforeDOM: before, remounts: [], replays: [], timeline: [] };
        let original = null, discovery = null;
        try {
            if (!before.battleRoot || before.scoreBar || before.participantText.some(text => text?.trim()))
                throw new Error('The page is not a cohost-without-PK state missing its native name');
            discovery = discoverCohostNameRepair();
            if (!discovery) {
                report.sourceDiagnostics = inspectCohostNameSources();
                throw new Error('Two named cohosts and matching current-room SEI are not available yet');
            }
            const app = discovery.event.seiContent.app_data;
            const battleId = sid(app.battle_id);
            if (battleId && battleId !== '0') throw new Error('A PK battle is active; cohost-only repair was refused');
            original = { ...discovery.moduleData, match: { ...discovery.moduleData.match } };
            const corrected = { ...discovery.moduleData, initialLinkedUsers: discovery.users };
            report.context = { roomId: discovery.current.roomId, anchorId: discovery.current.anchorId,
                groupChannelId: discovery.groupChannelId };
            report.users = discovery.users.map(summarizeUser);
            updateStatus('RESTORING COHOST NAME', '#b48cff');
            discovery.controller.destroyFn('Cohost');
            const removal = await waitForCohostRemoved(discovery.controller);
            const settleMs = Math.max(150, 500 - removal.domRemovedInMs);
            await sleep(settleMs);
            discovery.controller.showFn('Cohost', corrected);
            report.remounts.push({ phase: 'CORRECTED', ...removal, settleMs,
                destroyToReopenMs: removal.domRemovedInMs + settleMs });
            await replayCohostName(discovery.current, discovery.event, report, 'CORRECTED');
            await sleep(300);
            if (!domState().participantText.some(text => text?.trim()))
                await setNativeCohostParticipants(discovery.current, discovery.users, discovery.event, report);
            const start = Date.now();
            const validationTimes = options.automatic ? [100, 300, 750, 1500] : [100, 300, 750, 1500, 3000];
            for (const ms of validationTimes) {
                await sleep(Math.max(0, start + ms - Date.now()));
                report.timeline.push({ ms, ...domState() });
            }
            const final = report.timeline.at(-1);
            report.validation = { battleRoot: final.battleRoot, noScoreBar: !final.scoreBar,
                hasClickableNativeName: final.participantText.some(text => text?.trim()) };
            report.success = report.usable = Object.values(report.validation).every(Boolean);
            report.stage = report.success ? 'REPAIRED' : 'NOT_REPAIRED';
        } catch (error) {
            report.stage = 'REFUSED_OR_FAILED';
            report.error = { message: error?.message || String(error) };
            if (original && discovery && before.battleRoot && !domState().battleRoot) {
                try {
                    discovery.controller.showFn('Cohost', original);
                    await sleep(800);
                    report.rollbackDOM = domState();
                } catch (rollbackError) { report.rollbackError = String(rollbackError); }
            }
        } finally {
            lastReport = report;
            updateStatus(report.success ? 'COHOST NAME RESTORED ✓' : 'COHOST NAME NOT CONFIRMED',
                report.success ? '#55ff88' : '#ffb84d');
            running = false;
            if (!options.automatic || !report.success) showReport();
        }
        return report;
    }

    const cohostNameAuto = { key: null, since: 0, retryAt: 0, busy: false };
    async function automaticCohostNameTick() {
        if (document.hidden) return;
        if (running || liveCapture.active || cohostNameAuto.busy || !a2.enabled || document.hidden) return;
        try {
            const dom = domState();
            if (!dom.battleRoot || dom.scoreBar || dom.participantText.some(text => text?.trim())) {
                cohostNameAuto.key = null;
                return;
            }
            const discovery = discoverCohostNameRepair();
            if (!discovery) { cohostNameAuto.key = null; return; }
            const key = location.href + '|' + discovery.current.roomId + '|' + discovery.groupChannelId;
            if (cohostNameAuto.key !== key) {
                cohostNameAuto.key = key;
                cohostNameAuto.since = Date.now();
                return;
            }
            if (Date.now() - cohostNameAuto.since < 1500 || Date.now() < cohostNameAuto.retryAt) return;
            cohostNameAuto.busy = true;
            cohostNameAuto.retryAt = Date.now() + 30000;
            await repairCohostName({ automatic: true });
            cohostNameAuto.key = null;
        } catch (error) {
            cohostNameAuto.retryAt = Date.now() + 30000;
            lastReport = { ...makeReportBase(), mode: 'COHOST_NATIVE_NAME_REPAIR',
                trigger: 'AUTOMATIC', success: false, stage: 'DISCOVERY_ERROR', error: String(error) };
        } finally { cohostNameAuto.busy = false; }
    }


    function incompleteBattle(dom) {
        return dom.battleRoot && dom.scoreBar &&
            (dom.scores.filter(x => typeof x === 'string' && x.trim()).length < 2 ||
             !dom.participantText.some(x => typeof x === 'string' && x.trim()));
    }

    function reportPartialBattle(trigger) {
        lastReport = {
            ...makeReportBase(),
            success: false,
            detectedType: 'TYPE_PARTIAL',
            stage: 'DIAGNOSTIC_ONLY',
            actionType: 'NONE',
            trigger,
            reason: 'Partial-state repair is disabled after a confirmed regression. No native state was changed.',
            beforeDOM: domState(),
            nativeState: captureNativeState()
        };
        updateStatus('INCOMPLETE — DIAGNOSTIC ONLY', '#ffb84d');
        return lastReport;
    }

    async function autoRepair() {
        if (liveCapture.active) return; // Keep the capture free of repair actions.
        if (running) {
            return fail(
                'AUTO is already running. Do not press it twice.'
            );
        }

        running = true;

        try {
            updateStatus(
                'SCANNING',
                '#ffd43b'
            );

            const beforeDOM =
                domState();

            let root = null;
            let data = null;
            let current = null;

            /*
             * Retry discovery just like our stable 1v1 path.
             */
            for (
                let attempt = 1;
                attempt <= 20;
                attempt++
            ) {
                root =
                    committedRoot();

                if (root) {
                    data =
                        collectCandidates(root);

                    current =
                        chooseCurrentRoom(
                            data.rooms
                        );
                }

                if (
                    current?.roomId &&
                    current?.anchorId &&
                    current?.battle &&
                    Array.isArray(
                        current?.users
                    )
                ) {
                    break;
                }

                await sleep(500);
            }

            if (
                !root ||
                !data ||
                !current
            ) {
                return fail(
                    'Could not locate a complete current 1v1 PK snapshot.',
                    {
                        beforeDOM
                    }
                );
            }

            const battleId =
                getBattleId(
                    current.battle
                );

            const channelId =
                getChannelId(
                    current.battle
                );

            if (
                !battleId ||
                !channelId
            ) {
                return fail(
                    'Current PK battle ID/channel ID is missing.',
                    {
                        beforeDOM
                    }
                );
            }

            if (
                !Array.isArray(
                    current.users
                ) ||
                current.users.length !== 2
            ) {
                return fail(
                    `AUTO is currently restricted to 1v1. Found ${
                        Array.isArray(
                            current.users
                        )
                            ? current.users.length
                            : 'no'
                    } social Cohost users.`,
                    {
                        beforeDOM,

                        roomId:
                            current.roomId,

                        battleId
                    }
                );
            }

            const controller =
                findController(
                    data.fibers
                );

            if (!controller) {
                return fail(
                    'Native Cohost controller with update/show/destroy callbacks was not found.',
                    {
                        beforeDOM
                    }
                );
            }

            const shown =
                [...controller.shown];

            /*
             * Already healthy enough:
             * do nothing.
             */
            if (incompleteBattle(domState()) && shown.includes('Cohost')) {
                return reportPartialBattle('MANUAL');
            }
            if (beforeDOM.scoreBar) {
                return fail(
                    'PK scorebar already exists. AUTO made no changes.',
                    {
                        classification:
                            'ALREADY_MOUNTED',

                        beforeDOM,
                        shown
                    }
                );
            }

            /*
             * Type A
             *
             * No PK root and controller does not consider Cohost shown.
             */
            if (
                !beforeDOM.battleRoot &&
                !shown.includes('Cohost')
            ) {
                lastReport = {
                    ...makeReportBase(),

                    stage:
                        'AUTO_CLASSIFIED',

                    detectedType:
                        'TYPE_A',

                    beforeDOM,

                    shown
                };

                // A1 keeps the original native base-data path. A2 handles
                // fresh-entry cases where that usable base does not exist.
                if (!a1Available(data, current)) {
                    const handler = findHandler(controller.fiber);
                    if (handler) {
                        return await runTypeA2({ data, current, controller, handler,
                            groups: findGroups(controller.fiber, current.roomId, handler.index) });
                    }
                }

                return await runTypeA({
                    data,
                    controller,
                    current
                });
            }

            /*
             * Type B1
             *
             * Root exists, scorebar missing,
             * Cohost already mounted.
             */
            if (
                beforeDOM.battleRoot &&
                !beforeDOM.scoreBar &&
                shown.includes('Cohost')
            ) {
                lastReport = {
                    ...makeReportBase(),

                    stage:
                        'AUTO_CLASSIFIED',

                    detectedType:
                        'TYPE_B1',

                    beforeDOM,

                    shown
                };

                return await runTypeB1({
                    data,
                    controller,
                    current
                });
            }

            /*
             * Unknown/mixed state:
             * refuse rather than guess.
             */
            return fail(
                'AUTO found an unrecognized/mixed state and made no changes.',
                {
                    classification:
                        'UNKNOWN',

                    beforeDOM,

                    shown,

                    current: {
                        roomId:
                            current.roomId,

                        anchorId:
                            current.anchorId,

                        battleId,

                        channelId,

                        users:
                            current.users.map(
                                summarizeUser
                            )
                    }
                }
            );

        } finally {
            running = false;
        }
    }

    function safeJSON(value) {
        const seen =
            new WeakSet();

        return JSON.stringify(
            value,
            (key, val) => {
                if (
                    val &&
                    typeof val === 'object'
                ) {
                    if (seen.has(val)) {
                        return '[Circular]';
                    }

                    seen.add(val);
                }

                if (
                    typeof val === 'bigint'
                ) {
                    return val.toString();
                }

                return val;
            },
            2
        );
    }

    function closeReport() {
        document
            .getElementById(
                REPORT_ID
            )
            ?.remove();
    }

    function uiButton(label, action, color = '#333') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        const styles = { display: 'inline-block', visibility: 'visible', opacity: '1',
            background: color, color: '#fff', border: '1px solid #aaa',
            'border-radius': '4px', padding: '5px 8px', cursor: 'pointer',
            font: 'bold 11px Arial', 'line-height': '18px', appearance: 'none',
            'min-width': '36px', 'text-shadow': 'none', 'pointer-events': 'auto' };
        for (const [key, value] of Object.entries(styles)) button.style.setProperty(key, value, 'important');
        button.onclick = action;
        return button;
    }

    async function copyReportText(area, button) {
        area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
        let copied = false;
        try { await navigator.clipboard.writeText(area.value); copied = true; } catch (_) {}
        if (!copied) {
            try { copied = document.execCommand('copy'); } catch (_) {}
        }
        button.textContent = copied ? 'COPIED ✓' : 'SELECTED — COPY MANUALLY';
        if (!copied) { area.focus(); area.select(); }
        setTimeout(() => { button.textContent = 'COPY'; }, 1800);
    }

    function showReport() {
        if (!document.body) return;
        closeReport();
        const overlay = document.createElement('div');
        overlay.id = REPORT_ID;
        Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647',
            background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        const box = document.createElement('div');
        Object.assign(box.style, { width: '92vw', height: '90vh', padding: '10px',
            boxSizing: 'border-box', background: '#080808', border: '2px solid #b48cff',
            display: 'flex', flexDirection: 'column', gap: '8px' });
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
        const area = document.createElement('textarea');
        area.readOnly = true;
        area.setAttribute('aria-label', 'Repair report');
        area.value = safeJSON(lastReport || { version: '2.2.0', stage: 'NO_REPORT_YET' });
        Object.assign(area.style, { flex: '1', minHeight: '0', width: '100%',
            boxSizing: 'border-box', background: '#050505', color: '#fff',
            font: '12px monospace', padding: '10px', resize: 'none' });
        const select = () => { area.focus(); area.select(); area.setSelectionRange(0, area.value.length); };
        const copy = uiButton('COPY', () => copyReportText(area, copy), '#523080');
        row.append(copy, uiButton('SELECT ALL', select), uiButton('CLOSE ✕', closeReport, '#a51c3a'));
        box.append(row, area); overlay.append(box); document.body.append(overlay);
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.stopPropagation(); closeReport(); }
        });
        requestAnimationFrame(select);
    }


    let latestActivity = '';
    function updateStatus(text, color) {
        latestActivity = text;
        refreshPanelStatus();
    }

    function refreshPanelStatus() {
        const el = document.getElementById('tt-1v1-auto-status');
        const detail = document.getElementById('tt-1v1-auto-detail');
        if (!el || !detail) return;
        const dom = domState();
        const scores = dom.scores.filter(x => typeof x === 'string' && x.trim());
        const names = dom.participantText.filter(x => typeof x === 'string' && x.trim());
        let title, message, color = '#ffd43b';
        if (running) {
            title = ['A2 WAIT SEI', 'WAITING FOR NAMES'].includes(latestActivity) ? 'Waiting for live data…' : 'Checking / repairing…';
            message = 'Please wait. The result will appear here.';
        } else if (dom.battleRoot && dom.scoreBar && scores.length >= 2 && names.length) {
            title = 'Battle UI detected ✓'; color = '#55ff88';
            message = 'Scorebar, scores and participant names are visible. No repair needed.';
        } else if (dom.scoreBar) {
            title = 'Battle UI partly detected';
            message = 'Scores or names are missing. Repair for this state is disabled. Use Capture diagnostic; no reinitialization will run.';
        } else if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) {
            title = 'Open a TikTok LIVE'; color = '#ddd';
            message = 'This tool checks one-versus-one live battles.';
        } else if (lastReport?.page === location.href && lastReport?.success === false) {
            title = 'Repair not confirmed';
            message = (a2.enabled ? 'Automatic monitoring continues. Failed attempts have a 30-second cooldown. View report for details.' : 'Press Check & repair to try again, or View report for details.');
        } else {
            title = 'No battle UI detected'; color = '#ddd';
            message = (a2.enabled ? 'Watching for a broken battle. Repairs start automatically after a short loading delay.' : 'Automatic repair is paused. Press Check & repair to run once.');
        }
        el.textContent = title; el.style.color = color;
        detail.textContent = message;
        const monitoring = document.getElementById('tt-1v1-auto-monitoring');
        if (monitoring) monitoring.textContent = liveCapture.active ? 'Automatic repair: paused during capture' : a2.enabled
            ? 'Automatic battle repair: ON' : 'Automatic battle repair: OFF';
        const run = document.getElementById('tt-1v1-auto-check');
        if (run) { run.disabled = running || liveCapture.active; run.textContent = running ? 'Please wait…' : 'Check & repair'; }
    }

    function cohostPanelInfo() {
        const info = { active: false, battleActive: false, opponentName: null };
        try {
            const root = committedRoot();
            if (!root) return info;
            const data = collectCandidates(root);
            const current = chooseCurrentRoom(data.rooms);
            const controller = findController(data.fibers);
            if (!current) return info;
            const events = [opponentData.sei, missingLayout.event, preCohost.event].filter(Boolean);
            const currentSEI = events.find(event => sid(event?.seiContent?.app_data?.channel_id) === current.roomId &&
                Array.isArray(event?.seiContent?.app_data?.grids) && event.seiContent.app_data.grids.length === 2);
            const app = currentSEI?.seiContent?.app_data;
            const seiBattleId = sid(app?.battle_id);
            info.active = !!(domState().battleRoot || controller?.shown?.includes('Cohost') || currentSEI);
            info.battleActive = !!(domState().scoreBar || (seiBattleId && seiBattleId !== '0') ||
                getBattleId(current.battle));
            const lists = [];
            if (Array.isArray(current.users)) lists.push(current.users);
            for (const room of data.rooms) {
                if (room.roomId === current.roomId && Array.isArray(room.users)) lists.push(room.users);
            }
            for (const item of data.modules) {
                if (getRoomId(item.object) === current.roomId && Array.isArray(item.object.initialLinkedUsers))
                    lists.push(item.object.initialLinkedUsers);
            }
            const battle = selectActiveBattle(data, current.roomId, current.anchorId);
            if (battle && currentSEI) {
                const mapped = buildLinkedUsers(battle, currentSEI, current.anchorId);
                if (mapped) lists.push(mapped);
            }
            for (const users of lists) {
                const remote = users.find(user => sid(user?.id ?? user?.id_str ?? user?.user_id_str ?? user?.user_id) !== current.anchorId);
                const name = remote?.nick_name ?? remote?.nickname ?? remote?.name;
                if (typeof name === 'string' && name.trim()) { info.opponentName = name.trim(); break; }
            }
        } catch (_) {}
        return info;
    }

    function refreshPanelStatus() {
        const el = document.getElementById('tt-1v1-auto-status');
        const detail = document.getElementById('tt-1v1-auto-detail');
        if (!el || !detail) return;
        const dom = domState();
        const scores = dom.scores.filter(x => typeof x === 'string' && x.trim());
        const names = dom.participantText.filter(x => typeof x === 'string' && x.trim());
        const cohost = cohostPanelInfo();
        let title, message, color = '#ffd43b';
        if (running || missingLayout.busy || opponentData.busy) {
            title = 'Checking / repairing…';
            message = 'Please wait. TikTok’s live interface is being refreshed.';
        } else if (dom.battleRoot && dom.scoreBar && scores.length >= 2 && names.length) {
            title = 'PK battle active ✓'; color = '#55ff88';
            message = 'Opponent: ' + names[0] + '. Scores and names are updating.';
        } else if (cohost.active && !cohost.battleActive) {
            title = 'Cohost — no PK active'; color = '#8fc7ff';
            message = names.length ? 'The native cohost name is visible on the video.' :
                'Waiting for TikTok’s clickable cohost name on the video.';
        } else if (cohost.battleActive || dom.scoreBar) {
            title = 'PK detected — interface incomplete';
            message = 'Automatic repair is watching for the missing scoreboard or opponent name.';
        } else if (!/\/@[^/]+\/live\/?$/.test(location.pathname)) {
            title = 'Open a TikTok LIVE'; color = '#ddd';
            message = 'The panel will identify cohost mode and PK battles.';
        } else if (lastReport?.page === location.href && lastReport?.success === false) {
            title = 'Repair not confirmed';
            message = a2.enabled ? 'Automatic monitoring continues after a 30-second cooldown. View the report for details.' :
                'Press Check & repair to try again, or View report for details.';
        } else {
            title = 'No cohost or PK detected'; color = '#ddd';
            message = a2.enabled ? 'Watching for a cohost or PK session.' : 'Automatic repair is paused.';
        }
        el.textContent = title; el.style.color = color;
        detail.textContent = message;
        const monitoring = document.getElementById('tt-1v1-auto-monitoring');
        if (monitoring) monitoring.textContent = liveCapture.active ? 'Automatic repair: paused during capture' : a2.enabled
            ? 'Automatic cohost/PK repair: ON' : 'Automatic cohost/PK repair: OFF';
        const run = document.getElementById('tt-1v1-auto-check');
        if (run) { run.disabled = running || liveCapture.active || missingLayout.busy || opponentData.busy;
            run.textContent = (running || missingLayout.busy || opponentData.busy) ? 'Please wait…' : 'Check & repair'; }
    }


    function loadPosition() {
        try {
            const raw =
                localStorage.getItem(
                    POS_KEY
                );

            if (!raw) return null;

            const value =
                JSON.parse(raw);

            if (
                Number.isFinite(
                    value.left
                ) &&
                Number.isFinite(
                    value.top
                )
            ) {
                return value;
            }
        } catch (_) {}

        return null;
    }

    function savePosition(
        left,
        top
    ) {
        try {
            localStorage.setItem(
                POS_KEY,

                JSON.stringify({
                    left,
                    top
                })
            );
        } catch (_) {}
    }

    function makeDraggable(
        panel,
        handle
    ) {
        let dragging =
            false;

        let moved = false;

        let startX =
            0;

        let startY =
            0;

        let startLeft =
            0;

        let startTop =
            0;

        handle.addEventListener(
            'mousedown',

            event => {
                if (
                    event.button !== 0
                ) {
                    return;
                }

                dragging =
                    true;

                moved = false;

                startX =
                    event.clientX;

                startY =
                    event.clientY;

                const r =
                    panel.getBoundingClientRect();

                startLeft =
                    r.left;

                startTop =
                    r.top;

                event.preventDefault();
            }
        );

        document.addEventListener(
            'mousemove',

            event => {
                if (!dragging) return;

                if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) moved = true;

                let left =
                    startLeft +
                    (
                        event.clientX -
                        startX
                    );

                let top =
                    startTop +
                    (
                        event.clientY -
                        startY
                    );

                left =
                    Math.max(
                        0,

                        Math.min(
                            innerWidth -
                            panel.offsetWidth,

                            left
                        )
                    );

                top =
                    Math.max(
                        0,

                        Math.min(
                            innerHeight -
                            panel.offsetHeight,

                            top
                        )
                    );

                panel.style.left =
                    `${left}px`;

                panel.style.top =
                    `${top}px`;
            }
        );

        document.addEventListener(
            'mouseup',

            () => {
                if (!dragging) return;

                dragging =
                    false;

                panel.dataset.justDragged = moved ? 'true' : 'false';
                setTimeout(() => { delete panel.dataset.justDragged; }, 0);

                const r =
                    panel.getBoundingClientRect();

                savePosition(
                    Math.round(
                        r.left
                    ),

                    Math.round(
                        r.top
                    )
                );
            }
        );
    }

    function expandPanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        collapsed = false;
        panel.dataset.collapsed = 'false';
        panel.style.width = '280px';
        panel.style.height = 'auto';
        panel.style.borderRadius = '5px';
        panel.style.padding = '5px';
        const [head, ...content] = [...panel.children];
        for (const child of content) {
            child.style.display = child.dataset.expandedDisplay ?? '';
            delete child.dataset.expandedDisplay;
        }
        if (head) {
            head.textContent = 'TikTok Battle Repair · 2.6.10';
            head.title = '';
            Object.assign(head.style, { width: 'auto', height: 'auto', display: 'block',
                alignItems: '', justifyContent: '', padding: '4px', borderRadius: '0' });
        }
        const r = panel.getBoundingClientRect();
        panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, r.left)) + 'px';
        panel.style.top = Math.max(0, Math.min(innerHeight - panel.offsetHeight, r.top)) + 'px';
    }

    function hidePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        collapsed = true;
        panel.dataset.collapsed = 'true';
        const [head, ...content] = [...panel.children];
        for (const child of content) {
            child.dataset.expandedDisplay = child.style.display;
            child.style.display = 'none';
        }
        Object.assign(panel.style, { width: '46px', height: '46px', borderRadius: '50%',
            padding: '0', overflow: 'hidden' });
        if (head) {
            head.textContent = 'PK';
            head.title = 'Open TikTok Battle Repair';
            Object.assign(head.style, { width: '46px', height: '46px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: '0', borderRadius: '50%',
                font: 'bold 12px Arial', cursor: 'move' });
        }
        const r = panel.getBoundingClientRect();
        panel.style.left = Math.max(0, Math.min(innerWidth - 46, r.left)) + 'px';
        panel.style.top = Math.max(0, Math.min(innerHeight - 46, r.top)) + 'px';
    }

    function createPanel() {
        if (!moduleEnabled || hidden || !document.body || document.getElementById(PANEL_ID)) return;
        const saved = loadPosition();
        const panel = document.createElement('div'); panel.id = PANEL_ID;
        Object.assign(panel.style, { position: 'fixed', zIndex: '2147483646', width: '280px',
            left: Math.max(0, Math.min(innerWidth - 280, saved?.left ?? innerWidth * .72)) + 'px',
            top: Math.max(0, Math.min(innerHeight - 220, saved?.top ?? 150)) + 'px',
            background: '#101010', color: '#fff', border: '1px solid #b48cff',
            borderRadius: '5px', padding: '5px', boxSizing: 'border-box', font: '11px Arial' });
        const head = document.createElement('div');
        head.textContent = 'TikTok Battle Repair · 2.6.10';
        Object.assign(head.style, { cursor: 'move', textAlign: 'center', padding: '4px', color: '#b48cff' });
        head.addEventListener('click', () => {
            if (panel.dataset.collapsed === 'true' && panel.dataset.justDragged !== 'true') expandPanel();
        });
        const status = document.createElement('div'); status.id = 'tt-1v1-auto-status';
        status.textContent = 'Checking battle UI…';
        Object.assign(status.style, { textAlign: 'center', margin: '5px 0' });
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
        const run = uiButton('Check & repair', async () => {
            if (running) return;
            try { await autoRepair(); } catch (error) { fail(String(error)); }
        }, '#523080');
        run.id = 'tt-1v1-auto-check';
        const detail = document.createElement('div');
        detail.id = 'tt-1v1-auto-detail';
        Object.assign(detail.style, { lineHeight: '17px', margin: '8px 2px', color: '#ddd' });
        const monitoring = document.createElement('div');
        monitoring.id = 'tt-1v1-auto-monitoring';
        Object.assign(monitoring.style, { margin: '8px 2px', color: '#aaa' });
        const toggle = uiButton('Pause automatic repair', () => {
            a2.enabled = !a2.enabled;
            toggle.textContent = a2.enabled ? 'Pause automatic repair' : 'Resume automatic repair';
            autoWatch.candidate = null;
            if (!a2.enabled && !running) resetA2();
            refreshPanelStatus();
        });
        toggle.textContent = a2.enabled ? 'Pause automatic repair' : 'Resume automatic repair';
        const record = uiButton('Record live events (90s)', startLiveCapture);
        record.id = 'tt-live-capture';
        row.append(record);
        row.append(run, uiButton('Test 3/4 cohost names', repairGroupCohostNames, '#006b72'), uiButton('Test 2v2 missing layout', repairMissingTwoVTwo, '#006b72'), uiButton('Test 1v1 missing layout', repairMissingLayout, '#7a4a00'), uiButton('Test 1v1 cohost name', repairCohostName, '#7a4a00'), uiButton('Test 1v1 opponent restart', repairOpponentByRemount, '#7a4a00'), uiButton('View report', showReport), toggle, uiButton('Collapse panel', hidePanel));
        panel.append(head, status, detail, monitoring, row); document.body.append(panel); makeDraggable(panel, head);
        refreshPanelStatus();
    }

    function ensurePanel() {
        if (!moduleEnabled || document.hidden) return;
        if (
            !hidden &&
            document.body &&
            !document.getElementById(
                PANEL_ID
            )
        ) {
            createPanel();
        }
    }

    const whenEnabled = fn => () => { if (moduleEnabled) return fn(); };
    setInterval(whenEnabled(() => { if (!document.hidden) refreshPanelStatus(); }), 1000);
    setInterval(whenEnabled(observeMissingLayoutSEI), 4200);
    setInterval(whenEnabled(observeOpponentData), 4700);
    setInterval(whenEnabled(observeTwoVTwo), 5200);
    setInterval(whenEnabled(observeGroupCohost), 5700);
    setInterval(whenEnabled(automaticTwoVTwoTick), 3000);
    setInterval(whenEnabled(automaticGroupCohostTick), 3200);
    // Pre-battle automatic mutation disabled after live regression.
    setInterval(whenEnabled(automaticTick), 3000);
    setInterval(whenEnabled(automaticCohostNameTick), 3200);
    window.addEventListener('pagehide', resetA2);
    window.addEventListener('pagehide', resetPreCohost);
    window.addEventListener('pagehide', resetOpponentData);
    window.addEventListener('pagehide', resetTwoVTwo);
    window.addEventListener('pagehide', resetGroupCohost);
    window.addEventListener('pagehide', resetMissingLayout);
    window.addEventListener('pagehide', () => finishLiveCapture('PAGE_HIDDEN', false));

    setInterval(
        whenEnabled(ensurePanel),
        1000
    );

    window.addEventListener(
        'load',
        ensurePanel
    );

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            ensurePanel();
            refreshPanelStatus();
        }
    });

    window.__TT_1V1_AUTO_SHOW =
        function () {
            moduleEnabled = true;
            hidden = false;
            ensurePanel();
            expandPanel();
        };

    window.__TTLC__?.register({
        id: 'battle-pk',
        name: 'Battle / PK Repair',
        description: 'Restores missing 1v1/2v2 scores, layouts, and cohost names.',
        start() {
            moduleEnabled = true;
            hidden = false;
            ensurePanel();
        },
        stop() {
            moduleEnabled = false;
            document.getElementById(PANEL_ID)?.remove();
            closeReport();
            finishLiveCapture('MODULE_DISABLED', false);
            resetA2();
            resetPreCohost();
            resetOpponentData();
            resetTwoVTwo();
            resetGroupCohost();
            resetMissingLayout();
        },
        status() {
            if (!moduleEnabled) return 'Off';
            if (running) return 'Repairing…';
            return a2.enabled ? 'Monitoring' : 'Manual mode';
        }
    });

})();

