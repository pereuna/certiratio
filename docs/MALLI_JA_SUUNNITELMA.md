# Certiratio: suhteellisen saldon mekanismi ja tutkimussuunnitelma

Nykyinen mallilähde on [VELKATALOUS_CONTEXT.md](../VELKATALOUS_CONTEXT.md). V2 korvaa v1:n ei-negatiiviset absoluuttiset saldot ja määräaikaisiin lupauksiin perustuvan velanluonnin. Vahvistettu protokollavalinta ei tarkoita empiirisesti vahvistettua talousväitettä.

## 1. Kirjanpito

Jokaisen henkilön suhteellinen saldo `x_i` on etumerkillinen kokonaisluku. Nollasta voi siirtyä suoraan negatiiviseksi. Ajatuksellinen `D_i = K + x_i` erottaa historiallisen perusvelan ja kirjatun poikkeaman; K ja D eivät ole numeerisia ohjelmatiloja.

Kaupassa A luovuttaa hyödykkeen B:lle, A:n saldo pienenee p:llä ja B:n kasvaa p:llä. Kokonaisnetto säilyy. Hyväksyntä edellyttää erillisiä aktiivisia toimijoita, eksplisiittistä suostumusta, riittävää hyödykemäärää ja positiiviselle hinnalle `x_B + p <= L_B`. Kaikki tarkistetaan ennen mutaatioita. Myyjän saldokatetta ei vaadita. Ilmainen hyödykeluovutus ei lisää saldoa ja onnistuu myös vastaanottorajan ylityttyä. Nollamääräisellä hyödykkeellä ei voi tehdä positiivisen hinnan kauppaa.

Kuolemassa `C += x_i`, henkilösaldo nollataan ja tili suljetaan. C on yhteisön selvitystili, jota tavallinen transfer/trade ei voi käyttää. Kirjanpito säilyttää `sum_alive(x_i) + C = 0`. Kuoleman siirto ei ole kaupankäynnin liikevaihtoa. Kuolleiden tilit jäävät nollasaldoisiksi tarkastettaviksi. Uusi ihminen aloittaa nollasta, eikä samaa identiteettiä voi rekisteröidä uudelleen.

Tämä kuolemasääntö on keskustelun vaihtoehdoista valittu toteutusoletus, ei väite juridisesta lopullisesta ratkaisusta. Yrityksen lopettamista ei käsitellä ihmisen kuolemana. Kuolleen hyödykkeet tuhotaan tässä tuotantokokeessa; perintöä ei mallinneta.

## 2. Kerrosten vastuut

- `ledger.py`: henkilöt, suhteelliset saldot, välittömät kaupat, yhteisötili ja saldo-/varastoinvariantit.
- `physical.py`: tuotantoreseptit, panosten käyttö, kulutus ja vanheneminen. Ei saldomuutoksia.
- `policies.py`: kokeellinen elinikäisen vastaanottorajan ennuste.
- `simulation.py`: agenttien toiminta, markkinajärjestys ja aika.
- `monte_carlo.py`: satunnaistettu sukupolvien yli ulottuva kirjanpidon rasituskoe ja riippumaton tapahtumatarkastus.
- `scenarios.py`: toistettavien neljän ABM-skenaarion tulosten tuottaminen.

Jokainen hyväksytty tapahtuma tarkistaa tilien summan sekä `varasto = alkuvarasto + tuotettu - käytetty - kulutettu - tuhottu` kullekin hyödykkeelle. Nämä tarkistukset toimivat myös Pythonin optimointitilassa. Hyödykelajin varastotase ei yksin ole materiaalimassan tai energian säilymislaki.

## 3. Ensimmäinen ABM

