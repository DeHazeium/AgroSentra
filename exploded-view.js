const scene = document.getElementById("scene");
const replay = document.getElementById("replay");
const toggle = document.getElementById("toggleAssembly");
const state = document.getElementById("stateText");

let exploded = true;
let settleTimer;
let replayTimer;
let transitionToken = 0;

function layoutName() {
  return window.matchMedia("(max-width: 700px)").matches
    ? "vertical"
    : "horizontal";
}

function setState(text) {
  state.textContent = `${text} · ${layoutName()} layout`;
}

function explode() {
  clearTimeout(settleTimer);
  clearTimeout(replayTimer);
  const token = ++transitionToken;
  exploded = true;
  scene.classList.add("assembled");
  setState("Separating components");
  toggle.textContent = "Assemble";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token === transitionToken) scene.classList.remove("assembled");
    });
  });

  settleTimer = setTimeout(() => {
    setState("Exploded view active");
  }, 1450);
}

function assemble() {
  ++transitionToken;
  clearTimeout(settleTimer);
  clearTimeout(replayTimer);
  exploded = false;
  scene.classList.add("assembled");
  setState("Assembly collapsed");
  toggle.textContent = "Explode";
}

window.addEventListener(
  "load",
  () => { replayTimer = setTimeout(explode, 260); },
  { once: true }
);

replay.addEventListener("click", () => {
  ++transitionToken;
  clearTimeout(settleTimer);
  clearTimeout(replayTimer);
  scene.classList.add("assembled");
  setState("Resetting assembly");
  replayTimer = setTimeout(explode, 300);
});

toggle.addEventListener("click", () => {
  exploded ? assemble() : explode();
});

window.addEventListener("resize", () => {
  if (exploded) {
    setState("Exploded view active");
  } else {
    setState("Assembly collapsed");
  }
});
