/**
 * Original pentatonic score and physically inspired plucked-string synthesis.
 * This is an openly documented synthetic substitute for a recorded acoustic guzheng.
 * A single caller-driven clock owns scheduling; there are no timers or global listeners.
 */
export function createAudio() {
    let context: AudioContext | null = null;
    let music: GainNode | null = null, environment: GainNode | null = null;
    let waterGain: GainNode | null = null, windGain: GainNode | null = null;
    let enabled = false, hidden = false, disposed = false;
    let musicVolume = 0.55, environmentVolume = 0.4, performanceElapsed = -1, nextNote = 0;
    let ambientClock = 2.4, birdClock = 5.6, nightMix = 0;
    const sources = new Set<AudioScheduledSourceNode>();
    const persistentNodes: AudioNode[] = [];
    const notes = new Map<number, AudioBuffer>();
    const melody = [62, 69, 74, 76, 74, 69, 67, 69, 62, 64, 67, 69, 74, 81, 79, 76, 74, 69, 67, 64, 62, 57, 62, 67, 69, 74, 76, 74, 69, 67, 64, 62, 57, 62];
    let seed = 64821;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
    function track(source: AudioScheduledSourceNode, nodes: AudioNode[] = []) {
        sources.add(source);
        source.onended = () => { sources.delete(source); source.disconnect(); nodes.forEach(n => n.disconnect()); };
    }
    function noiseBuffer(seconds: number) {
        const ctx = context!;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < data.length; i++) {
            brown = (brown + (rand() * 2 - 1) * 0.027) / 1.027;
            data[i] = brown * 3.5;
        }
        return buffer;
    }
    function startEnvironment() {
        const ctx = context!;
        const buffer = noiseBuffer(5);
        for (const kind of ['water', 'wind']) {
            const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = buffer;
            src.loop = true;
            filter.type = kind === 'water' ? 'lowpass' : 'bandpass';
            filter.frequency.value = kind === 'water' ? 1900 : 370;
            filter.Q.value = 0.6;
            gain.gain.value = 0.12;
            src.connect(filter).connect(gain).connect(environment!);
            src.start(0, kind === 'water' ? 0 : 2.37);
            track(src, [filter, gain]);
            if (kind === 'water')
                waterGain = gain;
            else
                windGain = gain;
        }
    }
    function pluckBuffer(midi: number) {
        if (notes.has(midi))
            return notes.get(midi)!;
        const ctx = context!, freq = 440 * 2 ** ((midi - 69) / 12), rate = ctx.sampleRate;
        const buffer = ctx.createBuffer(1, Math.ceil(rate * 3.2), rate), data = buffer.getChannelData(0);
        const delay = Math.max(2, Math.round(rate / freq)), ring = new Float32Array(delay);
        for (let i = 0; i < delay; i++)
            ring[i] = (rand() * 2 - 1) * Math.sin(Math.PI * i / delay);
        // Karplus–Strong loop, plus a restrained wooden-body partial. All generated locally.
        for (let i = 0; i < data.length; i++) {
            const k = i % delay, s = ring[k];
            ring[k] = (s + ring[(k + 1) % delay]) * 0.497;
            const t = i / rate;
            data[i] = (s * 0.75 + Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3.8) * 0.12) * Math.min(1, t * 400);
        }
        notes.set(midi, buffer);
        return buffer;
    }
    function pluck(midi: number, strength: number, delay = 0) {
        if (!context || !music || !enabled || hidden || sources.size >= 42)
            return;
        const ctx = context, src = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
        src.buffer = pluckBuffer(midi);
        gain.gain.value = strength;
        pan.pan.value = -0.22;
        src.connect(gain).connect(pan).connect(music);
        track(src, [gain, pan]);
        src.start(ctx.currentTime + delay);
        src.stop(ctx.currentTime + delay + 3.2);
    }
    function tone(frequency: number, duration: number, strength: number, endFrequency = frequency, delay = 0) {
        if (!context || !environment || !enabled || hidden || sources.size >= 42)
            return;
        const ctx = context, oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + delay;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(strength, start + Math.min(0.015, duration / 4));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(environment);
        track(oscillator, [gain]);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.015);
    }
    function rustle(strength: number, duration: number, frequency: number) {
        if (!context || !environment || !enabled || hidden || sources.size >= 42)
            return;
        const ctx = context, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = noiseBuffer(duration);
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = 0.7;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(strength, ctx.currentTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        src.connect(filter).connect(gain).connect(environment);
        track(src, [filter, gain]);
        src.start();
        src.stop(ctx.currentTime + duration);
    }
    return {
        async setEnabled(value: boolean) {
            if (disposed)
                return;
            // AudioContext is created exclusively inside this explicit user-gesture entry point.
            if (value && !context) {
                context = new AudioContext();
                music = context.createGain();
                environment = context.createGain();
                const limiter = context.createDynamicsCompressor();
                limiter.threshold.value = -12;
                limiter.ratio.value = 5;
                music.gain.value = musicVolume;
                environment.gain.value = environmentVolume;
                music.connect(limiter);
                environment.connect(limiter);
                limiter.connect(context.destination);
                persistentNodes.push(music, environment, limiter);
                startEnvironment();
            }
            enabled = value;
            if (!context)
                return;
            if (value && !hidden)
                await context.resume();
            else
                await context.suspend();
        },
        setVolumes(m: number, e: number) {
            musicVolume = clamp(m);
            environmentVolume = clamp(e);
            if (context && music && environment) {
                music.gain.setTargetAtTime(musicVolume, context.currentTime, 0.12);
                environment.gain.setTargetAtTime(environmentVolume, context.currentTime, 0.12);
            }
        },
        trigger(event: string) {
            if (disposed)
                return;
            if (event === 'character.guzheng') {
                if (performanceElapsed < 0) {
                    performanceElapsed = 0;
                    nextNote = 1;
                    pluck(melody[0], 0.63);
                }
                return;
            }
            if (!enabled || hidden)
                return;
            if (event === 'lake.feed' || event === 'koi.splash') {
                rustle(0.33, 0.34, 1300);
                tone(420, 0.17, 0.06, 125);
            }
            else if (event.startsWith('flora.'))
                rustle(0.22, 0.6, event === 'flora.magnolia' ? 1900 : 3100);
            else if (event === 'character.cinnabar')
                for (let i = 0; i < 4; i++)
                    tone(1700 + i * 213, 0.11, 0.035, 1500 + i * 203, i * 0.12);
            else if (event === 'pavilion.lantern') {
                tone(880, 0.55, 0.045);
                tone(1321, 0.7, 0.022);
            }
        },
        update(dt: number, _time: number, night: number, distance: number) {
            if (disposed || hidden)
                return;
            dt = Math.min(Math.max(dt, 0), 0.1);
            nightMix = clamp(night);
            if (performanceElapsed >= 0) {
                performanceElapsed += dt;
                if (performanceElapsed >= 14)
                    performanceElapsed = -1;
                else if (performanceElapsed >= nextNote * 0.42) {
                    pluck(melody[nextNote % melody.length], nextNote % 4 === 0 ? 0.65 : 0.46);
                    nextNote++;
                }
            }
            if (!enabled || !context || context.state !== 'running')
                return;
            const now = context.currentTime;
            const proximity = 1 / (1 + Math.max(0, distance) * 0.055);
            waterGain?.gain.setTargetAtTime(0.13 + proximity * 0.42, now, 0.8);
            windGain?.gain.setTargetAtTime(0.16 - nightMix * 0.05, now, 1.5);
            ambientClock -= dt;
            if (ambientClock <= 0) {
                ambientClock = 3.7 + rand() * 3;
                // The ambient layer ducks while the synchronised character phrase is active.
                if (performanceElapsed < 0) {
                    pluck([50, 57, 62, 67][Math.floor(rand() * 4)], 0.16);
                    pluck(74, 0.06, 0.23);
                }
            }
            birdClock -= dt;
            if (birdClock <= 0) {
                birdClock = 7 + rand() * 11;
                if (nightMix < 0.5) {
                    tone(2050, 0.16, 0.022, 3050);
                    tone(2750, 0.13, 0.015, 2200, 0.2);
                }
                else {
                    tone(4100, 0.07, 0.01, 4150);
                    tone(4130, 0.065, 0.008, 4160, 0.11);
                }
            }
        },
        suspend(value: boolean) {
            hidden = value;
            if (!context || disposed)
                return;
            if (value)
                void context.suspend().catch(() => { });
            else if (enabled)
                void context.resume().catch(() => { });
        },
        dispose() {
            disposed = true;
            enabled = false;
            for (const source of sources) {
                try {
                    source.stop();
                }
                catch { /* A finite source may have already ended. */ }
                source.disconnect();
            }
            sources.clear();
            notes.clear();
            persistentNodes.forEach(n => n.disconnect());
            if (context)
                void context.close().catch(() => { });
            context = null;
            music = null;
            environment = null;
            waterGain = null;
            windGain = null;
        },
    };
}
