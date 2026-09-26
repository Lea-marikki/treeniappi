// Habbi v6 -savutesti 2: ateriarunko, herkut, viikkosaldo, painon checkpointit, raportti
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const INDEX = process.env.HABBI_INDEX || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(INDEX, "utf-8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/", pretendToBeVisual: true });
const { window } = dom;
window.confirm = () => true;
window.alert = () => {};

const js = html.split("<script>")[1].split("</script>")[0];
window.eval(js + `
;window.__g = {
  get data(){ return data; },
  save, load, renderFood, renderWeight, fmtISO, addDays, parseISO, mondayOf,
  trendSeries, checkpointActual, buildReport, planMonday
};`);
const doc = window.document;
const g = window.__g;
const results = [];
function check(name, cond){ results.push((cond ? "PASS" : "FAIL") + " — " + name); if(!cond) process.exitCode = 1; }
function store(){ return JSON.parse(window.localStorage.getItem("treeniappi_v1")); }
function iso(offset){ return g.fmtISO(g.addDays(new Date(), offset)); }

// 1. Ateriarunko renderöityy
check("5 ateriariviä rungossa", doc.querySelectorAll("#daycard .slot").length === 5);
check("Aamupala ja iltapala näkyvät", doc.getElementById("daycard").textContent.includes("Aamupala")
  && doc.getElementById("daycard").textContent.includes("Iltapala"));
check("Smoothie-vaihtoehto näkyy kaloreineen", doc.getElementById("daycard").textContent.includes("Marjasmoothie")
  && doc.getElementById("daycard").textContent.includes("355"));
check("Ainesmäärät näkyvät (smoothien resepti)", doc.getElementById("daycard").textContent.includes("2½ dl maitoa")
  && doc.getElementById("daycard").textContent.includes("30 g proteiinijauhetta"));
check("Ainesmäärät näkyvät (kanan määrä)", doc.getElementById("daycard").textContent.includes("130 g kanaa"));

// 2. Vaihtoehdon kuittaus
const smoothieBtn = [...doc.querySelectorAll("#daycard .optbtn")].find(b=>b.textContent.includes("Marjasmoothie"));
smoothieBtn.click();
let meals = store().meals;
check("Smoothie kirjautui slotilla", meals.length===1 && meals[0].slot==="aamupala" && meals[0].kcal===355 && meals[0].date===iso(0));
check("Rivi näkyy kuitattuna", doc.querySelector("#daycard .slotdone").textContent.includes("Marjasmoothie"));
check("Päiväsumma 355 kcal", doc.getElementById("daycard").textContent.includes("355 kcal"));
check("Aamupalan vaihtoehdot piilotettu", ![...doc.querySelectorAll("#daycard .optbtn")].some(b=>b.textContent.includes("Ruisleivät")));

// 3. Oma kirjaus slottiin (muu…)
const lounasSlot = [...doc.querySelectorAll("#daycard .slot")].find(s=>s.textContent.includes("Lounas"));
const muuBtn = [...lounasSlot.querySelectorAll(".optbtn")].find(b=>b.textContent.includes("muu"));
muuBtn.click();
const form = doc.querySelector("#daycard .customform");
check("Oma kirjaus -lomake aukeaa", !!form);
form.querySelector(".cname").value = "työpaikkalounas";
form.querySelector(".ckcal").value = "550";
[...form.querySelectorAll("button")].find(b=>b.textContent==="Kirjaa").click();
meals = store().meals;
check("Oma lounas kirjautui", meals.some(m=>m.slot==="lounas" && m.name==="työpaikkalounas" && m.kcal===550));
check("Summa 905 kcal", doc.getElementById("daycard").textContent.includes("905 kcal"));

// 4. Herkkukirjaus rungon ulkopuolelle
doc.getElementById("mtreat").click();
doc.getElementById("mname").value = "suklaa";
doc.getElementById("mkcal").value = "200";
doc.getElementById("msave").click();
meals = store().meals;
check("Herkku tallentui ilman slottia", meals.some(m=>m.treat===true && !m.slot && m.kcal===200));
check("🍬 näkyy listassa", doc.getElementById("daycard").innerHTML.includes("🍬 suklaa"));
check("Herkkumittari: 200 / 1200 kcal", doc.getElementById("treatmeter").textContent.includes("200 / 1200 kcal"));
check("Vanha herkuton putki poistettu", !doc.getElementById("streakcard").textContent.includes("ilman herkkuja"));

// 5. Kuittauksen poisto
const delBtn = doc.querySelector("#daycard .slotdone .del");
delBtn.click();
meals = store().meals;
check("Aamupala poistui, vaihtoehdot palasivat", !meals.some(m=>m.slot==="aamupala")
  && [...doc.querySelectorAll("#daycard .optbtn")].some(b=>b.textContent.includes("Marjasmoothie")));

