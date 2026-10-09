# Velkatalous – siirtokonteksti Codexille

Päivitetty 2026-10-09. Tämä dokumentti tiivistää käyttäjän kanssa käydyn suunnittelukeskustelun. Käytä tätä ensisijaisena lähteenä *käyttäjän mallia koskeville päätöksille*. Erota päätetyt periaatteet alustavista simulaatio-oletuksista. Älä oleta tavallisen rahatalouden toimintalogiikkaa tai moraalista tavoitefunktiota.

## 1. Tavoite

Tutki uudenlaista, hajautetusti kirjattavaa **velkataloutta**, jossa **velka itse on valuutta**, ja jokaisella ihmisellä on vain **ei-negatiivinen velkasaldo**. Järjestelmä on ensisijaisesti vaihtokaupan ja taloudellisten velansiirtojen kirjanpitoprotokolla. Mahdolliset yhteiskunnalliset vaikutukset ovat tutkimuskysymyksiä, eivät toteutuksen moraalisia oletuksia.

## 2. Käyttäjän määrittelemät perusperiaatteet

1. Henkilö syntyy velkasaldolla `D_i = 0`. `D_i >= 0`; kenelläkään ei ole positiivista saamissaldoa eli negatiivista velkaa. Nollavelka on saldomielessä ylin mahdollinen tila, ei tavoite johon kaikkien pitäisi pyrkiä.
2. Velka on **luovutettava suure**. Kun A myy hyödykkeen B:lle, **myyjä A siirtää velkaa ostajalle B**. Tämä on tavanomaiseen rahakauppaan nähden vastakkainen suunta. Myyjä pääsee eroon velasta; ostaja vastaanottaa tavaran ja velan.
3. Tavallinen velan siirto ei synnytä eikä hävitä velkaa: `D_A' = D_A - x`, `D_B' = D_B + x` (kun `D_A >= x`). Hyödykkeen voi antaa myös ilmaiseksi ilman velansiirtoa.
4. Velka ei katoa muutoin kuin velallisen **kuollessa** (tähän on täsmennettävä yritysten ja juridisten toimijoiden käsittely). Syntymät eivät luo velkaa.
5. Velkaa ei ole pakko vähentää nollaan. Suuri velkasaldo ja valtava velkaliikevaihto voivat kuulua aktiiviselle tuottajalle ja olla merkkejä korkeasta taloudellisesta toimintakyvystä, jos jäljellä oleva elinaikainen velanhoitokyky riittää. Myös pieni kulutus ja vähäinen tuotantotoiminta ovat mahdollisia elämäntapoja.
6. Velkaa saa ottaa vastaan vain laskennallisen, jäljellä olevaan elinaikaan ja arvioituun kykyyn **siirtää velkaa eteenpäin** perustuvan velkarajan puitteissa. Rajan arviointi on vielä avoin tutkimuskysymys, eikä sitä pidä olettaa luotettavasti ratkaistuksi.
7. Hyödykkeen arvo ja tuotanto syntyvät pitkissä, yhteisissä tuotantoketjuissa (esim. teräslusikka: malmin louhinta, seosaineet, kuljetukset, seppä). Yhden myyjän panos ei yksin selitä koko hyödykkeen arvoa.
8. Työntekijä voi siirtää omasta kulutuksestaan, investoinneistaan ja kuluistaan vastaanottamaansa velkaa työnantajalle työnsä yhteydessä. Työnantaja voi siirtää velkaa edelleen tuotteidensa tai palveluidensa ostajille. Työnantaja voi tarjota parempia koneita, työympäristön etuja ym. Työntekijä ei voi saada positiivista rahavarantoa.
9. Julkiset palvelut voivat siirtää niiden kustannuksia kuvaavaa velkaa väestölle säännöllisesti; tarkat jakosäännöt ovat avoimia. Tämä ei ole sama asia kuin positiivisen rahan kerääminen veroina.
10. Älä sisällytä protokollaan moraalin, ansaitsevuuden, ahkeruuden, toimintakyvyn tai hyvän yhteiskunnan mittaamista. Sosiaaliturva, omistusoikeus, politiikka ja normatiiviset arviot ovat erillisiä kysymyksiä.

### Käyttäjän täsmennys: velan kollektiivinen vastapuoli

Velkasaldo `D_i = X` tarkoittaa velkaa yhteisölle: ajatuksellisesti kaikille maailman ihmisille, ja käyttäjän määrittelemässä järjestelmän oikeudellisessa rakenteessa sen osallistujille kollektiivisesti. Velan vastapuoli on siis määritelty. Tätä ei pidä kuvata vastapuolettomaksi velaksi tai pelkäksi tekniseksi saldoksi. Osallistujayhteisön kollektiivinen saaminen ei tarkoita osallistujille kirjattavia henkilökohtaisia positiivisia saamissaldoja.

