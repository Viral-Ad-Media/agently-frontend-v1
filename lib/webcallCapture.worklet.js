// Capture runs on the audio thread so UI rendering cannot stall microphone PCM.
class AgentlyCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(480);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.frame[this.offset++] = input[i];
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(480);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("agently-capture", AgentlyCapture);
