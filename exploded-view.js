const scene = document.getElementById("scene");
const replay = document.getElementById("replay");
const toggle = document.getElementById("toggleAssembly");
const state = document.getElementById("stateText");

let exploded = true;

function layoutName() {
  return window.matchMedia("(max-width: 700px)").matches
    ? "vertical"
    : "horizontal";
}

function setState(text) {
  state.textContent = `${text} · ${layoutName()} layout`;
}

function explode() {
  exploded = true;
  scene.classList.add("assembled");
  setState("Separating components");
  toggle.textContent = "Assemble";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scene.classList.remove("assembled");
    });
  });

  setTimeout(() => {
    setState("Exploded view active");
  }, 1450);
}

function assemble() {
  exploded = false;
  scene.classList.add("assembled");
  setState("Assembly collapsed");
  toggle.textContent = "Explode";
}

window.addEventListener(
  "load",
  () => setTimeout(explode, 260),
  { once: true }
);

replay.addEventListener("click", () => {
  scene.classList.add("assembled");
  setState("Resetting assembly");
  setTimeout(explode, 300);
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