Käyttäjän mallin lähtökohta on, että hyödykkeiden lisäarvo perustuu vuosituhansien aikana kertyneeseen yhteiseen työhön, tietoon ja tuotannon edellytyksiin. Tähän kokonaisuuteen suhteutettuna yksittäisen nykyisen valmistajan panos on käytännössä olematon, vaikka hyödyke olisi monimutkainen. Tämä kirjataan mallin käsitteelliseksi perustaksi; siitä ei johdeta ilman erillistä sääntöä numeerista hintaa, nollaksi asetettua nykytyön tuotantovaikutusta tai alkutilan velkasaldoa.

Kun henkilö luovuttaa työpanoksen tai hyödykkeen, sen hyödyn vastaanottaja ottaa samalla sovitun osan luovuttajan yhteisölle olevasta velasta kannettavakseen. Tavallisessa siirrossa velan kantaja vaihtuu ja kollektiivinen vastapuoli säilyy. Velka ei tällöin tule maksetuksi pois yhteisöltä. Vastaanottaja voi olla myös tuotantoketjun välivaiheen toimija, joka hyödyntää panosta ja siirtää velkaa edelleen oman tuotoksensa mukana.

## 3. Käynnistymisongelma ja käyttäjän valitsema kokeilu

Kaikki voivat aluksi olla nollavelkaisia, jolloin pelkät siirrot eivät koskaan käynnistä velan kiertoa. Käyttäjä ehdotti velansiirtositoumuksia, joiden **toimitusajankohta voi olla myöhemmin**. Myyjä voi luvata ostajalle velkaa jo ennen kuin hänellä on sitä.

**Valittu ensimmäinen simulaatiokoe (ei vielä lopullinen laki):** kun myyjän velansiirtositoumus erääntyy, siirretään ensin myyjän olemassa oleva velka, ja jos se ei riitä, **puuttuva osa luodaan ostajan velaksi**. Tällöin kokonaisvelka kasvaa juuri puuttuvan määrän. Ostajan hyväksyntä ja velkaraja ovat pakollisia tarkastuskohteita. Täydellinen selvitys, osasuoritus, maksukyvyttömyys ja erääntymisen aikataulu vaativat vielä tarkennuksia.

Tilayhtälö erääntyvälle sitoumukselle `A -> B`, määrä `x`:

- `a = min(D_A, x)` (olettaen ettei muita varauksia)
- `m = x - a` (uusi velka)
- `D_A' = D_A - a`
- `D_B' = D_B + x`
- `W' = W + m`, missä `W = sum(D_i)` elävillä toimijoilla.

**TÄRKEÄÄ:** Käyttäjä on esittänyt tämän kokeiltavaksi vaihtoehdoksi. Uuden velan vastaanottavan ostajan suostumus, avoimien lupausten varaus ja väärinkäytön ehkäisy eivät ole vielä ratkaistuja. Älä väitä niiden olevan ratkaistuja.

## 4. Konkreettisia kauppaesimerkkejä

- A myy B:lle lusikan, ja B vastaanottaa A:n luovuttamaa velkaa (esimerkiksi 2,5 yksikköä). B:n työnantaja ottaa B:ltä velkaa vastaan työn vastineeksi. Työnantaja siirtää velan edelleen työnsä tilaajalle.
- A myy metsästään puuta B:lle, B valmistaa laatikoita C:lle. A ostaa ruokaa kaupasta ja vastaanottaa ruoan mukana velkaa, jota A voi myöhemmin siirtää puun ostajille. Sama velka voi kiertää takaisin alkuperäiselle luovuttajalle, eikä sitä silloin tarvitse hävittää.
- Paljon ylellisyystuotteita myyvä henkilö tai yritys tarvitsee vastaavan määrän velkaa luovutettavaksi ostajilleen: velkaa vastaanotetaan hankkimalla tuotantopanoksia, palveluja ja kulutushyödykkeitä.
- Jos myyjällä ei aluksi ole velkaa, hän voi antaa velanluovutuksesta määräaikaisen sitoumuksen, jota koskee yllä oleva kokeellinen velanluontisääntö.

## 5. Tieteellinen simulaatio

Käyttäjä haluaa **taloustieteeseen perustuvan, uskottavan** tutkimuksen, ei pelkkää blockchain-demonstraatiota.

Suositeltu tutkimusrunko:

- **Agent-based model (ABM)**: itsenäisesti toimivat ihmiset, yritykset ja muut agentit; tuotanto, kulutus, investoinnit ja kaupankäynti.
- **Stock-flow consistent (SFC)** -kurinalainen tapahtuma- ja saldokirjanpito; tämän mallin ei-negatiiviset velkasaldot vaativat oman eksplisiittisen järjestelmätason velanluonti- ja poistumiskirjauksen, eivät klassista vastakkaismerkkisten henkilösaldojen summaa.
- **Input-output / Leontief**: fyysisten tuotantoketjujen ja resurssirajoitteiden mallintaminen.
- Eri agenttityypit ja erilaiset mieltymykset: osa haluaa suuren tuotannollisen toiminnan, osa pienen kulutuksen ja paljon vapaa-aikaa. Älä optimoi agentteja kohti nollavelkaa tai maksimaalista säästöä. Käytä harkitusti empiirisesti kalibroitavia kulutus-, tuotanto- ja vapaa-aikapreferenssejä.
- Aloita deterministisillä kirjanpitotesteillä ja vähitellen laajenna avoimeksi stokastiseksi taloussimulaatioksi. Myöhemmin vertaile rahatalouteen samalla tuotantoteknologialla, väestöllä ja ulkoisilla häiriöillä.