// 6. Viikkosaldo: viime viikko täysin kontrolloitu (arki 5×1800 = +500, vkl 2×1900 = +400)
const lastMon = g.addDays(g.mondayOf(new Date()), -7);
for(let i=0;i<7;i++){
  g.data.meals.push({id:"w"+i, date:g.fmtISO(g.addDays(lastMon,i)), name:"ruoka", kcal:(i<5 ? 1800 : 1900), treat:false});
}
g.save(); g.renderFood();
const rule = doc.getElementById("rulecard").textContent;
check("Viikkosaldo-kortti renderöityy", rule.includes("Viikkosaldo"));
check("80/20 poistettu", !rule.includes("80/20"));
check("Viime viikon saldo +900", rule.includes("+900"));
check("Arki +500 ja vkl +400 eritelty", rule.includes("+500") && rule.includes("+400"));
check("Keskiarvot säilyivät", rule.includes("ka 7 pv") && rule.includes("ka 30 pv"));
// Tyhjä päivä lasketaan arviolla ja merkitään
g.data.meals = g.data.meals.filter(m=>m.date!==g.fmtISO(g.addDays(lastMon,2)));
g.save(); g.renderFood();
const rule2 = doc.getElementById("rulecard").textContent;
check("Arviopäivä mukana saldossa (+1600)", rule2.includes("+1600"));
check("Arviopäivä merkitty riville", rule2.includes("1 arviopv"));

// 7. Painon kirjaus ja checkpointit
doc.getElementById("wkg").value = "74,5";
doc.getElementById("wsave").click();
const w = store().weights;
check("Paino tallentui tälle päivälle", w.length===1 && w[0].date===iso(0) && w[0].kg===74.5);
check("Tavoitekortti 75→68 ilman muokkausta", doc.getElementById("goalcard").textContent.includes("75,0 kg")
  && doc.getElementById("goalcard").textContent.includes("68,0 kg")
  && !doc.getElementById("goalcard").textContent.includes("Muokkaa"));
check("4 checkpointia", doc.querySelectorAll("#cpcard .cprow").length === 4);
check("Checkpoint vk 9 pe 25.9.", doc.getElementById("cpcard").textContent.includes("Vko 9 · 25.9."));
check("Viimeinen checkpoint vk 21 pe 18.12. (68 kg)", doc.getElementById("cpcard").textContent.includes("Vko 21 · 18.12.")
  && doc.getElementById("cpcard").textContent.includes("68 kg"));
check("Punnituspäiväohje näkyy", doc.getElementById("view-weight").textContent.includes("perjantaiaamu"));

// 8. checkpointActual-logiikka
const trend = g.trendSeries([{date:"2026-08-20", kg:73.2},{date:"2026-08-21", kg:72.8}]);
const act = g.checkpointActual(g.parseISO("2026-08-21"), trend);
check("Checkpoint poimii punnituksen (73,0)", act !== null && Math.abs(act - 73.0) < 0.01);
const none = g.checkpointActual(g.parseISO("2026-10-30"), trend);
check("Ei punnitusta ikkunassa → null", none === null);

// 9. Raportti
const r = g.buildReport();
check("Raportissa tavoitteet", r.tavoitteet.alkupaino===75 && r.tavoitteet.tavoitepaino===68 && r.tavoitteet.kcalPaivassa===1700);
check("Raportissa 4 checkpointia oikeilla päivillä", r.checkpointit.length===4 && r.checkpointit[0].pvm==="2026-09-25" && r.checkpointit[3].pvm==="2026-12-18");
check("Raportissa painot mukana", Array.isArray(r.painot) && r.painot.length===1);
check("Raportissa saliliikkeet-objekti", typeof r.saliliikkeet === "object");
check("Raportissa ateriat nimineen", Array.isArray(r.ateriat) && r.ateriat.some(m=>m.nimi==="työpaikkalounas" && m.kcal===550));
check("Raportissa herkkumerkintä aterialla", r.ateriat.some(m=>m.herkku===true && m.kcal===200));
check("kcalGoal lukittu 1700:aan", (()=>{ g.data.kcalGoal = 1800; g.save(); return JSON.parse(window.localStorage.getItem("treeniappi_v1")).kcalGoal===1800 && g.load().kcalGoal===1700; })());
check("Jako- ja latausnapit olemassa", !!doc.getElementById("reportshare") && !!doc.getElementById("reportdl"));
check("Leikepöytäkopiointi poistettu", !doc.getElementById("reportcopy"));

// 10. Poistetut asetukset
check("Ei viikkotavoite-steppereitä", !doc.getElementById("targetlist"));
check("Ei kaloritavoitteen muokkausta", !doc.getElementById("kcalgoalinput"));
check("Ei treenipohjien muokkausta", !doc.getElementById("gymroot"));

console.log(results.join("\n"));
console.log(process.exitCode ? "\n>>> VIRHEITÄ" : "\n>>> Kaikki testit läpi");