Yhdeksän työntekijää tarjoaa 1–3 työtuntia oman kulutus-/vapaa-aikatyypin mukaan. Kolme henkilöomistajaa tuottaa ruokaa, puuta ja laatikoita. Työntekijän työtoimitus pienentää hänen saldoaan ja kasvattaa työn vastaanottajan saldoa välittömästi. Tuottaja voi siirtää saldoa edelleen lopputuotteen mukana samassa jaksossa.

Reseptit: 1 resurssi + 1 työ → 2 ruokaa; 1 resurssi + 1 työ → 1 puu; 1 puu + 1 työ → 1 laatikko. Kapasiteetti on enintään kuusi erää/yksikkö/jakso. Alkuvarannot ovat äärellisiä ja käyttämätön työ vanhenee jakson lopussa. Hinnat ovat kiinteitä koeparametreja, eivät empiirisiä velkahintoja.

Agentit pyrkivät valittuun kulutus- ja toimintamäärään. Nollasaldoa tai negatiivisen saldon maksimointia ei tavoitella. Omistaja saa kuluttaa omaa tuotettaan ilman saldosiirtoa. Negatiivisen saldon vastaanottovaraa ei kuitenkaan pidetä taloudellisesti merkityksettömänä.

Rajaennuste on `0.5 × jäljellä oleva horisontti × (priori + viiden edellisen jakson siirtoliikevaihto)/6 × kerroin`, kokonaislukuna vähintään nolla. Siirtoliikevaihtoon lasketaan kaikki toteutuneet kaupat ja saldosiirrot, myös nollasta tai negatiivisesta saldosta tehtävät myynnit. Horisontti arvotaan alussa 40–80 jaksoon; se ei ole tiedossa oleva kuolinaika. Saldo voi ylittää laskeneen rajan, mutta uudet positiiviset vastaanotot estetään; myynti ja ilmainen vastaanotto sallitaan.

Jakso: rajojen päivitys → työ → ruoan ja puun tuotanto → puukauppa → laatikkotuotanto → kuluttajien satunnaistettu järjestys → kaupat ja kulutus → työn vanheneminen → mahdolliset kuolemat → mittarit. Velan erääntymisvaihetta ei ole. Tämä järjestys mahdollistaa välipanoksen välittömän käytön.

## 4. Mittarit

`balance_sum` on elävien toimijoiden nettosumma, `community_balance` yhteisön selvityssaldo. Niiden yhteissumma ja `accounting_error` ovat nolla. `positive_balance_total` on positiivisten saldojen summa, `negative_balance_total` negatiivisten saldojen etumerkillinen summa. `gross_balance` on henkilöiden itseisarvojen summa. Mikään näistä ei mittaa absoluuttista historiallista velkaa.

`transfer_volume` on kaupoissa ja erillisissä saldosiirroissa liikkunut määrä jaksossa. `turnover_per_gross_balance` jakaa sen jakson alku- ja loppu-gross_balancen keskiarvolla; nollanimittäjällä arvo on null. Se ei ole vanha absoluuttisen velan kiertonopeus.

Tuotanto ja kulutus ovat kumulatiivisia; työtunnit, toteutumaton kysyntä ja hylkäykset jakson virtoja. Työtunnit tarkoittavat toimitettua työtä, eivät välttämättä tuotannossa käytettyä työmäärää. Avoimia lupauksia tai piilovelanluontia ei raportoida, koska niitä ei ole mekanismissa.

## 5. Tutkimuksen seuraavat vaiheet

**Ensimmäinen tapahtumajärjestelmän toteutus on selainpohjainen. Kaikki paperiset ratkaisut ovat aluksi sekundäärinen tavoite.** Ensimmäisen selainversion lähtökohta on jokaisen hyväksytyn suoran kaupan välitön rekisteröinti taustapalvelun valvomana. Paperitositteet, kuittivihkot, paperivaltuutukset ja paperiset velkasetelit suunnitellaan myöhemmässä vaiheessa; niiden valmius ei estä selainversion valmistumista.

