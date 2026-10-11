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
- Reitti näkyy vertaisittain. Koska kumpikaan pää ei tiedä toisen IPv4-osoitetta, onnistunut suora pari on IPv6, vaikka Chrome piilottaisi osoitteet (merkintä *päätelty*). Jos yhteys ei 20 sekunnissa ole auki, se merkitään **failed**.
- Käynnistystesti: ennen liittymistä sivu tarkistaa, tavoittaako selain jedin (IPv6) ja löytyykö sille julkinen IPv6-osoite (2000::/3) ICE-kandidaateista. Jos jedi ei vastaa, sivu ilmoittaa puhelimen olevan vanha puukalikka ja neuvoo kokeilemaan mobiilidataa. Liittyminen on silloin estetty.
- Koska jedi on ulospäin vain IPv6, IPv4-käyttäjä ei saa jediltä edes sivua. Siksi sivu julkaistaan myös GitHub Pagesiin (IPv4+IPv6): **https://pereuna.github.io/certiratio/launchpad.html** (`tools/publish-pages.sh`, haara `gh-pages`). Sieltä ladattuna IPv4-käyttäjä näkee varoituksen. Muualta kuin jediltä ladattu sivu signaloi oletuksena osoitteeseen `wss://jedi.ydns.eu:8443/`.
- DataChannel on DTLS-salattu päästä päähän: operaattori ja jedi eivät näe tekstiä.
- PoC: ei tunnistusta eikä nimien todennusta.
- Avoinna: oma STUN jediin (Googlen STUN on ainoa suuryhtiön osa; se näkee vain osoitteet, ei tekstiä), testi kahdella puhelimella eri liittymillä.

## Suora pari ilman palvelinta (`web/direct.html`)

Kaksi puhelinta muodostaa suoran IPv6-yhteyden ilman signalointi- ja STUN-palvelinta: WebRTC-tarjous ja -vastaus vaihdetaan QR-koodeilla. Sivun lataamisen jälkeen palvelinta ei tarvita. Yhteyden jälkeen sama tekstivirta kuin launchpadissa (`src/streamview.js`).

Testaajille: **https://pereuna.github.io/certiratio/direct.html** (myös https://jedi.ydns.eu:8443/direct.html).

1. A painaa **Aloita** ja näyttää QR-koodin. B skannaa sen puhelimen kameralla, ja sivu avautuu B:lle tarjous mukanaan (`direct.html#1.o.…`).
2. B:n sivu tekee vastauksen ja näyttää sen QR-koodina. A skannaa sen omalla kamerallaan. Avautuva välilehti (`#1.a.…`) välittää vastauksen A:n alkuperäiselle välilehdelle (`BroadcastChannel`), ja A palaa siihen.
3. Yhteys syntyy, ja ylärivi näyttää reitin (`IPv6 direct`, host → host) ja viiveen.

Varakeinot: **Jaa linkki** / **Kopioi linkki** (pikaviestimellä) ja A:n liitä-kenttä vastauslinkille.

- `src/pairing.js`: tarjous ja vastaus tiiviinä merkkijonona `1.o|a.UFRAG.PWD.SORMENJÄLKI.MID.OSOITE_PORTTI,…` (noin 150 merkkiä): ICE-tunnus ja -salasana, DTLS-sormenjälki (sha-256, base64url), mid ja vain IPv6-osoitteet (ei link-localia, IPv4:ää eikä mDNS-nimiä). Vastaanottaja kokoaa niistä SDP:n. QR-koodi on versio ≤ 11 (testi `tests/pairing.test.mjs`).
- QR-koodit tekee `src/vendor/qrcode.js` (qrcode-generator 1.4.4, Kazuhiko Arase, MIT, sellaisenaan npm:stä). Skannaus on puhelimen oma kamera; sivu ei pyydä kameralupaa.
- Ilman STUNia selaimen on kerrottava IPv6-osoitteensa itse. Androidin Chrome tekee niin (havaittu T6:ssa); työpöytä-Chrome piilottaa osoitteet mDNS-nimillä, ja sivu tarjoaa silloin **Kokeile STUN-avulla** (`?stun`: Googlen STUN vain osoitteen selvittämiseen).
- Yhteys, joka ei synny 45 sekunnissa, on epäonnistunut, ja sivu neuvoo aloittamaan uuden parin. Puhelin voi jäädyttää taustalle jääneen välilehden; A:n kannattaa palata alkuperäiseen välilehteen heti skannauksen jälkeen.
- Testi: `tools/drive-direct.mjs` (kaksi Chromiumia, A:n kameravälilehti A:n selaimessa). Työpöytä-Chromen pitää käynnistyä `--disable-features=WebRtcHideLocalIpsWithMdns`, jotta se kertoo osoitteensa kuten puhelin. Kahdella selaimella samassa koneessa STUN-varakeino ei toimi: vastaaja näkee tarjoajan osoitteen omanaan eikä kysy STUNilta.
- Avoinna: B:n esittely muille A:n kanavan kautta (signalointi vertaisverkossa), jolloin verkko laajenee ilman palvelinta.

Julkaisu molempiin paikkoihin muutoksen jälkeen (commit ja push ensin; palvelinta ei käynnistetä uudelleen):

```bash
tools/publish-pages.sh                                   # GitHub Pages, näkyy noin minuutissa
scp web/launchpad.html web/direct.html lapere@jedi.ydns.eu:rtcsignal/site/
scp web/src/{launchpad,direct,stream,streamview,pairing,signaling,classify}.js lapere@jedi.ydns.eu:rtcsignal/site/src/
scp web/src/vendor/qrcode.js lapere@jedi.ydns.eu:rtcsignal/site/src/vendor/
```

Tulokset jediltä: `ssh lapere@jedi.ydns.eu 'grep launchpad ~/rtcsignal/pages.log'` (liittymiset, IPv6-testi, reitit).

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/launchpad.html`. `tools/drive-launchpad.mjs` ajaa kolmen vertaisen testin DevTools-protokollalla (puhelin `adb forward tcp:9223 localabstract:chrome_devtools_remote`, Chromium `--remote-debugging-port=9222`).
