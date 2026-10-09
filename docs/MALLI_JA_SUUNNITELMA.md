# Velkatalous: johdonmukaisuusauditointi ja tutkimussuunnitelma

Ensisijainen mallilähde on ../VELKATALOUS_CONTEXT.md (2026-10-09). Sana **vahvistettu** tarkoittaa käyttäjän päättämää protokollasääntöä, ei empiirisesti vahvistettua taloustieteellistä väitettä. Tämä prototyyppi on mekanismikoe, ei kalibroitu ennuste järjestelmän toimivuudesta.

## 1. Sisäinen johdonmukaisuus ennen käyttäytymismallia

**Saldojen algebra on johdonmukainen ehdollisesti.** Tavallisessa myynnissä myyjä A luovuttaa velkaa ostajalle B: ΔD_A = −x, ΔD_B = x; tarvitaan D_A ≥ x. Ostaja saa sekä tavaran että velkarasituksen. Siirto säilyttää W = Σ_alive D_i. Syntymä tuottaa nollasaldon. Kuolema poistaa henkilön senhetkisen saldon. Sitoumuksen erääntymisen kokeessa a = min(D_A,x), m = x−a, ΔW = m. Siten W_t = W_0 + C_t − E_t. Moottori aloittaa W_0 = 0 eikä salli piilotettuja alkusaldoinjektioita.

**Nollasta ei synny velkaa siirroilla.** Jos W_0 = 0 eikä luontia sallita, W pysyy nollassa. Ilmaiset hyödykeluovutukset ja fyysinen tuotanto ovat silti mahdollisia. Nollavelkainen talous ei siis tarkoita fyysisesti tyhjää taloutta.

**Velan vastapuoli on osallistujayhteisö kollektiivisesti.** Käyttäjän täsmennyksen mukaan henkilö on velkaa ajatuksellisesti koko ihmiskunnalle ja järjestelmän määritelmän mukaan sen osallistujille. Aiempi tulkinta vastapuolen puuttumisesta oli virheellinen. Henkilöllä on velkasaldo D_i ja yhteisöllä sitä vastaava kollektiivinen saaminen. Tämä ei luo yksittäisille osallistujille positiivisia saamissaldoja.

SFC-esityksessä voidaan kuvata henkilöiden velkapositiot −D_i ja yhteisön kollektiivinen vastapositio +W, missä W = Σ_alive D_i. Tavallisessa siirrossa yhteisön saamisen määrä säilyy ja velan kantaja vaihtuu. Kokeellinen velanluonti kasvattaa molempia puolia; kuoleman aiheuttama velan poistuma pienentää molempia. Yhteisöpositio antaa vastakirjaukselle taloudellisen tulkinnan pelkän teknisen täsmäytyksen sijaan. Sitä ei jaeta henkilöiden käytettävissä oleviksi W/N-saamisiksi eikä siitä oleteta syntyvän automaattisia henkilökohtaisia maksuvaatimuksia. Täydellinen sektoritase edellyttää vielä yhteisön institutionaalisen esityksen, oikeuksien käyttämisen sekä reaalipääoman omistuksen ja arvostuksen täsmennystä. Vastapuolen identiteetti ei ole enää avoin kysymys.

**Velansiirto jakaa yhteiseen tuotantoperintöön liittyvää velkavastuuta hyötyjille.** Mallin käsitteellinen lähtökohta on hyödykkeiden rakentuminen vuosituhansien yhteiselle työlle, tiedolle ja tuotannon edellytyksille. Käyttäjän mukaan yksittäisen valmistajan panos on tähän kokonaisuuteen verrattuna käytännössä olematon. Luovutettu työ tai hyödyke antaa vastaanottajalle hyötyä, ja tämä ottaa samalla sovitun osan luovuttajan yhteisövelasta kannettavakseen. Tämä kuvaa myös välipanosten vastaanottoa. Historiallinen lähtökohta ei yksin määrää velkahintaa eikä tarkoita nykyisen työpanoksen asettamista fyysisessä tuotantoreseptissä nollaksi. Syntymän nollavelkasääntö säilyy: yhteinen tuotantoperintö ei itsessään kirjaa henkilölle alkuvelkaa.

