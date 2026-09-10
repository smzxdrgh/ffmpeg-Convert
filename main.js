const { app, BrowserWindow, dialog, ipcMain } = require('electron');
// 禁用 HTTP 缓存，确保每次启动加载磁盘最新文件（迭代场景）
app.commandLine.appendSwitch('disable-http-cache');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const defaultRoot = 'G:\\ffmpeg';
const settingsFile = () => path.join(app.getPath('userData'), 'ffmpeg-studio.json');
let mainWindow;
let selectedFfmpeg = process.env.FFMPEG_PATH || '';
let configuredFfmpeg = '';
let ffmpegHistory = [];
const defaultSettings = {
  convert: {
    format: 'webp',
    webp: { lossless: true, quality: 100, compression_level: 6 },
    png: { compression_level: 9, pixfmt: 'auto' },
    jpg: { q: 9, subsampling: 'yuvj420p', progressive: true, optimize: true },
    avif: { lossless: true, crf: 32, cpu_used: 0 },
    gif: { colors: 205, dither: 'sierra2_4a', loop: true },
    bmp: {},
    tiff: { compression: 'deflate' },
    jpegxl: { lossless: true, distance: 7.55, effort: 9 },
    width: '', height: '', keepRatio: true,
    sizeGate: true, sizeTarget: 20, deleteOriginal: false,
    filenameMode: 'original', filenameTemplate: '{name}',
    threads: '0', hwaccel: '', customCores: 2
  },
  media: {
    outFormat: 'gif',
    gifOut: { colors: 205, dither: 'sierra2_4a', loop: true, fps: 15, width: '' },
    webpOut: { lossless: true, quality: 100, compression_level: 6, loop: true, fps: 15, width: '' },
    apngOut: { fps: 15, width: '' },
    videoOut: { vcodec: 'libx264', crf: 26, preset: 'veryslow', fps: '', width: '', height: '', acodec: 'aac', abitrate: '128k' }
  },
  gifStudio: { format: 'gif', fps: 12, width: '', loop: true },
  video: { container: 'mp4', vcodec: 'libx264', vcrf: '23', vbitrate: '', width: '', height: '', preset: 'medium', acodec: 'aac', abitrate: '128k' },
  audio: { container: 'mp3', acodec: 'libmp3lame', abitrate: '192k' }
};
function deepMerge(base, extra) { if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra === undefined ? base : extra; const out = Array.isArray(base) ? base.slice() : { ...base }; for (const key of Object.keys(extra)) out[key] = deepMerge(base && typeof base === 'object' && key in base ? base[key] : {}, extra[key]); return out; }
let settings = deepMerge({}, defaultSettings);

function paths() {
  const root = process.env.FFMPEG_HOME || defaultRoot;
  const ffmpeg = selectedFfmpeg || path.join(root, 'bin', 'ffmpeg.exe');
  return { root: path.dirname(ffmpeg), ffmpeg, ffprobe: path.join(path.dirname(ffmpeg), 'ffprobe.exe') };
}

function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify({ ffmpeg: configuredFfmpeg, ffmpegHistory, settings }, null, 2)); } catch {} }
function loadSettings() { try { const data = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); if (data.ffmpeg && fs.existsSync(data.ffmpeg)) { configuredFfmpeg = data.ffmpeg; if (!process.env.FFMPEG_PATH) selectedFfmpeg = data.ffmpeg; } if (Array.isArray(data.ffmpegHistory)) ffmpegHistory = data.ffmpegHistory.filter(Boolean); if (data.settings && typeof data.settings === 'object') settings = deepMerge(defaultSettings, data.settings); } catch {} }
function resetSettings() { settings = deepMerge({}, defaultSettings); saveSettings(); return settings; }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 540, minHeight: 350,
    backgroundColor: '#111417',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // 启动时清除会话缓存和代码缓存，确保加载最新文件
  mainWindow.webContents.session.clearCache().catch(() => {});
  mainWindow.webContents.session.clearCodeCaches({}).catch(() => {});
}

function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true, cwd: paths().root });
    const MAX = 4 * 1024 * 1024; let stdout = '', stderr = '', so = 0, se = 0, timedOut = false;
    if (opts.timeoutMs) { const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, opts.timeoutMs); if (timer.unref) timer.unref(); }
    child.stdout.on('data', (d) => { if (so < MAX) { const s = d.toString(); const room = MAX - so; stdout += s.length > room ? s.slice(0, room) : s; so = stdout.length; } });
    child.stderr.on('data', (d) => { if (se < MAX) { const s = d.toString(); const room = MAX - se; stderr += s.length > room ? s.slice(0, room) : s; se = stderr.length; } });
    child.on('error', (error) => resolve({ ok: false, error: error.message, stdout, stderr, timedOut }));
    child.on('close', (code) => resolve({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut }));
  });
}

