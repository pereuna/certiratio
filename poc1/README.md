# PoC 1 — selain-P2P, vaihe 1: IPv6/WebRTC-verkkotesti

Toteuttaa [määrittelyn](../docs/POC1-BROWSER-P2P.md) kohdat 3.2 (signaling), 3.3 (IPv6-mittaus) sekä testit T5 ja T6. Kirjanpitotapahtumia (ISSUE, TRANSFER, SETTLE), identiteettiavaimia tai IndexedDB:tä tämä vaihe ei vielä sisällä. Niitä koskevat [tarkastusmuistion](../docs/POC1-BROWSER-P2P-REVIEW.md) täsmennykset on ratkaistava ennen toteutusta.

Vaatii Node.js 20:n tai uudemman. Ei npm-riippuvuuksia.

```bash
cd poc1
npm test                                   # luokittelu + signaling-palvelin
node signal/server.mjs --port 8080         # http://localhost:8080/
```

## HTTPS muille laitteille

Selain vaatii suojatun kontekstin muualla kuin `localhost`issa. Kehityksessä riittää itse allekirjoitettu varmenne. Puhelin varoittaa siitä, ja varoitus hyväksytään kerran.

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 30 \
  -keyout key.pem -out cert.pem -subj "/CN=certiratio-poc1"
node signal/server.mjs --cert cert.pem --key key.pem      # https://[IPv6-osoite]:8443/
```

Palvelin kuuntelee oletuksena osoitteessa `::` (IPv6 ja IPv4). Jotta toisessa verkossa oleva laite tavoittaa sen, palomuurin ja reitittimen on päästettävä portti läpi. Signaling-palvelin tarvitaan vain yhteyden muodostamiseen.

## T6-testiaskeleet

1. Avaa sivu kahdessa tai kolmessa selaimessa tai laitteessa samalla huonekoodilla, esimerkiksi `…/#koe1`. Paina **Liity huoneeseen**.
2. Taulukon **Reitti**-sarake näyttää valitun ICE-parin luokan: `IPv6 direct`, `IPv4 direct`, `relay`, `unknown` tai `failed`. **Ping RTT** mitataan DataChannelin yli.
3. Toista seuraavilla asetuksilla:
   - STUN-kenttä tyhjänä: vain host-kandidaatit.
   - Oletus-STUN.
   - Oma TURN, rasti kohdassa *vain relay*.
4. Paina **Vie tulokset JSON**. Tiedostossa on luokat, kandidaattityypit ja selaimen tiedot, mutta ei IP-osoitteita.

T5: kun kanavat ovat auki, paina **Sulje signaling** tai pysäytä palvelin. Ping toimii edelleen.

## Luokittelusäännöt (`web/src/classify.js`)

- Luokka päätellään vain valitun parin `getStats()`-kandidaateista, ei laitteen osoitteista.
- Jos jompikumpi pää on `relay`, luokka on aina **relay**, vaikka osoite olisi IPv6.
- Chrome piilottaa host-osoitteet mDNS-nimillä (`*.local`). Silloin perhe luetaan parin toisesta päästä. Jos kumpikaan pää ei paljasta osoitetta, luokka on **unknown**.
- mDNS-nimet ratkeavat vain lähiverkossa. Verkkojen välisessä testissä ilman STUNia suora yhteys voi siksi epäonnistua, vaikka molemmilla olisi julkinen IPv6. Oletus-STUN on Googlen julkinen `stun.l.google.com:19302`, ja kenttää voi muuttaa.

## IPv6 launchpad (`web/launchpad.html`)

Saman huoneen selaimet muodostavat suoran **IPv6**-WebRTC-meshin ja jakavat yhden tekstivirran. Erillistä syöttökenttää ei ole: on yksi yhteinen kursori virran lopussa, johon kaikkien merkit menevät saapumisjärjestyksessä heti, joten samaan aikaan kirjoitettu sekoittuu ("huuda toisen päälle"). Enter (↵) on rivinvaihto, pyyhkimistä ei lähetetä. Nimiä ei näytetä: jokainen saa liittyessään arvotun, hieman eri sävyn, josta kirjoittajaa voi arvailla.