**Saldoidentiteetti ei takaa talouden kestävyyttä.** Velan kierto riippuu siitä, että muut haluavat ottaa tavaran ja velan vastaan. Kyky tuottaa ei ole sama kuin tuleva myynti tai velansiirtokyky. Kaikkien kyky siirtää velkaa riippuu muiden vastaanottokyvystä; elinikäennusteiden summa ei takaa kollektiivista selvitystä. Nollavelkainen myyjä voi menettää mahdollisuuden välittömään maksulliseen myyntiin; luontisääntö muuttaa tämän rajoitteen. Velattomuus ei ole mallin tavoite.

**Velkarajan lasku ei oikeuta velan hävittämiseen.** D tai D + varaukset voi ylittää uuden ennusterajan. Uudet vastaanotot estetään, olemassa oleva saldo säilyy. Prototyypissä myös erääntyminen odottaa, jos kaikki avoimet vastaanottovaraukset eivät enää mahdu rajaan. Tämä voi lukita sopimuksia pitkäksi aikaa; se on testattava valinta, ei ratkaisu maksukyvyttömyyteen.

**Kuoleman ja yrityksen sulkemisen ero on olennainen.** Yrityksen lopettamisesta ei saa tehdä velanpoistokeinoa. Ensimmäisen kokeen tuotantoyksiköt ovat henkilöiden toimintoja omalla velkatilillä, eivät juridisia yhtiöitä. Moottori kieltää yrityksen käsittelyn henkilön kuolemana.

**Reaalivirrat eivät säily hyödykelajeittain ilman muunnostilejä.** Puusta syntyy laatikoita, ruoka kulutetaan ja työaika kuluu. Kullekin hyödykelajille g tarkistetaan Q_g = Q_g,0 + tuotettu_g − panoskäyttö_g − kulutettu_g − tuhottu_g. Tämä varastokirjanpito ei ole materiaalimassojen tai energian säilymislaki; niiden tutkimiseen tarvitaan omat yksiköt ja muunnoskertoimet.

## 2. Vahvistetut säännöt ja kokeelliset valinnat

| Asia | Käyttäjän vahvistama | Ensimmäisen kokeen hypoteesi / rajaus |
|---|---|---|
| Velan vastapuoli | Osallistujayhteisö kollektiivisesti | Yhteisön vastapositio +W; ei henkilökohtaisia saamisosuuksia |
| Henkilösaldo | D ≥ 0, syntymässä nolla | Kokonaislukuyksiköt, ei pyöristysvirheitä |
| Vaihto | Myyjä luovuttaa velkaa ostajalle; ilmainen luovutus sallittu | Kiinteä velkahinta, ei markkinahinnan muodostusta |
| Tavallinen siirto | Säilyttää kokonaisvelan, tarvitsee myyjän katteen | Ostajan suostumus annetaan eksplisiittisesti API:ssa |
| Velan luonti | Ei lopullista sääntöä | Erääntyvän lupauksen puuttuva kate luodaan ostajalle; voidaan kytkeä pois |
| Rajat | Vastaanotto perustuu arvioituun jäljellä olevan eliniän siirtokykyyn | 0,5 × jäljellä oleva horisontti × arvioitu siirtovauhti × kerroin |
| Varaukset | Avoin kysymys | Koko tuleva vastaanotto varataan sopimuksessa; myyjän saldoa ei varata |
| Toimitus | Avoin kysymys | Tavara nyt, velka yhden jakson päästä; ostaja hyväksyy molemmat |
| Selvitys | Avoin kysymys | FIFO, täysi suoritus tai odotus; ei osasuoritusta, uudistusta tai jälleenmyyntiä |
| Kuolema | Poistaa henkilön velan | Avoimet lupaukset perutaan ilman palautusta; tavaravarasto tuhotaan, ei perintöä |
| Yritykset | Identiteetti ja päättyminen avoimia | Henkilöomistajien tuotantoyksiköt; yhtiön kuolema hylätään |
| Julkiset palvelut | Velansiirto väestölle mahdollinen | Ei ensimmäisessä kokeessa |
| Agentin päämäärä | Ei moraalista mittaria eikä nollavelkatavoitetta | Kulutustavoitteet ja vapaa-ajan valinta; ei säästö- tai varallisuusoptimointia |

## 3. Ensimmäinen testattava ABM

`ledger.py` vastaa identiteeteistä, velasta, sopimuksista ja täsmäytyksistä. `physical.py` vastaa resepteistä ja kulutuksesta eikä muuta velkaa. `policies.py` sisältää kokeellisen ennusterajan. `simulation.py` järjestää agenttien päätökset, markkinakohtaamiset ja ajan. Kirjanpidon ydin ei tunne kulutustoiveita tai tuotantoteknologiaa.

