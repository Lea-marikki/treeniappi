// Habbi-savutesti 5 (10.11.): v4 joustoviikko, pikavalinnat, vapaa sali, joulu, uudet välitavoitteet
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
const seed = {
  workouts: [
    // v3:n maanantain Sali A 9.11. ei saa enää näkyä väliin jääneenä
    { id:"t1", date:"2026-10-28", cat:"lihaskunto", title:"Koko kehon kahvakuula", note:"", done:true }
  ],
  weights: [ { date:"2026-10-30", kg:72 }, { date:"2026-11-10", kg:71.8 } ],
  gymlog: [
    { id:"g1", date:"2026-10-10", planKey:"B", name:"Sali B · veto + pakara", exercises:[{ name:"Ylätalja", note:"Leveä", sets:[{kg:42.5,reps:10},{kg:42.5,reps:10},{kg:42.5,reps:9}] }] }
  ],
  meals: [], moves: []
};
window.localStorage.setItem("treeniappi_v1", JSON.stringify(seed));
const js = html.split("<script>")[1].split("</script>")[0];
window.eval(js + `
;window.__g = {
  get data(){ return data; },
  renderWeek, renderWeight, plannedItems, weekStats, weekTargets, buildReport, openDialog, versionOf, planWeekOf, planMonday, fmtISO,
  setWeek: iso => { weekStart = mondayOf(parseISO(iso)); renderWeek(); }
};`);
const doc = window.document;
const g = window.__g;
const results = [];
function check(name, cond){ results.push((cond ? "PASS" : "FAIL") + " — " + name); if(!cond) process.exitCode = 1; }
const keys = d => g.plannedItems(d).map(i=>i.key).join(",");

// 1. Versiot ja runko
check("8.11. v3, 9.11. v4, 31.1.2027 v4", g.versionOf("2026-11-08").id==="v3" && g.versionOf("2026-11-09").id==="v4" && g.versionOf("2027-01-31").id==="v4");
check("Ohjelma kestää vk 27 asti (31.1.2027)", g.planWeekOf("2027-01-31")===27 && g.planWeekOf("2027-02-01")===null);
check("Vk 16 ma–to ja la: ei kortteja", ["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-14"].every(d=>keys(d)===""));
check("Vk 16 pe: Spinning 7:00", keys("2026-11-13")==="SPIN");
check("Vk 16 su: koko kropan sali", keys("2026-11-15")==="S" && g.plannedItems("2026-11-15")[0].type==="gym");
check("Vk 16 tavoitteet: lk 2, int 1, liik 1, PK 0", JSON.stringify(g.weekTargets(16))===JSON.stringify({intervalli:1,lihaskunto:2,liikkuvuus:1,peruskestavyys:0}));
check("Vk 21 pe: soututesti spinningin tilalla", keys("2026-12-18")==="TEST");
check("Vk 22 joulu: 24.–27.12. ei kortteja, su sali poissa", keys("2026-12-25")==="" && keys("2026-12-27")==="");
check("Vk 22 tavoite: lihaskunto 1", g.weekTargets(22).lihaskunto===1 && g.weekTargets(22).intervalli===0);
check("Vk 23 su: sali taas", keys("2027-01-03")==="S");

// 2. Viikkonäkymä
g.setWeek("2026-11-09");
const banner = doc.getElementById("phasebanner").textContent;
check("Banneri: 16/27 · Jousto + joustoviikko-ohje", banner.includes("Ohjelmaviikko 16/27") && banner.includes("Jousto") && banner.includes("Minimi: su sali + 1 muu"));
check("Banneri: 68 kg 29.1.2027", banner.includes("29.1.2027"));
check("Ei peruskestävyys-chipiä kun 0 kirjattu", ![...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Peruskestävyys")));
check("Vapaa päivä -teksti", doc.getElementById("days").textContent.includes("Vapaa päivä"));
check("Ei väliin jääneitä vk 16 (ma Sali A poistunut)", g.weekStats(g.planMonday(16)).missed.length===0);

// 3. Pikavalinta: lihaskuntatunti
g.openDialog("2026-11-10", null);
const presets = [...doc.querySelectorAll("#presetpick button")];
check("4 pikavalintaa", presets.length===4 && presets[0].textContent.includes("Lihaskuntatunti"));
check("Oletuskategoria lihaskunto + liikenappi näkyy", doc.querySelector("#catpick .sel").textContent.includes("Lihaskunto") && doc.getElementById("dlggym").style.display==="block");
presets[1].click(); // spinning
check("Spinning → intervalli, liikenappi piiloon", doc.querySelector("#catpick .sel").textContent.includes("Intervalli") && doc.getElementById("dlggym").style.display==="none");
presets[0].click(); // lihaskuntatunti
doc.getElementById("dlgsave").click();
const lk = g.data.workouts.find(w=>w.date==="2026-11-10" && w.title==="Lihaskuntatunti");
check("Lihaskuntatunti tallentui tehtynä", lk && lk.done && lk.cat==="lihaskunto");
check("Lihaskunto 1/2", g.weekStats(g.planMonday(16)).cats.lihaskunto.tehty===1);

// 4. Vapaa sali liikkeineen
g.openDialog("2026-11-11", null);
[...doc.querySelectorAll("#presetpick button")][2].click();
doc.getElementById("dlggym").click();
check("Vapaa sali aukesi kirjaukseen", g.data.activeGym && g.data.activeGym.free && g.data.activeGym.name==="Vapaa sali");
doc.getElementById("newexname").value = "Ylätalja";
doc.getElementById("newexadd").click();
check("Liike lisätty, sarjamäärä edelliseltä kerralta (3)", g.data.activeGym.exercises.length===1 && g.data.activeGym.exercises[0].sets.length===3);
check("Datalistassa tunnetut liikkeet", doc.querySelectorAll("#exnames option").length > 5);
const sdone = doc.querySelector("#logroot .sdone");
sdone.click(); // täyttyy edellisellä 42,5 × 10
[...doc.querySelectorAll("#logroot .btn")].find(b=>b.textContent.includes("Treeni valmis")).click();
check("Vapaa sali tallentui saliloki + treeni", g.data.gymlog.some(x=>x.date==="2026-11-11" && x.planKey===null) && g.data.workouts.some(w=>w.date==="2026-11-11" && w.title==="Vapaa sali" && w.done));
const st = g.weekStats(g.planMonday(16));
check("Vapaa sali lasketaan kerran → lihaskunto 2/2", st.cats.lihaskunto.tehty===2);

// 5. Välitavoitteet ja raportti
g.renderWeight();
const cps = [...doc.querySelectorAll("#cpcard .cprow")].map(r=>r.textContent);
check("Välitavoitteet: vk 18 71, vk 21 70, vk 27 68", cps.length===5 && cps[2].includes("71") && cps[3].includes("70") && cps[4].includes("Vko 27") && cps[4].includes("68"));
const r = g.buildReport();
check("Raportti: v4 mukana ja ohjelma 31.1.2027", r.ohjelmaversiot.at(-1).versio==="v4" && r.ohjelma.includes("31.1.2027"));
check("Raportti: vk 16 tehdyt 2", r.treeniviikot.find(w=>w.vko===16).tehdyt.length===2);

console.log(results.join("\n"));
console.log(process.exitCode ? "\n>>> VIRHEITÄ" : "\n>>> Kaikki testit läpi");
