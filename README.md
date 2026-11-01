# Pi Feeder

Node.js service for the Raspberry Pi Zero 2 W feeder. It controls the feeder relay, runs schedules, and reports the food distance through its HTTP API.

## SEN0590 laser distance sensor

The HC-SR04 implementation has been replaced with the DFRobot **SEN0590**. This sensor uses I2C (not trigger/echo GPIO), has address `0x74`, and measures 2-400 cm.

### Raspberry Pi Zero 2 W wiring

Power the sensor at **3.3 V** so its I2C pull-ups are safe for the Pi's 3.3 V GPIO. Do not connect the sensor to 5 V while its SDA/SCL lines are directly connected to the Pi.

| SEN0590 wire | Pi physical pin | Pi signal |
| --- | ---: | --- |
| Red - VCC | 1 | 3.3 V |
| Black - GND | 6 | GND |
| Yellow - SCL | 5 | GPIO3 / I2C1 SCL |
| Green - SDA | 3 | GPIO2 / I2C1 SDA |

Enable I2C on the Pi, install the development dependencies needed to build `i2c-bus`, then verify that the sensor appears at `74`:

```sh
sudo raspi-config nonint do_i2c 0
sudo apt update
sudo apt install -y i2c-tools build-essential python3 make g++
sudo reboot

# after the reboot
i2cdetect -y 1
npm ci
```

`i2cdetect -y 1` should show `74`. If it does not, stop and check the four wires before starting the app.

The defaults are I2C bus `1` and address `0x74`. They can be overridden for a nonstandard installation:

```sh
export SENSOR_I2C_BUS=1
export SENSOR_I2C_ADDRESS=0x74
export SENSOR_POLL_INTERVAL_MS=60000
```

Read the sensor directly while troubleshooting:

```sh
npm run sensor:read
```

Start the feeder service:

```sh
npm run dev
```

Distance endpoints:

- `GET /sensor/distance` - latest stable distance in centimetres.
- `GET /sensor/status` - I2C configuration, connection state, and last error.
- `GET /status` - feeder state plus distance-sensor status.

## Other API endpoints

- `POST /feed`
- `GET /schedules`

## Logging

The service logs to two places:

- **systemd journal**: view with `journalctl -u feeder2.service`.
- **Log files**: written to `/home/tianc/v3/pi-feeder/logs/`.

### Log rotation

Log files are rotated by logrotate using `/etc/logrotate.d/pi-feeder`:

```
/home/tianc/v3/pi-feeder/logs/*.log {
    size 5M
    rotate 5
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su tianc tianc
}
```

- Files over 5 MB are rotated, and 5 old copies are kept (compressed).
- `copytruncate` lets the service keep writing without a restart.
- logrotate runs daily via `logrotate.timer`, so size is checked once a day.

If the project folder moves, update the path in this file.

### Verify rotation

```
sudo logrotate -d /etc/logrotate.d/pi-feeder    # dry run
sudo logrotate -f /etc/logrotate.d/pi-feeder    # force a rotation
systemctl list-timers | grep logrotate          # timer is active
grep -i feeder /var/lib/logrotate/status        # last rotation time
```

### Journal size and persistence

Make the journal survive reboots and cap its size:

```
sudo mkdir -p /var/log/journal
sudo nano /etc/systemd/journald.conf     # set SystemMaxUse=100M
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

### Troubleshooting a missed feed

1. Check the logs before rebooting: `journalctl -u feeder2.service --since today`.
2. Look for `Scheduler alive` heartbeats (logged hourly), `Scheduled feed blocked` warnings, and sensor/I2C errors.
3. Check the clock and timezone: `timedatectl` should show `Europe/Ljubljana` and "System clock synchronized: yes".
