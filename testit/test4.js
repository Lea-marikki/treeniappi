// Habbi-savutesti 4 (26.9.): ohjelmaversiot, kadonneet kirjaukset, Tehty-valinta, siirtojen tallennus,
// varmuuskopion tuonti, tallennusvirhe, raportti PT-käyttöön
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const INDEX = process.env.HABBI_INDEX || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(INDEX, "utf-8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/", pretendToBeVisual: true });
const { window } = dom;
window.confirm = () => true;
window.alert = () => {};
window.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = () => {};
if (!window.HTMLDialogElement.prototype.showModal) {
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
}
// Vanhan ohjelman (v1) kirjauksia, joita nykyinen runko ei sisällä
const seed = {
  workouts: [
    { id:"a1", date:"2026-07-27", cat:"lihaskunto", title:"Sali A · jalat + työntö", note:"", done:true, plan:"A" },
    { id:"b1", date:"2026-07-29", cat:"lihaskunto", title:"Sali B", note:"", done:true, plan:"B" },
    { id:"c1", date:"2026-08-01", cat:"lihaskunto", title:"Sali C", note:"", done:true, plan:"C" },
    { id:"pk1", date:"2026-07-30", cat:"peruskestavyys", title:"Pyörälenkki", note:"", done:false },
    // tuplakirjaus samalle päivälle (esim. tuonnista)
    { id:"k1", date:"2026-09-04", cat:"peruskestavyys", title:"Kävelykardio 40–60 min", note:"", done:false, plan:"KAV" },
    { id:"k2", date:"2026-09-04", cat:"peruskestavyys", title:"Kävelykardio 40–60 min", note:"työmatka", done:true, plan:"KAV" }
  ],
  weights: [ { date:"2026-09-25", kg:73.4 } ],
  gymlog: [
    { id:"g1", date:"2026-07-27", planKey:"A", name:"Sali A", exercises:[{ name:"Wall ball", note:"raskas", sets:[{kg:4,reps:14},{kg:4,reps:12}] }] },
    { id:"g2", date:"2026-08-07", planKey:"B", name:"Sali B · veto + pakara", exercises:[{ name:"Alatalja", note:"", sets:[{kg:35,reps:12}] }] }
  ],
  meals: [ { id:"m1", date:"2026-09-23", name:"Suklaa", kcal:200, treat:true }, { id:"m2", date:"2026-09-24", name:"Omenapiirakka", kcal:200, treat:true } ],
  moves: [ { id:"mv1", key:"B", origin:"2026-09-24", to:"2026-09-27" } ]
};
window.localStorage.setItem("treeniappi_v1", JSON.stringify(seed));

const js = html.split("<script>")[1].split("</script>")[0];
window.eval(js + `
;window.__g = {
  get data(){ return data; }, set data(v){ data = v; },
  save, renderWeek, renderWeight, renderMore, plannedItems, planWorkout, weekStats, buildReport, applyMove, openDialog, openPlanDialog,
  planMonday, versionOf, fmtISO, addDays,
  setWeek: iso => { weekStart = mondayOf(parseISO(iso)); renderWeek(); }
};`);
const doc = window.document;
const g = window.__g;
const results = [];
function check(name, cond){ results.push((cond ? "PASS" : "FAIL") + " — " + name); if(!cond) process.exitCode = 1; }
function store(){ return JSON.parse(window.localStorage.getItem("treeniappi_v1")); }
const today = g.fmtISO(new Date());

// 1. Ohjelmaversiot
check("27.7. on v1, 31.8. v2, 28.9. v3", g.versionOf("2026-07-27").id==="v1" && g.versionOf("2026-08-31").id==="v2" && g.versionOf("2026-09-28").id==="v3");
const w1 = g.weekStats(g.planMonday(1));
check("Vk 1 tavoitteet v1: lihaskunto 3, PK 1", w1.cats.lihaskunto.tavoite===3 && w1.cats.peruskestavyys.tavoite===1);
check("Vk 1 lihaskunto tehty 3 (A, ke-B, C)", w1.cats.lihaskunto.tehty===3);
check("Tuplakirjaus lasketaan kerran (vk 6 PK)", g.weekStats(g.planMonday(6)).done.filter(d=>d.pvm==="2026-09-04").length===1);
check("Tuplakirjaus siivottu käynnistyksessä, tehty jäi", g.data.workouts.filter(w=>w.date==="2026-09-04" && w.plan==="KAV").length===1
  && g.planWorkout("2026-09-04","KAV").done===true);
const w2 = g.weekStats(g.planMonday(2));
check("Linkittämätön salikirjaus (7.8.) lasketaan", w2.cats.lihaskunto.tehty===1 && w2.done.some(d=>d.lahde==="salikirjaus"));
const w15 = g.weekStats(g.planMonday(15));
check("Vk 15 matkaviikon tavoitteet: sali 1, PK 2", w15.cats.lihaskunto.tavoite===1 && w15.cats.peruskestavyys.tavoite===2);

