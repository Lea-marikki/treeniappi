// Habbi-savutesti 3: treenin raahaus/siirto toiselle päivälle (data.moves + applyMove)
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const INDEX = process.env.HABBI_INDEX || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(INDEX, "utf-8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/", pretendToBeVisual: true });
const { window } = dom;
window.confirm = () => true;
window.alert = () => {};
if (!window.HTMLDialogElement.prototype.showModal) {
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
}
const js = html.split("<script>")[1].split("</script>")[0];
window.eval(js + `
;window.__g = {
  get data(){ return data; },
  save, renderWeek, plannedItems, baseItems, planWorkout, applyMove,
  reset(){ data.workouts=[]; data.moves=[]; save(); },
  setWeek: iso => { weekStart = mondayOf(parseISO(iso)); renderWeek(); }
};`);
const doc = window.document;
const g = window.__g;
const results = [];
function check(name, cond){ results.push((cond ? "PASS" : "FAIL") + " — " + name); if(!cond) process.exitCode = 1; }

// v2: torstai 3.9. = ohjelmatreeni Sali B; siirretään sunnuntaille 6.9.
const FRI = "2026-09-03", SAT = "2026-09-06";
g.reset();
check("Lähtötilanne: to on Sali B", g.plannedItems(FRI).some(i=>i.key==="B"));
check("Lähtötilanne: la ei salia", !g.plannedItems(SAT).some(i=>i.type==="gym"));

// Siirrä ohjelmatreeni pe -> la
g.applyMove({ type:"plan", key:"B", origin:FRI, date:FRI }, SAT);
check("Siirron jälkeen: B katosi torstailta", !g.plannedItems(FRI).some(i=>i.key==="B"));
check("Siirron jälkeen: B näkyy lauantaina", g.plannedItems(SAT).some(i=>i.key==="B"));
check("Siirretyn kortin _origin on alkuperäinen pvm", g.plannedItems(SAT).find(i=>i.key==="B")._origin === FRI);
check("moves-tietue tallentui", g.data.moves.length === 1 && g.data.moves[0].to === SAT && g.data.moves[0].origin === FRI);

// Viikkonäkymä renderöi kortin oikealle päivälle
g.setWeek(FRI);
const days = [...doc.querySelectorAll("#days .day")];
const friDay = days.find(d=>d.dataset.date===FRI);
const satDay = days.find(d=>d.dataset.date===SAT);
check("Torstain päiväblokissa ei Sali B -korttia", !friDay.textContent.includes("Sali B"));
check("Lauantain päiväblokissa on Sali B -kortti", satDay.textContent.includes("Sali B"));
check("Kortit ovat raahattavia (draggable-luokka)", doc.querySelectorAll("#days .wcard.draggable").length > 0);

// Siirrä takaisin origin-päivälle -> tietue poistuu
g.applyMove({ type:"plan", key:"B", origin:FRI, date:SAT }, FRI);
check("Takaisin siirto poistaa moves-tietueen", g.data.moves.length === 0);
check("B palasi torstaille", g.plannedItems(FRI).some(i=>i.key==="B"));

// Materialisoidun (kuitatun) treenin siirto vie done-tilan mukanaan
g.reset();
g.data.workouts.push({ id:"x1", date:FRI, cat:"lihaskunto", title:"Sali B", note:"", done:true, plan:"B" });
g.save();
g.applyMove({ type:"plan", key:"B", origin:FRI, date:FRI }, SAT);
check("Materialisoitu workout siirtyi lauantaille", !!g.planWorkout(SAT,"B") && g.planWorkout(SAT,"B").done === true);
check("Materialisoitua ei jää torstaille", !g.planWorkout(FRI,"B"));

// Itse lisätyn (extra) treenin siirto id:n perusteella
g.reset();
g.data.workouts.push({ id:"e1", date:FRI, cat:"peruskestavyys", title:"Koiralenkki", note:"", done:false });
g.save();
g.applyMove({ type:"extra", id:"e1", date:FRI }, SAT);
check("Extra-treeni siirtyi lauantaille", g.data.workouts.find(w=>w.id==="e1").date === SAT);

// Sama päivä = ei muutosta
g.reset();
const before = JSON.stringify(g.data.moves);
g.applyMove({ type:"plan", key:"B", origin:FRI, date:FRI }, FRI);
check("Pudotus samalle päivälle ei tee siirtoa", JSON.stringify(g.data.moves) === before);

// Siirto päivälle, jolla on jo sama treeni, estetään (kortti ei katoa)
g.reset();
const MON1 = "2026-09-28", MON2 = "2026-10-05";
const ok = g.applyMove({ type:"plan", key:"A", origin:MON1, date:MON1 }, MON2);
check("Päällekkäinen siirto estetty", ok === false && g.data.moves.length === 0);
check("Sali A näkyy yhä molempina maanantaina", g.plannedItems(MON1).some(i=>i.key==="A") && g.plannedItems(MON2).some(i=>i.key==="A"));
// v3: Sali B lauantaina → sunnuntaille ok
g.reset();
check("v3 B la → su onnistuu", g.applyMove({ type:"plan", key:"B", origin:"2026-10-03", date:"2026-10-03" }, "2026-10-04") === true
  && g.plannedItems("2026-10-04").some(i=>i.key==="B"));
check("Siirto tallentui localStorageen", JSON.parse(window.localStorage.getItem("treeniappi_v1")).moves.some(m=>m.key==="B" && m.to==="2026-10-04"));

console.log(results.join("\n"));
console.log(process.exitCode ? "\n>>> VIRHEITÄ" : "\n>>> Kaikki testit läpi");
