# Certiratio: jäseneksi rekisteröityminen, sosiaalinen identiteetti ja oikeudellinen vastuu

**Tila:** suunnittelumuistio / keskusteluyhteenveto, 11.10.2026  
**Suhde toteutukseen:** ei kuvaa vielä valmista tai hyväksyttyä ohjelmistoprotokollaa.

## 1. Tarkoitus ja lähtökohta

Certiratio on suhteellisten saldojen ja velansiirtojen kirjanpitojärjestelmä. Sillä on eri identiteettiongelma kuin tavallisella viestintäverkolla: yhden ihmisen ei pidä voida kasvattaa käytettävissä olevaa taloudellista vastaanottokapasiteettiaan luomalla itselleen rajattomasti käyttäjätilejä.

Ongelmaa ei kuitenkaan pidä yrittää ratkaista pelkästään kryptografialla. Olemassa olevassa yhteiskunnassa ihmiset tunnistetaan myös henkilökohtaisesti, virallisista asiakirjoista, sopimuksilla, todistajien avulla ja tarvittaessa oikeudenkäynneissä. Certiratio voi nojata näihin käytäntöihin samalla, kun sen varsinainen kaupankäynti ja kirjanpito toimivat itsenäisessä selainpohjaisessa vertaisverkossa.

Perusajatus:

> Certiration jäsenyys perustuu todellisen ihmisen ja järjestelmän ylläpitävän oikeushenkilön väliseen sopimukseen, kahden ennestään tunnetun jäsenen henkilökohtaiseen tunnistukseen sekä jatkuvasti säilyvään sosiaaliseen rekisterihistoriaan. Kryptografiset avaimet ovat jäsenyyden käyttövälineitä, eivät itse ihminen.

Tavoitteena ei ole tehdä rikoksia teknisesti mahdottomiksi. Tavoitteena on tehdä väärien identiteettien massatuotannosta vaikeaa, hidasta, kallista, jäljitettävää ja taloudellisesti huonosti kannattavaa sekä säilyttää keinot sopimus- ja rikosoikeudelliseen puuttumiseen.

## 2. Kolme identiteetin tasoa

Identiteetti jaetaan kolmeen erilliseen käsitteeseen:

1. **Oikeudellinen jäsenyys.** Todellinen henkilö tekee liittymissopimuksen Certiratio ry:n, Oy:n tai muun määritellyn oikeushenkilön kanssa. Sopimusosapuolet, tunnistusmenettely ja sopimuksen versio ovat myöhemmin todennettavissa.
2. **Sosiaalinen, historiallinen identiteetti.** Jäsen sijoittuu yhteen katkeamattomaan ympyrärekisteriin kahden hänet tuntevan jäsenen välille. Kaikkien liittymisten ja myöhempien tunnistusten historia säilytetään.
3. **Tekninen käyttöoikeus.** Selaimessa toimiva jäsen käyttää kulloinkin voimassa olevia kryptografisia avaimia. Avaimen katoaminen tai vaihtuminen ei synnytä uutta taloudellista henkilöä eikä pyyhi vanhaa saldoa.

Jäsenellä voi olla useita puhelimia, selainistuntoja ja avainpareja. Niiden määrä ei saa kasvattaa hänen velkakapasiteettiaan. Jäsenyyden jatkuvuuden takaamiseen tarvitaan yksikäsitteisesti viitattava historiallinen tietue, mutta sen ei tarvitse olla julkinen henkilötunnus eikä pysyvä henkilökohtainen julkinen avain.

## 3. Ympyrärekisterin synty

### 3.1 Kolmen perustajajäsenen tilanne

Ajatellaan kolmea toisiaan henkilökohtaisesti tuntevaa ihmistä: A, B ja C. He muodostavat ensimmäisen suljetun ympyrän:

```text
          A
         / \
        B---C
```

Seuraavat kolme henkilöä liittyvät heidän väleihinsä. Esimerkkitapauksessa kyseessä ovat veljesten puolisot, joiden tuttavuusverkostot ulottuvat Peruun, Puolaan ja Merikarvialle. Seuraavaksi puolisot tuovat mukanaan ihmisiä omista tuttavuuspiireistään. Näiden kautta rekisteri laajenee edelleen uusille paikkakunnille ja maihin.

Tämä on havainnollistava kasvutarina, ei oletus siitä, että jokainen ehdokas automaattisesti tuntee juuri ne kaksi jäsentä, joiden väliin hänet halutaan sijoittaa. **Liittymispaikan valinnan tulee täyttää todellinen henkilökohtaisen tunnistamisen vaatimus.** Jos sopivaa väliä ei löydy, liittymistä ei voida hyväksyä tällä menettelyllä ilman erikseen määriteltyä sääntöä.

### 3.2 Uuden jäsenen lisääminen

Jos A ja B ovat ympyrässä vierekkäin ja molemmat tuntevat D:n, he voivat ehdottaa D:tä väliinsä:

