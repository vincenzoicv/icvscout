import * as THREE from "three";

const canvas = document.getElementById("matchHubLineupCanvas");
const stage = document.getElementById("matchHubLineupStage");
const fallback = document.getElementById("matchHubLineup2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let renderer;
let scene;
let camera;
let playerRoot;
let currentFormation;
let currentSignature = "";
let animationFrame = 0;
let introStartedAt = 0;
let dragging = false;
let pointerStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
let yaw = 0;
let pitch = 0;
let projectedLabels = [];
const labelLayer = document.createElement("div");
labelLayer.className = "lineup-label-layer";
labelLayer.setAttribute("aria-hidden", "true");
stage?.appendChild(labelLayer);

function makePitchTexture() {
  const surface = document.createElement("canvas");
  surface.width = 640;
  surface.height = 960;
  const ctx = surface.getContext("2d");
  if (!ctx) return null;
  const stripeHeight = surface.height / 12;
  for (let row = 0; row < 12; row += 1) {
    ctx.fillStyle = row % 2 ? "#154f40" : "#195647";
    ctx.fillRect(0, row * stripeHeight, surface.width, stripeHeight + 1);
  }
  ctx.strokeStyle = "rgba(238,246,236,.9)";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, surface.width - 44, surface.height - 44);
  ctx.beginPath();
  ctx.moveTo(22, surface.height / 2);
  ctx.lineTo(surface.width - 22, surface.height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(surface.width / 2, surface.height / 2, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(surface.width / 2, surface.height / 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(238,246,236,.9)";
  ctx.fill();
  [22, surface.height - 22].forEach((goalLine, index) => {
    const direction = index ? -1 : 1;
    ctx.strokeRect(155, goalLine, 330, direction * 155);
    ctx.strokeRect(235, goalLine, 170, direction * 65);
    ctx.beginPath();
    ctx.arc(surface.width / 2, goalLine + direction * 105, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  return texture;
}

function makePlayer(player) {
  const group = new THREE.Group();
  const goalkeeper = player === currentFormation.players.reduce((a, b) => Number(a.z) > Number(b.z) ? a : b);
  const shape = new THREE.Shape();
  const contour = [[-.36,-.5],[.36,-.5],[.36,.18],[.57,.05],[.73,.37],[.3,.62],[.15,.62],[0,.49],[-.15,.62],[-.3,.62],[-.73,.37],[-.57,.05],[-.36,.18]];
  contour.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
  shape.closePath();
  const shirt = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025}),new THREE.MeshStandardMaterial({color:goalkeeper ? 0x46c8b2 : 0xf5f5f2,roughness:.65}));
  shirt.position.y = .85;
  shirt.castShadow = true;
  group.add(shirt);
  if (!goalkeeper) [-.23,0,.23].forEach(x => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.115,.86,.025),new THREE.MeshStandardMaterial({color:0x151719,roughness:.7}));
    stripe.position.set(x,.79,.15);
    group.add(stripe);
  });
  const marker = document.createElement("span");
  marker.className = "lineup-projected-label";
  marker.textContent = player.name;
  labelLayer.appendChild(marker);
  projectedLabels.push({marker,player});
  group.position.set(Number(player.x) || 0, 0, Number(player.z) || 0);
  return group;
}

function setCamera() {
  const distance = Math.max(28, 22 / Math.max(.5, camera.aspect)) + Math.abs(yaw) * 8;
  const radius = distance * .5;
  camera.position.set(Math.sin(yaw) * radius, distance * .866 + pitch * 4, Math.cos(yaw) * radius);
  camera.lookAt(0, 0, 0);
}

function resize() {
  if (!renderer || !canvas) return false;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width === width && canvas.height === height) return false;
  renderer.setSize(width, height, false);
  camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  camera.updateProjectionMatrix();
  return true;
}

function draw() {
  if (!renderer || !scene || !camera || stage.hidden) return;
  resize();
  setCamera();
  renderer.render(scene, camera);
  projectedLabels.forEach(({marker,player}) => {
    const point = new THREE.Vector3(Number(player.x)||0,.1,Number(player.z)||0).project(camera);
    marker.style.left = `${(point.x + 1) * 50}%`;
    marker.style.top = `${(1 - point.y) * 50}%`;
  });
  projectedLabels.forEach(({marker,player}) => {
    const left = parseFloat(marker.style.left);
    const neighbors = projectedLabels.filter(item => item.marker !== marker && Math.abs(Number(item.player.z) - Number(player.z)) < .8);
    const gap = neighbors.length ? Math.min(...neighbors.map(item => Math.abs(parseFloat(item.marker.style.left) - left))) * canvas.clientWidth / 100 : 130;
    marker.style.width = `${Math.min(120,canvas.clientWidth * .22,gap * .88)}px`;
  });
}