Yhdeksän työntekijää tarjoaa 1–3 työtuntia jaksossa oman kulutus-/vapaa-aikatyypin mukaan. Kolme henkilöomistajaa harjoittaa ruokatuotantoa, puunhankintaa ja laatikkotuotantoa. Työntekijä luovuttaa työn mukana velkaa työn tilaajalle. Tilaaja vastaanottaa työn ja voi luovuttaa velkaa tuotteiden mukana. Työn myynti on palvelusopimus, ei positiivisen palkkarahan maksu.

Leontief-reseptit ovat 1 resurssi + 1 työtunti → 2 ruokaa; 1 resurssi + 1 työtunti → 1 puu; 1 puu + 1 työtunti → 1 laatikko. Kapasiteetti on enintään kuusi erää / tuotantoyksikkö / jakso. Alkuresurssit ovat äärellisiä ja eksplisiittisiä; resurssikantaan ei tule ilmaista täydennystä. Työtä voi tarjota vain asetetun tuntirajan verran ja käyttämätön työ vanhenee jakson lopussa. Nämä kertoimet ovat demon parametreja, eivät aineistosta arvioituja teknologioita.

Agentti tavoittelee oman tyyppinsä mukaista ruokamäärää ja satunnaisesti laatikkoa. Se hyväksyy tarjotun kiinteän velkahinnan, jos tavaraa ja vastaanottorajaa on. Tuottaja tavoittelee kapasiteetin mukaista toimintaa. Omistajan omaa tuotetta saa kuluttaa ilman velansiirtoa. Päätössääntö on rajallisesti rationaalinen määrätavoite, ei hyvinvointioptimi. Malli ei ratkaise työn tarjonnan ja kulutustoiveen yhteistä optimointia; tyyppien yhteys on eksplisiittinen koeparametri. Kulutus voi perustella velan vastaanoton, tuotanto toimintaa, eikä D:n pienuus tuota hyötyä itsessään.

Rajaennuste käyttää viiden jakson toteutunutta tavallista velansiirtomäärää ja yhtä priorihavaintoa. Uuden velan luontia ei lasketa osoitetuksi siirtokyvyksi. Horisontti on satunnainen 40–80 jakson ennuste, ei tiedossa oleva biologinen kuolinaika. Erillinen satunnainen kuolleisuus stressaa ennustevirhettä; perusajossa ei ole kuolemia. Ennuste voi muodostaa itseään vahvistavan kierteen: pienempi raja → vähemmän kauppoja → pienempi mitattu kyky. Priorin, turvakertoimen, ikähorisontin ja markkinajärjestyksen herkkyys on tutkittava.

Jakso: päivitä rajat → selvitä erääntyvät sopimukset → tarjoa työ → tuota ruokaa ja puuta → toimita puu → tuota laatikoita → satunnaista kuluttajien järjestys → kaupat ja kulutus → työn vanheneminen ja mahdolliset kuolemat → mittarit. Järjestys suosii samassa jaksossa käyttöön saatavia panoksia; vaihtoehtoinen kaikki toimitukset seuraavassa jaksossa on vertailtava.

Mittarit ja tapahtumaloki tallennetaan JSONiin. Velan luonti, poistuma, tuotanto ja kulutus ovat kumulatiivisia; `transfer_volume`, työtunnit, toteutumaton kysyntä ja hylätyt kaupat ovat jakson virtoja. Luontia ei lasketa siirtoliikevaihtoon. `debt_velocity` käyttää jakson alku- ja loppuvelan keskiarvoa; se on karkea approksimaatio, ei jatkuva-aikainen keskiarvo. Nollanimittäjällä arvo on `null`. Työtunnit tarkoittavat onnistuneesti toimitettua työtä, eivät välttämättä tuotannossa käytettyä työtä. Avoimien lupausten velka ei sisälly D:hen; se näkyy erikseen varauksena.

## 4. Toteutuksen vaiheet ja hyväksymiskriteerit

