// Habbi v6 -savutesti 1: migraatio vanhasta datasta, syksyn ohjelma viikkonäkymässä, salikirjaus
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const INDEX = process.env.HABBI_INDEX || path.join(__dirname, "..", "index.html");
const BACKUP = process.env.HABBI_BACKUP || path.join(__dirname, "..", "treeniappi-historia-kesakuu.json");
const html = fs.readFileSync(INDEX, "utf-8");
const oldBackup = fs.readFileSync(BACKUP, "utf-8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/", pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem("treeniappi_v1", oldBackup);
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
  save, renderWeek, planWeekOf, plannedItems, planWorkout, buildReport,
  setWeek: iso => { weekStart = mondayOf(parseISO(iso)); renderWeek(); }
};`);
const doc = window.document;
const g = window.__g;
const results = [];
function check(name, cond){ results.push((cond ? "PASS" : "FAIL") + " — " + name); if(!cond) process.exitCode = 1; }
function store(){ return JSON.parse(window.localStorage.getItem("treeniappi_v1")); }

// 1. Migraatio
check("Otsikko on Habbi", doc.getElementById("apptitle").textContent.includes("Habbi"));
window.__g.save();
const d = store();
check("23 painokirjausta säilyi", d.weights.length === 23);
check("Tavoite lukittu 75 → 68", d.goal.startKg === 75 && d.goal.goalKg === 68);
check("kcalGoal 1700", d.kcalGoal === 1700);
check("Välilehtiä 4 (ei erillistä Salia)", doc.querySelectorAll("nav.tabs button").length === 4
  && ![...doc.querySelectorAll("nav.tabs button")].some(b => b.dataset.view === "gym"));

// 2. Ohjelman apurit
check("planWeekOf: 27.7. on vko 1", g.planWeekOf("2026-07-27") === 1);
check("planWeekOf: 29.11. on vko 18", g.planWeekOf("2026-11-29") === 18);
check("planWeekOf: 20.12. on vko 21 (jatkettu jouluun)", g.planWeekOf("2026-12-20") === 21);
check("planWeekOf: 26.7. ei ohjelmassa", g.planWeekOf("2026-07-26") === null);
check("planWeekOf: 21.12. ei ohjelmassa", g.planWeekOf("2026-12-21") === null);
// v1 (vk 1–5): ei päiväkohtaista runkoa
check("v1: vk 1 ma ei ohjelmakortteja", g.plannedItems("2026-07-27").length === 0);
// v2 (vk 6–9)
const mon6 = g.plannedItems("2026-08-31");
check("v2 ma vk 6: vain Sali A", mon6.length === 1 && mon6[0].key === "A");
const tue6 = g.plannedItems("2026-09-01");
check("v2 ti vk 6: Ouran intervallit 4 × 3 min", tue6[0].key === "INT" && tue6[0].title.includes("4 × 3 min") && tue6[0].sub.includes("~32 min"));
check("v2 ke vk 6: vain padel", g.plannedItems("2026-09-02").map(i=>i.key).join(",") === "PADEL");
const thu6 = g.plannedItems("2026-09-03");
check("v2 to vk 6: Sali B", thu6.length === 1 && thu6[0].key === "B" && thu6[0].type === "gym");
check("v2 la vk 6: intervallit 2", g.plannedItems("2026-09-05")[0].key === "INT2");
check("v2 pe vk 6: kävelykardio", g.plannedItems("2026-09-04")[0].key === "KAV");
check("v2 su vk 6: jooga", g.plannedItems("2026-09-06")[0].key === "MOB");
const tue9 = g.plannedItems("2026-09-22");
check("v2 ti vk 9 (testiviikko): soututesti", tue9[0].key === "TEST" && tue9[0].title.includes("12 min soututesti"));
check("v2 kevennysviikon to: Sali B kevennyksellä", g.plannedItems("2026-09-24")[0].sub.includes("kevennys"));
check("v2 kevennysviikon la: kevyt lenkki", g.plannedItems("2026-09-26")[0].title.includes("Kevyt lenkki"));
// v3 (vk 10 →)
check("v3 ma vk 10: Sali A", g.plannedItems("2026-09-28").map(i=>i.key).join(",") === "A");
const tue10 = g.plannedItems("2026-09-29");
check("v3 ti vk 10: intervallit sisällä", tue10[0].key === "INT" && tue10[0].sub.includes("sisällä"));
check("v3 ke vk 10: padel", g.plannedItems("2026-09-30").map(i=>i.key).join(",") === "PADEL");
check("v3 to vk 10: puskuripäivä (tyhjä)", g.plannedItems("2026-10-01").length === 0);
check("v3 pe vk 10: kävely", g.plannedItems("2026-10-02").map(i=>i.key).join(",") === "KAV");
const sat10 = g.plannedItems("2026-10-03");
check("v3 la vk 10: Sali B + Intervallit 2", sat10.map(i=>i.key).join(",") === "B,INT2" && sat10[1].title === "Intervallit 2" && sat10[1].sub.includes("juosten"));
check("v3 su vk 10: jooga tai venyttely", g.plannedItems("2026-10-04")[0].key === "MOB");
check("v3 vk 14 ei ole enää kevennys", !g.plannedItems("2026-10-26")[0].sub.includes("kevennys"));
// vk 15 Edinburgh
check("Vk 15 ma: Sali A normaalisti (ei kevennystä)", g.plannedItems("2026-11-02")[0].key === "A" && !g.plannedItems("2026-11-02")[0].sub.includes("kevennys"));
check("Vk 15 ti: intervallit normaalisti", g.plannedItems("2026-11-03")[0].title.includes("4 × 3 min"));
check("Vk 15 ke: matkapäivä, ei padelia", g.plannedItems("2026-11-04").length === 0);
check("Vk 15 to ja la: kävely kaupungilla", g.plannedItems("2026-11-05")[0].cat === "peruskestavyys" && g.plannedItems("2026-11-07")[0].title.includes("Kävely"));
check("Vk 15 la: ei salia", !g.plannedItems("2026-11-07").some(i=>i.type==="gym"));
check("Vk 15 su: venyttely hotellilla", g.plannedItems("2026-11-08")[0].title.includes("Venyttely"));
// vk 19 kevennys, vk 21 testi
check("Vk 19 ma: kevennys", g.plannedItems("2026-11-30")[0].sub.includes("kevennys"));
check("Vk 19 la: kevyt tasavauhti", g.plannedItems("2026-12-05")[1].title.includes("Kevyt tasavauhti"));
check("Vk 21 ti: soututesti", g.plannedItems("2026-12-15")[0].key === "TEST");

// 3. Viikkonäkymä ohjelmaviikolla 6
g.setWeek("2026-08-31");
check("Banneri: Ohjelmaviikko 1/21 · Pohja", doc.getElementById("phasebanner").textContent.includes("Ohjelmaviikko 6/21")
  && doc.getElementById("phasebanner").textContent.includes("Rakennus"));
check("Sali A -kortti maanantaina", doc.getElementById("days").textContent.includes("Sali A"));
check("Ei koiralenkkikortteja", !doc.getElementById("days").textContent.includes("Koiralenkki"));
check("Lihaskunto-chip 0/2", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Lihaskunto") && x.textContent.includes("0/2")));
check("Peruskestävyys-chip 0/2", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Peruskestävyys") && x.textContent.includes("0/2")));

// 4. Pikakuittaus (padel ke + kävely pe)
const padelCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Padel"));
padelCard.querySelector(".check").click();
check("Padel kuittautui dataan", !!g.planWorkout("2026-09-02","PADEL"));
check("Peruskestävyys-chip 1/2", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Peruskestävyys") && x.textContent.includes("1/2")));
const walkCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kävelykardio"));
walkCard.querySelector(".check").click();
check("Peruskestävyys-chip tavoite täynnä", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Peruskestävyys") && x.textContent.includes("tavoite täynnä")));
const walkDone = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kävelykardio"));
check("Kortti näkyy tehtynä", walkDone.classList.contains("done"));
walkDone.querySelector(".check").click();
check("Kuittaus peruutettavissa", !g.planWorkout("2026-09-04","KAV"));
[...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Padel")).querySelector(".check").click();
check("Jooga-kortti sunnuntaina", [...doc.querySelectorAll("#days .wcard")].some(c=>c.textContent.includes("Jooga tai venyttely")));

// 4b. Soututesti vk 9: kortin klikkaus avaa dialogin, tulos näkyy
g.setWeek("2026-09-21");
check("Testiviikon badge näkyy", doc.getElementById("phasebanner").textContent.includes("12 min soututesti"));
const testCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("soututesti"));
testCard.querySelector(".info").click();
check("Testidialogi aukeaa kortista", doc.getElementById("testdlg").open === true);
doc.getElementById("testkm").value = "2450";
doc.getElementById("testsave").click();
check("Testitulos tallentui (2450 m)", g.planWorkout("2026-09-22","TEST") && g.planWorkout("2026-09-22","TEST").note === "2450 m");
check("Tulos näkyy kortissa", [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("soututesti")).textContent.includes("2450 m"));
const tue21 = g.plannedItems("2026-12-15");
check("Vko 21 testi näyttää edellisen tuloksen", tue21[0].key === "TEST" && tue21[0].sub.includes("2450 m"));
g.setWeek("2026-08-31");
check("Raportissa soututestit", g.buildReport().soututestit.length === 1 && g.buildReport().soututestit[0].tulos === "2450 m");

// 4c. Ohjelman kortin muokkaus (kävely → pyörä)
const rowEdit = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kävelykardio"));
rowEdit.querySelector(".info").click();
check("Muokkausdialogi aukeaa kortista", doc.getElementById("plandlg").open === true);
doc.getElementById("planname").value = "Kuntopyörä 45 min";
doc.getElementById("plansave").click();
check("Muokattu nimi näkyy kortissa", [...doc.querySelectorAll("#days .wcard")].some(c=>c.textContent.includes("Kuntopyörä 45 min")));
check("Muokkaus ei kuitannut treeniä (Tehty-valinta pois)", g.planWorkout("2026-09-04","KAV").done === false);
let editCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kuntopyörä 45 min"));
editCard.querySelector(".check").click();
check("Muokattu treeni kuittautuu", g.planWorkout("2026-09-04","KAV").done === true);
check("Peruskestävyys-chip 1/2 muokatulla", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Peruskestävyys") && x.textContent.includes("1/2")));
editCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kuntopyörä 45 min"));
editCard.querySelector(".check").click();
check("Kuittauksen peruminen säilyttää muokkauksen", g.planWorkout("2026-09-04","KAV").done === false);
editCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Kuntopyörä 45 min"));
editCard.querySelector(".info").click();
doc.getElementById("planreset").click();
check("Palauta oletus tuo kävelykardion takaisin", !g.planWorkout("2026-09-04","KAV")
  && [...doc.querySelectorAll("#days .wcard")].some(c=>c.textContent.includes("Kävelykardio")));
check("Välilehtijärjestys Muut–Paino–Viikko–Ruoka", [...doc.querySelectorAll("nav.tabs button")].map(b=>b.dataset.view).join(",") === "more,weight,week,food");

// 5. Salikirjaus viikkonäkymästä
const gymCard = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Sali A"));
gymCard.querySelector(".info").click();
check("Salikirjaus avautui", doc.getElementById("view-log").classList.contains("active"));
check("Wall ball ja tavoite 4 × 12–15 näkyvät", doc.getElementById("logroot").textContent.includes("Wall ball")
  && doc.getElementById("logroot").textContent.includes("3 × 12–15"));
check("Viikko-tab pysyy aktiivisena", [...doc.querySelectorAll("nav.tabs button")].find(b=>b.dataset.view==="week").classList.contains("active"));
check("activeGym tallentui", !!store().activeGym && store().activeGym.planKey === "A");

// Kirjaa sarjat ensimmäiseen liikkeeseen ja valmistu
g.data.activeGym.exercises[0].sets.forEach(s=>{ s.kg = "40"; s.reps = "8"; s.done = true; });
g.save();
const finishBtn = [...doc.querySelectorAll("#logroot button")].find(b=>b.textContent.includes("Treeni valmis"));
finishBtn.click();
check("Palattiin viikkonäkymään", doc.getElementById("view-week").classList.contains("active"));
const d2 = store();
check("Salitreeni historiaan", d2.gymlog.some(x=>x.planKey==="A" && x.date==="2026-08-31"));
check("Sali A kuittautui viikkoon", d2.workouts.some(w=>w.plan==="A" && w.date==="2026-08-31" && w.done));
check("Lihaskunto-chip 1/2", [...doc.querySelectorAll("#summary .goal")].some(x=>x.textContent.includes("Lihaskunto") && x.textContent.includes("1/2")));
const gymCardDone = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Sali A"));
check("Sali A -kortti tehty", gymCardDone.classList.contains("done"));

// 6. Edellisen kerran painot näkyvät seuraavalla kerralla
g.setWeek("2026-09-07");
const gymCardW2 = [...doc.querySelectorAll("#days .wcard")].find(c=>c.textContent.includes("Sali A"));
gymCardW2.querySelector(".info").click();
check("Viimeksi-sarake näyttää 40 kg × 8", doc.getElementById("logroot").textContent.includes("40 kg × 8"));
// hylkää kesken jäänyt
const discardBtn = [...doc.querySelectorAll("#logroot button")].find(b=>b.textContent==="Hylkää");
discardBtn.click();
check("Hylkäys palauttaa viikkoon", doc.getElementById("view-week").classList.contains("active") && !store().activeGym);

// 7. Ohjelman ulkopuolinen viikko
g.setWeek("2027-01-04");
check("Ei banneria ohjelman jälkeen", doc.getElementById("phasebanner").innerHTML === "");
check("Lepopäivät näkyvät", doc.getElementById("days").textContent.includes("Lepopäivä"));

// 8. Vienti
check("Export-nimi habbi-varmuuskopio", js.includes("habbi-varmuuskopio-"));

console.log(results.join("\n"));
console.log(process.exitCode ? "\n>>> VIRHEITÄ" : "\n>>> Kaikki testit läpi");
