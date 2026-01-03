export async function feed(duration) {
  console.log("Feeding for", duration, "ms");
  await new Promise(r => setTimeout(r, duration));
}