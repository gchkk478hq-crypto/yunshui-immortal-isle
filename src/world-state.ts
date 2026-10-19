export type DayPhase = 'day' | 'transitionToNight' | 'night' | 'transitionToDay';
export class WorldState {
    night = 0;
    targetNight = 0;
    time = 0;
    audioEnabled = false;
    mode: 'panorama' | 'focus' = 'panorama';
    focusTarget: string | null = null;
    reducedMotion = false;
    quality: 'high' | 'balanced' | 'low' = 'balanced';
    hidden = false;
    ready = false;
    lastEvent = '';
    interactions = 0;
    get dayPhase(): DayPhase { return this.night === this.targetNight ? (this.night === 1 ? 'night' : 'day') : (this.targetNight === 1 ? 'transitionToNight' : 'transitionToDay'); }
    toggleNight() { this.targetNight = 1 - this.targetNight; }
    tick(dt: number) { if (this.hidden)
        return; this.time += Math.max(0, Math.min(dt, .05)); const delta = this.targetNight - this.night; this.night += Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, dt) / 10); }
}
