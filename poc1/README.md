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

Sivu: **https://jedi.ydns.eu:8443/launchpad.html** (huone `launchpad`, toisen huoneen saa `#nimi`-osalla).

- Testin kohde on IPv6-P2P. Mobiiliverkon IPv4 on operaattorin NATin (CGNAT) takana, joten puhelimesta toiseen sillä ei ole suoraa reittiä. IPv6:ssa jokaisella liittymällä on julkinen /64. Siksi IPv4- ja mDNS-kandidaatit hylätään molempiin suuntiin, ja hylätyt lasketaan. TURNia ei käytetä.
- Signalointi on jedin Plan2001-`rtcsignal` (`monolith/tools/rtcsignal`, enintään 8 vertaista huoneessa). Palvelin vain esittelee vertaiset. Se kirjaa sivujen lokin (liittymiset, reitit, epäonnistumiset) jedin tiedostoon `~/rtcsignal/pages.log`, mutta tekstiä ei.
- STUN (`stun.l.google.com:19302`) kertoo selaimelle vain sen oman julkisen osoitteen, koska työpöytä-Chrome piilottaa host-osoitteet mDNS:llä. Liikenne kulkee silti suoraan. `?stun=` ilman arvoa poistaa STUNin, ja `?stun=URL` vaihtaa sen.
- Reitti näkyy vertaisittain. Koska kumpikaan pää ei tiedä toisen IPv4-osoitetta, onnistunut suora pari on IPv6, vaikka Chrome piilottaisi osoitteet (merkintä *päätelty*). Jos yhteys ei 20 sekunnissa ole auki, se merkitään **failed**.
- Käynnistystesti: ennen liittymistä sivu tarkistaa, tavoittaako selain jedin (IPv6) ja löytyykö sille julkinen IPv6-osoite (2000::/3) ICE-kandidaateista. Jos jedi ei vastaa, sivu ilmoittaa puhelimen olevan vanha puukalikka ja neuvoo kokeilemaan mobiilidataa. Liittyminen on silloin estetty.
- Koska jedi on ulospäin vain IPv6, IPv4-käyttäjä ei saa jediltä edes sivua. Siksi sivu julkaistaan myös GitHub Pagesiin (IPv4+IPv6): **https://pereuna.github.io/certiratio/launchpad.html** (`tools/publish-pages.sh`, haara `gh-pages`). Sieltä ladattuna IPv4-käyttäjä näkee varoituksen. Muualta kuin jediltä ladattu sivu signaloi oletuksena osoitteeseen `wss://jedi.ydns.eu:8443/`.
- PoC: ei tunnistusta eikä nimien todennusta.

Asennus jediin (palvelinta ei käynnistetä uudelleen):

```bash
scp web/launchpad.html lapere@jedi.ydns.eu:rtcsignal/site/
scp web/src/{launchpad,stream,signaling,classify}.js lapere@jedi.ydns.eu:rtcsignal/site/src/
```

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/launchpad.html`. `tools/drive-launchpad.mjs` ajaa kolmen vertaisen testin DevTools-protokollalla (puhelin `adb forward tcp:9223 localabstract:chrome_devtools_remote`, Chromium `--remote-debugging-port=9222`).