1. **Nyt toteutettu:** deterministinen velkamoottori, suostumus, vastaanottovaraukset, erääntymiskoe, kuolema, erillinen fyysinen kerros, heterogeeninen pieni ABM ja siemenellä toistettavat ajot. Jokainen hyväksytty tapahtuma tarkistaa saldo- ja varastoidentiteetit. Hylkäys ei muuta taloustilaa. Testit kattavat osittaisen katteen, tuplaselvityksen eston, rajojen laskun, kuoleman, resurssipulan ja usean siemenen stressit.
2. **Sopimus- ja markkinatutkimus:** vaihtoehtoiset hinnat, kysynnän ja työajan vasteet, sopimusten aikataulut, osaselvitys, kuoleman jälkeiset oikeudet sekä myyjän lupausrajat. Hyväksyntä: samat invarianssit ja dokumentoidut erot vertailuskenaarioissa, ei piilotettua velanpoistoa.
3. **Taloustieteellinen kalibrointi:** eriytä ammatit, kotitaloudet ja juridiset yritykset; arvioi panoskertoimet, kapasiteetti, kulutus, työ ja myyntiodotukset aineistosta. Lisää pääoma, investoinnit, poistot ja materiaalitasetilit vasta, kun niiden omistus ja reseptit on määritelty. Hyväksyntä: realistiset määräjakaumat ja ennustevirheiden raportointi aineiston ulkopuolella.
4. **Elinikärajan tutkimus:** selviytymistodennäköisyyksillä painotettu tuleva nettosiirtokyky, epävarmuusmarginaalit, kapasiteetin ja kysynnän erottelu sekä aggregaattinen vastaanottorajoite. Vertaa havaintoperusteista rajaa tarkoituksella optimistiseen ja pessimistiseen rajaan. Älä tulkitse agentin rajaa moraaliseksi toimintakykyarvioksi.
5. **Järjestelmävertailu:** useat siemenet, hintaskaalat, toimitusviiveet, väestöpolut ja tarjonta-/kysyntäshokit. Raportoi jakaumat ja epävarmuusvälit. Rahatalouden vertailumalli käyttää samoja resursseja, teknologioita, mieltymyksiä ja shokkeja; sen rahoitussäännöt määritellään erikseen. Yksittäinen ajo ei osoita velkatalouden paremmuutta tai tasapainoa.

## 5. Avoimet kysymykset ja tunnetut rajoitteet

Hintayksikön ankkuri ja kaupan molemminpuolinen hyöty; kollektiivisen saamisen institutionaalinen kirjaaminen ja siihen liittyvien oikeuksien käyttäminen; myyjän luontikannustin ja rajattomat lupaukset; tahallinen sopimuskierto ja yhteistoiminta; ei toimituskatetta olevat palvelulupaukset; rajojen laskun aiheuttama selvityslukko; kuoleman aikainen sopimus- ja perintökäsittely; yrityksen vastuut ja omistajanvaihdos; julkisten palvelujen jakosääntö; työn ja pääoman arvostus; väestön syntymä-/ikärakenne; fyysisen toimituksen todentaminen. API:n `consent=True` osoittaa vain testiskenaarion suostumuksen, ei tietoista hyväksyntää tai henkilöllisyyden todentamista. Prototyyppi ei toteuta lohkoketjua.

Luonti pois -kontrollissa tavarat luovutetaan edelleen hyväksyttyjen lupausten vastineeksi, vaikka selvitys odottaa. Kontrolli osoittaa nollavelkaidentiteetin, ei kestävästi toimivaa velatonta markkinaa. Perusajoissa tulee raportoida myös odottavat sopimukset; ei saa päätellä toteutuneesta tavarakaupasta selvityksen onnistuneen.

## 6. Taloustieteellinen lähdepohja

[Bank of England: A dynamic model of financial balances for the UK (2016)](https://www.bankofengland.co.uk/working-paper/2016/a-dynamic-model-of-financial-balances-for-the-uk) perustelee stock–flow-kirjanpidon ja reaalipäätösten kytkennän tutkimusmenetelmänä. Se ei vahvista tämän velkaprotokollan taloudellista tulkintaa.

[Bank of England: Agent-based modeling at central banks (2025)](https://www.bankofengland.co.uk/working-paper/2025/agent-based-modeling-at-central-banks-recent-developments-and-new-challenges) kuvaa agenttimallien käyttöä talousinstituutioissa. Heterogeenisuus, verkostot ja kokeet soveltuvat tämän mallin tutkimiseen; tämä on menetelmällinen valinta.

[BEA: Input-Output Accounts](https://www.bea.gov/data/industries/input-output-accounts-data) kuvaa toimialojen ja hyödykkeiden tuotantoyhteyksiä sekä suoria ja välillisiä panostarpeita. Prototyypin reseptit ovat fyysinen Leontief-tyylinen rajaus; BEA:n arvomääräisiä taulukoita ei voi sellaisenaan tulkita tämän protokollan velkahinnoiksi.