```text
ennen:  ... — A — B — ...
jälkeen: ... — A — D — B — ...
```

Liittäminen on **atominen**: sama liittymistapahtuma perustaa D:n jäsenyystietueen, tallentaa hänen tunnistajansa, korvaa kyseisen nykyisen välin kahdella uudella välillä ja säilyttää vanhan välin historiassa. Ristiriitaisia samanaikaisia lisäyksiä samaan väliin ei saa hyväksyä ilman yksikäsitteistä järjestystä.

Merkittävä ominaisuus on, että A:n ja B:n vanha tuttavuus- ja naapuruussuhde **ei häviä**, vaikka he eivät enää ole nykyisessä ympyrässä vierekkäin. Se jää historialliseksi yhteydeksi ja toimii uuden jakson alkuperänä.

### 3.3 Ympyrän laajeneminen ei katkaise historiallisia suhteita

Aikanaan kaksi veljestä ovat voineet olla suoria naapureita. Vuosikymmeniä myöhemmin heidän välissään voi olla satojatuhansia ihmisiä ja he voivat olla nykyisessä ympyräjärjestyksessä kaukana toisistaan. Tästä huolimatta järjestelmä pystyy palauttamaan täsmällisesti, miten heidän välinsä on jakautunut ja ketkä ovat hyväksyneet kunkin jakautumisen.

Ympyrärekisterissä on tämän vuoksi kaksi erillistä näkymää:

- **Nykyinen rengas:** jokaisella aktiivisella paikalla on edeltäjä ja seuraaja; rekisterissä on yksi yhtenäinen ympyrä, ei puun kaltaisia haaroja.
- **Historiallinen jakautumisketju:** jokaisen nykyisen välin alkuperä voidaan jäljittää aiempiin väleihin ja lopulta perustamishetkeen. Historialliset tunnistussuhteet säilyvät, vaikka nykyinen naapuruus vaihtuu.

Jokainen välin jakaminen synnyttää kaksi alaväliä. Alkuperäisistä väleistä muodostuu siten historiallinen välinjakopuu; **nykyisen ympyrän kaaret ovat näiden puiden aktiivisia lehtiä**. Jakopuu ei tarkoita, että sosiaalinen järjestelmä muuttuisi haarautuvaksi jäsenrekisteriksi: jäsenet muodostavat edelleen yhden ympyrän.

## 4. Tunnistaminen on ihmisten välinen jatkuva tapahtuma

Jäsenyys ei synny siitä, että selain luo satunnaisen avainparin, vaan kahden ennestään tunnetun ihmisen tunnistamisesta ja jäsenen omasta liittymissopimuksesta.

Tunnistajat eivät todista vain sitä, että jokin dokumentti tai valokuva näyttää oikealta. He vakuuttavat tuntevansa hakijan todellisena ihmisenä ja tunnistaneensa juuri tämän sopimuksen allekirjoittajan. Tunnistajan vakuutuksen täsmällinen sisältö on määriteltävä sopimuksessa; se **ei automaattisesti tarkoita takausta kaikista hakijan tulevista veloista**.

Tunnistaminen ei myöskään lakkaa liittymishetkeen. Jäsenten myöhemmät henkilökohtaiset kohtaamiset, uusien avainten hyväksynnät, suhteet ja mahdolliset ristiriitaiset väitteet muodostavat elävän historiallisen todistusaineiston. Voidaan tutkia, kuinka laajasti eri aikoina ja toisistaan riippumattomissa tuttavapiireissä henkilö tunnetaan.

Välittömien tunnistajien lisäksi myös näiden vanhat naapurit ja muut heidät tuntevat ihmiset voivat tarkastella uutta liittymistä. **Ehdotus:** liittymisestä ilmoitetaan historiallisesti lähimmille suhteille ja voidaan vaatia lisävahvistuksia tai määräajan kuluessa tapahtuvaa kiistämismahdollisuutta. Se, mikä on pakollinen hyväksyntä ja mikä jälkikäteinen tarkastus, on vielä avoin protokollavalinta.

## 5. Historiallinen ympyrä väärinkäytön havaitsemisessa

Oletetaan, että kaksi entistä naapuria R1 ja R2 ovat tunteneet toisensa jo ennen suurta laajenemista:

```text
alku:      R1 — R2
myöhemmin: R1 — M1 — M2 — R2
lopulta:   R1 — M1 — X1 — X2 — ... — X1000 — M2 — R2
```

Jos saman historiallisen välin sisälle ilmestyy tuhat uutta henkilöä, jotka tunnetaan vain pienen sisäpiirin kesken, kasvu näkyy rekisterin alkuperäisille osapuolille ja muille historian tarkastajille. Ulkopuoliset jäsenet voivat havaita poikkeuksellisen kasvuvauhdin, hyväksyjien keskittymisen ja sen, ettei uusilla jäsenillä näytä olevan riippumattomia tuttavuussuhteita.

