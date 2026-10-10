# Suhteellisten saldojen 300 vuoden Monte Carlo -tulokset

V2: sata 300 vuoden historiaa, 30 elossa olevaa ihmistä, siemenet 0–99. Kuolleen tilalle syntyy nollasaldoinen ihminen. Kaupat toteutuvat heti.

| Tarkistus | Tulos |
|---|---:|
| Valmistuneet ajot | 100 / 100 |
| Vuosittaiset havaintorivit | 30 000 |
| Tarkistettuja tapahtumia | 3 747 531 |
| Suurin kirjanpidon täsmäytysero | 0 |
| Hyväksyttyjä välittömiä palvelukauppoja | 1 054 921 |
| Hylättyjä kauppayrityksiä | 278 887 |
| Kuolemia | 10 997 |
| Henkilöiden nettosumma lopussa, pienin–suurin ajo | 162–1312 |
| Yhteisön selvitystili lopussa, pienin–suurin ajo | −1312–−162 |
| Henkilösaldojen itseisarvojen summa lopussa, pienin–suurin ajo | 806–1957 |

**Jokaisessa tarkistetussa tapahtumassa henkilöiden saldot ja yhteisötili summautuivat nollaan.** Tapahtumista erikseen laskettu henkilösaldo, yhteisötili ja siirtoliikevaihto vastasivat moottorin tilaa. Fyysiset palveluvarastot täsmäsivät.

Henkilöiden nettosumma ei kuolemien jälkeen välttämättä ole nolla. Näissä ajoissa se oli lopussa positiivinen, ja yhteisötili täsmälleen vastakkaismerkkinen. Tämä on valitun kuoleman selvityssäännön tulos, ei luotua historiallista velkaa. Yhteisötilin kertymä tarvitsee omaa taloudellista tutkimusta.

Velanluontia, erääntyviä lupauksia ja niiden selvitysvaikeuksia ei ole tässä mekanismissa. Vastaanottorajat ja suostumus voivat yhä estää kaupan. Nollasumman säilyminen ei osoita talouden elinkelpoisuutta, hintojen oikeellisuutta tai rajojen toimivuutta.

Ajo: `python3 -m velkatalous.monte_carlo --runs 100 --years 300 --population 30`. Koneelliset tulokset: `results/monte_carlo/summary.json` ja `annual.csv`. [Koemenetelmä](MONTE_CARLO_300_VUOTTA.md). Kaikki 26 yksikkötestiä läpäisivät. V1- ja v2-ajot käyttävät eri mekanismia ja eri satunnaistapahtumajonoa; niitä ei tulkita kontrolloiduksi talousjärjestelmien paremmuusvertailuksi.
