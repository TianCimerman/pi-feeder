import i2cBus from "i2c-bus";

const DEFAULT_ADDRESS = 0x74;
const START_MEASUREMENT_REGISTER = 0x10;
const START_MEASUREMENT_COMMAND = 0xb0;
const DISTANCE_REGISTER = 0x02;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SEN0590Error extends Error {
  constructor(message, code = "SEN0590_ERROR") {
    super(message);
    this.name = "SEN0590Error";
    this.code = code;
  }
}

/**
 * Driver for DFRobot SEN0590 (4 m laser-ranging sensor).
 *
 * A measurement is started by writing 0xB0 to register 0x10.  After the
 * sensor has had time to acquire a reading, register 0x02 returns a
 * big-endian two-byte distance in millimetres, offset by -10 mm.
 */
export class SEN0590 {
  constructor({
    busNumber = 1,
    address = DEFAULT_ADDRESS,
    measurementDelayMs = 50,
    minCm = 2,
    maxCm = 400,
  } = {}) {
    this.busNumber = busNumber;
    this.address = address;
    this.measurementDelayMs = measurementDelayMs;
    this.minCm = minCm;
    this.maxCm = maxCm;
    this.bus = null;
  }

  async open() {
    if (!this.bus) {
      this.bus = await i2cBus.openPromisified(this.busNumber);
    }
  }

  async measureOnce() {
    if (!this.bus) {
      throw new SEN0590Error("SEN0590: sensor has not been opened", "NOT_OPEN");
    }

    try {
      await this.bus.writeByte(
        this.address,
        START_MEASUREMENT_REGISTER,
        START_MEASUREMENT_COMMAND
      );
      await sleep(this.measurementDelayMs);

      const data = Buffer.alloc(2);
      const { bytesRead } = await this.bus.readI2cBlock(
        this.address,
        DISTANCE_REGISTER,
        data.length,
        data
      );
      if (bytesRead !== data.length) {
        throw new SEN0590Error(
          `SEN0590: expected 2 distance bytes, received ${bytesRead}`,
          "SHORT_READ"
        );
      }

      const distanceMm = (data[0] << 8) + data[1] + 10;
      const distanceCm = distanceMm / 10;
      if (distanceCm < this.minCm || distanceCm > this.maxCm) {
        throw new SEN0590Error(
          `SEN0590: reading ${distanceCm.toFixed(1)} cm is outside ${this.minCm}-${this.maxCm} cm`,
          "OUT_OF_RANGE"
        );
      }
      return distanceCm;
    } catch (error) {
      if (error instanceof SEN0590Error) throw error;
      throw new SEN0590Error(
        `SEN0590 I2C read failed at address 0x${this.address.toString(16)}: ${error.message}`,
        "I2C_ERROR"
      );
    }
  }

  async getDistance({ samples = 3, delayMs = 60 } = {}) {
    const readings = [];
    for (let i = 0; i < samples; i += 1) {
      try {
        readings.push(await this.measureOnce());
      } catch (error) {
        // A later sample can still succeed; the error is reported if all fail.
        if (i === samples - 1 && readings.length === 0) throw error;
      }
      if (i < samples - 1) await sleep(delayMs);
    }

    if (readings.length === 0) return null;
    readings.sort((a, b) => a - b);
    const middle = Math.floor(readings.length / 2);
    return readings.length % 2
      ? readings[middle]
      : (readings[middle - 1] + readings[middle]) / 2;
  }

  async close() {
    if (this.bus) {
      await this.bus.close();
      this.bus = null;
    }
  }
}

