🐶 Pi Feeder – Smart Dog Feeder (Raspberry Pi)

Smart automatic dog feeder built with Raspberry Pi, Node.js, and Next.js.
The system controls a motor for dispensing food, provides a web dashboard, and runs automatic feeding schedules with fail-safe offline operation.

⚙️ Features
Automatic feeding schedules
Manual feed from web dashboard
Connection heartbeat monitoring
Offline autonomous mode (fail-safe)
Feeding lock to prevent double feeding
REST API for communication
Tablet-optimized dashboard
🏗️ Architecture

Raspberry Pi

Motor control
Feeding logic
Schedule execution
Local API
State stored in state.json

Web Dashboard

Feeder status
Feed now button
Feeding schedules
Connection status
📡 API Endpoints
GET  /status
POST /feed
GET  /schedules
🛠️ Tech Stack
Raspberry Pi
Node.js / Express
Next.js
Tailwind CSS
REST API
GPIO motor control
🚀 Installation
git clone https://github.com/TianCimerman/pi-feeder
cd pi-feeder
npm install
npm run dev
📄 State File

The feeder stores its state in:

state.json
- lastFeed
- feedsToday
- lastResetDate
- locked
- heartbeat

If connection is lost, the feeder continues running scheduled feedings locally.

👨‍💻 Author

Tian Cimerman
Smart Raspberry Pi Dog Feeder Project