function animateIntro(time) {
  if (!introStartedAt) introStartedAt = time;
  const progress = Math.min(1, (time - introStartedAt) / 950);
  const eased = 1 - Math.pow(1 - progress, 3);
  yaw = .18 * (1 - eased);
  draw();
  if (progress < 1) animationFrame = requestAnimationFrame(animateIntro);
}

function buildScene(formation) {
  if (!canvas || !stage) return false;
  if (!renderer) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      setView("2d");
      return false;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101917);
  camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
  scene.add(new THREE.HemisphereLight(0xeef5ed, 0x10251a, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-5, 13, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  const pitchMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(10.8, 16.2),
    new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: .88, metalness: 0 })
  );
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(11.25, .28, 16.65),
    new THREE.MeshStandardMaterial({ color: 0x080a09, roughness: .7, metalness: .2 })
  );
  base.position.y = -.18;
  base.receiveShadow = true;
  scene.add(base);

  playerRoot = new THREE.Group();
  labelLayer.replaceChildren();
  projectedLabels = [];
  formation.players.forEach((player) => playerRoot.add(makePlayer(player)));
  scene.add(playerRoot);
  yaw = 0;
  pitch = 0;
  setCamera();
  draw();
  cancelAnimationFrame(animationFrame);
  introStartedAt = 0;
  if (!reduceMotion.matches) animationFrame = requestAnimationFrame(animateIntro);
  return true;
}

function disposeScene() {
  if (!scene) return;
  scene.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}

function renderFallback(formation) {
  if (!fallback) return;
  fallback.replaceChildren();
  const pitchSurface = makePitchTexture();
  fallback.style.backgroundImage = `url(${pitchSurface.image.toDataURL()})`;
  pitchSurface.dispose();
  const goalkeeper = formation.players.reduce((a,b) => Number(a.z) > Number(b.z) ? a : b);
  formation.players.forEach((player) => {
    const marker = document.createElement("span");
    marker.className = "lineup-2d-player";
    marker.style.left = `${50 + (Number(player.x) || 0) * 8.4}%`;
    marker.style.top = `${50 + (Number(player.z) || 0) * 5.45}%`;
    const shirt = document.createElement("i");
    shirt.className = player === goalkeeper ? "lineup-shirt is-goalkeeper" : "lineup-shirt";
    const name = document.createElement("b");
    name.textContent = player.name;
    marker.append(shirt,name);
    fallback.appendChild(marker);
  });
}

function render(formation) {
  if (!formation || !Array.isArray(formation.players) || formation.players.length !== 11) return;
  currentFormation = formation;
  renderFallback(formation);
  const signature = JSON.stringify(formation);
  if (signature === currentSignature && renderer) {
    draw();
    return;
  }
  currentSignature = signature;
  disposeScene();
  buildScene(formation);
}

function setView(mode) {
  if (!stage) return;
  const use2d = mode === "2d" || (!renderer && mode !== "graphic");
  const useGraphic = mode === "graphic";
  if (use2d || useGraphic) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  stage.classList.toggle("is-2d", use2d);
  stage.classList.toggle("is-graphic", useGraphic);
  document.querySelectorAll("[data-lineup-view]").forEach((button) => {
    const active = button.dataset.lineupView === (useGraphic ? "graphic" : use2d ? "2d" : "3d");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!use2d && !useGraphic) draw();
}

document.querySelectorAll("[data-lineup-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.lineupView));
});

canvas?.addEventListener("pointerdown", (event) => {
  cancelAnimationFrame(animationFrame);
  dragging = true;
  pointerStart = { x: event.clientX, y: event.clientY, yaw, pitch };
  canvas.setPointerCapture(event.pointerId);
});
canvas?.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  yaw = Math.max(-.48, Math.min(.48, pointerStart.yaw + (event.clientX - pointerStart.x) * .0035));
  pitch = Math.max(-.2, Math.min(.55, pointerStart.pitch + (pointerStart.y - event.clientY) * .003));
  draw();
});
canvas?.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});
canvas?.addEventListener("pointercancel", () => { dragging = false; });
window.addEventListener("resize", draw, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentFormation) draw();
});
const stopIntroForReducedMotion = (event) => {
  if (!event.matches || !animationFrame) return;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
};
if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", stopIntroForReducedMotion);
else reduceMotion.addListener(stopIntroForReducedMotion);

window.ICVLineupPitch = { render, setView };
if (window.ICV_LINEUP_DATA) render(window.ICV_LINEUP_DATA);
