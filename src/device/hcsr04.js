import pigpioPkg from "pigpio";

const { Gpio } = pigpioPkg;

const SPEED_OF_SOUND_CM_PER_US_20C = 0.0343; // ~343 m/s at 20°C, dry air

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SensorBusyError extends Error {
  constructor() {
    super("HC-SR04: measurement already in progress");
    this.code = "BUSY";
  }
}
export class EchoTimeoutError extends Error {
  constructor() {
    super("HC-SR04: no echo received (check wiring / timeout too short)");
    this.code = "TIMEOUT";
  }
}
export class OutOfRangeError extends Error {
  constructor(distanceCm) {
    super(`HC-SR04: reading ${distanceCm.toFixed(1)}cm outside configured range`);
    this.code = "OUT_OF_RANGE";
    this.distanceCm = distanceCm;
  }
}

export class HCSR04 {
  /**
   * @param {number} triggerPin BCM pin wired to HC-SR04 TRIG
   * @param {number} echoPin BCM pin wired to HC-SR04 ECHO (through a
   *   voltage divider — ECHO is 5V, Pi GPIO is 3.3V and not 5V-tolerant)
   * @param {number} [minCm=2]
   * @param {number} [maxCm=400]
   * @param {number} [timeoutMs=60] max time to wait for an echo
   * @param {number} [temperatureC=20] for speed-of-sound compensation
   */
  constructor({
    triggerPin,
    echoPin,
    minCm = 2,
    maxCm = 400,
    timeoutMs = 60,
    temperatureC = 20,
  }) {
    if (triggerPin == null || echoPin == null) {
      throw new Error("HCSR04: triggerPin and echoPin are required");
    }

    this.minCm = minCm;
    this.maxCm = maxCm;
    this.timeoutMs = timeoutMs;
    this.speedCmPerUs =
      SPEED_OF_SOUND_CM_PER_US_20C + (temperatureC - 20) * 0.00006;

    this.trigger = new Gpio(triggerPin, { mode: Gpio.OUTPUT });
    this.echo = new Gpio(echoPin, { mode: Gpio.INPUT, alert: true });
    this.trigger.digitalWrite(0);

    this._busy = false;
    this._pending = null; // { resolve, reject, startTick, timer }

    this._onAlert = this._onAlert.bind(this);
    this.echo.on("alert", this._onAlert);
  }

  _onAlert(level, tick) {
    if (!this._pending) return; // stray/late edge — ignore

    if (level === 1) {
      this._pending.startTick = tick; // rising edge: echo started
      return;
    }

    if (this._pending.startTick == null) return; // never saw rising edge

    const pulseUs = (tick - this._pending.startTick) >>> 0; // unsigned handles tick wraparound
    const distanceCm = (pulseUs * this.speedCmPerUs) / 2;

    const { resolve, reject, timer } = this._pending;
    clearTimeout(timer);
    this._pending = null;
    this._busy = false;

    if (distanceCm < this.minCm || distanceCm > this.maxCm) {
      reject(new OutOfRangeError(distanceCm));
    } else {
      resolve(distanceCm);
    }
  }

  /** Single raw reading. Never hangs — always resolves or rejects within timeoutMs. */
  measureOnce() {
    if (this._busy) {
      return Promise.reject(new SensorBusyError());
    }
    this._busy = true;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending = null;
        this._busy = false;
        reject(new EchoTimeoutError());
      }, this.timeoutMs);

      this._pending = { resolve, reject, startTick: null, timer };
      this.trigger.trigger(10, 1); // hardware-timed 10µs pulse
    });
  }

  /**
   * Several readings, median-filtered. Robust to the occasional wild
   * outlier this sensor is known for. Returns null if every sample failed.
   */
  async getDistance({ samples = 5, delayMs = 65 } = {}) {
    const readings = [];

    for (let i = 0; i < samples; i++) {
      try {
        readings.push(await this.measureOnce());
      } catch (err) {
        // expected occasionally — skip
      }
      if (i < samples - 1) await sleep(delayMs);
    }

    if (readings.length === 0) return null;

    readings.sort((a, b) => a - b);
    const mid = Math.floor(readings.length / 2);
    return readings.length % 2
      ? readings[mid]
      : (readings[mid - 1] + readings[mid]) / 2;
  }

  close() {
    if (this._pending) {
      clearTimeout(this._pending.timer);
      this._pending.reject(new Error("HC-SR04: closed while measuring"));
      this._pending = null;
    }
    this.echo.removeListener("alert", this._onAlert);
    this.echo.disableAlert();
    this.trigger.digitalWrite(0);
  }
}