Mahdollinen tilavektori: `S_t = (D_t, Q_t, K_t, O_t, N_t)`, missä `D` velat, `Q` hyödykevarastot, `K` tuotantokapasiteetti, `O` erääntyvät sitoumukset ja `N` toimijat ja ominaisuudet. `S_{t+1} = F(S_t, decisions_t, shocks_t; parameters)`.

**Kirjanpidon invarianssi**, jos kaikki aloittavat nollasta ja toimijoiden velka häviää vain kuollessa: `sum_alive(D_i) = cumulative_created_debt - cumulative_extinguished_on_death`. Siirrot eivät muuta summaa. Yritysten purkamista ei ole vielä määritelty.

Alustavat kokeet:

1. Nollavelkainen alkutila; syntyykö velkaa määräaikaisista kaupoista ja käynnistyykö tuotanto?
2. Velka liikkuu useiden tuotantovaiheiden ja työnantajan kautta.
3. Luottoraja katkaisee uusia velanvastaanottoja; vaikutus markkinoihin.
4. Suuri velkaliikevaihto ilman, että velkasaldo välttämättä kasvaa jatkuvasti.
5. Väestön syntymät, ikääntyminen ja kuolemat; globaalin velkamäärän kehitys.
6. Fyysinen tuotanto ja kysynnän tyydyttyminen; resurssipula.
7. Markkinahäiriöt, kustannukset, investoinnit, kapasiteetti ja yritysten päättyminen.
8. Herkkyysanalyysi useilla siemenillä ja malliparametreilla; vertailu nykyrahajärjestelmään.

Mittarit: `total_debt`, `created_debt`, `death_extinguished_debt`, `transfer_volume`, `debt_velocity = transfer_volume / avg_total_debt`, toteutuneet kaupat, toteutumaton kysyntä, kulutus, tuotanto, työtunnit, velkarajoihin pysähtyneet kaupat, lupausten määrä/viiveet/estymiset, velan jakaumat, reaaliset varannot ja tuotantokapasiteetti.

## 6. Ehdottomasti avoimet kysymykset

- **Hintamekanismi:** mistä hyödykkeen mukana luovutettavien velkayksiköiden määrä määräytyy? Kuinka sovitaan kaupoista, joissa velka rasittaa ostajaa mutta hyödyke hyödyttää häntä?
- **Likviditeetti ja luonti:** tuleeko uutta velkaa vain erääntyvistä sitoumuksista, saako sitoumuksia uudistaa, varata tai luovuttaa eteenpäin?
- **Luottokatto:** miten lasketaan jäljellä olevaan elinikään perustuva tuleva velansiirtokyky, mitä tietoa siihen käytetään ja miten epävarmuus käsitellään?
- **Sopimusrajat:** kuka saa tehdä rajattomia lupauksia, ja miten muut agentit suojataan vailla toimituskatetta olevilta lupauksilta?
- **Yritysten identiteetti ja elinkaari:** mitä yrityksen velalle tapahtuu, jos yritys lakkaa toimimasta? Ei voida automaattisesti käyttää ihmiselle määriteltyä kuolemasääntöä.
- **Yhteinen velka:** miten julkisten palveluiden velkarasitus jaetaan?
- **Yksilöllinen identiteetti sekä kuoleman todentaminen:** hajautetun kirjanpidon ulkopuoliset tosiasiat.
- **Vaihdannan aikataulutus:** tavaran luovutuksen, velan vastaanoton ja velanluovutussitoumuksen sitovuus.
- **Lohkoketju:** konsensus voi varmentaa tapahtumat, mutta ei fyysistä kauppaa tai biologisia tosiasioita.

## 7. Codexille annettavan tehtävän rajaus

Toteuta aluksi **tutkimussimulaattori**, ei julkista lohkoketjua tai moraalista ohjausjärjestelmää. Erota puhdas, deterministinen velkakirjanpidon moottori agenttien käyttäytymisestä ja tuotanto-/kulutusmallista. Ylläpidä avoimista kysymyksistä dokumentoitua luetteloa. Sisällytä automaattiset invarianttitestit ja toistettavat simulointiajot. Älä lisää oletuksia nykyisestä palkka-, vero- tai rahataloudesta ilman että ne ovat eksplisiittisiä vertailumallin valintoja.

Jos projektista löytyy vanhempi `maarittely.md` tai `simulaattori.py`, tarkista ne tätä keskustelukontekstia vasten ennen muutoksia: osa aiemmista sanamuodoista saattaa kuvata väliaikaisia kokeiluja lopullisina sääntöinä.
