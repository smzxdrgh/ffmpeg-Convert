/* FFMPEG Workbench renderer — 图片转换(8格式质量体系) / 动图工坊 / 媒体互转 / 音频 / 滤镜 / 能力 / 偏好设置 */
const state = { files: [], gifFiles: [], mediaFiles: [], audioFiles: [], meta: new Map(), mediaStatus: new Map(), audioStatus: new Map(), format: 'webp', mediaFormat: 'gif', outputDir: '', running: false, batchRunning: false, mediaRunning: false, audioRunning: false, convertPartial: false, mediaPartial: false, audioPartial: false, activeFile: null, activeJobs: new Map(), nextJobId: 1, coreCount: 1, capData: null, capTab: 'formats', filterFile: '', activeFilter: null, filterOut: 'filtered', savedSettings: null, fmtParams: {}, media: { gif: { colors: 205, dither: 'sierra2_4a', loop: true, fps: 15, width: '' }, webp: { lossless: true, quality: 100, compression_level: 6, loop: true, fps: 15, width: '' }, apng: { fps: 15, width: '' }, video: { vcodec: 'libx264', crf: 26, preset: 'veryslow', fps: '', width: '', height: '', acodec: 'aac', abitrate: '128k' } } };
setTimeout(() => { const selector = $('threads'); if (!selector) return; selector.previousElementSibling.textContent = 'CPU 处理模式'; selector.innerHTML = '<option value="0">自动（使用多核）</option><option value="1">1 核</option><option value="2">2 核</option><option value="4">4 核</option><option value="8">8 核</option><option value="16">16 核</option>'; const custom = document.createElement('input'); custom.id = 'custom-cores'; custom.type = 'number'; custom.min = '2'; custom.max = '256'; custom.value = '2'; custom.placeholder = '自定义并行核心数'; custom.className = 'custom-cores'; selector.insertAdjacentElement('afterend', custom); const readout = document.createElement('small'); readout.id = 'core-readout'; readout.className = 'policy-note acceleration-note'; readout.textContent = '正在检测逻辑核心数…'; custom.insertAdjacentElement('afterend', readout); const update = () => { custom.disabled = selector.value !== 'custom'; }; selector.onchange = update; update(); window.ffmpeg.cpuCount().then((count) => { state.coreCount = count; readout.textContent = `检测到 ${count} 个逻辑核心；自动多核会先并行处理静态图片，再单核处理动图。`; }).catch(() => { readout.textContent = '无法检测核心数，默认使用 1 个并行任务。'; }); }, 0);
const $ = (id) => document.getElementById(id);
const log = (message, error = false) => { $('log').textContent = message; $('log').className = `log${error ? ' error' : ''}`; };
const ext = (file) => file.split(/[\\/]/).pop().split('.').pop().toUpperCase();
const name = (file) => file.split(/[\\/]/).pop();
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
/* ---- 文件格式过滤：每个输入队列可勾选忽略哪些格式（默认全部接收） ---- */
const FILTER_GROUPS = { image: ['webp', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'jxl'], media: ['gif', 'webp', 'apng', 'mp4', 'webm', 'mkv', 'mov', 'avi'], audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus'] };
state.ignored = { image: new Set(), media: new Set(), audio: new Set() };
function renderFilterBars() { Object.keys(FILTER_GROUPS).forEach((kind) => { const bar = $(`${kind}-filter-bar`); if (!bar) return; bar.innerHTML = '<span class="filter-title">忽略格式</span>' + FILTER_GROUPS[kind].map((e) => `<label class="check filter-chip"><input type="checkbox" data-ignore="${kind}" data-ext="${e}"> ${e.toUpperCase()}</label>`).join('') + '<small class="filter-hint">勾选后忽略该格式（默认全部接收）</small>'; }); document.querySelectorAll('[data-ignore]').forEach((cb) => cb.onchange = () => { const kind = cb.dataset.ignore; const e = cb.dataset.ext; cb.checked ? state.ignored[kind].add(e) : state.ignored[kind].delete(e); applyFilterToQueues(kind); }); }
function isIgnored(file, kind) { return state.ignored[kind].has(ext(file).toLowerCase()); }
function filterFiles(files, kind) { const kept = []; const ignored = []; for (const f of files) (isIgnored(f, kind) ? ignored : kept).push(f); return { kept, ignored }; }
function applyFilterToQueues(kind) { if (kind === 'image') { const r = filterFiles(state.files, 'image'); if (r.ignored.length) { state.files = r.kept; state.meta = new Map(); renderFiles(state.files, 'file-list', 'file-count'); log(`已按过滤规则移除 ${r.ignored.length} 个被忽略格式的文件。`); } } else if (kind === 'media') { const r = filterFiles(state.mediaFiles, 'media'); if (r.ignored.length) { state.mediaFiles = r.kept; renderSimpleList(state.mediaFiles, 'media-list', 'media-count'); log(`已按过滤规则移除 ${r.ignored.length} 个被忽略格式的文件。`); } } else if (kind === 'audio') { const r = filterFiles(state.audioFiles, 'audio'); if (r.ignored.length) { state.audioFiles = r.kept; renderSimpleList(state.audioFiles, 'audio-list', 'audio-count'); log(`已按过滤规则移除 ${r.ignored.length} 个被忽略格式的文件。`); } } }
/* ---- 加速面板（注入到图片转换输出区） ---- */
const accelerationPanel = document.createElement('div'); accelerationPanel.className = 'panel acceleration-panel'; accelerationPanel.innerHTML = '<div class="panel-title"><span class="eyebrow">PROCESS ACCELERATION</span><span class="pill">CPU / GPU</span></div><label>CPU 线程</label><select id="threads"><option value="0">自动（使用多核）</option><option value="1">1 核</option><option value="2">2 核</option><option value="4">4 核</option><option value="8">8 核</option><option value="16">16 核</option></select><label>硬件加速</label><select id="hwaccel"><option value="">关闭（兼容性最佳）</option><option value="auto">自动选择可用 GPU</option><option value="cuda">CUDA / NVIDIA</option><option value="d3d11va">D3D11VA / DirectX</option><option value="qsv">Intel Quick Sync</option><option value="dxva2">DXVA2</option></select><small class="policy-note acceleration-note">线程 0 由 FFmpeg 自动使用多核。GPU 主要加速解码与滤镜，图片编码仍取决于具体编码器。</small>'; const destinationPanel = document.querySelector('#view-convert .panel.compact'); destinationPanel.parentNode.insertBefore(accelerationPanel, destinationPanel);
function rational(value) { if (!value || value === '0/0') return 0; const [a, b] = String(value).split('/').map(Number); return b ? a / b : a || 0; }
function processLabel(info) { if (!info || !info.job || info.job === 'pending') return '<span class="process-status pending">待处理</span>'; if (info.job === 'processing') return `<span class="process-status active">处理中 ${Math.round(info.progress || 0)}%</span>`; if (info.job === 'done') return `<span class="process-status success">已输出 · 缩小 ${info.saved}%${info.deleted ? ' · 原文件已删除' : ''}</span>`; if (info.job === 'rejected') return `<span class="process-status rejected">保留原文件 · 输出文件为原文件的 ${info.outputRatio}%</span>`; return '<span class="process-status rejected">处理失败 · 保留原文件</span>'; }
function metadataLabel(file) { const info = state.meta.get(file); if (!info || info.status === 'probing') return '<span class="probe-badge probing">识别中</span>'; if (info.status === 'error') return '<span class="probe-badge error-badge">识别失败</span>'; const type = info.animated ? '动图' : '图片'; const frames = info.frames > 1 ? `${info.frames} 帧` : '单帧'; const fps = info.fps ? `${info.fps.toFixed(2)} fps` : ''; return `<span class="probe-badge ${info.animated ? 'animated' : ''}">${type}</span><small>${info.width || '?'} × ${info.height || '?'} · ${frames}${fps ? ` · ${fps}` : ''}</small>${processLabel(info)}`; }
function updateQueueProgress() { const total = state.files.length; const completed = state.files.filter((file) => ['done', 'rejected', 'error'].includes(state.meta.get(file)?.job)).length; $('progress-count').textContent = `${completed}/${total}`; $('progress-fill').style.width = total ? `${(completed / total) * 100}%` : '0%'; }
function renderFiles(list, target, countId) { const el = $(target); $(countId).textContent = list.length; el.classList.toggle('empty', !list.length); const MAX = 500; const shown = list.slice(0, MAX); const extra = list.length - shown.length; const rows = shown.map((file, index) => `<div class="file-row"><div class="file-type">${esc(ext(file))}</div><div class="file-info"><strong>${esc(name(file))}</strong><small>${esc(file)}</small><div class="probe-line">${metadataLabel(file)}</div></div><button class="remove" data-remove="${target}" data-index="${index}">×</button></div>`).join(''); const overflow = extra > 0 ? `<div class="empty-state" style="padding:10px">… 另有 ${extra} 个文件未逐一显示（最多展示 ${MAX} 行，全部仍会被处理）</div>` : ''; el.innerHTML = list.length ? rows + overflow : '<div class="empty-state">还没有文件<br><small>单次可添加多个文件，自动批量处理</small></div>'; updateQueueProgress(); }
function renderSimpleList(list, target, countId) { const el = $(target); $(countId).textContent = list.length; el.classList.toggle('empty', !list.length); const MAX = 500; const shown = list.slice(0, MAX); const extra = list.length - shown.length; const rows = shown.map((file, index) => `<div class="file-row"><div class="file-type">${esc(ext(file))}</div><div class="file-info"><strong>${esc(name(file))}</strong><small>${esc(file)}</small></div><button class="remove" data-simple-remove="${target}" data-index="${index}">×</button></div>`).join(''); const overflow = extra > 0 ? `<div class="empty-state" style="padding:10px">… 另有 ${extra} 个文件未逐一显示（最多展示 ${MAX} 行，全部仍会被处理）</div>` : ''; el.innerHTML = list.length ? rows + overflow : `<div class="empty-state">还没有文件<br><small>${target === 'media-list' ? '可添加 GIF / WebP 动图 / APNG / MP4 / MKV / WebM / MOV / AVI' : '可添加 MP3 / WAV / FLAC / M4A / OGG 等'}</small></div>`; }
document.addEventListener('click', (event) => { const simple = event.target.closest('[data-simple-remove]'); if (simple) { const key = simple.dataset.simpleRemove === 'media-list' ? 'mediaFiles' : 'audioFiles'; state[key].splice(Number(simple.dataset.index), 1); renderSimpleList(state[key], simple.dataset.simpleRemove, key === 'mediaFiles' ? 'media-count' : 'audio-count'); return; } const button = event.target.closest('[data-remove]'); if (!button) return; const list = button.dataset.remove === 'gif-list' ? 'gifFiles' : 'files'; state[list].splice(Number(button.dataset.index), 1); renderFiles(state.files, 'file-list', 'file-count'); renderFiles(state.gifFiles, 'gif-list', 'gif-count'); });
async function inspect(file) { state.meta.set(file, { status: 'probing', job: 'pending' }); renderFiles(state.files, 'file-list', 'file-count'); const result = await window.ffmpeg.probe(file); if (!result.ok) state.meta.set(file, { status: 'error', job: 'error', error: result.error || result.stderr }); else { try { const data = JSON.parse(result.stdout); const stream = (data.streams || [])[0] || {}; const format = data.format || {}; const frames = Number(stream.nb_frames || stream.nb_read_frames || stream.nb_read_packets || 0); const detectedFps = rational(stream.avg_frame_rate || stream.r_frame_rate); const duration = Number(format.duration || (frames > 0 && detectedFps > 0 ? frames / detectedFps : 0)); const codec = String(stream.codec_name || '').toLowerCase(); const formatName = String(format.format_name || '').toLowerCase(); const webpAnimation = codec === 'webp_anim' || formatName.includes('webp_anim'); const animated = webpAnimation || frames > 1 || (duration > 0.25 && detectedFps > 1); const fps = animated ? detectedFps : 0; state.meta.set(file, { status: 'ready', job: 'pending', animated, frames, duration, fps, width: stream.width, height: stream.height, codec: stream.codec_name, pixFmt: stream.pix_fmt, format: format.format_name }); } catch (error) { state.meta.set(file, { status: 'error', job: 'error', error: error.message }); } } renderFiles(state.files, 'file-list', 'file-count'); }
async function addFiles(files, type = 'image') { const target = type === 'gif' ? 'gifFiles' : 'files'; let list = files; if (type === 'image') { const r = filterFiles(files, 'image'); list = r.kept; if (r.ignored.length) log(`已忽略 ${r.ignored.length} 个被勾选过滤的格式文件。`); } state[target] = [...new Set([...state[target], ...list])]; renderFiles(state.files, 'file-list', 'file-count'); renderFiles(state.gifFiles, 'gif-list', 'gif-count'); if (type === 'image') { for (const file of list) await inspect(file); if (state.files[0]) { $('advanced-source').textContent = state.files[0]; updateCommand(); } } }
/* ---- 导航 ---- */
const pageMeta = { convert: ['图片转换', '任意图片格式互转，统一质量与速度比例尺。'], gif: ['动图工坊', '让一组静态画面，拥有自己的时间线。'], media: ['媒体互转', '动图与视频之间任意互转，统一质量比例尺。'], audio: ['音频转换', '常见音频格式与码率互转。'], filter: ['滤镜工作台', '给媒体加一层滤镜。'], advanced: ['高级命令', '直接调用 FFmpeg 参数，保持完整控制力。'], capabilities: ['能力扫描', '本机引擎已安装能力的可视化索引。'], integrity: ['完整性检查', '检查文件是否损坏，损坏文件可罗列并删除。'], settings: ['偏好设置', '引擎路径与默认配置管理。'], 'folder-batch': ['文件夹批处理', '指定文件夹后分批读取处理，避免数十万文件同时加载导致黑屏。'] };
document.querySelectorAll('.nav').forEach((button) => button.onclick = () => { document.querySelectorAll('.nav').forEach((item) => item.classList.remove('active')); button.classList.add('active'); document.querySelectorAll('.view').forEach((item) => item.classList.remove('active-view')); $('view-' + button.dataset.view).classList.add('active-view'); const meta = pageMeta[button.dataset.view]; $('page-title').textContent = meta[0]; $('page-subtitle').textContent = meta[1]; });
/* ---- 侧边栏收起 / 展开 ---- */
const sidebarToggle = $('sidebar-toggle');
function setSidebarCollapsed(collapsed) { document.body.classList.toggle('sidebar-collapsed', collapsed); if (sidebarToggle) sidebarToggle.innerHTML = collapsed ? '▶' : '◀'; sidebarToggle.title = collapsed ? '展开侧边栏' : '收起侧边栏'; }
if (sidebarToggle) sidebarToggle.onclick = () => { const collapsed = !document.body.classList.contains('sidebar-collapsed'); setSidebarCollapsed(collapsed); window.ffmpeg.saveSettings({ ui: { sidebarCollapsed: collapsed } }); };
/* ---- 图片转换：输入 ---- */
$('add-files').onclick = async () => addFiles(await window.ffmpeg.pickFiles()); $('gif-add').onclick = async () => addFiles(await window.ffmpeg.pickFiles(), 'gif'); $('gif-clear').onclick = () => { state.gifFiles = []; state.meta.clear(); renderFiles([], 'gif-list', 'gif-count'); log('已清空图片序列。'); }; $('gif-folder').onclick = async () => { const directory = await window.ffmpeg.pickDirectory(); if (directory) addFiles(await window.ffmpeg.listImages(directory), 'gif'); }; $('choose-dir').onclick = async () => { const directory = await window.ffmpeg.pickDirectory(); if (directory) { state.outputDir = directory; $('output-dir').textContent = directory; } };
$('filename-mode').onchange = (event) => { $('filename-template').disabled = event.target.value !== 'custom'; if (event.target.value === 'custom') $('filename-template').focus(); };
$('clear-files').onclick = () => { state.files = []; state.meta.clear(); renderFiles([], 'file-list', 'file-count'); };
const droppedPaths = (event) => { const paths = []; const items = event.dataTransfer?.items || []; for (const item of items) { if (item.kind === 'file') { const f = item.getAsFile?.(); if (f && f.path) paths.push(f.path); } } if (!paths.length) paths.push(...Array.from(event.dataTransfer?.files || []).map((file) => file.path).filter(Boolean)); return paths; };
const handleDrop = async (event, type = 'image') => { event.preventDefault(); event.stopPropagation(); const dropEl = type === 'media' ? $('media-list') : type === 'audio' ? $('audio-list') : type === 'gif' ? $('gif-list') : $('dropzone'); if (dropEl) dropEl.classList.remove('over'); const paths = droppedPaths(event); if (!paths.length) return log('没有读取到拖入路径，请从 Windows 资源管理器直接拖入文件或文件夹。', true); const collect = type === 'media' ? 'listMedia' : type === 'audio' ? 'listAudio' : 'listImages'; const files = []; for (const target of paths) { const kind = await window.ffmpeg.pathKind(target); if (kind === 'directory') files.push(...await window.ffmpeg[collect](target)); else if (kind === 'file') files.push(target); } if (type === 'media') { if (!files.length) return log('拖入的文件夹中没有支持的媒体文件。', true); const r = filterFiles(files, 'media'); state.mediaFiles = [...new Set([...state.mediaFiles, ...r.kept])]; renderSimpleList(state.mediaFiles, 'media-list', 'media-count'); return log(`已加入 ${r.kept.length} 个媒体文件${r.ignored.length ? `（忽略 ${r.ignored.length} 个被勾选过滤的格式）` : ''}。`); } if (type === 'audio') { if (!files.length) return log('拖入的文件夹中没有支持的音频文件。', true); const r = filterFiles(files, 'audio'); state.audioFiles = [...new Set([...state.audioFiles, ...r.kept])]; renderSimpleList(state.audioFiles, 'audio-list', 'audio-count'); return log(`已加入 ${r.kept.length} 个音频文件${r.ignored.length ? `（忽略 ${r.ignored.length} 个被勾选过滤的格式）` : ''}。`); } if (!files.length) return log('拖入的文件夹中没有支持的图片文件。', true); await addFiles(files, type); log(`已加入 ${files.length} 个文件，并开始识别类型。`); };
$('dropzone').ondragover = (event) => { event.preventDefault(); event.stopPropagation(); $('dropzone').classList.add('over'); }; $('dropzone').ondragleave = () => $('dropzone').classList.remove('over'); $('dropzone').ondrop = (event) => handleDrop(event, 'image');
$('gif-list').ondragover = (event) => { event.preventDefault(); event.stopPropagation(); $('gif-list').classList.add('over'); }; $('gif-list').ondragleave = () => $('gif-list').classList.remove('over'); $('gif-list').ondrop = (event) => { $('gif-list').classList.remove('over'); handleDrop(event, 'gif'); };
function bindDrop(id, type) { const el = $(id); if (!el) return; el.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); }; el.ondragleave = () => el.classList.remove('over'); el.ondrop = (e) => handleDrop(e, type); }
bindDrop('media-list', 'media'); bindDrop('audio-list', 'audio');
/* ================= 图片转换：8 格式质量体系 =================
   设计语义：图片专有质量参数（CRF / q / 颜色数 / distance / quality）是主控滑块，
   百分比仅作展示：实时显示当前专有参数对应的质量水平，并带 100/75/50/25/0 五档刻度对照。
   master = 专有参数滑块定义；speed = 压缩率/速度；extra = 其他辅助参数。 */