Testaajille: **https://pereuna.github.io/certiratio/** (GitHub Pages, IPv4+IPv6). Suoraan jediltä: https://jedi.ydns.eu:8443/launchpad.html. Huone on `launchpad`; toisen huoneen saa `#nimi`-osalla (`…/launchpad.html#nimi`).

Esittelyteksti välttää sanaa vertaisverkko (kuulostaa useimmista darknetiltä) ja sanaa julkinen (IPv6-osoitteen julkisuus pelottaa ammattilaisiakin): käyttäjä näkee "Suoraan puhelimesta puhelimeen" ja "IPv6 OK!".

- Testin kohde on IPv6-P2P. Mobiiliverkon IPv4 on operaattorin NATin (CGNAT) takana, joten puhelimesta toiseen sillä ei ole suoraa reittiä. IPv6:ssa jokaisella liittymällä on julkinen /64. Siksi IPv4- ja mDNS-kandidaatit hylätään molempiin suuntiin, ja hylätyt lasketaan. TURNia ei käytetä.
- Signalointi on jedin Plan2001-`rtcsignal` (`monolith/tools/rtcsignal`, enintään 8 vertaista huoneessa). Palvelin vain esittelee vertaiset. Se kirjaa sivujen lokin (liittymiset, reitit, epäonnistumiset) jedin tiedostoon `~/rtcsignal/pages.log`, mutta tekstiä ei.
- STUN (`stun.l.google.com:19302`) kertoo selaimelle vain sen oman julkisen osoitteen, koska työpöytä-Chrome piilottaa host-osoitteet mDNS:llä. Liikenne kulkee silti suoraan. `?stun=` ilman arvoa poistaa STUNin, ja `?stun=URL` vaihtaa sen.
- Yhteenveto: *Huoneessa N · suoria yhteyksiä M*; kun kaikki toimii, M = N − 1 kaikilla. Poistunut vertainen, jonka P2P-kanava ei ole auki (esim. sivu ladattiin uudelleen), poistuu listalta.
- Reitti näkyy vertaisittain. Koska kumpikaan pää ei tiedä toisen IPv4-osoitetta, onnistunut suora pari on IPv6, vaikka Chrome piilottaisi osoitteet (merkintä *päätelty*). Jos yhteys ei 20 sekunnissa ole auki, se merkitään **failed**.
- Käynnistystesti: ennen liittymistä sivu tarkistaa, tavoittaako selain jedin (IPv6) ja löytyykö sille julkinen IPv6-osoite (2000::/3) ICE-kandidaateista. Jos jedi ei vastaa, sivu ilmoittaa puhelimen olevan vanha puukalikka ja neuvoo kokeilemaan mobiilidataa. Liittyminen on silloin estetty.
- Koska jedi on ulospäin vain IPv6, IPv4-käyttäjä ei saa jediltä edes sivua. Siksi sivu julkaistaan myös GitHub Pagesiin (IPv4+IPv6): **https://pereuna.github.io/certiratio/launchpad.html** (`tools/publish-pages.sh`, haara `gh-pages`). Sieltä ladattuna IPv4-käyttäjä näkee varoituksen. Muualta kuin jediltä ladattu sivu signaloi oletuksena osoitteeseen `wss://jedi.ydns.eu:8443/`.
- DataChannel on DTLS-salattu päästä päähän: operaattori ja jedi eivät näe tekstiä.
- PoC: ei tunnistusta eikä nimien todennusta.
- Avoinna: oma STUN jediin (Googlen STUN on ainoa suuryhtiön osa; se näkee vain osoitteet, ei tekstiä), testi kahdella puhelimella eri liittymillä.

## Rengas: suora verkko ilman palvelinta (`web/direct.html`)

Puhelimet muodostavat suoran IPv6-verkon ilman signalointipalvelinta, ja jäsenet muodostavat **renkaan** ([rekisteröitymismuistio](../docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md), vaiheen 1 rakennetesti). Sivun lataamisen jälkeen palvelinta ei tarvita. Tekstivirta on sama kuin launchpadissa (`src/streamview.js`).

