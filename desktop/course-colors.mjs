// Matches web/src/lib/palette.ts and the verified deployed index-VReTr89L.js.
export const coursePalettes = [
  { name: 'green', label: '绿', bg: '#e3f6e5', text: '#3d9c4e' },
  { name: 'blue', label: '蓝', bg: '#e0edff', text: '#4a7de0' },
  { name: 'yellow', label: '黄', bg: '#fdf6d8', text: '#b8971f' },
  { name: 'red', label: '红', bg: '#fde3e3', text: '#e05a5a' },
  { name: 'purple', label: '紫', bg: '#f1e4fb', text: '#9b59d0' },
  { name: 'orange', label: '橙', bg: '#fdeadb', text: '#e08a3c' },
  { name: 'cyan', label: '青', bg: '#dcf3f6', text: '#3aa6b5' },
];
const seeds = [[/高数|高等数学|数学|线性代数/, 'blue'], [/英语|外语/, 'red'], [/物理/, 'cyan'], [/化学/, 'green'], [/思想|政治|马克思|毛概|近代史|军事/, 'yellow'], [/体育|篮球|足球/, 'orange'], [/计算机|程序|数据结构|算法|软件/, 'purple'], [/电路|电子|信号/, 'blue'], [/实验/, 'green']];
export function paletteForCourse(course) {
  const stored = String(course.color || '').trim().toLowerCase();
  const explicit = coursePalettes.find(p => p.name === stored || p.bg === stored); if (explicit) return explicit;
  const title = String(course.title || ''), seed = seeds.find(([pattern]) => pattern.test(title));
  if (seed) return coursePalettes.find(p => p.name === seed[1]);
  let hash = 0; for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 1_000_003;
  return coursePalettes[hash % coursePalettes.length];
}
