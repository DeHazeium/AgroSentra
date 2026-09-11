const scene=document.getElementById('scene');
const replay=document.getElementById('replay');
const toggle=document.getElementById('toggleAssembly');
const state=document.getElementById('stateText');
let exploded=true;

function explode(){
  exploded=true;
  scene.classList.add('assembled');
  state.textContent='Separating components';
  toggle.textContent='Assemble';
  requestAnimationFrame(()=>requestAnimationFrame(()=>scene.classList.remove('assembled')));
  setTimeout(()=>{state.textContent='Exploded view active';},1450);
}
function assemble(){
  exploded=false;
  scene.classList.add('assembled');
  state.textContent='Assembly collapsed';
  toggle.textContent='Explode';
}
window.addEventListener('load',()=>setTimeout(explode,260),{once:true});
replay.addEventListener('click',()=>{scene.classList.add('assembled');setTimeout(explode,300)});
toggle.addEventListener('click',()=>{exploded?assemble():explode()});
