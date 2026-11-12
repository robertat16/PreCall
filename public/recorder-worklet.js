// AudioWorklet that forwards raw mono PCM blocks to the main thread.
class PrecallRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.buf = new Float32Array(4096);
    this.len = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'start') {
        this.recording = true;
        this.len = 0;
      } else if (e.data === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ done: true });
      }
    };
  }
  flush() {
    if (this.len > 0) {
      this.port.postMessage({ chunk: this.buf.slice(0, this.len) });
      this.len = 0;
    }
  }
  process(inputs) {
    const input = inputs[0];
    if (this.recording && input && input.length > 0) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.len++] = ch[i];
        if (this.len === this.buf.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('precall-recorder', PrecallRecorder);