[Velkasetelipohdinta](VELKASETELIT_JA_TOTEUTUSJARJESTYS.md) säilyttää tutkimusvaihtoehdon suorien siirtojen rinnalla kiertävästä välillisestä instrumentista. Sen haltijaoikeus, kertalunastus, liikkeessä olevien vastuiden valvonta, jakaminen ja vaihtoraha on ratkaistava ennen käyttöönottoa. Avoin peruskysymys on jokaisen vaihdon rekisteröinti suhteessa lopullisten nettomuutosten kirjaamiseen. Tämä vaihtoehto ei ole ensimmäisen selainversion jo päätetty tai toteutettu ominaisuus.

Tapahtumaprotokollan sitovat [kannustinyhteensopivuusvaatimukset](KANNUSTINYHTEENSOPIVUUS.md) ohjaavat jatkototeutusta. Ostaja hyväksyy tositteen kaupantekohetkellä, myyjä rekisteröi ja laskentatoimisto valvoo hyväksyttävyyttä. Myyjän hyvitystä ei saa jättää ostajan myöhemmän vapaaehtoisen toimen varaan. Hyvitystakuu edellyttää ostajan tapahtumaoikeuden tarkistamista; myös tekemättä jättäminen, toisteinen lähetys, häiriöt ja hylätyn mutta jo toimitetun kaupan selvitys määritellään.

Ennen tapahtumaprotokollan katsomista toteutetuksi on osoitettava käyttöönotettavaan toteutusmuotoon soveltuvat vaatimusdokumentin hyväksymiskriteerit. Paperikohtaiset kriteerit täytetään ennen paperiratkaisun mahdollista myöhempää käyttöönottoa. Nykyinen `consent=True`, vastaanottorajan tarkistus ja kirjanpidon atomisuus ovat tutkimussimulaattorin toimintoja. Ne eivät todista tositteen aitoutta, henkilöllisyyttä tai fyysistä toimitusta eivätkä toteuta paperivaltuutuksia, tositteen kertakirjausta, riitautusta tai palvelun häiriöpalautumista.

Hinnat, kulutuksen ja työn tarjonnan vasteet, elinikärajat ja tuotantokertoimet tarvitsevat kalibrointia. Negatiivisten saldojen kannustimet ja yhteisötilin kertymä on tutkittava erikseen. Rahatalousvertailu edellyttää samoja resursseja, teknologioita, väestöä ja häiriöitä sekä erikseen määriteltyjä rahoitussääntöjä. Yksittäinen ajo tai nollasumman säilyminen ei osoita tasapainoa tai paremmuutta.

Identiteetit, fyysisen toimituksen todentaminen, yritysten oikeudelliset vastuut, perintö, julkisten palveluiden saldosiirrot ja yhteisötilin oikeudellinen käsittely ovat avoimia. API:n suostumus on testisyöte, ei henkilöllisyyden tai tietoisen hyväksynnän todentaminen. Lohkoketjua ei toteuteta.

## 6. Menetelmällinen lähdepohja

[Bank of England: A dynamic model of financial balances for the UK (2016)](https://www.bankofengland.co.uk/working-paper/2016/a-dynamic-model-of-financial-balances-for-the-uk) kuvaa stock–flow-kirjanpidon ja reaalipäätösten yhteyttä.

[Bank of England: Agent-based modeling at central banks (2025)](https://www.bankofengland.co.uk/working-paper/2025/agent-based-modeling-at-central-banks-recent-developments-and-new-challenges) käsittelee heterogeenisia agentteja, verkostoja ja mekanismikokeita.

[BEA: Input-Output Accounts](https://www.bea.gov/data/industries/input-output-accounts-data) kuvaa tuotantopanosten toimialayhteyksiä. Arvomääräisiä taulukoita ei voi sellaisenaan tulkita Certiration velkahinnoiksi.

Lähteet tukevat tutkimusmenetelmien käyttöä, eivät vahvista tämän protokollan elinkelpoisuutta.
