// Camera + MediaPipe hand tracking. Landmarks are returned MIRRORED (x -> 1-x), i.e. as the player sees the screen.
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Камера недоступна в этом браузере");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  return { stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
}

export async function createHandTracker(video, onFrame) {
  const { FilesetResolver, HandLandmarker } = await import("/vendor/mediapipe/vision_bundle.mjs");
  const fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe");
  const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/vendor/mediapipe/hand_landmarker.task", delegate },
    runningMode: "VIDEO", numHands: 2,
  });
  let landmarker;
  try { landmarker = await make("GPU"); } catch { landmarker = await make("CPU"); }
  let alive = true, lastTime = -1;
  const loop = () => {
    if (!alive) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      const hands = (res.landmarks ?? []).map((hand) => hand.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
      onFrame(hands, performance.now());
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { stop() { alive = false; landmarker.close(); } };
}
