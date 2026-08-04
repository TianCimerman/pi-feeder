function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SensorBusyError extends Error {
  constructor() {
    super("HC-SR04 (mock): measurement already in progress");
    this.code = "BUSY";
  }
}
export class EchoTimeoutError extends Error {
  constructor() {
    super("HC-SR04 (mock): no echo received (simulated timeout)");
    this.code = "TIMEOUT";
  }
}
export class OutOfRangeError extends Error {
  constructor(distanceCm) {
    super(`HC-SR04 (mock): reading ${distanceCm.toFixed(1)}cm outside configured range`);
    this.code = "OUT_OF_RANGE";
    this.distanceCm = distanceCm;
  }
}

export class HCSR04 {
  constructor({
    triggerPin,
    echoPin,
    minCm = 2,
    maxCm = 400,
    timeoutMs = 60,
    temperatureC = 20,
    // Mock-only options, all optional:
    mockBaseCm = 25,      // "resting" distance the fake sensor hovers around
    mockJitterCm = 3,     // random +/- noise per reading
    mockFailRate = 0,     // 0..1 chance a given measureOnce() times out (simulates flaky wiring)
  } = {}) {
    if (triggerPin == null || echoPin == null) {
      throw new Error("HCSR04 (mock): triggerPin and echoPin are required");
    }

    this.minCm = minCm;
    this.maxCm = maxCm;
    this.timeoutMs = timeoutMs;
    this.temperatureC = temperatureC;

    this.mockBaseCm = mockBaseCm;
    this.mockJitterCm = mockJitterCm;
    this.mockFailRate = mockFailRate;

    this._busy = false;

    console.log(
      `[hcsr04.mock] Simulated sensor initialised (trigger=${triggerPin}, echo=${echoPin}). ` +
      `No real GPIO is used — running off-Pi.`
    );
  }

  measureOnce() {
    if (this._busy) {
      return Promise.reject(new SensorBusyError());
    }
    this._busy = true;

    return new Promise((resolve, reject) => {
      // Simulate the small real-world delay a real ultrasonic pulse would take
      const delay = 5 + Math.random() * 15;

      setTimeout(() => {
        this._busy = false;

        if (Math.random() < this.mockFailRate) {
          reject(new EchoTimeoutError());
          return;
        }

        const noise = (Math.random() * 2 - 1) * this.mockJitterCm;
        const distanceCm = this.mockBaseCm + noise;

        if (distanceCm < this.minCm || distanceCm > this.maxCm) {
          reject(new OutOfRangeError(distanceCm));
        } else {
          resolve(distanceCm);
        }
      }, delay);
    });
  }

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
    // Nothing to clean up in the mock — no real GPIO handles held.
  }
}