const FORMAT_CONFIG = {
  webp: { label: 'WEBP', desc: '静态用 libwebp，动图自动用 libwebp_anim；支持无损与有损', lossless: true,
    master: { name: '质量（quality）', key: 'quality', min: 0, max: 100, step: 1, display: (v) => `quality=${v}`, percent: (v) => Math.round(v), toParam: (p) => Math.round(p), left: '最低画质', right: '最高画质' },
    speed: { key: 'compression_level', min: 0, max: 6, fast: '更快 / 更大', slow: '更慢 / 更小（最高压缩）' } },
  png: { label: 'PNG', desc: '无损格式，压缩级别只影响速度与体积', lossless: true, alwaysLossless: true,
    master: { name: '压缩级别', key: 'compression_level', min: 0, max: 9, step: 1, display: (v) => `level=${v}`, percent: () => 100, toParam: () => 9, left: '更快 / 更大', right: '更慢 / 更小', fixed: true } },
  jpg: { label: 'JPG', desc: '照片 / 兼容；不支持透明与无损；质量以 q 值控制（2-31）', lossless: false,
    master: { name: '质量（q 值）', key: 'q', min: 2, max: 31, step: 1, display: (v) => `q=${v}`, percent: (v) => Math.round((31 - v) / 29 * 100), toParam: (p) => Math.max(2, Math.min(31, Math.round(31 - p / 100 * 29))), left: '最高画质', right: '最低画质' },
    extra: [{ type: 'select', key: 'subsampling', label: '色彩采样', options: [{ v: 'yuvj420p', t: '4:2:0（默认）' }, { v: 'yuvj422p', t: '4:2:2' }, { v: 'yuvj444p', t: '4:4:4' }] }, { type: 'check', key: 'optimize', label: '优化 Huffman 表' }] },
  avif: { label: 'AVIF', desc: 'libaom-av1；支持无损；有损质量以 CRF 控制（0-63，0 最高）', lossless: true,
    master: { name: 'CRF（有损质量）', key: 'crf', min: 0, max: 63, step: 1, display: (v) => `CRF=${v}`, percent: (v) => Math.round((63 - v) / 63 * 100), toParam: (p) => Math.max(0, Math.min(63, Math.round(63 - p / 100 * 63))), left: '最高画质（CRF 0）', right: '最低画质（CRF 63）', perceptualGuide: { metric: 'LPIPS(alexnet)·8样本·25档密集实测(raw RGB直读)', note: 'CRF≤8 无损级(LPIPS<0.01)；CRF 9-15 视觉无损；CRF 16-26 无损上限(最差LPIPS<0.05，CRF26体积仅18.5%)；CRF 27-36 近无损(体积12-17%)；CRF 37-43 极细微差异(体积8-11%)；CRF≥46 可感知损失；CRF63 明显损失(体积1.5%)。CRF26 为严格视觉无损极限压缩点。', levels: [{ crf: 0, tag: '无损级' }, { crf: 8, tag: '无损上限' }, { crf: 15, tag: '视觉无损' }, { crf: 26, tag: '无损极限' }, { crf: 36, tag: '近无损' }, { crf: 43, tag: '极细微' }, { crf: 63, tag: '明显损失' }] } },
    speed: { key: 'cpu_used', min: 0, max: 8, fast: '更快 / 更大', slow: '更慢 / 更小（最高压缩）', direction: 'slow-fast', hint: 'cpu_used 0=极致压缩（最慢·最小），8=最快·最大；无损下 0 与 8 体积仅差约 3% 但速度差 10 倍以上，有损下 0 压缩率显著更高。默认 0。' } },
  gif: { label: 'GIF', desc: '调色板有损（不支持无损）；质量以颜色数控制（2-256）', lossless: false,
    master: { name: '颜色数', key: 'colors', min: 2, max: 256, step: 1, display: (v) => `${v} 色`, percent: (v) => Math.round((v - 2) / 254 * 100), toParam: (p) => Math.max(2, Math.min(256, Math.round(2 + p / 100 * 254))), left: '最低画质（2 色）', right: '最高画质（256 色）' },
    extra: [{ type: 'select', key: 'dither', label: '抖动算法', options: [{ v: 'sierra2_4a', t: 'sierra2_4a（推荐）' }, { v: 'floyd_steinberg', t: 'floyd_steinberg' }, { v: 'bayer', t: 'bayer' }, { v: 'none', t: 'none（无抖动）' }] }, { type: 'check', key: 'loop', label: '无限循环播放' }] },
  bmp: { label: 'BMP', desc: 'Windows 位图 · 始终无损，无压缩参数', lossless: true, alwaysLossless: true },
  tiff: { label: 'TIFF', desc: '无损格式，可选用不同压缩算法', lossless: true, alwaysLossless: true,
    extra: [{ type: 'select', key: 'compression', label: '压缩算法', options: [{ v: 'deflate', t: 'deflate（最高压缩 · 默认）' }, { v: 'lzw', t: 'lzw（兼容性好）' }, { v: 'packbits', t: 'packbits（快速）' }, { v: 'raw', t: 'raw（无压缩）' }] }] },
  jpegxl: { label: 'JPEG-XL', desc: 'libjxl；支持无损（distance=0）与有损；速度 = effort（1-9，9 最高压缩）', lossless: true,
    master: { name: 'distance（有损质量）', key: 'distance', min: 0, max: 15, step: 0.1, display: (v) => `distance=${v}`, percent: (v) => v === 0 ? 100 : Math.round((15 - v) / 14.9 * 100), toParam: (p) => Number(Math.max(0.1, Math.min(15, 15 - p / 100 * 14.9)).toFixed(1)), left: '最高画质（distance 0）', right: '最低画质（distance 15）' },
    speed: { key: 'effort', min: 1, max: 9, fast: '更快 / 更大', slow: '更慢 / 更小（最高压缩）' } }
};
/* AVIF CRF → LPIPS 感知等级（基于 8 样本实测） */
function avifPerceptualTag(crf) { if (crf <= 8) return '无损级'; if (crf <= 15) return '视觉无损'; if (crf <= 26) return '无损极限'; if (crf <= 36) return '近无损'; if (crf <= 43) return '极细微'; if (crf <= 55) return '可感知'; return '明显损失'; }
/* 专有参数 → 质量百分比（用于纯展示 output 与刻度） */
function masterPercent(format, p) { const c = FORMAT_CONFIG[format]; const m = c.master; if (!m) return 100; if (p.lossless && !c.alwaysLossless) return 100; return m.percent(p[m.key]); }
/* 专有参数当前值（无损模式显示「最高画质端」的固定值） */
function masterValue(format, p) { const c = FORMAT_CONFIG[format]; const m = c.master; if (!m) return null; if (p.lossless && !c.alwaysLossless) { if (format === 'avif' || format === 'jpegxl') return m.min; return m.max; } return p[m.key]; }
/* 五档刻度：100 / 75 / 50 / 25 / 0 各档对应的专有参数值 */
function ticksHtml(format, c) { if (!c.master || c.master.fixed) return ''; return `<div class="quality-ticks">${[100, 75, 50, 25, 0].map((pct) => { const v = c.master.toParam(pct); return `<span><i>${pct}%</i><b>${c.master.display(v)}</b></span>`; }).join('')}</div>`; }
function initFmtParams() { state.fmtParams = { webp: { lossless: true, quality: 100, compression_level: 6 }, png: { compression_level: 9, pixfmt: 'auto' }, jpg: { q: 9, subsampling: 'yuvj420p', progressive: true, optimize: true }, avif: { lossless: true, crf: 32, cpu_used: 0 }, gif: { colors: 205, dither: 'sierra2_4a', loop: true }, bmp: {}, tiff: { compression: 'deflate' }, jpegxl: { lossless: true, distance: 7.55, effort: 9 } }; }
function renderFormatSettings(format) { const c = FORMAT_CONFIG[format]; const p = state.fmtParams[format]; if (!c || !p) return; const lossy = !c.alwaysLossless && !p.lossless; const mv = masterValue(format, p); const percent = masterPercent(format, p); let html = `<div class="settings-heading">${c.label} 编码设置<small>${c.desc}</small></div>`;
  if (c.lossless && !c.alwaysLossless) html += `<label>编码模式</label><div class="mode-row">${['lossless', 'lossy'].map((m) => `<button class="mode-btn ${(m === 'lossless') === !!p.lossless ? 'selected' : ''}" data-fmt-mode="${m}">${m === 'lossless' ? '无损' : '有损'}</button>`).join('')}</div>`;
  else if (c.alwaysLossless) html += `<label>编码模式 <span class="pill">无损</span></label>`;
  if (c.master) { const _pg = c.master.perceptualGuide; const _ptag = (_pg && lossy) ? ` <span class="perceptual-tag">${avifPerceptualTag(mv)}</span>` : ''; html += `<label>图片专有参数：${c.master.name} <output id="fmt-master-output">${c.master.display(mv)}${_ptag}</output></label><input id="fmt-master" type="range" min="${c.master.min}" max="${c.master.max}" step="${c.master.step}" value="${mv}" ${!lossy && !c.alwaysLossless ? 'disabled' : ''}><div class="range-labels"><span>${c.master.left}</span><span>${c.master.right}</span></div>${ticksHtml(format, c)}`; if (_pg && lossy) html += `<div class="perceptual-guide"><div class="pg-title">${_pg.metric}</div><div class="pg-levels">${_pg.levels.map(l => `<span class="pg-level"><i>CRF ${l.crf}</i><b>${l.tag}</b></span>`).join('')}</div><small class="pg-note">${_pg.note}</small></div>`; }
  else html += `<label>图片专有参数 <span class="pill">无（固定无损）</span></label>`;
  html += `<label>对应质量百分比 <output id="fmt-percent-output">${percent}%</output></label><div class="percent-track"><div class="percent-fill" style="width:${percent}%"></div></div><small class="policy-note">${c.master ? `当前 ${c.master.name} = ${c.master.display(mv)} 对应质量 ${percent}%（仅作展示：100% = 最高画质，0% = 最低画质）` : '无损格式 · 质量恒为 100%（仅作展示）'}</small>`;
  if (c.speed) { const _sl = c.speed.direction === 'slow-fast' ? [c.speed.slow, c.speed.fast] : [c.speed.fast, c.speed.slow]; html += `<label>压缩率 / 速度 <output id="fmt-speed-output">${p[c.speed.key]}</output></label><input id="fmt-speed" type="range" min="${c.speed.min}" max="${c.speed.max}" value="${p[c.speed.key]}"><div class="range-labels"><span>${_sl[0]}</span><span>${_sl[1]}</span></div>`; if (c.speed.hint) html += `<small class="speed-hint">${c.speed.hint}</small>`; }
  (c.extra || []).forEach((e) => { if (e.type === 'select') html += `<label>${e.label}</label><select data-fmt-extra="${e.key}">${e.options.map((o) => `<option ${String(p[e.key]) === String(o.v) ? 'selected' : ''} value="${esc(o.v)}">${o.t}</option>`).join('')}</select>`; else if (e.type === 'check') html += `<label class="check"><input type="checkbox" data-fmt-extra="${e.key}" ${p[e.key] ? 'checked' : ''}> ${e.label}</label>`; });
  $('format-settings').innerHTML = html;
  bindFmtEvents(format, c, p);
}
function bindFmtEvents(format, c, p) { const m = $('fmt-master'); const s = $('fmt-speed');
  document.querySelectorAll('[data-fmt-mode]').forEach((btn) => btn.onclick = () => { p.lossless = btn.dataset.fmtMode === 'lossless'; renderFormatSettings(format); });
  if (m) m.oninput = () => { p[c.master.key] = c.master.step >= 1 ? Number(m.value) : Number(Number(m.value).toFixed(1)); renderFormatSettings(format); };
  if (s) s.oninput = () => { p[c.speed.key] = Number(s.value); $('fmt-speed-output').textContent = s.value; };
  document.querySelectorAll('[data-fmt-extra]').forEach((el) => { const key = el.dataset.fmtExtra; if (el.type === 'checkbox') el.onchange = () => { p[key] = el.checked; }; else el.onchange = () => { p[key] = el.value; }; });
}
function showFormatSettings(format) { state.format = format; renderFormatSettings(format); }
document.querySelectorAll('#format-grid button').forEach((button) => button.onclick = () => { document.querySelectorAll('#format-grid button').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); showFormatSettings(button.dataset.format); });
$('size-target').oninput = (event) => { const target = Number(event.target.value); $('size-target-output').textContent = `${target}%`; $('size-limit-label').textContent = `${100 - target}%`; };
function updateCommand() { $('command-preview').textContent = `ffmpeg ${state.files[0] || '[input]'} ${$('custom-args').value} [output]`; } $('custom-args').oninput = updateCommand;
async function run(args, label, metadata = {}) { const jobId = metadata.jobId || `job-${state.nextJobId++}`; state.activeJobs.set(jobId, metadata.file || label); state.running = true; log(label); const result = await window.ffmpeg.run(args, { ...metadata, jobId }); state.activeJobs.delete(jobId); state.running = state.activeJobs.size > 0; log(result.ok ? label + ' 完成。' : (result.error || '处理失败'), !result.ok); return result; }
function outputPath(input, format, index = 0) { const sourceBase = input.replace(/\.[^.\\/]+$/, ''); const base = sourceBase.split(/[\\/]/).pop(); const sourceExtension = (input.match(/\.([^.\\/]+)$/) || [,''])[1].toLowerCase(); const mode = $('filename-mode').value; let targetBase = base; if (mode === 'custom') { const template = $('filename-template').value.trim() || '{name}'; targetBase = template.replaceAll('{name}', base).replaceAll('{index}', String(index + 1).padStart(2, '0')).replace(/[<>:"/\\|?*]/g, '_').trim(); if (state.files.length > 1 && !template.includes('{index}')) targetBase += `_${String(index + 1).padStart(2, '0')}`; } if (!targetBase) targetBase = `${base}_converted`; if (sourceExtension === format.toLowerCase() && mode === 'original') targetBase = `${targetBase}_converted`; const directory = state.outputDir || sourceBase.substring(0, sourceBase.length - base.length); return `${state.outputDir ? `${directory}\\` : directory}${targetBase}.${format}`; }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
async function validateOutput(input, output) { const sourceSize = await window.ffmpeg.fileSize(input); const outputSize = await window.ffmpeg.fileSize(output); if (sourceSize < 0 || outputSize < 0) return { accepted: false, reason: '无法读取转换前后文件大小', sourceSize, outputSize }; const ratio = outputSize / sourceSize; const target = Number($('size-target').value) / 100; const sizeGate = $('size-gate').checked; const tooLarge = outputSize > sourceSize; const belowTarget = ratio <= 1 - target; if (tooLarge || (sizeGate && !belowTarget)) { await window.ffmpeg.deleteFile(output); return { accepted: false, sourceSize, outputSize, ratio, reason: tooLarge ? '输出文件大于原文件' : `未达到缩小 ${$('size-target').value}% 的目标` }; } return { accepted: true, sourceSize, outputSize, ratio }; }
function scaleArgs() { const width = $('width').value.trim(); const height = $('height').value.trim(); if (!width && !height) return []; if ($('keep-ratio').checked && width && height) return ['-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease`]; return ['-vf', `scale=${width || -2}:${height || -2}`]; }
function fmtArgs(format, p, animated) { const out = []; switch (format) {
  case 'webp': out.push('-c:v', animated ? 'libwebp_anim' : 'libwebp'); if (p.lossless) out.push('-lossless', '1', '-q:v', '100'); else out.push('-lossless', '0', '-q:v', String(p.quality)); out.push('-compression_level', String(p.compression_level), '-loop', '0'); break;
  case 'png': out.push('-c:v', 'png', '-compression_level', String(p.compression_level)); if (p.pixfmt && p.pixfmt !== 'auto') out.push('-pix_fmt', p.pixfmt); break;
  case 'jpg': out.push('-c:v', 'mjpeg', '-q:v', String(p.q), '-pix_fmt', p.subsampling || 'yuvj420p'); if (p.optimize) out.push('-huffman', '1'); break;
  case 'avif': out.push('-c:v', 'libaom-av1'); if (p.lossless) out.push('-lossless', '1', '-crf', '0'); else out.push('-crf', String(p.crf)); out.push('-cpu-used', String(p.cpu_used), '-still-picture', animated ? '0' : '1'); break;
  case 'gif': out.push('-filter_complex', `[0:v]split[a][b];[a]palettegen=max_colors=${p.colors}:stats_mode=diff[pal];[b][pal]paletteuse=dither=${p.dither}[v]`, '-map', '[v]', '-loop', p.loop ? '0' : '1'); break;
  case 'bmp': out.push('-c:v', 'bmp'); break;
  case 'tiff': out.push('-c:v', 'tiff', '-compression_algo', p.compression || 'deflate'); break;
  case 'jpegxl': out.push('-c:v', 'libjxl'); if (p.lossless) out.push('-distance', '0'); else out.push('-distance', String(p.distance)); out.push('-effort', String(p.effort)); break;
} return out; }
function imageArgs(input, output, info) { const format = state.format; const animated = Boolean(info && info.animated); const args = ['-y']; const threads = state.currentThreads || '1'; const hwaccel = $('hwaccel')?.value || ''; args.push('-threads', threads); if (hwaccel) args.push('-hwaccel', hwaccel); args.push('-i', input); const staticOnly = !animated || ['jpg', 'png', 'bmp', 'tiff'].includes(format); if (staticOnly) args.push('-frames:v', '1'); const scaling = scaleArgs(); if (scaling.length && format !== 'gif') args.push(...scaling); if (animated && !['jpg', 'png', 'bmp', 'tiff'].includes(format)) args.push('-fps_mode', 'passthrough'); args.push(...fmtArgs(format, state.fmtParams[format] || {}, animated)); args.push(output); return args; }
async function processOne(input, index, threadCount) { if (!state.meta.get(input) || state.meta.get(input).status !== 'ready') await inspect(input); const info = state.meta.get(input); if (info.status === 'error') { info.job = 'error'; renderFiles(state.files, 'file-list', 'file-count'); log(`${name(input)} 无法识别，已跳过。`, true); return; } const mode = info.animated ? '动图' : '图片'; const timing = info.animated ? `，保留原始 ${info.fps ? info.fps.toFixed(2) : '可变'} fps 帧间隔` : ''; const output = outputPath(input, state.format, index); info.job = 'processing'; info.progress = 0; state.currentThreads = String(info.animated ? 1 : threadCount); renderFiles(state.files, 'file-list', 'file-count'); const result = await run(imageArgs(input, output, info), `正在转换 ${name(input)}（${mode}${timing}）`, { duration: info.duration, file: input, jobId: `file-${index}-${Date.now()}` }); if (!result || !result.ok) { info.job = 'error'; renderFiles(state.files, 'file-list', 'file-count'); return; } info.progress = 100; const check = await validateOutput(input, output); if (!check.accepted) { info.job = 'rejected'; info.outputRatio = check.sourceSize > 0 && check.outputSize >= 0 ? ((check.outputSize / check.sourceSize) * 100).toFixed(0) : '?'; renderFiles(state.files, 'file-list', 'file-count'); log(`${name(input)}：${check.reason}（原文件 ${formatBytes(check.sourceSize)}，输出 ${formatBytes(check.outputSize)}，已丢弃输出）`, true); return; } const saved = ((1 - check.ratio) * 100).toFixed(1); info.job = 'done'; info.saved = saved; info.deleted = false; renderFiles(state.files, 'file-list', 'file-count'); if ($('delete-original').checked) { const deleted = await window.ffmpeg.deleteFile(input); if (!deleted.ok) { log(`${name(input)} 已输出并缩小 ${saved}%，但原文件删除失败：${deleted.error}`, true); return; } info.deleted = true; renderFiles(state.files, 'file-list', 'file-count'); log(`${name(input)} 完成：${formatBytes(check.sourceSize)} → ${formatBytes(check.outputSize)}，缩小 ${saved}%，原文件已删除。`); } else log(`${name(input)} 完成：${formatBytes(check.sourceSize)} → ${formatBytes(check.outputSize)}，缩小 ${saved}%。`); }
async function runBatch(_files) { if (state.batchRunning) return log('已有批处理正在运行，请等待当前队列完成。', true); const files = (_files && _files.length) ? _files : [...state.files]; if (!files.length) return log('请先添加图片文件。', true); saveConvertProfile(); state.batchRunning = true; const threadMode = $('threads')?.value || 'single'; const single = threadMode === 'single'; const detected = state.coreCount || 1; const custom = Math.max(1, Number($('custom-cores')?.value || detected)); const parallel = Math.min(detected, threadMode === 'custom' ? custom : detected); const readyInOrder = []; const stillQueue = []; const animationQueue = []; let probeDone = false; let active = 0; let wakeResolve = null; const signal = () => { if (wakeResolve) { const resolve = wakeResolve; wakeResolve = null; resolve(); } }; const waitForSignal = () => new Promise((resolve) => { wakeResolve = resolve; }); const launch = (item) => { active += 1; processOne(item.file, item.index, item.info.animated ? 1 : 1).catch((error) => { item.info.job = 'error'; log(`${name(item.file)} 处理异常：${error.message}`, true); renderFiles(state.files, 'file-list', 'file-count'); }).finally(() => { active -= 1; signal(); }); }; const scheduler = async () => { while (state.batchRunning) { if (single) { if (active === 0 && readyInOrder.length) launch(readyInOrder.shift()); } else { while (active < parallel && stillQueue.length) launch(stillQueue.shift()); if (active === 0 && stillQueue.length === 0 && animationQueue.length) launch(animationQueue.shift()); } if (probeDone && active === 0 && (single ? readyInOrder.length === 0 : stillQueue.length === 0 && animationQueue.length === 0)) return; await waitForSignal(); } }; const schedulerTask = scheduler(); log(`开始增量识别：检测到 ${detected} 个逻辑核心，识别完成前也会持续处理已确认文件。`); for (const [index, file] of files.entries()) { if (!state.meta.get(file) || state.meta.get(file).status !== 'ready') await inspect(file); const info = state.meta.get(file); const item = { file, index, info }; if (single) readyInOrder.push(item); else if (info.animated) animationQueue.push(item); else stillQueue.push(item); signal(); } probeDone = true; log('识别完毕：后续按静态图片优先、多核静态处理、动图单核处理。'); signal(); await schedulerTask; const stopped = !state.batchRunning; state.batchRunning = false; if (stopped) { state.convertPartial = true; setRunPhase('convert', 'paused'); log(`批量处理已停止：已完成 ${state.files.filter((f) => state.meta.get(f)?.job === 'done').length}/${state.files.length}。可点「继续」或「重新开始」。`); } else { state.convertPartial = false; setRunPhase('convert', 'idle'); log(`批量处理完成：${state.files.length}/${state.files.length}`); } }
async function runBatchBatched(_files) { const files = (_files && _files.length) ? _files : [...state.files]; if (!files.length) return log('请先添加图片文件。', true); saveConvertProfile(); state.batchRunning = true; const batchSize = Math.max(1, Math.min(100, Number($('convert-batch-size').value) || 5)); const total = files.length; let done = 0; let stoppedFlag = false; try { for (let i = 0; i < files.length && state.batchRunning; i += batchSize) { const batch = files.slice(i, i + batchSize); for (const [bi, file] of batch.entries()) { await processOne(file, i + bi, 1); done++; } renderFiles(state.files, 'file-list', 'file-count'); log(`分批转换：已完成 ${done}/${total}`); await new Promise((r) => setTimeout(r, 20)); } } finally { state.batchRunning = false; } stoppedFlag = done < total; if (stoppedFlag) { state.convertPartial = true; setRunPhase('convert', 'paused'); log(`分批转换已停止：${done}/${total}。可点「继续」或「重新开始」。`); } else { state.convertPartial = false; setRunPhase('convert', 'idle'); log(`分批转换完成：${done}/${total}`); } }
$('run-convert').onclick = () => { if (state.batchRunning) { if ($('convert-batch').checked) { state.batchRunning = false; state.convertPartial = true; setRunPhase('convert', 'paused'); log('正在停止…当前批结束后停止。'); } else log('已有批处理正在运行，请等待当前队列完成。', true); return; } if (!state.files.length) return log('请先添加图片文件。', true); state.convertPartial = false; if ($('convert-batch').checked) runBatchBatched(); else runBatch(); };
$('resume-convert').onclick = () => { const pending = state.files.filter((f) => { const j = state.meta.get(f)?.job; return !j || !['done', 'rejected', 'error'].includes(j); }); if (!pending.length) { state.convertPartial = false; setRunPhase('convert', 'idle'); return log('没有未完成的文件（全部已处理）。'); } state.convertPartial = false; for (const f of pending) { const m = state.meta.get(f); if (m) m.job = 'pending'; } if ($('convert-batch').checked) runBatchBatched(pending); else runBatch(pending); };
/* ---- 动图工坊 ---- */
$('run-gif').onclick = async () => { if (!state.gifFiles.length) return log('请先添加图片序列。', true); saveConvertProfile(); const directory = state.gifFiles[0].substring(0, Math.max(state.gifFiles[0].lastIndexOf('\\'), state.gifFiles[0].lastIndexOf('/'))); const format = document.querySelector('[data-gif-format].selected')?.dataset.gifFormat || 'gif'; const output = `${directory}\\animation.${format}`; const inputs = state.gifFiles.flatMap((file) => ['-i', file]); const scale = $('gif-width').value ? `,scale=${$('gif-width').value}:-2` : ''; const args = ['-y', ...inputs, '-filter_complex', `concat=n=${state.gifFiles.length}:v=1:a=0${scale}[v]`, '-map', '[v]', '-r', $('fps').value, '-loop', $('loop').checked ? '0' : '1', output]; await run(args, '正在生成图片序列动图'); };
/* ---- 高级命令 ---- */
$('run-advanced').onclick = async () => { if (!state.files[0]) return log('高级命令需要至少一个输入文件。', true); const output = state.files[0].replace(/\.[^.\\/]+$/, '_processed.webm'); await run(['-y', '-i', state.files[0], ...$('custom-args').value.trim().split(/\s+/), output], '正在执行高级命令'); };
/* ================= 媒体互转（动图 / 视频） ================= */
$('media-add').onclick = async () => { const files = await window.ffmpeg.pickFiles(); if (!files.length) return; const r = filterFiles(files, 'media'); state.mediaFiles = [...new Set([...state.mediaFiles, ...r.kept])]; renderSimpleList(state.mediaFiles, 'media-list', 'media-count'); if (r.ignored.length) log(`已忽略 ${r.ignored.length} 个被勾选过滤的格式文件。`); else log(`已加入 ${r.kept.length} 个媒体文件。`); };
$('media-clear').onclick = () => { state.mediaFiles = []; renderSimpleList([], 'media-list', 'media-count'); };
function renderAnimQuality(fmt) { const wrap = $('media-anim-quality-wrap'); const p = state.media[fmt]; if (!wrap || !p) return;
  if (fmt === 'gif') { const pct = Math.round((p.colors - 2) / 254 * 100); wrap.innerHTML = `<label>图片专有参数：颜色数 <output id="media-anim-master-output">${p.colors} 色</output></label><input id="media-anim-master" type="range" min="2" max="256" value="${p.colors}"><div class="range-labels"><span>最低画质（2 色）</span><span>最高画质（256 色）</span></div><div class="quality-ticks">${[100, 75, 50, 25, 0].map((x) => { const c = Math.max(2, Math.round(2 + x / 100 * 254)); return `<span><i>${x}%</i><b>${c} 色</b></span>`; }).join('')}</div><label>对应质量百分比 <output id="media-anim-percent-output">${pct}%</output></label><div class="percent-track"><div class="percent-fill" style="width:${pct}%"></div></div><small class="policy-note">当前颜色数 = ${p.colors} 对应质量 ${pct}%（仅作展示：100% = 最高画质，0% = 最低画质）</small>`; $('media-anim-master').oninput = () => { p.colors = Number($('media-anim-master').value); renderAnimQuality(fmt); }; }
  else if (fmt === 'webp') { const lossless = p.lossless; const pct = lossless ? 100 : Math.round(p.quality); wrap.innerHTML = `<label>编码模式</label><div class="mode-row"><button class="mode-btn ${lossless ? 'selected' : ''}" data-media-mode="lossless">无损</button><button class="mode-btn ${!lossless ? 'selected' : ''}" data-media-mode="lossy">有损</button></div><label>图片专有参数：质量（quality） <output id="media-anim-master-output">${lossless ? 'quality=100' : `quality=${p.quality}`}</output></label><input id="media-anim-master" type="range" min="0" max="100" value="${lossless ? 100 : p.quality}" ${lossless ? 'disabled' : ''}><div class="range-labels"><span>最低画质</span><span>最高画质</span></div><div class="quality-ticks">${[100, 75, 50, 25, 0].map((x) => `<span><i>${x}%</i><b>quality=${x}</b></span>`).join('')}</div><label>对应质量百分比 <output id="media-anim-percent-output">${pct}%</output></label><div class="percent-track"><div class="percent-fill" style="width:${pct}%"></div></div><small class="policy-note">${lossless ? '无损模式 · 质量恒为 100%（仅作展示）' : `当前 quality=${p.quality} 对应质量 ${pct}%（仅作展示）`}</small>`; document.querySelectorAll('[data-media-mode]').forEach((btn) => btn.onclick = () => { p.lossless = btn.dataset.mediaMode === 'lossless'; renderAnimQuality(fmt); }); const m = $('media-anim-master'); if (m) m.oninput = () => { p.quality = Number(m.value); renderAnimQuality(fmt); }; }
  else if (fmt === 'apng') { wrap.innerHTML = `<label>图片专有参数 <span class="pill">无（无损）</span></label><label>对应质量百分比 <output id="media-anim-percent-output">100%</output></label><div class="percent-track"><div class="percent-fill" style="width:100%"></div></div><small class="policy-note">APNG 无损格式 · 质量恒为 100%（仅作展示）</small>`; }
}
function renderMediaAnimExtra() { const fmt = state.mediaFormat; const extra = $('media-anim-extra'); const heading = $('media-anim-heading'); if (fmt === 'gif') { heading.innerHTML = 'GIF 动图输出<small>调色板有损；质量以颜色数控制（2-256）</small>'; extra.innerHTML = '<label>抖动算法</label><select id="media-gif-dither"><option value="sierra2_4a">sierra2_4a（推荐）</option><option value="floyd_steinberg">floyd_steinberg</option><option value="bayer">bayer</option><option value="none">none（无抖动）</option></select>'; const d = $('media-gif-dither'); if (d) d.value = state.media.gif.dither; } else if (fmt === 'webp') { heading.innerHTML = 'WEBP 动图输出<small>支持无损 / 有损；质量以 quality（0-100）控制</small>'; extra.innerHTML = `<label>压缩率 / 速度 <output id="media-webp-method-output">${state.media.webp.compression_level}</output></label><input id="media-webp-method" type="range" min="0" max="6" value="${state.media.webp.compression_level}"><div class="range-labels"><span>更快/更大</span><span>更慢/更小（最高压缩）</span></div>`; const m = $('media-webp-method'); if (m) m.oninput = () => { state.media.webp.compression_level = Number(m.value); $('media-webp-method-output').textContent = m.value; }; } else if (fmt === 'apng') { heading.innerHTML = 'APNG 动图输出<small>无损格式 · 固定最高画质 100%</small>'; extra.innerHTML = ''; } renderAnimQuality(fmt); }
function switchMediaFormat(fmt) { state.mediaFormat = fmt; document.querySelectorAll('#media-format-grid button').forEach((b) => b.classList.toggle('selected', b.dataset.mediaFormat === fmt)); const isAnim = ['gif', 'webp', 'apng'].includes(fmt); $('media-anim-settings').classList.toggle('hidden-setting', !isAnim); $('media-video-settings').classList.toggle('hidden-setting', isAnim); if (isAnim) renderMediaAnimExtra(); else { const vc = $('media-vcodec'); if (fmt === 'webm' && !['libvpx-vp9', 'libsvtav1'].includes(vc.value)) vc.value = 'libvpx-vp9'; if (fmt === 'avi' && vc.value === 'libvpx-vp9') vc.value = 'libx264'; renderVideoCrf(); } }
document.querySelectorAll('#media-format-grid button').forEach((button) => button.onclick = () => switchMediaFormat(button.dataset.mediaFormat));
function renderVideoCrf() { const crf = state.media.video.crf; const pct = Math.round((51 - crf) / 51 * 100); $('media-video-crf').value = crf; $('media-video-crf-output').textContent = `CRF=${crf}`; $('media-video-quality-output').textContent = `${pct}%`; $('media-video-percent-fill').style.width = `${pct}%`; const note = $('media-video-settings .policy-note'); if (note) note.textContent = `当前 CRF=${crf} 对应质量 ${pct}%（仅作展示：100% = 最高画质，0% = 最低画质）`; }
$('media-video-crf').oninput = () => { state.media.video.crf = Number($('media-video-crf').value); renderVideoCrf(); };
$('media-fps').oninput = () => { $('media-fps-output').textContent = $('media-fps').value; state.media[state.mediaFormat].fps = Number($('media-fps').value); };
$('media-width').oninput = () => { state.media[state.mediaFormat].width = $('media-width').value; };
$('media-loop').onchange = () => { if (state.mediaFormat !== 'apng') state.media[state.mediaFormat].loop = $('media-loop').checked; };
$('media-vcodec').onchange = () => { state.media.video.vcodec = $('media-vcodec').value; if (state.mediaFormat === 'webm' && !['libvpx-vp9', 'libsvtav1'].includes($('media-vcodec').value)) { log('WebM 容器只支持 VP9/AV1 视频编码。', true); } };
$('media-preset').onchange = () => { state.media.video.preset = $('media-preset').value; $('media-preset-output').textContent = $('media-preset').value; };
$('media-vfps').oninput = () => { state.media.video.fps = $('media-vfps').value; };
$('media-vwidth').oninput = () => { state.media.video.width = $('media-vwidth').value; };
$('media-vheight').oninput = () => { state.media.video.height = $('media-vheight').value; };
$('media-acodec').onchange = () => { state.media.video.acodec = $('media-acodec').value; };
$('media-abitrate').oninput = () => { state.media.video.abitrate = $('media-abitrate').value; };
async function runMediaInner(_files) {
  const files = (_files && _files.length) ? _files : [...state.mediaFiles];
  if (!files.length) return log('请先添加动图或视频文件。', true);
  saveConvertProfile(); state.mediaRunning = true; setRunPhase('media', 'running');
  const fmt = state.mediaFormat; const isAnim = ['gif', 'webp', 'apng'].includes(fmt);
  const batchEnabled = $('media-batch').checked; const batchSize = Math.max(1, Math.min(100, Number($('media-batch-size').value) || 3));
  let done = 0, failed = 0;
  const convertOne = async (file) => { const out = file.replace(/\.[^.\\/]+$/, '') + `_${fmt}.${fmt}`; let args = ['-y', '-i', file]; try { if (isAnim) { const width = state.media[fmt].width.trim(); const fps = Number(state.media[fmt].fps || 15); let chain = []; if (width) chain.push(`scale=${width}:-2`); chain.push(`fps=${fps}`); if (fmt === 'gif') { const colors = state.media.gif.colors; const dither = $('media-gif-dither')?.value || state.media.gif.dither; args.push('-filter_complex', `]${chain.join(',')},split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[pal];[b][pal]paletteuse=dither=${dither}[v]`, '-map', '[v]', '-loop', state.media.gif.loop ? '0' : '1'); } else if (fmt === 'webp') { args.push('-vf', chain.join(','), '-c:v', 'libwebp_anim'); if (state.media.webp.lossless) args.push('-lossless', '1', '-q:v', '100'); else args.push('-lossless', '0', '-q:v', String(state.media.webp.quality)); args.push('-compression_level', String(state.media.webp.compression_level), '-loop', state.media.webp.loop ? '0' : '1'); } else { args.push('-vf', chain.join(','), '-c:v', 'apng', '-plays', '0', '-f', 'apng'); } } else { const v = state.media.video; args.push('-c:v', v.vcodec, '-crf', String(Math.max(0, v.crf))); if (v.preset) args.push('-preset', v.preset); let vfChain = []; if (v.width || v.height) vfChain.push(`scale=${v.width || -2}:${v.height || -2}`); if (v.fps) vfChain.push(`fps=${v.fps}`); if (vfChain.length) args.push('-vf', vfChain.join(',')); if (v.acodec === 'none') args.push('-an'); else if (fmt === 'webm') args.push('-c:a', 'libopus', '-b:a', v.abitrate || '128k'); else { args.push('-c:a', v.acodec); if (v.abitrate) args.push('-b:a', v.abitrate); } if (fmt === 'mp4') args.push('-movflags', '+faststart'); } args.push(out); const result = await run(args, `正在互转 ${name(file)} → ${fmt}`, {}); if (result.ok) { state.mediaStatus.set(file, 'done'); done += 1; log(`互转完成：${name(file)} → ${name(out)}`); } else { state.mediaStatus.set(file, 'failed'); failed += 1; } } catch (e) { state.mediaStatus.set(file, 'failed'); failed += 1; log(`互转失败：${e.message}`, true); } };
  if (batchEnabled) { for (let i = 0; i < files.length && state.mediaRunning; i += batchSize) { const batch = files.slice(i, i + batchSize); for (const file of batch) await convertOne(file); log(`分批互转：已完成 ${done + failed}/${files.length}`); await new Promise((r) => setTimeout(r, 20)); } } else { for (const file of files) { if (!state.mediaRunning) break; await convertOne(file); } }
  const stopped = !state.mediaRunning; state.mediaRunning = false;
  if (stopped) { state.mediaPartial = true; setRunPhase('media', 'paused'); log(`媒体互转已停止：已完成 ${done}/${files.length}，失败 ${failed}。可点「继续」或「重新开始」。`); } else { state.mediaPartial = false; setRunPhase('media', 'idle'); log(`媒体互转结束：成功 ${done}，失败 ${failed}。`); }
};
$('run-media').onclick = () => { if (state.mediaRunning) { state.mediaRunning = false; state.mediaPartial = true; setRunPhase('media', 'paused'); return log('正在停止…当前批结束后停止。'); } if (!state.mediaFiles.length) return log('请先添加动图或视频文件。', true); state.mediaStatus = new Map(); state.mediaPartial = false; runMediaInner(); };
$('resume-media').onclick = () => { const pending = state.mediaFiles.filter((f) => state.mediaStatus.get(f) !== 'done'); if (!pending.length) { state.mediaPartial = false; setRunPhase('media', 'idle'); return log('没有未完成的文件（全部已互转）。'); } state.mediaPartial = false; runMediaInner(pending); };
/* ---- 音频转换 ---- */
$('audio-add').onclick = async () => { const files = await window.ffmpeg.pickFiles(); if (!files.length) return; const r = filterFiles(files, 'audio'); state.audioFiles = [...new Set([...state.audioFiles, ...r.kept])]; renderSimpleList(state.audioFiles, 'audio-list', 'audio-count'); if (r.ignored.length) log(`已忽略 ${r.ignored.length} 个被勾选过滤的格式文件。`); else log(`已加入 ${r.kept.length} 个音频文件。`); };
$('audio-clear').onclick = () => { state.audioFiles = []; renderSimpleList([], 'audio-list', 'audio-count'); };
$('audio-container').onchange = () => { const map = { mp3: 'libmp3lame', m4a: 'aac', opus: 'libopus', ogg: 'libvorbis', flac: 'flac', wav: 'pcm_s16le' }; const sel = $('audio-acodec'); if (map[$('audio-container').value]) sel.value = map[$('audio-container').value]; };
async function runAudioInner(_files) {
  const files = (_files && _files.length) ? _files : [...state.audioFiles];
  if (!files.length) return log('请先添加音频文件。', true);
  saveConvertProfile(); state.audioRunning = true; setRunPhase('audio', 'running');
  const container = $('audio-container').value; const acodec = $('audio-acodec').value; const bitrate = $('audio-bitrate').value.trim(); const samplerate = $('audio-samplerate').value;
  const extMap = { mp3: 'mp3', m4a: 'm4a', opus: 'opus', ogg: 'ogg', flac: 'flac', wav: 'wav' }; const ext = extMap[container] || 'mp3';
  const batchEnabled = $('audio-batch').checked; const batchSize = Math.max(1, Math.min(100, Number($('audio-batch-size').value) || 3));
  let done = 0, failed = 0;
  const convertOne = async (file) => { const out = file.replace(/\.[^.\\/]+$/, '') + `_${container}.${ext}`; const args = ['-y', '-i', file]; const codecByC = { mp3: 'libmp3lame', m4a: 'aac', opus: 'libopus', ogg: 'libvorbis', flac: 'flac', wav: 'pcm_s16le' }; const eff = codecByC[container] || acodec; args.push('-c:a', eff); if (bitrate && !['flac', 'alac', 'pcm_s16le'].includes(eff)) args.push('-b:a', bitrate); if (samplerate) args.push('-ar', samplerate); if (container === 'm4a') args.push('-movflags', '+faststart'); args.push(out); const result = await run(args, `正在转换 ${name(file)} → ${container}`, {}); if (result.ok) { state.audioStatus.set(file, 'done'); done += 1; log(`音频转换完成：${name(file)} → ${name(out)}`); } else { state.audioStatus.set(file, 'failed'); failed += 1; } };
  if (batchEnabled) { for (let i = 0; i < files.length && state.audioRunning; i += batchSize) { const batch = files.slice(i, i + batchSize); for (const file of batch) await convertOne(file); log(`分批音频转换：已完成 ${done + failed}/${files.length}`); await new Promise((r) => setTimeout(r, 20)); } } else { for (const file of files) { if (!state.audioRunning) break; await convertOne(file); } }
  const stopped = !state.audioRunning; state.audioRunning = false;
  if (stopped) { state.audioPartial = true; setRunPhase('audio', 'paused'); log(`音频转换已停止：已完成 ${done}/${files.length}，失败 ${failed}。可点「继续」或「重新开始」。`); } else { state.audioPartial = false; setRunPhase('audio', 'idle'); log(`音频转换结束：成功 ${done}，失败 ${failed}。`); }
};
$('run-audio').onclick = () => { if (state.audioRunning) { state.audioRunning = false; state.audioPartial = true; setRunPhase('audio', 'paused'); return log('正在停止…当前批结束后停止。'); } if (!state.audioFiles.length) return log('请先添加音频文件。', true); state.audioStatus = new Map(); state.audioPartial = false; runAudioInner(); };
$('resume-audio').onclick = () => { const pending = state.audioFiles.filter((f) => state.audioStatus.get(f) !== 'done'); if (!pending.length) { state.audioPartial = false; setRunPhase('audio', 'idle'); return log('没有未完成的文件（全部已转换）。'); } state.audioPartial = false; runAudioInner(pending); };
/* ---- 滤镜工作台 ---- */
const FILTER_LIBRARY = [
  { name: 'scale', desc: '缩放尺寸', params: [{ k: 'w', v: '640', label: '宽度' }, { k: 'h', v: '-2', label: '高度' }, { k: 'force', v: 'decrease', label: '比例模式', type: 'select', options: ['decrease', 'increase', 'disable'] }], build: (p) => `scale=${p.w}:${p.h}${p.force ? `:force_original_aspect_ratio=${p.force}` : ''}` },
  { name: 'crop', desc: '裁剪区域', params: [{ k: 'w', v: '640', label: '宽度' }, { k: 'h', v: '640', label: '高度' }, { k: 'x', v: '(iw-640)/2', label: 'X 起点' }, { k: 'y', v: '(ih-640)/2', label: 'Y 起点' }], build: (p) => `crop=${p.w}:${p.h}:${p.x}:${p.y}` },
  { name: 'rotate', desc: '旋转角度', params: [{ k: 'angle', v: 'PI/4', label: '角度（弧度，如 PI/4）' }, { k: 'fill', v: 'black', label: '填充颜色' }], build: (p) => `rotate=${p.angle}:fillcolor=${p.fill}` },
  { name: 'hflip', desc: '水平镜像', params: [], build: () => 'hflip' },
  { name: 'vflip', desc: '垂直翻转', params: [], build: () => 'vflip' },
  { name: 'transpose', desc: '90° 转置', params: [{ k: 'dir', v: '1', label: '方向', type: 'select', options: ['0', '1', '2', '3', '4', '5', '6', '7'] }], build: (p) => `transpose=${p.dir}` },
  { name: 'boxblur', desc: '方块模糊', params: [{ k: 'r', v: '10', label: '半径' }, { k: 'p', v: '5', label: '强度' }], build: (p) => `boxblur=${p.r}:${p.p}` },
  { name: 'gblur', desc: '高斯模糊', params: [{ k: 'sigma', v: '8', label: 'Sigma 强度' }], build: (p) => `gblur=sigma=${p.sigma}` },
  { name: 'negate', desc: '反色', params: [], build: () => 'negate' },
  { name: 'hue', desc: '色相偏移', params: [{ k: 'h', v: '90', label: '色相角度' }], build: (p) => `hue=h=${p.h}` },
  { name: 'eq', desc: '亮度 / 对比度 / 饱和度', params: [{ k: 'brightness', v: '0', label: '亮度（-1~1）' }, { k: 'contrast', v: '1.2', label: '对比度' }, { k: 'saturation', v: '1.3', label: '饱和度' }], build: (p) => `eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}` },
  { name: 'vignette', desc: '暗角', params: [{ k: 'angle', v: 'PI/4', label: '角度' }], build: (p) => `vignette=${p.angle}` },
  { name: 'fps', desc: '帧率调整', params: [{ k: 'fps', v: '24', label: '目标帧率' }], build: (p) => `fps=${p.fps}` },
  { name: 'drawtext', desc: '文字叠加', params: [{ k: 'text', v: 'HELLO', label: '文字内容' }, { k: 'fontsize', v: '48', label: '字号' }, { k: 'fontcolor', v: 'white', label: '颜色' }, { k: 'fontfile', v: 'C\\:/Windows/Fonts/msyh.ttc', label: '字体文件（冒号用 \\: 转义）' }], build: (p) => `drawtext=fontfile=${p.fontfile}:text=${p.text}:fontsize=${p.fontsize}:fontcolor=${p.fontcolor}:x=(w-text_w)/2:y=(h-text_h)/2` },
  { name: 'noise', desc: '噪点', params: [{ k: 'alls', v: '15', label: '强度' }], build: (p) => `noise=alls=${p.alls}` },
  { name: 'edgedetect', desc: '边缘检测', params: [{ k: 'low', v: '0.1', label: '低阈值' }, { k: 'high', v: '0.3', label: '高阈值' }], build: (p) => `edgedetect=low=${p.low}:high=${p.high}` }
];
function renderFilterList() { const q = ($('filter-search')?.value || '').trim().toLowerCase(); const list = FILTER_LIBRARY.filter((f) => !q || f.name.includes(q) || f.desc.includes(q)); $('filter-list').innerHTML = list.map((f) => `<div class="filter-item ${state.activeFilter === f.name ? 'selected' : ''}" data-filter="${f.name}"><strong>${f.name}</strong><small>${f.desc}</small></div>`).join('') || '<div class="empty-state">无匹配滤镜</div>'; }
$('filter-search').oninput = renderFilterList;
$('filter-list').onclick = (event) => { const item = event.target.closest('[data-filter]'); if (!item) return; state.activeFilter = item.dataset.filter; renderFilterList(); const f = FILTER_LIBRARY.find((x) => x.name === state.activeFilter); $('filter-name').textContent = f.name; $('filter-config').innerHTML = f.params.length ? f.params.map((p, i) => `<label>${p.label}</label>${p.type === 'select' ? `<select data-fp="${p.k}">${p.options.map((o) => `<option ${o === p.v ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-fp="${p.k}" value="${esc(p.v)}">`}`).join('') : '<p class="muted">此滤镜无需参数</p>'; updateFilterCommand(); };
function currentFilterValues() { const f = FILTER_LIBRARY.find((x) => x.name === state.activeFilter); const values = {}; (f?.params || []).forEach((p) => { const el = document.querySelector(`[data-fp="${p.k}"]`); values[p.k] = el ? el.value : p.v; }); return values; }
function updateFilterCommand() { if (!state.activeFilter || !state.filterFile) { $('filter-command-preview').textContent = '—'; return; } const f = FILTER_LIBRARY.find((x) => x.name === state.activeFilter); const vf = f.build(currentFilterValues()); const isImage = /\.(png|jpe?g|webp|bmp|tiff?|avif|jxl)$/i.test(state.filterFile); $('filter-command-preview').textContent = `-i ${name(state.filterFile)} -vf "${vf}" → ${$('filter-outname').value || 'filtered'}.${isImage ? 'png' : 'mp4'}`; }
$('filter-config').oninput = updateFilterCommand;
$('filter-outname').oninput = () => { state.filterOut = $('filter-outname').value.trim() || 'filtered'; updateFilterCommand(); };
$('filter-add').onclick = async () => { const files = await window.ffmpeg.pickFiles(); if (!files.length) return; state.filterFile = files[0]; $('filter-file-name').textContent = name(state.filterFile); $('filter-file-name').classList.add('valid-pill'); $('filter-clear').onclick = () => { state.filterFile = ''; state.activeFilter = null; $('filter-file-name').textContent = '未选择文件'; $('filter-file-name').classList.remove('valid-pill'); log('已清除所选文件。'); updateFilterCommand(); }; log(`已选择滤镜输入：${name(state.filterFile)}`); updateFilterCommand(); };
$('run-filter').onclick = async () => { if (!state.filterFile) return log('请先选择要处理的媒体文件。', true); if (!state.activeFilter) return log('请先在滤镜库中选择一个滤镜。', true); const f = FILTER_LIBRARY.find((x) => x.name === state.activeFilter); const vf = f.build(currentFilterValues()); const dir = state.filterFile.substring(0, Math.max(state.filterFile.lastIndexOf('\\'), state.filterFile.lastIndexOf('/'))); const isImage = /\.(png|jpe?g|webp|bmp|tiff?|avif|jxl)$/i.test(state.filterFile); const outExt = isImage ? 'png' : 'mp4'; const output = `${dir}\\${state.filterOut}.${outExt}`; const args = isImage ? ['-y', '-i', state.filterFile, '-vf', vf, '-frames:v', '1', '-update', '1', output] : ['-y', '-i', state.filterFile, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', output]; await run(args, `正在应用滤镜 ${f.name}`); };
renderFilterList();
/* ---- 能力扫描 ---- */
function countEntries(text, pattern) { return (text.match(pattern) || []).filter((line) => !line.includes('=')).length; }
$('scan-capabilities').onclick = async () => { log('正在扫描本机 FFmpeg 能力…'); const result = await window.ffmpeg.capabilities(); state.capData = { formats: result.formats || '', codecs: result.codecs || '', filters: result.filters || '', hwaccels: result.hwaccels || '' }; $('format-total').textContent = countEntries(result.formats, /^\s*(?:D|E|DE|\.E)\s+\S+/gm); $('codec-total').textContent = countEntries(result.codecs, /^\s*[D.][E.][A-Z.]{4}\s+\S+/gm); $('filter-total').textContent = countEntries(result.filters, /^\s*[TSC.]{2,3}\s+\S+/gm); renderCapList(); log(`能力扫描完成，已读取 ${result.ffmpeg}。`); };
document.querySelectorAll('.cap-tab').forEach((tab) => tab.onclick = () => { document.querySelectorAll('.cap-tab').forEach((t) => t.classList.remove('active')); tab.classList.add('active'); state.capTab = tab.dataset.cap; renderCapList(); });
$('cap-search').oninput = renderCapList;
function renderCapList() { const pre = $('cap-output'); if (!state.capData) { pre.innerHTML = '点击「重新扫描」读取能力清单…'; return; } const text = state.capData[state.capTab] || ''; const q = ($('cap-search').value || '').trim().toLowerCase(); const lines = text.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, '').replace(/\s+$/, '')); const dataStart = lines.findIndex((l) => /^-{3,}/.test(l)); const body = dataStart >= 0 ? lines.slice(dataStart + 1) : lines.slice(3); const filtered = body.filter((l) => l.trim() && (!q || l.toLowerCase().includes(q))); pre.innerHTML = filtered.map((l) => `<span class="cap-line" data-cap-line>${esc(l)}</span>`).join('\n') || '（无匹配条目）'; }
$('cap-output').addEventListener('click', (event) => { const line = event.target.closest('[data-cap-line]'); if (!line) return; const m = line.textContent.trim().match(/([A-Za-z0-9_]+)/); if (!m) return; const token = m[1]; navigator.clipboard?.writeText(token).catch(() => {}); log(`已复制：${token}`); });
/* ---- 完整性检查 ---- */
const integrity = { files: [], mode: 'quick', checking: false, hasPartial: false, results: new Map() };

/* ---- 开始 / 停止 / 继续 三态按钮 ---- */
const RUN_IDS = { convert: 'run-convert', media: 'run-media', audio: 'run-audio', integrity: 'integrity-run' };
const RESUME_IDS = { convert: 'resume-convert', media: 'resume-media', audio: 'resume-audio', integrity: 'resume-integrity' };
const RUN_LABELS = { convert: ['开始批量转换', '停止', '重新开始'], media: ['开始互转', '停止', '重新开始'], audio: ['开始转换', '停止', '重新开始'], integrity: ['开始检查', '停止', '重新开始'] };
function setRunPhase(prefix, phase) {
  const run = $(RUN_IDS[prefix]);
  if (!run) return;
  const resume = $(RESUME_IDS[prefix]);
  if (phase === 'running') { run.innerHTML = RUN_LABELS[prefix][1] + ' <span>■</span>'; if (resume) resume.style.display = 'none'; }
  else if (phase === 'paused') { run.innerHTML = RUN_LABELS[prefix][2] + ' <span>↻</span>'; if (resume) resume.style.display = ''; }
  else { run.innerHTML = RUN_LABELS[prefix][0] + ' <span>→</span>'; if (resume) resume.style.display = 'none'; }
}
function completedCount(files, map, doneKey) {
  let n = 0;
  for (const f of files) { const v = map.get(f); if (v === doneKey || (v && v.status === doneKey)) n++; }
  return n;
}
function renderIntegrityList() { const list = $('integrity-list'); $('integrity-count').textContent = `${integrity.files.length} 个文件`; list.classList.toggle('empty', !integrity.files.length); const MAX = 1000; const shown = integrity.files.slice(0, MAX); const extra = integrity.files.length - shown.length; const rows = shown.map((file, index) => { const r = integrity.results.get(file); let badge = '<span class="probe-badge">待检查</span>'; if (r === 'checking') badge = '<span class="probe-badge animated">检查中…</span>'; else if (r === 'ok') badge = '<span class="probe-badge" style="background:#173a21;color:#7ae08a">正常</span>'; else if (r && r.status === 'damaged') badge = `<span class="probe-badge error-badge">损坏</span><small>${esc(r.error || '')}</small>`; return `<div class="file-row"><div class="file-type">${esc(ext(file))}</div><div class="file-info"><strong>${esc(name(file))}</strong><small>${esc(file)}</small><div class="probe-line">${badge}</div></div><button class="remove" data-integrity-del="${index}">×</button></div>`; }).join(''); const overflow = extra > 0 ? `<div class="empty-state" style="padding:10px">… 另有 ${extra} 个文件未逐一显示（列表最多展示 ${MAX} 行，全部文件仍会被检查，损坏文件会在右侧面板完整罗列）</div>` : ''; list.innerHTML = integrity.files.length ? rows + overflow : '<div class="empty-state">还没有文件<br><small>添加要检查的文件或文件夹，可拖入</small></div>'; renderIntegrityDamaged(); }
function renderIntegrityDamaged() { const allDamaged = integrity.files.filter((f) => integrity.results.get(f)?.status === 'damaged'); const el = $('integrity-damaged'); $('integrity-damaged-count').textContent = `${allDamaged.length} 损坏`; el.classList.toggle('empty', !allDamaged.length); const MAX = 2000; const damaged = allDamaged.slice(0, MAX); const extra = allDamaged.length - damaged.length; const rows = damaged.map((file) => { const r = integrity.results.get(file); return `<div class="file-row"><div class="file-type">${esc(ext(file))}</div><div class="file-info"><strong>${esc(name(file))}</strong><small>${esc(file)}</small><div class="probe-line"><span class="probe-badge error-badge">损坏</span><small>${esc(r.error || '')}</small></div></div><div class="file-row-actions"><button class="repair-btn" data-integrity-repair="${esc(file)}" title="在原文件旁生成修复副本，不自动改动原文件">修复</button><button class="remove" data-integrity-del-damaged="${esc(file)}">×</button></div></div>`; }).join(''); const overflow = extra > 0 ? `<div class="empty-state" style="padding:10px">… 另有 ${extra} 个损坏文件未显示，可先删除已列出的文件后再查看</div>` : ''; el.innerHTML = allDamaged.length ? rows + overflow : '<div class="empty-state">暂无损坏文件<br><small>检查完成后损坏文件会罗列在这里</small></div>'; }
document.addEventListener('click', (event) => { const del = event.target.closest('[data-integrity-del]'); if (del) { integrity.files.splice(Number(del.dataset.integrityDel), 1); integrity.results.clear(); renderIntegrityList(); return; } const delD = event.target.closest('[data-integrity-del-damaged]'); if (delD) deleteIntegrityFile(delD.dataset.integrityDelDamaged); const rp = event.target.closest('[data-integrity-repair]'); if (rp) repairIntegrityFile(rp); });
let repairPending = { file: '', ts: 0 };
async function repairIntegrityFile(btn) { const file = btn.dataset.integrityRepair; if (btn.dataset.state !== 'confirm') { btn.dataset.state = 'confirm'; btn.textContent = '再次点击确认修复'; btn.classList.add('confirming'); repairPending = { file, ts: Date.now() }; log('「修复」会在原文件旁生成修复副本，绝不自动改动原文件；再次点击确认后开始。'); setTimeout(() => { if (repairPending.file === file && Date.now() - repairPending.ts > 6000) { btn.dataset.state = ''; btn.textContent = '修复'; btn.classList.remove('confirming'); } }, 6500); return; } if (repairPending.file !== file) return; btn.dataset.state = 'busy'; btn.textContent = '修复中…'; btn.disabled = true; btn.classList.remove('confirming'); const result = await window.ffmpeg.repairFile({ file }); btn.disabled = false; if (result.ok) { const stageNote = result.stage === 'remux' ? '（重封装修复）' : '（重编码修复）'; btn.textContent = '已修复'; btn.classList.add('repaired'); btn.dataset.state = ''; log(`修复成功${stageNote}：已生成副本 ${name(result.repaired)}。原文件未改动，请打开副本核对无误后自行决定是否替换原文件。`); } else { btn.textContent = '修复'; btn.classList.remove('confirming'); btn.dataset.state = ''; log(`修复失败：${name(file)}（${result.error}）`, true); } }
async function deleteIntegrityFile(file) { const result = await window.ffmpeg.deleteFile(file); if (!result.ok) { log(`删除失败：${name(file)}（${result.error}）`, true); return; } integrity.files = integrity.files.filter((f) => f !== file); integrity.results.delete(file); renderIntegrityList(); log(`已删除：${name(file)}`); }
$('integrity-add').onclick = async () => { const paths = await window.ffmpeg.pickAny(); if (!paths.length) return; for (const p of paths) { const kind = await window.ffmpeg.pathKind(p); if (kind === 'directory') integrity.files = integrity.files.concat(await window.ffmpeg.listAllFiles(p)); else if (kind === 'file') integrity.files.push(p); } integrity.files = [...new Set(integrity.files)]; renderIntegrityList(); log(`已加入 ${integrity.files.length} 个文件（文件夹会递归扫描）。`); };
$('integrity-clear').onclick = () => { integrity.files = []; integrity.results.clear(); renderIntegrityList(); };
$('integrity-mode-quick').onclick = () => { integrity.mode = 'quick'; $('integrity-mode-quick').classList.add('selected'); $('integrity-mode-full').classList.remove('selected'); };
$('integrity-mode-full').onclick = () => { integrity.mode = 'full'; $('integrity-mode-full').classList.add('selected'); $('integrity-mode-quick').classList.remove('selected'); };
$('integrity-delete-all').onclick = async () => { const damaged = integrity.files.filter((f) => integrity.results.get(f)?.status === 'damaged'); if (!damaged.length) return log('当前没有损坏文件。'); let ok = 0, fail = 0; for (const f of damaged) { const r = await window.ffmpeg.deleteFile(f); r.ok ? ok++ : fail++; } integrity.files = integrity.files.filter((f) => integrity.results.get(f)?.status !== 'damaged'); integrity.results.clear(); renderIntegrityList(); log(`已删除 ${ok} 个损坏文件${fail ? `，${fail} 个失败` : ''}。`); };
const runIntegrity = async (resume = false) => {
  if (integrity.checking) { integrity.checking = false; integrity.hasPartial = true; setRunPhase('integrity', 'paused'); return log('正在停止…当前批结束后停止。'); }
  if (!integrity.files.length) return log('请先添加要检查的文件。', true);
  let files;
  if (resume) {
    files = integrity.files.filter((f) => !integrity.results.has(f) || integrity.results.get(f) === 'checking');
    if (!files.length) { integrity.hasPartial = false; setRunPhase('integrity', 'idle'); return log('没有未完成的文件（全部已检查）。'); }
  } else { files = [...integrity.files]; }
  integrity.checking = true; setRunPhase('integrity', 'running');
  const batchEnabled = $('integrity-batch').checked; const batchSize = Math.max(1, Math.min(100, Number($('integrity-batch-size').value) || 5));
  let damaged = 0, done = 0;
  const checkOne = async (file) => { integrity.results.set(file, 'checking'); const result = await window.ffmpeg.checkIntegrity({ file, mode: integrity.mode }); integrity.results.set(file, result.ok ? 'ok' : result); if (!result.ok) damaged++; };
  if (batchEnabled) { for (let i = 0; i < files.length && integrity.checking; i += batchSize) { const batch = files.slice(i, i + batchSize); for (const file of batch) await checkOne(file); done += batch.length; $('integrity-count').textContent = `${integrity.files.length} 个文件`; renderIntegrityDamaged(); log(`分批检查：已完成 ${done}/${files.length}（${damaged} 损坏）`); await new Promise((r) => setTimeout(r, 20)); } } else { for (const file of files) { if (!integrity.checking) break; integrity.results.set(file, 'checking'); renderIntegrityList(); await checkOne(file); renderIntegrityList(); } }
  const stopped = !integrity.checking; integrity.checking = false;
  const checked = integrity.files.filter((f) => integrity.results.get(f) === 'ok' || integrity.results.get(f)?.status === 'damaged').length;
  const allDamaged = integrity.files.filter((f) => integrity.results.get(f)?.status === 'damaged').length;
  renderIntegrityList();
  if (stopped) { integrity.hasPartial = true; setRunPhase('integrity', 'paused'); log(`检查已停止：已完成 ${checked}/${integrity.files.length}，${allDamaged} 损坏。可点「继续」从断点接着检查，或点「重新开始」从头检查。`); }
  else { integrity.hasPartial = false; setRunPhase('integrity', 'idle'); log(`检查完成：${integrity.files.length - allDamaged} 个正常，${allDamaged} 个损坏。${allDamaged ? '可查看右侧损坏列表并删除。' : ''}`); }
};
$('integrity-run').onclick = () => runIntegrity(false);
$('resume-integrity').onclick = () => runIntegrity(true);
const integrityDrop = $('integrity-list'); integrityDrop.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); integrityDrop.classList.add('over'); }; integrityDrop.ondragleave = () => integrityDrop.classList.remove('over'); integrityDrop.ondrop = async (e) => { e.preventDefault(); e.stopPropagation(); integrityDrop.classList.remove('over'); const paths = droppedPaths(e); for (const p of paths) { const kind = await window.ffmpeg.pathKind(p); if (kind === 'directory') integrity.files = integrity.files.concat(await window.ffmpeg.listAllFiles(p)); else if (kind === 'file') integrity.files.push(p); } integrity.files = [...new Set(integrity.files)]; renderIntegrityList(); log(`已加入 ${integrity.files.length} 个文件。`); };
renderFilterBars();

/* ---- 文件夹流式批处理（流式枚举，不预先扫描全部） ---- */
const folderBatch = { folders: [], batchSize: 100, recursive: true, ignored: new Set(), streaming: false, done: false, totalScanned: 0, batchCount: 0, currentBatch: [] };
const FB_FORMATS = [...new Set([...FILTER_GROUPS.image, ...FILTER_GROUPS.media, ...FILTER_GROUPS.audio])];
function fbLog(text) { const el = $('fb-log'); if (el) el.textContent = text; log(text); }
function renderFbFolderList() {
  const el = $('fb-folder-list'); if (!el) return;
  setOut('fb-folder-count', folderBatch.folders.length + ' 个文件夹');
  el.classList.toggle('empty', !folderBatch.folders.length);
  if (!folderBatch.folders.length) { el.innerHTML = '<div class="empty-state">还没有添加文件夹<br><small>可拖入多个文件夹，或点浏览逐个添加</small></div>'; return; }
  el.innerHTML = folderBatch.folders.map((f, i) => '<div class="fb-folder-item"><div class="file-info"><strong>' + esc(name(f)) + '</strong><small>' + esc(f) + '</small></div><button class="remove" data-fb-folder-del="' + i + '">×</button></div>').join('');
}
function renderFbFilterBar() {
  const bar = $('fb-filter-bar'); if (!bar) return;
  bar.innerHTML = '<span class="filter-title">忽略格式</span>' + FB_FORMATS.map((e) => '<label class="check filter-chip"><input type="checkbox" data-fb-ignore="' + e + '"> ' + e.toUpperCase() + '</label>').join('') + '<small class="filter-hint">勾选后忽略该格式（默认全部接收）</small>';
  document.querySelectorAll('[data-fb-ignore]').forEach((cb) => cb.onchange = () => { cb.checked ? folderBatch.ignored.add(cb.dataset.fbIgnore) : folderBatch.ignored.delete(cb.dataset.fbIgnore); });
}
function updateFbUI() {
  setOut('fb-scanned', String(folderBatch.totalScanned));
  setOut('fb-batch-count', String(folderBatch.batchCount));
  setOut('fb-status', folderBatch.done ? '已完成' : (folderBatch.streaming ? '枚举中' : '空闲'));
  setOut('fb-batch-size-display', String(folderBatch.batchSize));
  const startBtn = $('fb-start-stream');
  const resetBtn = $('fb-reset-stream');
  const fetchBtn = $('fb-fetch-batch');
  if (startBtn) { startBtn.textContent = folderBatch.streaming ? '重新启动' : '启动流式枚举'; startBtn.disabled = folderBatch.done; }
  if (resetBtn) resetBtn.disabled = !folderBatch.streaming;
  if (fetchBtn) fetchBtn.disabled = !folderBatch.streaming || folderBatch.done;
  // 批次预览
  const pv = $('fb-batch-preview'); if (pv) {
    const batch = folderBatch.currentBatch;
    setOut('fb-preview-count', batch.length + ' 个');
    pv.classList.toggle('empty', !batch.length);
    if (!batch.length) { pv.innerHTML = '<div class="empty-state">启动流式枚举后显示当前批次文件预览<br><small>最多显示 50 行</small></div>'; }
    else {
      const shown = batch.slice(0, 50);
      const extra = batch.length - shown.length;
      pv.innerHTML = shown.map((f) => '<div class="file-row"><div class="file-type">' + esc(ext(f)) + '</div><div class="file-info"><strong>' + esc(name(f)) + '</strong><small>' + esc(f) + '</small></div></div>').join('') + (extra > 0 ? '<div class="empty-state" style="padding:8px">… 另有 ' + extra + ' 个文件未显示</div>' : '');
    }
  }
}
async function startFbStream() {
  if (!folderBatch.folders.length) return fbLog('请先添加文件夹。');
  await window.ffmpeg.streamReset();
  await window.ffmpeg.streamStart({ folders: folderBatch.folders, recursive: folderBatch.recursive, ignoreExts: [...folderBatch.ignored] });
  folderBatch.streaming = true;
  folderBatch.done = false;
  folderBatch.totalScanned = 0;
  folderBatch.batchCount = 0;
  folderBatch.currentBatch = [];
  fbLog('流式枚举已启动，共 ' + folderBatch.folders.length + ' 个文件夹。点「获取下一批预览」或在功能视图点导入。');
  updateFbUI();
}
function resetFbStream() {
  window.ffmpeg.streamReset();
  folderBatch.streaming = false;
  folderBatch.done = false;
  folderBatch.totalScanned = 0;
  folderBatch.batchCount = 0;
  folderBatch.currentBatch = [];
  fbLog('已重置流式枚举，下次启动从头开始。');
  updateFbUI();
}
async function fetchFbBatch(forPreview) {
  if (!folderBatch.streaming) { await startFbStream(); }
  if (folderBatch.done) { fbLog('已枚举完全部文件，没有更多批次。'); return []; }
  const result = await window.ffmpeg.streamNext(folderBatch.batchSize);
  if (!result.ok) { fbLog('获取批次失败：' + result.error); return []; }
  folderBatch.currentBatch = result.files;
  folderBatch.totalScanned = result.totalScanned;
  folderBatch.batchCount++;
  folderBatch.done = result.done;
  if (!result.files.length) { fbLog('本批没有获取到文件' + (result.done ? '，已枚举完全部文件。' : '。')); updateFbUI(); return []; }
  if (forPreview) fbLog('已获取第 ' + folderBatch.batchCount + ' 批：' + result.files.length + ' 个文件（累计已扫描 ' + result.totalScanned + '）' + (result.done ? '，这是最后一批。' : ''));
  updateFbUI();
  return result.files;
}
async function importFbToFeature(feature) {
  const batch = await fetchFbBatch(false);
  if (!batch.length) return;
  const labels = { convert: '图片转换', media: '媒体互转', audio: '音频转换', integrity: '完整性检查' };
  if (feature === 'convert') { state.files = [...batch]; state.meta = new Map(); renderFiles(state.files, 'file-list', 'file-count'); }
  else if (feature === 'media') { state.mediaFiles = [...batch]; renderSimpleList(state.mediaFiles, 'media-list', 'media-count'); }
  else if (feature === 'audio') { state.audioFiles = [...batch]; renderSimpleList(state.audioFiles, 'audio-list', 'audio-count'); }
  else if (feature === 'integrity') { integrity.files = [...batch]; integrity.results = new Map(); renderIntegrityList(); }
  log('已从文件夹批处理导入 ' + batch.length + ' 个文件到' + labels[feature] + '（第 ' + folderBatch.batchCount + ' 批，累计已扫描 ' + folderBatch.totalScanned + '）。');
  fbLog('已导入 ' + batch.length + ' 个文件到' + labels[feature] + '。下次导入自动获取下一批。');
}
// 事件绑定
$('fb-choose-folder').onclick = async () => {
  const paths = await window.ffmpeg.pickAny();
  if (!paths.length) return;
  let added = 0;
  for (const p of paths) {
    const kind = await window.ffmpeg.pathKind(p);
    if (kind === 'directory' && !folderBatch.folders.includes(p)) { folderBatch.folders.push(p); added++; }
  }
  if (added) { renderFbFolderList(); fbLog('已添加 ' + added + ' 个文件夹。'); }
  else fbLog('选择的内容中没有新的文件夹。');
};
$('fb-recursive').onchange = (e) => { folderBatch.recursive = e.target.checked; };
$('fb-batch-size').onchange = (e) => { folderBatch.batchSize = Number(e.target.value); updateFbUI(); };
$('fb-start-stream').onclick = () => startFbStream();
$('fb-reset-stream').onclick = () => resetFbStream();
$('fb-fetch-batch').onclick = () => fetchFbBatch(true);
// 各功能导入按钮
const importBtns = { convert: 'import-fb-convert', media: 'import-fb-media', audio: 'import-fb-audio', integrity: 'import-fb-integrity' };
Object.keys(importBtns).forEach((feat) => { const btn = $(importBtns[feat]); if (btn) btn.onclick = () => importFbToFeature(feat); });
/* ---- 持续自动导入处理：自动循环 获取批次→注入→处理→等待→下一批 ---- */
const autoImport = { running: false, feature: null, stopRequested: false };
function isFeatureRunning(feature) { if (feature === 'convert') return state.batchRunning; if (feature === 'media') return state.mediaRunning; if (feature === 'audio') return state.audioRunning; if (feature === 'integrity') return integrity.checking; return false; }
function startFeatureProcessing(feature) {
  if (feature === 'convert') { state.batchRunning = false; state.convertPartial = false; if ($('convert-batch').checked) runBatchBatched(); else runBatch(); }
  else if (feature === 'media') { state.mediaRunning = false; state.mediaPartial = false; state.mediaStatus = new Map(); runMediaInner(); }
  else if (feature === 'audio') { state.audioRunning = false; state.audioPartial = false; state.audioStatus = new Map(); runAudioInner(); }
  else if (feature === 'integrity') { integrity.checking = false; integrity.hasPartial = false; integrity.results = new Map(); runIntegrity(false); }
}
function stopFeatureProcessing(feature) { if (feature === 'convert') state.batchRunning = false; else if (feature === 'media') state.mediaRunning = false; else if (feature === 'audio') state.audioRunning = false; else if (feature === 'integrity') integrity.checking = false; }
function waitForFeatureComplete(feature) { return new Promise((resolve) => { const check = () => { if (!isFeatureRunning(feature) || autoImport.stopRequested) resolve(); else setTimeout(check, 500); }; check(); }); }
function updateAutoImportButtons(feature, running) {
  const startBtn = $('auto-import-' + feature);
  const stopBtn = $('auto-import-stop-' + feature);
  if (startBtn) { startBtn.disabled = running; startBtn.textContent = running ? '自动导入中…' : '持续自动导入处理'; }
  if (stopBtn) stopBtn.style.display = running ? '' : 'none';
}
async function startAutoImport(feature) {
  if (autoImport.running) return log('已有持续自动导入处理正在运行，请先停止。', true);
  if (!folderBatch.folders.length) return log('请先在「文件夹批处理」中添加文件夹。', true);
  autoImport.running = true; autoImport.feature = feature; autoImport.stopRequested = false;
  const labels = { convert: '图片转换', media: '媒体互转', audio: '音频转换', integrity: '完整性检查' };
  updateAutoImportButtons(feature, true);
  log('持续自动导入处理已启动：' + labels[feature] + '，每批 ' + folderBatch.batchSize + ' 个文件。');
  let batchNum = 0;
  while (!autoImport.stopRequested) {
    batchNum++;
    const batch = await fetchFbBatch(false);
    if (!batch.length) { log('持续自动导入处理完成：共处理 ' + (batchNum - 1) + ' 批，全部文件已处理完毕。'); break; }
    log('持续自动导入：第 ' + batchNum + ' 批，' + batch.length + ' 个文件。');
    if (feature === 'convert') { state.files = [...batch]; state.meta = new Map(); renderFiles(state.files, 'file-list', 'file-count'); }
    else if (feature === 'media') { state.mediaFiles = [...batch]; renderSimpleList(state.mediaFiles, 'media-list', 'media-count'); }
    else if (feature === 'audio') { state.audioFiles = [...batch]; renderSimpleList(state.audioFiles, 'audio-list', 'audio-count'); }
    else if (feature === 'integrity') { integrity.files = [...batch]; integrity.results = new Map(); renderIntegrityList(); }
    startFeatureProcessing(feature);
    await waitForFeatureComplete(feature);
    if (autoImport.stopRequested) { log('持续自动导入处理已停止：共处理 ' + batchNum + ' 批。'); break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  autoImport.running = false;
  updateAutoImportButtons(feature, false);
}
function stopAutoImport(feature) { autoImport.stopRequested = true; stopFeatureProcessing(feature); log('正在停止持续自动导入处理…当前批结束后停止。'); }
const autoImportBtns = { convert: 'auto-import-convert', media: 'auto-import-media', audio: 'auto-import-audio', integrity: 'auto-import-integrity' };
const autoImportStopBtns = { convert: 'auto-import-stop-convert', media: 'auto-import-stop-media', audio: 'auto-import-stop-audio', integrity: 'auto-import-stop-integrity' };
Object.keys(autoImportBtns).forEach((feat) => {
  const btn = $(autoImportBtns[feat]); if (btn) btn.onclick = () => startAutoImport(feat);
  const stopBtn = $(autoImportStopBtns[feat]); if (stopBtn) stopBtn.onclick = () => stopAutoImport(feat);
});
// 文件夹列表删除
document.addEventListener('click', (event) => { const del = event.target.closest('[data-fb-folder-del]'); if (del) { folderBatch.folders.splice(Number(del.dataset.fbFolderDel), 1); renderFbFolderList(); } });
// 初始化
renderFbFilterBar();
renderFbFolderList();
updateFbUI();
// 拖放：支持多个文件夹
const fbDrop = $('view-folder-batch');
if (fbDrop) {
  fbDrop.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); };
  fbDrop.ondragleave = () => {};
  fbDrop.ondrop = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const paths = droppedPaths(e);
    if (!paths.length) return fbLog('没有读取到拖入路径，请从 Windows 资源管理器直接拖入文件夹。');
    let added = 0, skipped = 0;
    for (const p of paths) {
      const kind = await window.ffmpeg.pathKind(p);
      if (kind === 'directory') {
        if (!folderBatch.folders.includes(p)) { folderBatch.folders.push(p); added++; }
        else skipped++;
      } else skipped++;
    }
    renderFbFolderList();
    if (added) fbLog('已拖入 ' + added + ' 个文件夹' + (skipped ? '（跳过 ' + skipped + ' 个非文件夹或重复项）' : '') + '。');
    else fbLog('拖入的内容中没有新的文件夹（共 ' + paths.length + ' 项，全部跳过）。');
  };
}

/* ---- 偏好设置：引擎路径 ---- */
function fillPathSelect(history, current) { const sel = $('settings-path-select'); sel.innerHTML = '<option value="">（从历史中选择路径）</option>' + (history || []).map((p) => `<option value="${esc(p)}" ${p === current ? 'selected' : ''}>${esc(p)}</option>`).join(''); }
$('settings-path-select').onchange = (event) => { if (event.target.value) $('settings-path-input').value = event.target.value; };
$('settings-choose-ffmpeg').onclick = async () => { const candidate = await window.ffmpeg.pickFfmpeg(); if (candidate) { $('settings-path-input').value = candidate; log(`已选择：${candidate}`); } };
$('settings-validate-ffmpeg').onclick = async () => { const candidate = $('settings-path-input').value.trim(); if (!candidate) return log('请先选择或输入 ffmpeg.exe 路径。', true); $('settings-engine-validation').textContent = '检测中'; const result = await window.ffmpeg.setFfmpegPath(candidate); if (!result.ok) { $('settings-engine-validation').textContent = '无效'; log(result.error || 'FFmpeg 检测失败。', true); return; } $('settings-engine-validation').textContent = '有效'; $('settings-engine-validation').classList.add('valid-pill'); fillPathSelect(result.history, result.ffmpeg); $('engine-path').textContent = result.ffmpeg; $('engine-status').textContent = 'FFmpeg 引擎在线'; $('engine-status').previousElementSibling.classList.add('ok'); log(`已切换 FFmpeg：${result.version}`); };
$('settings-clear-ffmpeg').onclick = async () => { $('settings-path-input').value = ''; $('settings-engine-validation').textContent = '未检测'; $('settings-engine-validation').classList.remove('valid-pill'); };
$('settings-save-now').onclick = async () => { const candidate = $('settings-path-input').value.trim(); if (!candidate) return log('当前没有可保存的路径。', true); $('settings-validate-ffmpeg').click(); };
$('settings-reset-engine').onclick = async () => { const result = await window.ffmpeg.clearFfmpegPath(); $('settings-path-input').value = ''; fillPathSelect(result.history, ''); $('settings-engine-validation').textContent = '已恢复默认'; $('settings-engine-validation').classList.remove('valid-pill'); const cfg = await window.ffmpeg.getConfig(); $('engine-path').textContent = cfg.ffmpeg; $('engine-status').textContent = cfg.exists ? 'FFmpeg 引擎在线' : '未找到 FFmpeg'; $('engine-status').previousElementSibling.classList.toggle('ok', cfg.exists); log(`已恢复默认引擎路径：${cfg.ffmpeg}`); };
/* ---- 配置：收集 / 应用 / 保存 / 恢复 ---- */
function collectConvertProfile() { const cfg = { convert: { format: state.format, webp: { ...state.fmtParams.webp }, png: { ...state.fmtParams.png }, jpg: { ...state.fmtParams.jpg }, avif: { ...state.fmtParams.avif }, gif: { ...state.fmtParams.gif }, bmp: { ...state.fmtParams.bmp }, tiff: { ...state.fmtParams.tiff }, jpegxl: { ...state.fmtParams.jpegxl }, width: $('width').value, height: $('height').value, keepRatio: $('keep-ratio').checked, sizeGate: $('size-gate').checked, sizeTarget: Number($('size-target').value), deleteOriginal: $('delete-original').checked, filenameMode: $('filename-mode').value, filenameTemplate: $('filename-template').value, threads: $('threads')?.value || '0', hwaccel: $('hwaccel')?.value || '', customCores: Number($('custom-cores')?.value || 2) }, media: { outFormat: state.mediaFormat, gifOut: { ...state.media.gif }, webpOut: { ...state.media.webp }, apngOut: { ...state.media.apng }, videoOut: { ...state.media.video } }, gifStudio: { format: document.querySelector('[data-gif-format].selected')?.dataset.gifFormat || 'gif', fps: $('fps').value, width: $('gif-width').value, loop: $('loop').checked }, video: { container: 'mp4', vcodec: 'libx264', vcrf: '23', vbitrate: '', width: '', height: '', preset: 'medium', acodec: 'aac', abitrate: '128k' }, audio: { container: $('audio-container').value, acodec: $('audio-acodec').value, abitrate: $('audio-bitrate').value, samplerate: $('audio-samplerate').value } }; return cfg; }
function saveConvertProfile(silent = true) { const cfg = collectConvertProfile(); window.ffmpeg.saveSettings(cfg).then(() => { state.savedSettings = cfg; if (!silent) log('已保存当前设置，下次启动自动套用。'); }); }
function applyConvertProfile(cfg) { if (!cfg) cfg = {}; const c = cfg.convert || {}; if (c.format && FORMAT_CONFIG[c.format]) { state.format = c.format; document.querySelectorAll('#format-grid button').forEach((b) => b.classList.toggle('selected', b.dataset.format === c.format)); } initFmtParams(); ['webp', 'png', 'jpg', 'avif', 'gif', 'bmp', 'tiff', 'jpegxl'].forEach((f) => { if (c[f] && state.fmtParams[f]) state.fmtParams[f] = { ...state.fmtParams[f], ...c[f] }; }); setVal('width', c.width); setVal('height', c.height); setChk('keep-ratio', c.keepRatio); setChk('size-gate', c.sizeGate); if (c.sizeTarget !== undefined) { $('size-target').value = c.sizeTarget; $('size-target-output').textContent = `${c.sizeTarget}%`; $('size-limit-label').textContent = `${100 - c.sizeTarget}%`; } setChk('delete-original', c.deleteOriginal); setSel('filename-mode', c.filenameMode); if (c.filenameMode === 'custom') $('filename-template').disabled = false; setVal('filename-template', c.filenameTemplate || '{name}'); if (c.threads) { const t = $('threads'); if (t) t.value = c.threads; const cc = $('custom-cores'); if (cc && c.customCores) cc.value = c.customCores; } if (c.hwaccel) { const h = $('hwaccel'); if (h) h.value = c.hwaccel; } const m = cfg.media || {}; if (m.outFormat && ['gif', 'webp', 'apng', 'mp4', 'webm', 'mkv', 'mov', 'avi'].includes(m.outFormat)) state.mediaFormat = m.outFormat; if (m.gifOut) state.media.gif = { ...state.media.gif, ...m.gifOut }; if (m.webpOut) state.media.webp = { ...state.media.webp, ...m.webpOut }; if (m.apngOut) state.media.apng = { ...state.media.apng, ...m.apngOut }; if (m.videoOut) state.media.video = { ...state.media.video, ...m.videoOut }; renderMediaState(); const gs = cfg.gifStudio || {}; if (gs.format) document.querySelectorAll('[data-gif-format]').forEach((b) => b.classList.toggle('selected', b.dataset.gifFormat === gs.format)); setVal('fps', gs.fps); setOut('fps-output', gs.fps); setVal('gif-width', gs.width); setChk('loop', gs.loop); const a = cfg.audio || {}; setSel('audio-container', a.container); setSel('audio-acodec', a.acodec); setVal('audio-bitrate', a.abitrate); setSel('audio-samplerate', a.samplerate); renderFormatSettings(state.format); }
function renderMediaState() { const fmt = state.mediaFormat; const isAnim = ['gif', 'webp', 'apng'].includes(fmt); document.querySelectorAll('#media-format-grid button').forEach((b) => b.classList.toggle('selected', b.dataset.mediaFormat === fmt)); if (isAnim) { $('media-anim-settings').classList.remove('hidden-setting'); $('media-video-settings').classList.add('hidden-setting'); renderMediaAnimExtra(); $('media-fps').value = state.media[fmt].fps || 15; $('media-fps-output').textContent = state.media[fmt].fps || 15; $('media-width').value = state.media[fmt].width || ''; $('media-loop').checked = state.media[fmt].loop !== false; } else { $('media-anim-settings').classList.add('hidden-setting'); $('media-video-settings').classList.remove('hidden-setting'); const v = state.media.video; $('media-vcodec').value = v.vcodec; $('media-preset').value = v.preset; $('media-preset-output').textContent = v.preset; renderVideoCrf(); $('media-vfps').value = v.fps || ''; $('media-vwidth').value = v.width || ''; $('media-vheight').value = v.height || ''; $('media-acodec').value = v.acodec; $('media-abitrate').value = v.abitrate || ''; } }
function setVal(id, value) { const el = $(id); if (el && value !== undefined && value !== null && value !== '') el.value = value; }
function setOut(id, value) { const el = $(id); if (el && value !== undefined) el.textContent = value; }
function setSel(id, value) { const el = $(id); if (el && value !== undefined && value !== null) el.value = value; }
function setChk(id, value) { const el = $(id); if (el && value !== undefined) el.checked = Boolean(value); }
function resetAllToDefault() { window.ffmpeg.resetSettings().then(({ settings }) => { initFmtParams(); applyConvertProfile(settings); state.savedSettings = settings; log('已恢复全部默认设置。'); }); }
$('save-defaults').onclick = () => saveConvertProfile(false);
$('reset-defaults').onclick = resetAllToDefault;
$('settings-save-all').onclick = () => saveConvertProfile(false);
$('settings-reset-all').onclick = resetAllToDefault;
/* ---- 进度 / 日志 ---- */
if (window.ffmpeg) { window.ffmpeg.onLog((text) => { $('log').textContent = text.trim().split(/\r?\n/).pop() || '正在处理…'; }); window.ffmpeg.onProgress((progress) => { const file = state.activeJobs.get(progress.jobId) || progress.file; if (!file) return; const info = state.meta.get(file); if (!info) return; info.progress = progress.percent || 0; renderFiles(state.files, 'file-list', 'file-count'); }); }
/* ---- 初始化（带安全兜底：确保质量控制面板始终渲染） ---- */
function safeInitDefaults() { if (!state.fmtParams || Object.keys(state.fmtParams).length === 0) initFmtParams(); if (state.format && FORMAT_CONFIG[state.format]) renderFormatSettings(state.format); }
try {
  window.ffmpeg.getConfig().then((config) => { state.savedSettings = config.settings || null; setSidebarCollapsed(Boolean(config.settings?.ui?.sidebarCollapsed)); $('engine-status').textContent = config.exists ? 'FFmpeg 引擎在线' : '未找到 FFmpeg'; $('engine-status').previousElementSibling.classList.toggle('ok', config.exists); $('engine-path').textContent = config.ffmpeg; $('engine-path-input') && ($('engine-path-input').value = config.configured || config.ffmpeg); $('settings-path-input').value = config.configured || ''; $('settings-engine-validation').textContent = config.exists ? '有效' : '未检测'; if (config.exists) $('settings-engine-validation').classList.add('valid-pill'); fillPathSelect(config.history, config.configured); applyConvertProfile(config.settings); if (!config.exists) log('未找到默认 ffmpeg.exe，请在「偏好设置」中选择并检测有效的 ffmpeg.exe。', true); }).catch((err) => { log('配置加载失败，使用默认设置：' + (err && err.message || err)); safeInitDefaults(); });
} catch (err) { log('初始化异常，使用默认设置：' + (err && err.message || err)); safeInitDefaults(); }
setTimeout(() => { const fsEl = document.getElementById('format-settings'); if (fsEl && fsEl.children.length === 0) safeInitDefaults(); }, 1500);
