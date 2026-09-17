import { SEN0590 } from "../src/device/sen0590.js";

const sensor = new SEN0590({
  busNumber: Number(process.env.SENSOR_I2C_BUS || 1),
  address: Number(process.env.SENSOR_I2C_ADDRESS || "0x74"),
});

try {
  await sensor.open();
  const distanceCm = await sensor.getDistance();
  console.log(`${distanceCm.toFixed(1)} cm`);
} finally {
  await sensor.close();
}