Historiallista rekisteriä ei voi huomaamatta kirjoittaa uudelleen niin, että suuri uusi jakso näyttäisi olleen olemassa alkuperäisessä ympyrässä. Muutokset ovat jäljitettävissä alkuperäisiin liittymistapahtumiin.

Tämä on vahva **havaittavuus- ja vastuuketjumekanismi**. Se ei silti yksin muodosta matemaattista todistusta siitä, ettei kaksi keskenään sopivaa epärehellistä ryhmää voisi hyväksyä tekaistuja jäseniä. Aidosti kasvava suuri perhe- tai muuttoliikeverkosto voi myös näyttää poikkeukselliselta. Epäily on tarkistuksen peruste, ei automaattinen syyllisyysratkaisu.

## 6. Liittymissopimus ja oikeudellinen henkilöllisyys

### 6.1 Sopimusosapuolet

Certiration jäseneksi pyrkivä luonnollinen henkilö allekirjoittaa liittymissopimuksen Certiratio ry:n, Oy:n tai muun järjestelmää oikeudellisesti edustavan tahon kanssa. Tämän tahon perustaminen, kotipaikka, toimivalta ja jäsenyyden juridinen luonne määritellään ennen tuotantokäyttöä.

Sopimus voidaan tehdä paperilla tai asianmukaisella sähköisellä allekirjoituksella. Liittyminen voi siis perustua fyysiseen tapaamiseen **ilman, että koko identiteetin perustaminen on pakko suorittaa Internetissä**. Ensimmäinen ohjelmistototeutus voi silti keskittyä selainpohjaiseen protokollaan; paperinen liittyminen on erillinen hallinnollinen menettely, ei verkkokokeen käynnistymisen edellytys.

### 6.2 Tunnistaminen liittymistilanteessa

Hakija esittää hyväksytyn henkilöllisyysasiakirjan, esimerkiksi voimassa olevan passin tai henkilökortin. Ajokortin soveltuvuus riippuu käytettävästä menettelystä ja sovellettavasta sääntelystä; sitä ei oleteta automaattisesti kaikkiin vahvan tunnistamisen tilanteisiin kelpaavaksi.

Kaksi ennestään rekisteröityä ja hakijan henkilökohtaisesti tuntevaa jäsentä vahvistaa hakijan henkilöllisyyden ja suhteen valittuun ympyräväliin. Myös hakija vahvistaa oman liittymistahtonsa ja hyväksyy sopimusehdot.

Sopimuksessa voidaan edellyttää esimerkiksi seuraavia vakuutuksia:

- Hakija ilmoittaa todellisen henkilöllisyytensä ja antaa tarvittavat yhteystiedot.
- Hakija ei ole jo Certiration jäsen eri nimellä tai erillisenä taloudellisena henkilönä.
- Hakija hyväksyy rekisterin tapahtuma- ja tunnistushistorian säilyttämistä koskevat säännöt.
- Hakija hyväksyy järjestelmän kaupankäynti- ja riitautussäännöt sekä sopimuksessa täsmällisesti määritellyt seuraamukset.
- Tunnistajat vakuuttavat henkilökohtaisesti tuntevansa hakijan ja tarkistaneensa, että sopimus tehdään oikean henkilön nimissä.

Tunnistajien vakuutukset ja mahdollinen vastuu perustuvat heidän erikseen hyväksymiinsä ehtoihin. He eivät joudu automaattisesti vastuuseen jäsenen myöhemmästä taloudellisesta toiminnasta.

### 6.3 Sopimusrikkomukset eivät ole automaattisesti rikoksia

Liittymissopimuksen tahallinen rikkominen voi johtaa sopimuksen mukaiseen seuraamukseen, korvausvaatimukseen tai jäsenyyden käsittelyyn. **Sopimusrikkomus ei itsessään ole rikos**. Petos, väärennys, kiristys, pakottaminen tai muu rikos edellyttää sovellettavan rikoslain tunnusmerkkien toteutumista. Riitoja voidaan käsitellä toimivaltaisessa tuomioistuimessa; rikosasia kuuluu tavanomaiseen esitutkinta- ja rikosprosessiin.

Sopimussakot, vastuunrajoitukset, kohtuullisuus, kuluttaja-asema, sopimuksen tekemisen kelpoisuus, yhdistyksen tai yrityksen vastuut ja riidanratkaisupaikka edellyttävät erillistä oikeudellista arviointia ennen käyttöönottoa. Sopimus ei voi sivuuttaa pakottavaa lainsäädäntöä.

### 6.4 Oikeudellinen maailma jää järjestelmän ulkopuolelle mutta on käytettävissä

Certiration ei tarvitse teknisesti estää kaikkia rikoksia. Esimerkiksi henkilö voi pakottaa toista hankintoihin uhkailemalla, käyttää väärin tämän laitetta tai esiintyä toisena. Samanlaisia tekoja voi tapahtua nykyisissä pankkipalveluissa.

