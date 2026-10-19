export function installRecorder(canvas: HTMLCanvasElement) {
    if (!new URLSearchParams(location.search).has('record') || typeof MediaRecorder === 'undefined')
        return;
    const b = document.createElement('button');
    b.id = 'qa-record';
    b.textContent = '录制 30 秒验收片段';
    b.style.cssText = 'position:fixed;left:20px;bottom:120px;padding:8px 12px;border-radius:4px;background:#ffffffe0;font:11px sans-serif;z-index:9';
    document.body.appendChild(b);
    b.onclick = () => { b.hidden = true; const stream = canvas.captureStream(24); const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 4500000 }); const chunks: Blob[] = []; recorder.ondataavailable = e => { if (e.data.size)
        chunks.push(e.data); }; recorder.onstop = () => { const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); const a = document.createElement('a'); a.href = url; a.download = '云水仙洲-30秒验收.webm'; a.click(); stream.getTracks().forEach(t => t.stop()); setTimeout(() => URL.revokeObjectURL(url), 1000); }; recorder.start(1000); const stop = window.setTimeout(() => { if (recorder.state !== 'inactive')
        recorder.stop(); }, 30000); window.addEventListener('pagehide', () => { clearTimeout(stop); if (recorder.state !== 'inactive')
        recorder.stop(); }, { once: true }); };
}
