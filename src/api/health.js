export function health(req, res) {
  res.json({
    status: "alive",
    uptime: process.uptime()
  });
}