Siksi tapahtumien kryptografinen allekirjoitus ei yksin todista vapaaehtoista, oikeudellisesti pätevää suostumusta. Järjestelmän on mahdollistettava tapahtumien riitauttaminen, tutkinnan tarvitsemien tietojen asianmukainen luovuttaminen ja myöhempi jäljitettävä oikeudellinen oikaisu. Oikaisu ei saa hävittää alkuperäisen tapahtuman historiaa.

## 7. Ulkopuoliseen maksujärjestelmään perustuva liittymismaksu

**Ehdotus:** uuden henkilön liittymisehtona on esimerkiksi **100 euron** maksu valitulle yleishyödylliselle järjestölle, kuten Suomen Punaiselle Ristille tai Kirkon Ulkomaanavulle. Maksu tapahtuu nykyisessä euro- ja pankkijärjestelmässä eikä Certiration omissa suhteellisissa saldoissa.

Tällä on kaksi tehtävää:

1. **Todellinen kustannus:** valeidentiteettien luominen kuluttaa ulkopuolista rahaa, jota ei voi luoda lisää uusilla Certiratio-identiteeteillä.
2. **Tunnistamisen apu:** pankin asiakassuhteeseen perustuva maksutapahtuma voi antaa jäsenhakemukselle yhden lisätodisteen, jos maksajan henkilöllisyys voidaan oikeasti vahvistaa.

Kustannus esimerkkihinnalla:

| Uusia identiteettejä | Maksut yhteensä |
|---:|---:|
| 10 | 1 000 € |
| 100 | 10 000 € |
| 1 000 | 100 000 € |
| 10 000 | 1 000 000 € |
| 100 000 | 10 000 000 € |

Tämä on vakava taloudellinen este massarekisteröinnille, mutta ei ehdoton tae. Myös suuri huijaus voi olla tuottoisa, jos jokainen väärä identiteetti saa heti suuren hankintakapasiteetin. Maksu ja kapasiteetin asteittainen myöntäminen on siksi arvioitava yhdessä.

**Olennainen ero maksun ja henkilöllisyyden välillä:** tavallinen SEPA-kuitti, viitenumero tai maksajan nimi ei itsessään ole pankin allekirjoittama todistus siitä, että maksaja ja hakija ovat yksi tietty luonnollinen henkilö. Maksaja voi myös olla eri henkilö kuin jäsenhakija. Kuvakaappaus tai PDF-kuitti voidaan väärentää. Jos maksua halutaan käyttää identiteetin ankkurina, on määriteltävä, kuinka hyväntekeväisyysjärjestö tai maksupalvelu vahvistaa tosiasiallisesti vastaanotetun maksun ja miten hakijan vastaavuus maksajaan tarkistetaan.

Mahdollinen menettely:

1. Certiratio myöntää liittymishakemukselle kertakäyttöisen maksutunnisteen.
2. Hakija maksaa määrätyn summan valitulle hyväksytylle vastaanottajalle.
3. Maksunsaaja tai tätä palveleva valtuutettu todentaja antaa maksun vastaanottamisesta tarkistettavan vahvistuksen.
4. Vahvistus sidotaan yhteen hakemukseen ja merkitään käytetyksi, jotta samaa maksua ei voi käyttää uudelleen.
5. Erillinen henkilöllisyyden tarkistus varmistaa, että maksuehto täyttyy sovitulla tavalla. Maksu ei yksin todista henkilön yksilöllisyyttä.

Hyväntekeväisyysjärjestöä ei pidä ilman sen suostumusta kuvata Certiration virallisena kumppanina tai identiteetin varmentajana. Maksun kirjaamisen, viestinnän ja mahdollisen vahvistusrajapinnan järjestäminen edellyttää sen kanssa sovittavaa käytäntöä.

Maksun pakollisuus, summa, maksuttomat poikkeukset, alaikäisten liittyminen, maksun maksaminen toisen puolesta ja niiden vaikutus syrjimättömään pääsyyn ovat avoimia päätöksiä. Maksua ei myöskään pidä sekoittaa Certiration sisällä mahdollisesti tehtäviin erillisiin hyväntekeväisyyssiirtoihin; nämä ovat kaksi eri mekanismia.

## 8. Odotusaika ja liittymistaajuuden valvonta

**Ehdotus:** hyväksytyllä hakijalla on esimerkiksi seitsemän tai kolmenkymmenen päivän tarkastelujakso ennen täysien taloudellisten käyttöoikeuksien aktivointia.

Liittymissopimus, ympyrärekisteriin sijoittaminen ja kaupankäyntioikeuden avautuminen voivat olla eri ajankohtina. Tarkastelujakson aikana voidaan tutkia muun muassa samojen hyväksyjien toistuvat liittymiset, saman historiallisen välin epätavallinen kasvu ja muiden tuttujen esittämät ristiriitaiset tunnistusväitteet.