// 2. Kadonneet kortit näkyvät viikkonäkymässä
g.setWeek("2026-07-27");
const daysTxt = doc.getElementById("days").textContent;
check("Ke-Sali B näkyy vk 1", [...doc.querySelectorAll("#days .day")].find(d=>d.dataset.date==="2026-07-29").textContent.includes("Sali B"));
check("Sali C näkyy vk 1", daysTxt.includes("Sali C"));
check("Banneri kertoo alkuperäisestä ohjelmasta", doc.getElementById("phasebanner").textContent.includes("Alkuperäinen ohjelma"));
check("Lihaskunto-chip vk 1: tavoite täynnä (3/3)", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Lihaskunto") && x.textContent.includes("tavoite täynnä")));
const pkCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Pyörälenkki"));
check("Kuittaamaton oma treeni näkyy 'jäi väliin'", pkCard && pkCard.textContent.includes("jäi väliin"));
pkCard.querySelector(".check").click();
check("Vanhan oman treenin jälkikuittaus tallentuu", store().workouts.find(w=>w.id==="pk1").done===true);

// 3. Tehty-valinta dialogeissa
g.openDialog(today, null);
check("Tälle päivälle lisätty treeni on oletuksena tehty", doc.getElementById("dlgdone").checked===true);
doc.getElementById("dlgname").value = "Pilates 45 min";
doc.getElementById("dlgsave").click();
check("Pilates tallentui tehtynä", store().workouts.some(w=>w.title==="Pilates 45 min" && w.done===true && w.date===today));
const future = g.fmtISO(g.addDays(new Date(), 3));
g.openDialog(future, null);
check("Tulevalle päivälle oletuksena suunniteltu", doc.getElementById("dlgdone").checked===false);
doc.getElementById("dlgcancel").click();
g.openPlanDialog("2026-10-02", g.plannedItems("2026-10-02")[0]);
doc.getElementById("planname").value = "Kävely + kauppa";
doc.getElementById("plandone").checked = true;
doc.getElementById("plansave").click();
check("Ohjelmakortin muokkaus + Tehty tallentuu", store().workouts.some(w=>w.plan==="KAV" && w.date==="2026-10-02" && w.done===true && w.title==="Kävely + kauppa"));

// 4. Siirrot säilyvät ja näkyvät
check("Olemassa oleva siirto (B to → su vk 9) toimii", g.plannedItems("2026-09-27").some(i=>i.key==="B"));
check("Toast näkyy siirrosta", (g.applyMove({ type:"plan", key:"A", origin:"2026-10-05", date:"2026-10-05" }, "2026-10-08"), doc.getElementById("toast").textContent.includes("Siirretty")));
check("Siirto tallessa localStoragessa", store().moves.some(m=>m.key==="A" && m.origin==="2026-10-05" && m.to==="2026-10-08"));

// 5. Varmuuskopio: vienti merkitsee päivän, tuonti palauttaa siirrot
g.renderMore();
check("Varmuuskopiomuistutus näkyy ennen vientiä", doc.getElementById("backupstatus").textContent.includes("Varmuuskopiota ei ole"));
doc.getElementById("exportbtn").click();
check("Viennin jälkeen päivä tallessa", store().lastBackup===today && doc.getElementById("backupstatus").textContent.includes("Edellinen varmuuskopio"));
const backup = JSON.parse(JSON.stringify(g.data));
// Simuloi tietojen menetys: siirrot ja treenit tyhjiksi, sitten tuonti
g.data.moves = []; g.data.workouts = []; g.save();
const file = new window.File([JSON.stringify(backup)], "habbi.json", { type:"application/json" });
const input = doc.getElementById("importfile");
Object.defineProperty(input, "files", { value:[file], configurable:true });
input.dispatchEvent(new window.Event("change"));

setTimeout(()=>{
  check("Tuonti palautti siirrot", store().moves.length===backup.moves.length && store().moves.some(m=>m.key==="B" && m.to==="2026-09-27"));
  check("Tuonti palautti treenit", store().workouts.length===backup.workouts.length);

  // 6. Checkpoint ±0,5 kg
  g.renderWeight();
  check("73,4 kg vk 9 lasketaan tavoitteessa (±0,5)", doc.getElementById("cpcard").textContent.includes("73,4 kg ✓"));

  // 7. Raportti
  const r = g.buildReport();
  check("Raportissa ohjelmaversiot", r.ohjelmaversiot.length===3 && r.ohjelmaversiot[0].tavoitteet.lihaskunto===3);
  check("Raportin vk 1: versio v1, lihaskunto 3/3", r.treeniviikot[0].ohjelmaversio==="v1" && r.treeniviikot[0].treenit.lihaskunto.tehty===3 && r.treeniviikot[0].treenit.lihaskunto.tavoite===3);
  check("Raportin viikoilla tehtyjen lista", r.treeniviikot[0].tehdyt.some(d=>d.nimi==="Sali C"));
  check("Väliin jääneissä myös muut kuin sali", r.treeniviikot.some(w=>(w.valiin||[]).some(m=>m.kategoria!=="lihaskunto")));
  check("Raportissa siirrot", r.siirrot.some(s=>s.alkuperainen==="2026-09-24" && s.siirretty==="2026-09-27"));
  check("Saliliikkeissä kaikki sarjat ja muistiinpano", r.saliliikkeet["Wall ball"][0].sarjat==="4×14, 4×12" && r.saliliikkeet["Wall ball"][0].muistiinpano==="raskas");
  check("Raportin vk 9 herkut 400 kcal", r.treeniviikot[8].herkutKcal===400);
  check("Raportissa kevennykset 4, 9, 15, 19 ja matka", r.kevennysviikot.join(",")==="4,9,15,19" && r.matkat[0].nimi==="Edinburgh");
  check("Raportti ei väitä ohjelman loppuvan 29.11.", !JSON.stringify(r).includes("29.11"));

  // 8. Tallennusvirhe näkyy käyttäjälle
  const orig = window.localStorage.setItem.bind(window.localStorage);
  window.Storage.prototype.setItem = function(){ throw new Error("QuotaExceeded"); };
  const okSave = g.save();
  check("Tallennusvirhe palauttaa false", okSave===false);
  check("Tallennusvirheestä ilmoitus", doc.getElementById("toast").textContent.includes("Tallennus epäonnistui"));

  console.log(results.join("\n"));
  console.log(process.exitCode ? "\n>>> VIRHEITÄ" : "\n>>> Kaikki testit läpi");
}, 200);
