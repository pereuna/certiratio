# Kirjanpidon 300 vuoden rasituskoe

Tämä on insinöörimäinen testi: syötetään kirjanpitoon satunnaisia tapahtumaketjuja ja etsitään virheitä. Yksi ajo kuvaa 300 vuotta. Sata ajoa tarkoittaa sataa erilaista mahdollista tapahtumahistoriaa samoilla kokeellisilla säännöillä.

Tarkistus voidaan sanoa ilman taloustieteen käsitteitä: **elossa olevien ihmisten velkojen summan pitää olla täsmälleen kaikki tähän mennessä syntynyt velka miinus kuolemissa poistunut velka.** Sama summa on osallistujayhteisön kollektiivinen saaminen. Kauppa vaihtaa velan kantajaa, ja syntymä aloittaa nollasta. Velan luonti tapahtuu vain valitulla kokeellisella erääntymissäännöllä.

## Mitä satunnaistetaan?

- Yhteisössä on 30 elossa olevaa ihmistä. Alkujoukko on 20–60-vuotiaita; kaikki aloittavat nollavelasta. Kuolleen tilalle syntyy nollavuotias, joka tulee mukaan palvelukauppaan 18-vuotiaana.
- Elinikä arvotaan väliltä 65–100 vuotta. Tämä on testijakauma, ei väestöennuste. Todellista arvottua kuolinikää ei käytetä velkarajan laskennassa.
- Työpalvelun myyjä ja ostaja arvotaan. Palvelu käyttää yhden yksikön myyjän vuosittaisesta 2–8 yksikön työaikabudjetista. Jokaiselle aikuiselle tehdään keskimäärin kaksi kauppayritystä vuodessa.
- Palvelun mukana siirtyväksi sovittu velka on 1–20 yksikköä. Ostaja antaa suostumuksen 95 %:ssa yrityksistä. Lisäksi kirjanpito tarkistaa vastaanottorajan ja avoimet varaukset.
- Velka erääntyy toimitusvuonna tai 1–2 vuotta myöhemmin. Palvelu toimitetaan ja kulutetaan heti hyväksytyssä kaupassa. Epäonnistuneen kaupan palvelusuorite poistuu vanhenemisena.
- Vastaanottoraja perustuu arvioon jäljellä olevasta ajasta (90 vuotta miinus ikä), kapasiteettiin ja vuosittain arvottuun ennustekertoimeen 0,25–1,5. Tämä on tarkoituksella vaihteleva testisyöte, ei ratkaistu elinikäisen velansiirtokyvyn malli.
- Kuolemassa henkilön velka poistuu ja hänen avoimet sopimuksensa perutaan aiemman prototyypin koevalinnan mukaisesti. Yrityksiä ei ole tässä testissä.

Vuosijärjestys on ikääntyminen ja kuolemat → korvaavat syntymät → rajojen päivitys → vanhojen sopimusten selvitys → palvelukaupat → uusi selvitys → vuosiraportti. Yksi askel on yksi vuosi. Vuosiluku ei tee tästä yhteiskunnan ennustetta: testi käy läpi monta sukupolvea.

## Mitä tarkistetaan?

Jokaisen hyväksytyn tapahtuman jälkeen tarkistetaan alkuperäisen moottorin saldo- ja resurssiehdot. Lisäksi erillinen tarkastuskirjanpito laskee tapahtumista uudestaan jokaisen henkilön velan ja yhteisön saamisen. Näin testi havaitsee myös väärälle ihmiselle päätyvän velan, vaikka kaikkien velkojen summa näyttäisi oikealta. Virhe keskeyttää ajon heti.

Kokonaislukuyksiköt välttävät liukulukujen pyöristysvirheet. Hylätyt kaupat ja erääntyneet mutta selvittämättömät lupaukset raportoidaan erikseen. **Täsmäävä kirjanpito ei tarkoita, että kaikki sopimukset selvitetään tai että palveluja riittää.** Avoimet lupaukset ovat tulevia vastaanottoja, eivät vielä kirjattua velkaa.

Ajo säilyttää vuosiyhteenvedot ja tapahtumamäärät. Selvitetyt ja perutut sopimukset poistetaan aktiivisesta työjonosta, ja jo tarkistettu yksityiskohtainen tapahtumaloki tyhjennetään vuosittain muistin säästämiseksi. Kuolleiden henkilöiden nollasaldot jäävät tarkastettaviksi. Koko tapahtumakulun saa toistettua samalla siemenellä ja samalla ohjelmaversiolla.

## Ajaminen ja tulosten lukeminen

```bash
python3 -m velkatalous.monte_carlo --runs 100 --years 300 --population 30
python3 -m unittest discover -s tests -v
```

Tulokset: `results/monte_carlo/summary.json` ja `results/monte_carlo/annual.csv`. CSV avautuu taulukkolaskennassa. `error` on kirjanpidon täsmäytysero: sen tulee olla jokaisella rivillä nolla. `debt` ja `community_claim` ovat henkilösaldojen summa ja erikseen laskettu yhteisön saaminen. `overdue_promises` kertoo erääntyneet selvittämättömät lupaukset. `created` ja `extinguished` ovat kumulatiivisia määriä.

Testin läpäisy tarkoittaa, ettei näissä satunnaisissa tapahtumahistorioissa löytynyt kirjanpitovirhettä. Se ei ole matemaattinen todistus kaikkien mahdollisten tapahtumaketjujen virheettömyydestä eikä arvio hintojen, elintason tai velkarajojen toimivuudesta. Kulutus- tai varallisuustavoitteita ei tässä rasituskokeessa optimoida.