**Pelkkä odotus ei rajoita rinnakkaisia massarekisteröintejä**: kymmenentuhatta hakemusta voivat odottaa saman kuukauden. Tarvitaan myös nopeusrajoituksia tai havaintoihin perustuvia tarkastuksia.

Mahdollisia signaaleja:

- Historiallisen ympyräjakson uusiin jäseniin kohdistuva rekisteröintitaajuus.
- Samojen tunnistajien suorittamien tunnistusten määrä ja aikaväli.
- Samasta verkosta tai IP-osoitealueelta tulevien hakemusten tiheys.
- Hakemusten ajallinen kasaantuminen ja rekisteröitymisen nopea ketjuuntuminen.

IP-osoite on vain **tilastollinen signaali**, ei henkilöllisyys. Monet ihmiset voivat jakaa saman IP:n, mobiiliverkot voivat vaihtaa osoitteita, ja hyökkääjä voi käyttää monia yhteyksiä. IPv6:n osoite tai /64-etuliite ei vastaa yksiselitteisesti yhtä kotitaloutta tai ihmistä.

Pitkällä aikavälillä lähes kaikki yhteisön ihmiset voivat olla jo rekisterissä, jolloin uudet aidot jäsenet painottuvat syntyneisiin ja maahan muuttaneisiin sekä aiemmin liittymättömiin ihmisiin. **Tämä on kypsyneen järjestelmän karkea demografinen intuition lähde, ei algoritmin kova rekisteröintikiintiö.** Alkuvaiheen käyttöönotto tai uusi maantieteellinen laajentuminen voi synnyttää paljon todellisia uusia hakemuksia.

Liittymisen lykkäys, lisätarkistus tai hylkäys tulee tehdä johdonmukaisten sääntöjen ja muutoksenhakumahdollisuuden perusteella. Epätavallinen sosiaalinen verkosto, maa tai osoitealue ei yksin todista väärinkäytöstä.

## 9. Jäsenyyden alku ja vastaanottokapasiteetti

Certiration nykyinen talousmalli käyttää etumerkillistä suhteellista saldoa `x_i`. Hyödykkeen myynti pienentää myyjän saldoa ja vastaanotto kasvattaa ostajan saldoa. Positiivisen hinnan vastaanottoraja tarkistetaan ennen kauppaa. Jäsenen nollasaldo ei merkitse perinteistä rahatalouden tyhjää pankkitiliä eikä estä kaupankäyntiä.

Identiteettien väärinkäyttöä voidaan vaikeuttaa pitämällä erillisinä:

- henkilön oikeudellinen rekisteröinti;
- pääsy kaupankäyntiin;
- uuden jäsenen arvioitu elinaikainen vastaanottokapasiteetti.

**Ehdotus tutkimukseen:** heti liittyessä jäsenelle ei välttämättä myönnetä täyttä, oletettuun elinaikaiseen maksukykyyn perustuvaa vastaanottorajaa. Rajoja voidaan kasvattaa järjestelmän tunteman toiminnan, sopivaksi määriteltyjen ennusteiden ja muun todennettavan historian myötä. Tämä on avoin talouspoliittinen ja mallinnettava suunnitteluvaihtoehto, ei nykyisen simulaattorin päätetty sääntö.

Uusien identiteettien luomisesta saatavaa hyötyä ei saa arvioida pelkästään liittymismaksujen perusteella. On arvioitava, kuinka paljon tavaroita tai palveluja kukin uusi identiteetti voi todellisuudessa vastaanottaa ennen kuin järjestelmä havaitsee väärinkäytön.

## 10. Jäsenen vaihtuvat avaimet ja uudelleentunnistus

Jäsenen avainpari ei ole sama asia kuin henkilö. Avaimet voivat vaihtua teknisistä tai turvallisuussyistä, eikä jäsenyys saa kadota, jos puhelin rikkoutuu.

Mahdollinen uudelleentunnistamisen järjestys:

1. Henkilö ilmoittaa avaimensa kadonneen tai vaihtuneen.
2. Hänet tunnistetaan henkilökohtaisesti sovittujen tunnistajien toimesta tai muuten sopimuksessa määritellyllä tavalla.
3. Uusi tekninen avain valtuutetaan edustamaan **samaa historiallista jäsenyyttä**.
4. Vanhan avaimen käyttöoikeus perutaan tarvittaessa. Saldot ja tapahtumahistoria eivät muutu.

WebAuthn ja puhelimen paikallinen sormenjälki-, kasvo- tai PIN-varmennus voivat suojata avainten käyttöä. Ne eivät yksin todista, että jäsen on yksi tietty juridinen ihminen tai että hän toimii vapaaehtoisesti. Selainsovellus ei normaalisti saa raakaa biometristä tietoa.

Kirjanpitotapahtumissa tarvitaan edelleen tarkistettavat tekniset valtuutukset, vaikka pysyvää henkilökohtaista avainta ei vaadittaisi.

