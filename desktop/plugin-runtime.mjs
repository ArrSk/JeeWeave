// Lifecycle for trusted built-ins. No third-party code execution or sandbox.
export function createPluginRuntime(host, { enabled, onError = () => { } }) {
    const plugins = new Map(), active = new Map(), effects = new Map();
    let stopped = false;
    const report = action => { try {
        action();
    }
    catch (error) {
        try {
            onError(error);
        }
        catch { }
    } };
    const bindings = id => {
        if (!effects.has(id))
            effects.set(id, []);
        const add = install => {
            const entry = { install, dispose: null };
            effects.get(id).push(entry);
            if (active.has(id))
                entry.dispose = install();
            return () => { entry.dispose?.(); entry.dispose = null; effects.set(id, effects.get(id).filter(e => e !== entry)); };
        };
        return {
            owner: id,
            listen(target, type, listener, options) { return add(() => { target.addEventListener(type, listener, options); return () => target.removeEventListener(type, listener, options); }); },
            interval(callback, ms) { return add(() => { const timer = setInterval(callback, ms); return () => clearInterval(timer); }); },
            effect: add,
            onStop(callback) { return add(() => callback); },
        };
    };
    const order = () => {
        const result = [], visiting = new Set(), done = new Set();
        const visit = id => {
            if (visiting.has(id))
                throw Error(`插件依赖循环：${id}`);
            if (done.has(id))
                return;
            const plugin = plugins.get(id);
            if (!plugin)
                throw Error(`缺少插件：${id}`);
            visiting.add(id);
            for (const dependency of plugin.requires || [])
                visit(dependency);
            visiting.delete(id);
            done.add(id);
            result.push(plugin);
        };
        for (const id of plugins.keys())
            visit(id);
        return result;
    };
    const stop = id => {
        const state = active.get(id);
        if (!state)
            return;
        active.delete(id); // Invalidate in-flight operation tokens before releasing resources.
        for (const entry of [...(effects.get(id) || [])].reverse()) {
            if (entry.dispose)
                report(entry.dispose);
            entry.dispose = null;
        }
        state.scope.dispose();
    };
    return {
        register(plugin) {
            if (stopped || !/^[a-z][a-z0-9-]*$/.test(plugin.id || '') || !/^\d+\.\d+\.\d+$/.test(plugin.version || '') || plugins.has(plugin.id) || plugin.hostApiVersion !== 1 || typeof plugin.activate !== 'function' || plugin.requires !== undefined && !Array.isArray(plugin.requires) || Object.values(plugin.servicesRequired || {}).some(v => !Number.isInteger(v) || v < 1))
                throw Error('插件清单无效、重复或宿主版本不兼容。');
            plugins.set(plugin.id, { ...plugin, requires: [...(plugin.requires || [])], optional: [...(plugin.optional || [])], servicesRequired: { ...(plugin.servicesRequired || {}) } });
        },
        bindings,
        reconcile() {
            if (stopped)
                throw Error('插件运行时已关闭。');
            const sorted = order(), wanted = new Set();
            for (const plugin of sorted)
                if (enabled(plugin.id) && (plugin.requires || []).every(id => wanted.has(id)))
                    wanted.add(plugin.id);
            // Validate before stopping existing features, so dependency errors are non-destructive.
            for (const id of [...active.keys()].reverse())
                if (!wanted.has(id))
                    stop(id);
            const started = [];
            try {
                for (const plugin of sorted)
                    if (wanted.has(plugin.id) && !active.has(plugin.id)) {
                        const scope = host.scope(plugin.owner || plugin.id), state = { scope, token: {} };
                        active.set(plugin.id, state);
                        started.push(plugin.id);
                        for (const [service, version] of Object.entries(plugin.servicesRequired || {}))
                            host.use(service, version);
                        plugin.activate(scope);
                        for (const entry of effects.get(plugin.id) || [])
                            entry.dispose = entry.install();
                    }
            }
            catch (error) {
                for (const id of started.reverse())
                    stop(id);
                throw error;
            }
        },
        ticket(id) {
            const token = active.get(id)?.token;
            if (!token)
                throw Error('功能已关闭或依赖不可用。');
            return () => { if (stopped || active.get(id)?.token !== token || !enabled(id))
                throw Error('操作已取消：来源功能已关闭或重新载入。'); };
        },
        list: () => [...plugins.values()].map(p => ({ id: p.id, version: p.version, hostApiVersion: p.hostApiVersion, requires: [...p.requires], optional: [...p.optional], provides: [...(p.provides || [])], capabilities: [...(p.capabilities || [])], active: active.has(p.id), resources: effects.get(p.id)?.filter(e => e.dispose).length || 0 })),
        dispose() { if (stopped)
            return; stopped = true; for (const id of [...active.keys()].reverse())
            stop(id); effects.clear(); host.dispose(); },
    };
}
