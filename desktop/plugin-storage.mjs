import { writeTogether } from './workspace-transaction.mjs';
// Capability-limited adapter for trusted built-ins. Backups retain the full workspace.
export function createPluginStorage(storage, { read = [], write = [], transaction = [], projectRead = (_key,text)=>text }) {
    const readable = new Set([...read, ...write]), writable = new Set(write), atomic = new Set([...write, ...transaction]);
    const check = (set, key) => { if (!set.has(key))
        throw Error(`存储命名空间未授权：${key}`); };
    return {
        getItem(key) { check(readable, key); return projectRead(key,storage.getItem(key)); },
        setItem(key, value) { check(writable, key); storage.setItem(key, String(value)); },
        transaction(changes) { for (const key of Object.keys(changes))
            check(atomic, key); writeTogether(storage, changes); },
    };
}