## 11. Tietojen julkisuus ja yksityisyys

Historiallisen ympyrän tarkastettavuus ei edellytä koko sopimusarkiston, kotiosoitteiden, henkilötunnusten, henkilökorttien tai jokaisen yksityiskohtaisen henkilösuhteen julkaisemista kaikille vertaisille.

Tietoja voidaan jakaa vähintään kolmeen tasoon:

| Taso | Esimerkkejä | Käyttö |
|---|---|---|
| Julkinen protokollatieto | liittymistapahtuman viite, historia, välin jakautuminen, hyväksynnän olemassaolo ja sitä koskevat allekirjoitukset | rekisterin eheyden yhteinen tarkastaminen |
| Rajattu tunnistus- ja sopimustieto | henkilön nimi, vaaditut yhteystiedot, tunnistajien vakuutukset, liittymisehdot, maksuun liittyvä näyttö | jäsenyyden hallinta, riitojen selvittäminen |
| Erityisesti suojattu aineisto | mahdollinen henkilöllisyysasiakirjan tarkistusnäyttö, arkaluonteiset riita- ja turvallisuustiedot | vain tarpeellinen ja laillinen käsittely |

Pelkkä SHA-256 henkilön nimestä, syntymäajasta tai henkilötunnuksesta ei välttämättä anonymisoi tietoa, koska ennustettavia arvoja voidaan arvata. Myöskään julkinen pysyvä pseudonyymi ei välttämättä estä eri tapahtumien yhdistämistä samaan ihmiseen.

Sopimusosapuolen on selvitettävä henkilötietojen käsittelyn peruste, käyttötarkoitukset, säilytysajat, tarkastusoikeudet, oikaisumenettely ja tietoturva sovellettavan tietosuojalainsäädännön mukaisesti. **Muuttumaton julkinen historia ja henkilötietojen oikaisu-/poistovaatimukset on yhteensovitettava jo suunnittelussa.** Tätä ristiriitaa ei ratkaista pelkällä tiedon tiivistämisellä.

## 12. Rekisteröinnin ehdotettu tilakone

Seuraava on luonnos myöhempää protokollamäärittelyä varten:

```text
HAKEMUS
  ├─> HENKILÖKOHTAINEN_TUNNISTUS
  │     ├─> HYLÄTTY / TÄYDENNETTÄVÄ
  │     └─> SOPIMUS_HYVÄKSYTTY
  ├─> ULKOPUOLINEN_MAKSU_TARKISTETTU
  └─> YMPYRÄLIITTYMINEN_EHDOTETTU
            ├─> RISTIRIITA / RIITAUTETTU
            └─> ATOMISESTI_REKISTERÖITY
                        └─> TARKASTELUJAKSO
                                   ├─> KESKEYTETTY / RIITAUTETTU
                                   └─> TALOUDELLISESTI_AKTIIVINEN
```

Kaikki hyväksynnät ja hylkäykset kirjataan niin, että yksi liittymishakemus ei voi vahingossa synnyttää kahta jäsenyyttä eikä samaa maksuvahvistusta voi käyttää kahdesti. Jäsenyys- ja saldokirjanpidon merkintöjen tekninen julkaisutapa ratkaistaan erikseen.

Mahdollinen tapahtumarunko (havainnollistava, ei lukittu rajapinta):

```json
{
  "type": "membership.admit",
  "event_id": "unique-event-reference",
  "member_record": "historical-membership-reference",
  "parent_interval": "historical-interval-reference",
  "left_sponsor": "member-reference-A",
  "right_sponsor": "member-reference-B",
  "contract_evidence": "restricted-evidence-reference",
  "payment_confirmation": "single-use-confirmation-reference",
  "approvals": ["signature-A", "signature-B", "signature-applicant"],
  "status": "pending-or-active"
}
```

Tosiasiallisessa toteutuksessa allekirjoitusten tulee kattaa koko normalisoitu tapahtumasisältö ja sopimusversion viite. Sekä hakemuksen että ympyräjakson tilan on oltava yksikäsitteisiä. Riitautus ja oikaisu tarvitsevat omat tapahtumatyypit.

## 13. Ehdotetut rekisteri-invariantit

Seuraavat tekniset ehdot ovat järkeviä tutkimuskohteita:

