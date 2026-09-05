/** Tiny WebAudio sound effects for the Warship table (no asset downloads). */

let ctx: AudioContext | null = null;
let master: DynamicsCompressorNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    // A shared limiter glues layered sounds together and guards against
    // clipping when a hit and its sinking tail overlap.
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.knee.value = 20;
    master.ratio.value = 6;
    master.attack.value = 0.002;
    master.release.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Output bus — routes through the limiter once it exists. */
function out(context: AudioContext): AudioNode {
  return master ?? context.destination;
}

function noiseBuffer(context: AudioContext, seconds: number) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Punchy boom for a direct hit, with a metallic ring off the struck hull. */
export function playExplosion() {
  const context = audio();
  if (!context) return;
  const now = context.currentTime;
  const destination = out(context);

  // Instant crack — a bright noise burst for the moment of impact.
  const crack = context.createBufferSource();
  crack.buffer = noiseBuffer(context, 0.12);
  const crackFilter = context.createBiquadFilter();
  crackFilter.type = "highpass";
  crackFilter.frequency.value = 900;
  const crackGain = context.createGain();
  crackGain.gain.setValueAtTime(0.45, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  crack.connect(crackFilter).connect(crackGain).connect(destination);
  crack.start(now);
  crack.stop(now + 0.12);

  // Boom body — noise with a lowpass sweep.
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, 1);
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(2400, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(130, now + 0.9);
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.85, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1);
  noise.connect(noiseFilter).connect(noiseGain).connect(destination);
  noise.start(now);
  noise.stop(now + 1);

  // Sub thump for weight.
  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(130, now);
  thump.frequency.exponentialRampToValueAtTime(38, now + 0.5);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.6, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  thump.connect(thumpGain).connect(destination);
  thump.start(now);
  thump.stop(now + 0.6);

  // Metallic ring — a fast-decaying ping from the struck plate.
  const ring = context.createOscillator();
  ring.type = "triangle";
  ring.frequency.setValueAtTime(1400, now);
  ring.frequency.exponentialRampToValueAtTime(620, now + 0.35);
  const ringGain = context.createGain();
  ringGain.gain.setValueAtTime(0.15, now);
  ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  ring.connect(ringGain).connect(destination);
  ring.start(now);
  ring.stop(now + 0.4);
}

/** Water impact: a bright plunk, a splash of spray, and a deep bloop. */
export function playSplash() {
  const context = audio();
  if (!context) return;
  const now = context.currentTime;
  const destination = out(context);

  // The shell punching the surface — a short, bright plunk.
  const plunk = context.createOscillator();
  plunk.type = "sine";
  plunk.frequency.setValueAtTime(700, now);
  plunk.frequency.exponentialRampToValueAtTime(240, now + 0.09);
  const plunkGain = context.createGain();
  plunkGain.gain.setValueAtTime(0.32, now);
  plunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  plunk.connect(plunkGain).connect(destination);
  plunk.start(now);
  plunk.stop(now + 0.16);

  // Splash body — bandpassed noise sweeping downward.
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, 0.8);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(1700, now);
  filter.frequency.exponentialRampToValueAtTime(220, now + 0.7);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.38, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
  noise.connect(filter).connect(gain).connect(destination);
  noise.start(now);
  noise.stop(now + 0.8);

  // Fine spray — a whisper of high-frequency noise.
  const spray = context.createBufferSource();
  spray.buffer = noiseBuffer(context, 0.5);
  const sprayFilter = context.createBiquadFilter();
  sprayFilter.type = "highpass";
  sprayFilter.frequency.value = 3500;
  const sprayGain = context.createGain();
  sprayGain.gain.setValueAtTime(0.0001, now);
  sprayGain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
  sprayGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  spray.connect(sprayFilter).connect(sprayGain).connect(destination);
  spray.start(now);
  spray.stop(now + 0.5);
}

/** A long, dramatic sinking: a blast, a groaning hull, rising bubbles, a seabed thud. */
export function playSinking() {
  const context = audio();
  if (!context) return;
  const now = context.currentTime;
  const destination = out(context);

  // Opening blast as the hull breaks apart.
  const blast = context.createBufferSource();
  blast.buffer = noiseBuffer(context, 1.2);
  const blastFilter = context.createBiquadFilter();
  blastFilter.type = "lowpass";
  blastFilter.frequency.setValueAtTime(2200, now);
  blastFilter.frequency.exponentialRampToValueAtTime(110, now + 1.1);
  const blastGain = context.createGain();
  blastGain.gain.setValueAtTime(0.6, now);
  blastGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  blast.connect(blastFilter).connect(blastGain).connect(destination);
  blast.start(now);
  blast.stop(now + 1.2);

  // Groaning metal — a sawtooth with a slow downward pitch and a wobble.
  const groan = context.createOscillator();
  groan.type = "sawtooth";
  groan.frequency.setValueAtTime(180, now + 0.1);
  groan.frequency.exponentialRampToValueAtTime(42, now + 2.5);
  const wobble = context.createOscillator();
  wobble.frequency.value = 7;
  const wobbleGain = context.createGain();
  wobbleGain.gain.value = 10;
  wobble.connect(wobbleGain).connect(groan.frequency);
  wobble.start(now);
  wobble.stop(now + 2.6);
  const groanFilter = context.createBiquadFilter();
  groanFilter.type = "lowpass";
  groanFilter.frequency.setValueAtTime(640, now);
  groanFilter.frequency.exponentialRampToValueAtTime(160, now + 2.5);
  const groanGain = context.createGain();
  groanGain.gain.setValueAtTime(0.0001, now);
  groanGain.gain.exponentialRampToValueAtTime(0.22, now + 0.25);
  groanGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
  groan.connect(groanFilter).connect(groanGain).connect(destination);
  groan.start(now);
  groan.stop(now + 2.6);

  // Rising bubbles.
  const bubbles = context.createBufferSource();
  bubbles.buffer = noiseBuffer(context, 2.5);
  const bubbleFilter = context.createBiquadFilter();
  bubbleFilter.type = "bandpass";
  bubbleFilter.Q.value = 4;
  bubbleFilter.frequency.setValueAtTime(420, now + 0.2);
  bubbleFilter.frequency.linearRampToValueAtTime(1800, now + 2.5);
  const bubbleGain = context.createGain();
  bubbleGain.gain.setValueAtTime(0.0001, now + 0.2);
  bubbleGain.gain.linearRampToValueAtTime(0.16, now + 0.7);
  bubbleGain.gain.linearRampToValueAtTime(0.04, now + 2.5);
  bubbles.connect(bubbleFilter).connect(bubbleGain).connect(destination);
  bubbles.start(now);
  bubbles.stop(now + 2.5);

  // A final thud as the wreck settles on the seabed.
  const settle = context.createOscillator();
  settle.type = "sine";
  settle.frequency.setValueAtTime(70, now + 2.3);
  settle.frequency.exponentialRampToValueAtTime(30, now + 2.9);
  const settleGain = context.createGain();
  settleGain.gain.setValueAtTime(0.0001, now + 2.3);
  settleGain.gain.exponentialRampToValueAtTime(0.32, now + 2.4);
  settleGain.gain.exponentialRampToValueAtTime(0.001, now + 3);
  settle.connect(settleGain).connect(destination);
  settle.start(now + 2.3);
  settle.stop(now + 3);
}