Testaajille: **https://pereuna.github.io/certiratio/direct.html** (myös https://jedi.ydns.eu:8443/direct.html).

Testitarina "siemenen kylväjä":
1. **isi** kirjoittaa nimensä, valitsee kuvan ja painaa **Aloita uusi rengas**.
2. **Törttö** 🐈 (isin toinen puhelin): isi painaa **Kutsu toinen perustaja** ja näyttää koodin. Törttö skannaa sen puhelimen kameralla, kirjoittaa nimensä ja näyttää vastauskoodin. isi painaa **Skannaa hänen vastauksensa** ja skannaa sen sivun omalla kameralla. Rengas: isi → Törttö ↺.
3. **Liisa** liittyy isin ja Törtön väliin: isi painaa **Kutsu väliin: minä ja Törttö**, ja koodit vaihdetaan kuten edellä. Sen jälkeen Törtön puhelin näyttää itsestään vahvistuskoodin, ja Liisa skannaa sen (*Liittyminen 3/3*). Rengas: isi → Liisa → Törttö ↺.
4. **äiti** liittyy minkä tahansa vierekkäisen parin väliin, esimerkiksi isin ja Liisan väliin. Kutsun tekee aina parin vasen jäsen (*Kutsu väliin: minä ja seuraava*), ja oikea näyttää vahvistuskoodin.

Liittymisruudussa on kolme hahmoa käsi kädessä (vasen 🤝 **uusi** 🤝 oikea), ja tulokas on korostettu. Renkaan järjestys näkyy yläreunassa (oma nimi lihavoituna, uusin korostettuna hetken). Tekstivirrassa ei näy nimiä; kirjoittajat erottaa sävystä.

Rekisteri (`src/ring.js`, testit `tests/ring.test.mjs`):
- Tapahtumat `found` (aloitus) ja `admit` (uusi jäsen väliin vasen → oikea, nimi, kuva, vahvistuksen haaste). Rengas lasketaan aina tapahtumajoukosta deterministisessä järjestyksessä, joten saapumisjärjestyksellä ei ole väliä.
- `admit` hyväksytään vain, jos vasen ja oikea ovat yhä vierekkäin; puuttuvaa jäsentä odotetaan. Jäsen voi olla vain kerran.
- Vain välin vasen jäsen voi kutsua siihen, ja oikea vahvistaa yhden tulokkaan kerrallaan, joten samaan väliin ei tule kahta liittyjää.
- Jokaisella renkaalla on oma tunniste. Se kulkee koodeissa ja hello-sanomassa: eri renkaiden puhelimet eivät yhdisty, ja toisen renkaan vastauskoodi hylätään. Kaksi erillistä paria samalla sivulla pysyvät siis erillisinä.
- PoC: tunnisteet ovat satunnaisia, eikä tapahtumia allekirjoiteta. Avaimet ovat muistion vaihe 2. Tila katoaa, kun sivu ladataan uudelleen.

Koodit (`src/pairing.js`):
- Kutsu `2.o.RENGAS.VASEN.OIKEA.UFRAG.PWD.SORMENJÄLKI.MID.OSOITE_PORTTI,…`, vastaus `2.a.RENGAS.UFRAG.…` ja vahvistus `2.c.RENGAS.JÄSEN.HAASTE`.
- Mukana vain IPv6-osoitteet (ei link-localia, IPv4:ää eikä mDNS-nimiä), ICE-tunnus ja -salasana, DTLS-sormenjälki (sha-256, base64url) ja mid. Vastaanottaja kokoaa niistä SDP:n. QR-koodi on versio ≤ 11.
- Vanhat `1.`-koodit hylätään ("päivitä sivu").

