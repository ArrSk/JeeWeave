const owners = { courseEntry: 'courses', task: 'tasks', plan: 'plans', capture: 'web-capture', journalEntry: 'notes' };
export function createRecordRouter(host, { enabled }) {
    const inspect = ref => {
        if (!ref || typeof ref.id !== 'string' || !ref.id || !owners[ref.collection] || (ref.collection==='courseEntry' ? typeof ref.containerId!=='string'||!ref.containerId : ref.containerId!==undefined))
            throw Error('记录引用无效。');
        if (!enabled(owners[ref.collection]))
            return { status: 'disabled' };
        try {
            const result = ref.collection === 'courseEntry' ? host.use('courses').inspect(ref) : ref.collection === 'capture' ? host.use('web-captures').inspect(ref.id) : ref.collection === 'journalEntry' ? host.use('journal').inspect(ref.id) : host.use('items').inspect(ref);
            if (result.status === 'found' && (result.record?.id !== ref.id || ref.collection === 'courseEntry' && result.table?.id !== ref.containerId))
                return { status: 'unavailable' };
            return result;
        }
        catch {
            return { status: 'unavailable' };
        }
    };
    return { inspect, open(ref, options = {}) {
            const result = inspect(ref);
            if (result.status !== 'found')
                throw Error(result.status === 'disabled' ? '原功能已关闭。' : result.status === 'missing' ? '原记录已删除。' : result.status === 'hidden' ? '原记录当前不可见。' : '来源服务暂不可用。');
            const command = ref.collection === 'courseEntry' ? 'courses.open' : ref.collection === 'capture' ? 'web-captures.open' : ref.collection === 'journalEntry' ? 'journal.open' : 'items.open';
            return host.run(command, ref, options);
        } };
}
