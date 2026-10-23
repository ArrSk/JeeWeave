// Trusted built-in features only. This registry is not an external-code sandbox.
export function createWorkbenchHost({ enabled = () => true, onError = () => {} } = {}) {
  const services = new Map(), commands = new Map(), pages = new Map(), listeners = new Map();
  const scopes = new Set();
  let current = null, closed = false;
  const report = error => {try{onError(error);}catch{/* Diagnostics cannot reverse a committed operation. */}};
  const check = owner => { if (closed || !enabled(owner)) throw Error('该功能已关闭，请在插件管理中开启。'); };
  const register = (map, id, value) => {
    if (closed || map.has(id)) throw Error(`重复或失效的接口注册：${id}`);
    map.set(id, value);
    return () => { if (map.get(id) === value) map.delete(id); };
  };
  const host = {
    provide(id, api, { owner = id, version = 1 } = {}) {
      if (!Number.isInteger(version) || version < 1) throw Error('服务版本无效。');
      return register(services, id, { api, owner, version });
    },
    use(id, version = 1) {
      const source = services.get(id);
      if (!source || source.version !== version) throw Error(`服务不可用或版本不兼容：${id}`);
      return new Proxy({}, { get(_target, name) {
        const method = source.api[name];
        if (typeof method !== 'function') return undefined;
        return (...args) => {
          if (services.get(id) !== source) throw Error(`服务已卸载：${id}`);
          check(source.owner); return method.apply(source.api, args);
        };
      } });
    },
    // UI clients reconnect after a feature is reactivated; use() remains revocable.
    client(id, version = 1) { return new Proxy({}, { get: (_target, name) => name==='then'?undefined:(...args) => {
      const api = host.use(id, version), method = api[name];
      if (typeof method !== 'function') throw Error(`接口不可用：${id}.${String(name)}`);
      return method(...args);
    } }); },
    command(id, execute, owner) { return register(commands, id, { execute, owner }); },
    run(id, ...args) { const command = commands.get(id); if (!command) throw Error('此操作当前不可用。'); check(command.owner); return command.execute(...args); },
    page(id, page) { return register(pages, id, page); },
    navigate(id) {
      const next = pages.get(id);
      if (!next) throw Error('页面尚未注册。');
      check(next.owner || id);
      if (id === current) { next.refresh?.(); return; }
      const previous = pages.get(current); previous?.leave?.();
      next.enter(); current = id;
    },
    get currentPage() { return current; },
    inventory() { return {services:[...services].map(([id,s])=>({id,owner:s.owner,version:s.version})),commands:[...commands.keys()],pages:[...pages.keys()],listeners:[...listeners.values()].reduce((n,set)=>n+set.size,0),scopes:scopes.size}; },
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      const set = listeners.get(name); set.add(listener);
      return () => { set.delete(listener); if (!set.size) listeners.delete(name); };
    },
    emit(name, value) { for (const listener of [...(listeners.get(name) || [])]) { try { listener(value); } catch (error) { report(error); } } },
    scope(owner) {
      if (closed) throw Error('宿主已关闭。');
      const cleanup = []; let disposed = false;
      const own = disposer => { if (disposed) disposer(); else cleanup.push(disposer); return disposer; };
      const scope = {
        own,
        listen(target, type, listener, options) { target.addEventListener(type, listener, options); return own(() => target.removeEventListener(type, listener, options)); },
        on(name, listener) { return own(host.on(name, listener)); },
        provide(id, api, version = 1) { return own(host.provide(id, api, { owner, version })); },
        command(id, execute) { return own(host.command(id, execute, owner)); },
        dispose() { if (disposed) return; disposed = true; scopes.delete(scope); for (const dispose of cleanup.reverse()) { try { dispose(); } catch (error) { report(error); } } },
      };
      scopes.add(scope); return scope;
    },
    dispose() { closed = true; for (const scope of [...scopes]) scope.dispose(); services.clear(); commands.clear(); pages.clear(); listeners.clear(); },
  };
  return host;
}