Verkko (`src/direct.js`, protokolla `certiratio-direct/3` DataChannelissa):
- **hello**: naapurilista, renkaan tunniste, nimi ja kuva aina, kun lista muuttuu. Kun puhelin näkee listalla jäsenen, johon sillä ei ole yhteyttä, pienempi id tekee tarjouksen.
- **events**: koko rekisteri heti yhteyden auettua; **ev**: uusi tapahtuma kaikille.
- **sig**, **sponsor**, **claim**, **vouched**: osoitetut sanomat (tarjous ja vastaus, vahvistuspyyntö oikealle naapurille, tulokkaan haaste, vahvistus kutsujalle). Ne viedään suoraan perille tai muuten kaikille naapureille (`ttl` 8, kaksoiskappaleet `mid`:stä).
- **chars**: tekstivirta leviää kaikille ja kiertää puuttuvan suoran yhteyden ohi.
- Katkennut yhteys palautuu, kun naapurilistat seuraavan kerran muuttuvat. Yhteyttä, joka ei syntynyt 45 sekunnissa, ei yritetä uudelleen.

Kamera ja osoitteet:
- Sivulla on oma QR-lukija (`src/scanner.js`): Android-Chromessa `BarcodeDetector`, muualla `src/vendor/jsQR.js` (jsQR 1.4.0, Apache-2.0), joka ladataan vasta tarvittaessa. Näin kaikki tapahtuu yhdessä välilehdessä. Jos koodi kuitenkin avataan järjestelmäkameralla, uusi välilehti välittää sen odottavalle välilehdelle (`BroadcastChannel`). *Ei kameraa?* -kohdassa on jakolinkki ja liittämiskenttä.
- QR-koodit tekee `src/vendor/qrcode.js` (qrcode-generator 1.4.4, Kazuhiko Arase, MIT).
- Ilman STUNia selaimen on kerrottava IPv6-osoitteensa itse. Androidin Chrome tekee niin. iPhone (kaikki iOS-selaimet ovat WebKitiä) ja työpöytä-Chrome piilottavat osoitteet mDNS-nimillä; sivu kysyy osoitteen silloin automaattisesti Googlen STUNilta (`?stun` pakottaa sen heti). STUN vain kertoo osoitteen, liikenne kulkee silti suoraan.

Testi: `tools/drive-direct.mjs URL PORT_ISI PORT_TORTTO PORT_LIISA PORT_AITI [PORT_Q]`. Jokainen puhelin on oma Chromium (`--disable-features=WebRtcHideLocalIpsWithMdns --use-fake-ui-for-media-stream --use-fake-device-for-media-stream`), ja kamera korvataan `direct.scan()`-kutsulla. Tarina ajetaan läpi: kaikilla on sama rengas isi → äiti → Liisa → Törttö, suorat IPv6-yhteydet kaikkiin ja tekstit perillä. Q aloittaa oman renkaan, ja isin renkaan vastaus hylätään.

- Testattu Chromiumeilla 2026-10-11. Kahden puhelimen pari on testattu aiemmalla versiolla; rengasta ei ole vielä testattu puhelimilla.
- Avoinna: tila katoaa sivun uudelleenlatauksessa, puhelimen taustalle jääminen ja IPv6-osoitteen vaihtuminen (yhteys katkeaa), avaimet ja allekirjoitukset, yhteinen järjestys verkkokatkojen aikana (muistion kohta 13), suurten verkkojen rajattu naapurimäärä täyden verkon sijaan.

Julkaisu molempiin paikkoihin muutoksen jälkeen (commit ja push ensin; palvelinta ei käynnistetä uudelleen):

```bash
tools/publish-pages.sh                                   # GitHub Pages, näkyy noin minuutissa
scp web/launchpad.html web/direct.html lapere@jedi.ydns.eu:rtcsignal/site/
scp web/src/{launchpad,direct,stream,streamview,pairing,signaling,classify,ring,scanner}.js lapere@jedi.ydns.eu:rtcsignal/site/src/
scp web/src/vendor/{qrcode,jsQR}.js lapere@jedi.ydns.eu:rtcsignal/site/src/vendor/
```

Tulokset jediltä: `ssh lapere@jedi.ydns.eu 'grep launchpad ~/rtcsignal/pages.log'` (liittymiset, IPv6-testi, reitit).

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/launchpad.html`. `tools/drive-launchpad.mjs` ajaa kolmen vertaisen testin DevTools-protokollalla (puhelin `adb forward tcp:9223 localabstract:chrome_devtools_remote`, Chromium `--remote-debugging-port=9222`).