ipcMain.handle('pick-files', async () => (await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '媒体文件', extensions: ['png','jpg','jpeg','webp','bmp','tif','tiff','gif','avif','mp4','mov','webm','mkv'] }] })).filePaths);
ipcMain.handle('pick-ffmpeg', async () => (await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'FFmpeg 可执行文件', extensions: ['exe'] }] })).filePaths[0] || '');
ipcMain.handle('pick-directory', async () => (await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })).filePaths[0] || '');
function collectImages(dir, results = []) { let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; } for (const entry of entries) { const full = path.join(dir, entry.name); if (entry.isDirectory()) collectImages(full, results); else if (/\.(png|jpe?g|webp|bmp|tiff?|avif|gif)$/i.test(entry.name)) results.push(full); } return results; }
ipcMain.handle('list-images', (_, directory) => collectImages(directory).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
ipcMain.handle('path-kind', (_, target) => { try { const stat = fs.statSync(target); return stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'; } catch { return 'missing'; } });
ipcMain.handle('file-size', (_, target) => { try { return fs.statSync(target).size; } catch { return -1; } });
ipcMain.handle('delete-file', (_, target) => { try { if (fs.existsSync(target) && fs.statSync(target).isFile()) { fs.unlinkSync(target); return { ok: true }; } return { ok: false, error: '文件不存在' }; } catch (error) { return { ok: false, error: error.message }; } });
ipcMain.handle('get-config', () => ({ ...paths(), exists: fs.existsSync(paths().ffmpeg), configured: configuredFfmpeg, history: ffmpegHistory, settings }));
ipcMain.handle('save-settings', (_, patch) => { if (patch && typeof patch === 'object') settings = deepMerge(settings, patch); saveSettings(); return { ok: true, settings }; });
ipcMain.handle('load-settings', () => ({ ok: true, settings }));
ipcMain.handle('reset-settings', () => { const fresh = resetSettings(); return { ok: true, settings: fresh }; });
ipcMain.handle('cpu-count', () => Math.max(1, os.cpus().length));
ipcMain.handle('set-ffmpeg-path', async (_, candidate) => { const result = await run(candidate, ['-hide_banner', '-version']); if (!result.ok) return { ok: false, error: result.error || result.stderr || '不是有效的 FFmpeg 可执行文件' }; selectedFfmpeg = candidate; configuredFfmpeg = candidate; if (!ffmpegHistory.includes(candidate)) ffmpegHistory.unshift(candidate); if (ffmpegHistory.length > 8) ffmpegHistory = ffmpegHistory.slice(0, 8); saveSettings(); return { ok: true, ...paths(), history: ffmpegHistory, version: (result.stdout || result.stderr).split(/\r?\n/)[0] }; });
ipcMain.handle('clear-ffmpeg-path', () => { if (!process.env.FFMPEG_PATH) selectedFfmpeg = ''; configuredFfmpeg = ''; saveSettings(); return { ok: true, ...paths(), history: ffmpegHistory }; });
ipcMain.handle('probe', (_, file) => run(paths().ffprobe, ['-v','error','-count_frames','-count_packets','-show_entries','format=duration,size,format_name:stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,nb_read_packets','-of','json',file]));
function collectFiles(dir, results = []) { let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; } for (const entry of entries) { const full = path.join(dir, entry.name); if (entry.isDirectory()) collectFiles(full, results); else results.push(full); } return results; }
const MEDIA_EXT_RE = /\.(gif|webp|apng|mp4|webm|mkv|mov|avi)$/i; const AUDIO_EXT_RE = /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i;
function collectByExt(dir, re, results = []) { let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; } for (const entry of entries) { const full = path.join(dir, entry.name); if (entry.isDirectory()) collectByExt(full, re, results); else if (re.test(entry.name)) results.push(full); } return results; }
ipcMain.handle('list-media', (_, directory) => collectByExt(directory, MEDIA_EXT_RE, []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
ipcMain.handle('list-audio', (_, directory) => collectByExt(directory, AUDIO_EXT_RE, []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
function cleanError(stderr) { if (!stderr) return ''; const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => !/non monotonically increasing dts/i.test(l)).filter((l) => /error|invalid|corrupt|damaged|crc|truncat|failed|broken|not a |unable|no such|mismatch/i.test(l)); return lines.slice(0, 3).join(' | ') || (stderr.trim().split(/\r?\n/)[0] || ''); }
ipcMain.handle('pick-any', async () => (await dialog.showOpenDialog({ properties: ['openFile', 'openDirectory', 'multiSelections'] })).filePaths);
ipcMain.handle('list-all-files', (_, directory) => collectFiles(directory).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
// 流式文件枚举（有状态，单用户桌面应用；每次只取 N 个，避免数十万文件一次性加载）
let fileStream = null;
ipcMain.handle('stream-start', (_, { folders, recursive, ignoreExts }) => {
  fileStream = {
    folders: Array.isArray(folders) ? [...folders] : (folders ? [folders] : []),
    folderIndex: 0,
    dirStack: [],
    recursive: recursive !== false,
    ignoreExts: new Set((ignoreExts || []).map(e => String(e).toLowerCase().replace(/^\./, ''))),
    totalScanned: 0
  };
  return { ok: true };
});
ipcMain.handle('stream-next', (_, count) => {
  if (!fileStream) return { ok: false, error: '未启动流式枚举，请先调用 stream-start' };
  const n = Math.max(1, Math.min(5000, Number(count) || 100));
  const files = [];
  let guard = 0;
  while (files.length < n && guard < 200000) {
    guard++;
    if (fileStream.dirStack.length === 0) {
      if (fileStream.folderIndex >= fileStream.folders.length) break;
      const folder = fileStream.folders[fileStream.folderIndex];
      fileStream.folderIndex++;
      try {
        const entries = fs.readdirSync(folder, { withFileTypes: true });
        fileStream.dirStack.push({ dir: folder, entries, idx: 0 });
      } catch { continue; }
    }
    const top = fileStream.dirStack[fileStream.dirStack.length - 1];
    let advanced = false;
    while (top.idx < top.entries.length) {
      const entry = top.entries[top.idx];
      top.idx++;
      const full = path.join(top.dir, entry.name);
      if (entry.isDirectory()) {
        if (fileStream.recursive) {
          try {
            const subEntries = fs.readdirSync(full, { withFileTypes: true });
            fileStream.dirStack.push({ dir: full, entries: subEntries, idx: 0 });
          } catch {}
        }
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
      if (fileStream.ignoreExts.has(ext)) continue;
      files.push(full);
      fileStream.totalScanned++;
      advanced = true;
      break;
    }
    if (!advanced) fileStream.dirStack.pop();
  }
  const done = fileStream.dirStack.length === 0 && fileStream.folderIndex >= fileStream.folders.length;
  return { ok: true, files, done, totalScanned: fileStream.totalScanned };
});
ipcMain.handle('stream-reset', () => { fileStream = null; return { ok: true }; });

const stripMuxerDts = (s) => (s || '').replace(/.*non monotonically increasing dts.*/gi, '');
const damagePattern = () => /(error|invalid|corrupt|damaged|crc|truncat|end of file|not a (png|jpeg|jpg|gif|tiff|bmp|webp)|broken|failed to|unable|no such|mismatch|decode failed|decoding failed|lzw decode|short read|partial|overread|not enough data|parsing|obu|eoi missing|premature)/i;
ipcMain.handle('check-integrity', async (_, { file, mode }) => { let stats; try { stats = fs.statSync(file); } catch { return { ok: false, status: 'damaged', error: '文件不存在或不可访问' }; } if (stats.size === 0) return { ok: false, status: 'damaged', error: '空文件（0 字节）' }; const damage = /(error|invalid|corrupt|damaged|crc|truncat|end of file|not a (png|jpeg|jpg|gif|tiff|bmp|webp)|broken|failed to|unable|no such|mismatch|decode failed|decoding failed|lzw decode|short read|partial|overread|not enough data|parsing|obu|eoi missing|premature)/i; const probe = await run(paths().ffprobe, ['-v','error','-show_entries','format=format_name,duration,size','-of','json',file], { timeoutMs: 30000 }); if (!probe.ok) return { ok: false, status: 'damaged', error: probe.timedOut ? '读取文件头超时' : (cleanError(probe.stderr) || '无法读取文件头') }; if (mode === 'quick') { if (/\.(mp4|mov|webm|mkv|avi|ts|mts|m2ts|mpg|mpeg|wmv|flv|3gp|m4v)$/i.test(file)) return { ok: true, status: 'ok' }; const dec = await run(paths().ffmpeg, ['-v','error','-i',file,'-map','0:v:0','-f','null','-'], { timeoutMs: 60000 }); if (!dec.ok || damage.test(stripMuxerDts(dec.stderr))) return { ok: false, status: 'damaged', error: dec.timedOut ? '解码超时（疑似损坏或超大文件）' : (cleanError(dec.stderr) || '解码校验失败') }; return { ok: true, status: 'ok' }; } const dec = await run(paths().ffmpeg, ['-v','error','-i',file,'-map','0','-f','null','-'], { timeoutMs: 120000 }); if (!dec.ok || damage.test(stripMuxerDts(dec.stderr))) return { ok: false, status: 'damaged', error: dec.timedOut ? '完整解码超时（疑似损坏或超大文件）' : (cleanError(dec.stderr) || '解码校验失败') }; return { ok: true, status: 'ok' }; });
ipcMain.handle('repair-file', async (_, { file }) => { try { if (!fs.existsSync(file)) return { ok: false, error: '文件不存在' }; const stats = fs.statSync(file); if (stats.size === 0) return { ok: false, error: '空文件无法修复' }; const dir = path.dirname(file); const base = path.basename(file, path.extname(file)); const isImage = /\.(png|jpe?g|webp|bmp|tiff?|avif|jxl|gif)$/i.test(file); const outCopy = path.join(dir, `${base}_修复${path.extname(file)}`); const remux = await run(paths().ffmpeg, ['-y','-err_detect','ignore_err','-i',file,'-map','0','-c','copy',outCopy], { timeoutMs: 120000 }); let repaired = outCopy; let stage = 'remux'; const usable = (f) => { try { return fs.existsSync(f) && fs.statSync(f).size > 0; } catch { return false; } }; if (usable(outCopy)) { const verify = await run(paths().ffmpeg, ['-v','error','-i',outCopy,'-map','0:v:0','-f','null','-'], { timeoutMs: 120000 }); if (verify.ok && !damagePattern().test(stripMuxerDts(verify.stderr))) return { ok: true, repaired: outCopy, stage: 'remux' }; } try { fs.unlinkSync(outCopy); } catch {} const outEncode = isImage ? path.join(dir, `${base}_修复.png`) : path.join(dir, `${base}_修复.mp4`); const encArgs = isImage ? ['-y','-err_detect','ignore_err','-i',file,'-pix_fmt','yuv420p','-frames:v','1','-update','1',outEncode] : ['-y','-err_detect','ignore_err','-i',file,'-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-an',outEncode]; const enc = await run(paths().ffmpeg, encArgs, { timeoutMs: 300000 }); if (!usable(outEncode)) return { ok: false, error: cleanError(enc.stderr) || '修复失败：既无法重封装也无法重编码' }; const verify2 = await run(paths().ffmpeg, ['-v','error','-i',outEncode,'-map','0:v:0','-f','null','-'], { timeoutMs: 120000 }); if (!verify2.ok || damagePattern().test(stripMuxerDts(verify2.stderr))) { try { fs.unlinkSync(outEncode); } catch {} return { ok: false, error: '修复副本校验未通过，已丢弃' }; } return { ok: true, repaired: outEncode, stage: 'encode' }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('capabilities', async () => {
  const [formats, codecs, filters, hwaccels] = await Promise.all([
    run(paths().ffmpeg, ['-hide_banner','-formats']), run(paths().ffmpeg, ['-hide_banner','-codecs']), run(paths().ffmpeg, ['-hide_banner','-filters']), run(paths().ffmpeg, ['-hide_banner','-hwaccels'])
  ]);
  return { formats: `${formats.stdout || ''}\n${formats.stderr || ''}`, codecs: `${codecs.stdout || ''}\n${codecs.stderr || ''}`, filters: `${filters.stdout || ''}\n${filters.stderr || ''}`, hwaccels: `${hwaccels.stdout || ''}\n${hwaccels.stderr || ''}`, ffmpeg: paths().ffmpeg };
});
ipcMain.handle('run-ffmpeg', (event, args, metadata = {}) => new Promise((resolve) => {
  const child = spawn(paths().ffmpeg, ['-progress', 'pipe:1', '-nostats', ...args], { windowsHide: true, cwd: paths().root });
  let stderr = ''; let stderrDropped = false; let progressLine = {};
  child.stderr.on('data', (data) => { const text = data.toString(); if (stderr.length < 1024 * 1024) stderr += text; if (!stderrDropped) event.sender.send('ffmpeg-log', text); if (stderr.length >= 1024 * 1024) stderrDropped = true; });
  child.stdout.on('data', (data) => { const text = data.toString(); event.sender.send('ffmpeg-log', text); text.split(/\r?\n/).forEach((line) => { const separator = line.indexOf('='); if (separator < 1) return; progressLine[line.slice(0, separator)] = line.slice(separator + 1); if (line.startsWith('progress=')) { const elapsed = Number(progressLine.out_time_ms || 0); const duration = Number(metadata.duration || 0); const percent = duration > 0 ? Math.min(100, (elapsed / (duration * 1000000)) * 100) : (progressLine.progress === 'end' ? 100 : 0); event.sender.send('ffmpeg-progress', { jobId: metadata.jobId, file: metadata.file, percent, elapsed, duration, state: progressLine.progress }); progressLine = {}; } }); });
  child.on('error', (error) => resolve({ ok: false, error: error.message }));
  child.on('close', (code) => resolve({ ok: code === 0, code, stderr }));
}));

app.whenReady().then(() => { loadSettings(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