- Aktiivisista jäsenyyspaikoista muodostuu **täsmälleen yksi suljettu ympyrä** (kun verkko on perustettu).
- Hyväksytty liittyminen jakaa yhden ennestään olemassa olevan aktiivisen välin kahdeksi; alkuperäisen välin historia säilyy.
- Jäsenyyttä ei luoda hyväksynnättä tai ristiriitaisella rinnakkaisella välinjaolla.
- Jokaisella liittymisellä on jäljitettävä hakija, tunnistajat, sopimusversio ja rekisteröintipäätös.
- Kukin ulkopuolisen maksun vahvistus käytetään korkeintaan yhteen hyväksyttyyn liittymiseen.
- Avaimen vaihtaminen ei muuta jäsenen saldoa, rekisterihistoriaa eikä oikeudellista identiteettiä.
- Yksilöllisyysväitteen, siihen kohdistuvan kiistan ja oikeudellisen ratkaisun historia säilyy jäljitettävänä.
- Jäsenyyteen liittyvä virhe tai riitautus ei saa tehdä hyväksyttyjen taloustapahtumien saldomuutoksista mielivaltaisia; oikaisut ovat erillisiä tarkastettavia tapahtumia.

Ympyrän yhteinen tila edellyttää hajautetussa verkossa hyväksymisjärjestystä tai muuta konfliktien ratkaisumenetelmää. Pelkkä tapahtumien lähettäminen vertaisilta toisille ei yksin takaa atomisuutta tai yhtä yhteistä järjestystä.

## 14. Oikeudelliset ja käytännölliset riskit, joita ei pidä sekoittaa identiteettitekniikkaan

Seuraavat ilmiöt ovat mahdollisia myös pankki- ja sopimusjärjestelmissä:

- Sama ihminen voi yrittää tehdä kaksi eri liittymissopimusta eri tuttavapiireissä. Tähän tarvitaan sopimusehtojen, henkilötietojen ja tarvittaessa tunnistushistorian perusteella tehtäviä tarkistuksia; nimi ja osoite eivät yksin todista yksilöllisyyttä.
- Tunnistajat voivat valehdella tai joutua painostuksen kohteiksi.
- Henkilö voidaan pakottaa tekemään kauppoja tai luovuttamaan laitteensa käyttöoikeus.
- Väärinkäyttö voi olla rikosoikeudellisesti arvioitava teko, vaikka järjestelmän digitaalinen tapahtuma olisi teknisesti pätevä.
- Jäsenen kuolema, kyvyttömyys hoitaa asioitaan, kadonnut avain, muutto ja henkilötietojen vaihtuminen edellyttävät oikeudellisia ja teknisiä menettelyjä.

Näiden riskien olemassaolo ei tarkoita, että kaikkia pitäisi estää ohjelmakoodilla etukäteen. Certiration tulee tuottaa luotettava kirjanpito, säilyttää tarpeellinen näyttö ja tukea asianmukaista selvitystä sekä mahdollisia oikeudellisia korjauksia. Väärinkäytön tekninen estäminen, sen havaitseminen ja sen jälkikäteinen oikeudellinen käsittely ovat eri tehtäviä.

## 15. Toteutusjärjestys

Projektin nykyiset ohjeet painottavat ensin selainpohjaista tapahtumajärjestelmää. Tämä dokumentti täydentää sen tulevia jäsenyysvaatimuksia; se ei tee paperisen sopimusarkiston valmistumisesta nykyisen verkkokokeen ehdotonta edellytystä.

**Vaihe 1 – rekisterin rakennetesti:** kolmen perustajajäsenen ympyrä, välin atominen jakaminen, ristiriitaisten liittymisten hylkäys, historiallinen rekonstruktio ja yksi suljettu ympyrä. Simuloidut jäsenet ja allekirjoitukset riittävät. *Kokeilu puhelimilla:* [`poc1/web/direct.html`](../poc1/README.md#rengas-suora-verkko-qr-koodit-webdirecthtml) toteuttaa renkaan ilman allekirjoituksia: kaksi perustajaa, liittyminen vierekkäisten jäsenten väliin kahdella QR-koodilla ja ristiriitaisten liittymisten hylkäys (`poc1/web/src/ring.js`).

**Vaihe 2 – sosiaalisen tunnistuksen koe:** kahden tunnistajan hyväksynnät, jakson historiallisen kasvun raportointi, kiistämismenettely, avaimen vaihto ja uudelleentunnistus. Testataan myös yhteistyössä toimivia vääriä tunnistajia. *Kokeilu puhelimilla:* `poc1/web/direct.html` allekirjoittaa liittymiset (tulokas, vasen ja oikea naapuri; ECDSA P-256), todentaa jokaisen yhteyden avaimella, säilyttää avaimen ja rekisterin selaimessa ja yhdistää palaavan jäsenen ilman uutta liittymistä. Kiistäminen, avaimen vaihto ja uudelleentunnistus ovat vielä tekemättä.

**Vaihe 3 – taloudellinen rasituskoe:** arvioidaan liittymismaksun, odotusajan, hyväksyjien taajuusrajojen ja alkuvaiheen vastaanottorajan yhdistelmiä. Tarkistetaan hyökkääjän kustannus ja mahdollinen hyöty, ei vain hyväksyttyjen tilien määrä.

**Vaihe 4 – sopimus- ja maksuprosessi:** laaditaan oikeudellisesti arvioidut liittymisehdot, tunnistajien vakuutukset, tietosuojamenettely ja sopimusjärjestelyn oikeushenkilö. Selvitetään hyväksytyn hyväntekeväisyystoimijan kanssa maksujen vahvistamisen mahdollisuus.

**Vaihe 5 – tuotantojärjestelmän liitos:** tekninen jäsenyys, sopimustietoihin viittaaminen ja hajautettu talouskirjanpito yhdistetään tavalla, joka ei muuta nykyisen saldomallin invariantteja.

## 16. Avoimet suunnittelupäätökset

1. Ovatko kahden suoran naapurin allekirjoitukset yksin riittäviä, vai edellytetäänkö nykyisten tai historiallisten lisänaapureiden hyväksyntää? Millä aikarajalla?
2. Voidaanko ympyrän järjestystä muuttaa jäsenen tunnistamisen kannalta ja miten muutos säilyttää todistushistorian? Mitä tapahtuu jäsenen kuollessa tai poistuessa?
3. Kuinka uuden jäsenen kaksi todellista tuttua voidaan löytää samasta aktiivisesta välistä kansainvälisessä nopeasti kasvavassa verkossa?
4. Kuka on sopimusosapuolena toimiva oikeushenkilö, ja mitä tietoa sillä on yksilöllisyystarkistusta varten?
5. Miten varmistetaan, että ulkopuolinen pankkimaksu on vastaanotettu ja että sen maksaja vastaa ehtojen mukaista hakijaa, ilman että maksunsaajaa oletetaan henkilöllisyyden varmennuspalveluksi?
6. Onko hyväntekeväisyysmaksu pakollinen ja mikä on sen summa? Onko poikkeuksia tai yhteisön rahoittamia liittymisiä?
7. Miten odotusaika, poikkeamahälytykset, valitukset ja virheellisten epäilyjen oikaisu toteutetaan?
8. Mitkä rekisterihistorian osat ovat kaikille avoimia ja mitkä vain oikeutetuille käsittelijöille?
9. Miten jäsenyyden kaksoisrekisteröintiepäily ratkaistaan ja kuka tekee sitovan oikeudellisen päätöksen?
10. Millä mekanismilla hajautettu verkko hyväksyy liittymiset samassa järjestyksessä myös verkkokatkojen aikana?

## 17. Yhteenveto

Certiration rekisteröityminen ei ole pelkkä verkkosivulla tehtävä tilinluonti. Se on **sopimusoikeudellinen liittymistapahtuma, henkilökohtaisen tuttavuuden vahvistus ja historiallisen ympyrärekisterin atominen muutos**.

Järjestelmän vahvuus voi muodostua usean toisistaan poikkeavan mekanismin yhteisvaikutuksesta:

- todelliset ihmiset tuntevat tulokkaan ja vahvistavat henkilöllisyyden;
- liittymissopimus tekee väitteistä oikeudellisesti merkityksellisiä;
- ympyrän historia tekee epäilyttävän kasvun jäljitettäväksi myös vuosikymmenten jälkeen;
- mahdollinen ulkopuolinen hyväntekeväisyysmaksu nostaa valeidentiteettien massatuotannon kustannuksia;
- viiveet ja taajuustarkastelut hidastavat väärinkäyttöä;
- taloudellista kapasiteettia ei ole pakko antaa rajattomasti pelkän uuden identiteetin perusteella;
- kryptografia suojaa käyttöoikeuksia ja kirjanpitotapahtumia muuttumatta ihmisen identiteetiksi;
- siviili- ja rikosoikeudelliset menettelyt pysyvät käytettävissä väärinkäytösten jälkikäteiseen selvittämiseen.

**Keskeinen periaate:** Certiration ei tarvitse ratkaista kaikkea ihmisten välistä epärehellisyyttä tietoteknisesti. Sen tulee olla eheä, auditoitava ja oikeudellisesti mielekäs järjestelmä, jossa väärien identiteettien taloudellinen hyödyntäminen on hankalaa ja jonka väärinkäytökset voidaan tarvittaessa selvittää normaalissa oikeusjärjestelmässä.

---

**Huomautus:** Asiakirja on suunnittelumuistio eikä oikeudellinen lausunto. Maksut, sopimussakot, tunnistajien vastuu, sopimuksen pätevyys, tietosuoja, rahanpesun estämiseen liittyvät velvoitteet ja mahdollinen finanssialan sääntely on tutkittava erikseen ennen todellista jäsenyyttä tai taloudellista toimintaa. Tutkimusvaiheen vaihtoehtoja ei pidä tulkita jo hyväksytyiksi protokollapäätöksiksi.

**Projektin nykyisiä vertailudokumentteja:** `VELKATALOUS_CONTEXT.md`, `docs/MALLI_JA_SUUNNITELMA.md`, `docs/KANNUSTINYHTEENSOPIVUUS.md`, `docs/POC1-BROWSER-P2P.md` ja `AGENTS.md`.
