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

## Suora verkko ilman palvelinta (`web/direct.html`)

Puhelimet muodostavat suoran IPv6-verkon ilman signalointi- ja STUN-palvelinta. Ensimmäinen yhteys syntyy QR-koodeilla; sen jälkeen kuka tahansa jäsen voi kutsua uuden puhelimen, ja verkko esittelee sen muille. Sivun lataamisen jälkeen palvelinta ei tarvita. Tekstivirta on sama kuin launchpadissa (`src/streamview.js`).

Testaajille: **https://pereuna.github.io/certiratio/direct.html** (myös https://jedi.ydns.eu:8443/direct.html).

1. A painaa **Aloita** ja näyttää QR-koodin. B skannaa sen puhelimen kameralla, ja sivu avautuu tarjous mukanaan (`direct.html#1.o.…`).
2. B:n sivu näyttää vastauksen QR-koodina, ja A skannaa sen omalla kamerallaan. Avautuva välilehti (`#1.a.…`) välittää vastauksen A:n alkuperäiselle välilehdelle (`BroadcastChannel`), ja A palaa siihen.
3. Uusi puhelin C: kuka tahansa jäsen painaa **Kutsu uusi**, ja kutsu tehdään samoin QR-koodeilla. Sen jälkeen C saa suoran yhteyden kaikkiin muihin ilman uusia koodeja.

Verkon kasvu (`src/direct.js`, protokolla `certiratio-direct/2` DataChannelissa):

- **hello**: jokainen lähettää naapurilistansa (8-merkkiset satunnaiset id:t) aina, kun se muuttuu. Kun puhelin näkee listalla jäsenen, johon sillä ei ole yhteyttä, pienempi id tekee tarjouksen (ei törmäyksiä).
- **sig**: tarjous ja vastaus (koko SDP, vain IPv6-kandidaatit) osoitetaan id:lle. Välittäjä vie sen suoraan perille, jos sillä on yhteys kohteeseen, muuten kaikille naapureilleen (`ttl` 8, kaksoiskappaleet tunnistetaan `mid`:stä). Loki kertoo välittäjien määrän.
- **chars**: tekstivirta leviää kaikille, ja jokainen välittää sen eteenpäin, joten se kiertää myös puuttuvan suoran yhteyden ohi.
- Katkennut yhteys palautuu, kun naapurilistat seuraavan kerran muuttuvat. Yhteyttä, joka ei syntynyt 45 sekunnissa, ei yritetä uudelleen.

Ensimmäisen yhteyden QR-koodi (`src/pairing.js`): tarjous ja vastaus tiiviinä merkkijonona `1.o|a.UFRAG.PWD.SORMENJÄLKI.MID.OSOITE_PORTTI,…` (noin 150 merkkiä): ICE-tunnus ja -salasana, DTLS-sormenjälki (sha-256, base64url), mid ja vain IPv6-osoitteet (ei link-localia, IPv4:ää eikä mDNS-nimiä). Vastaanottaja kokoaa niistä SDP:n. QR-koodi on versio ≤ 11 (`tests/pairing.test.mjs`).

- QR-koodit tekee `src/vendor/qrcode.js` (qrcode-generator 1.4.4, Kazuhiko Arase, MIT, sellaisenaan npm:stä). Skannaus on puhelimen oma kamera; sivu ei pyydä kameralupaa.
- Ilman STUNia selaimen on kerrottava IPv6-osoitteensa itse. Androidin Chrome tekee niin. iPhone (kaikki iOS-selaimet ovat WebKitiä) ja työpöytä-Chrome piilottavat osoitteet mDNS-nimillä; sivu kysyy osoitteen silloin automaattisesti Googlen STUNilta (`?stun` pakottaa sen heti). STUN vain kertoo osoitteen, liikenne kulkee silti suoraan. Aiemmin tästä tuli erillinen nappi, jota iPhone 11:llä luultiin IPv6:n puuttumiseksi.
- Puhelin voi jäädyttää taustalle jääneen välilehden; kutsujan kannattaa palata alkuperäiseen välilehteen heti skannauksen jälkeen.
- Testi: `tools/drive-direct.mjs URL PORTA PORTB PORTC PORTD [PORTE] [--cut]`, jokainen puhelin oma Chromium (`--disable-features=WebRtcHideLocalIpsWithMdns`, jotta se kertoo osoitteensa kuten puhelin). A ja B QR:llä, A kutsuu C:n, C kutsuu D:n; kaikilla suorat IPv6-yhteydet kaikkiin ja tekstit perillä. `--cut`: A katkaisee yhteyden D:hen, A:n teksti kulkee D:lle muiden kautta, ja E liittyy D:n kutsulla; A:n ja E:n esittely kulkee välittäjän kautta. Kahdella selaimella samassa koneessa STUN-varakeino ei toimi: vastaaja näkee tarjoajan osoitteen omanaan eikä kysy STUNilta.
- Kahdella puhelimella testattu 2026-10-11 (pari). Kolmen tai useamman puhelimen verkko on testattu Chromiumeilla.
- Avoinna: puhelimen taustalle jääminen ja IPv6-osoitteen vaihtuminen (yhteys katkeaa), tunnistus avaimilla (id on satunnainen ja itse ilmoitettu), suurten verkkojen rajattu naapurimäärä täyden verkon sijaan.

Julkaisu molempiin paikkoihin muutoksen jälkeen (commit ja push ensin; palvelinta ei käynnistetä uudelleen):

```bash
tools/publish-pages.sh                                   # GitHub Pages, näkyy noin minuutissa
scp web/launchpad.html web/direct.html lapere@jedi.ydns.eu:rtcsignal/site/
scp web/src/{launchpad,direct,stream,streamview,pairing,signaling,classify}.js lapere@jedi.ydns.eu:rtcsignal/site/src/
scp web/src/vendor/qrcode.js lapere@jedi.ydns.eu:rtcsignal/site/src/vendor/
```

Tulokset jediltä: `ssh lapere@jedi.ydns.eu 'grep launchpad ~/rtcsignal/pages.log'` (liittymiset, IPv6-testi, reitit).

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/launchpad.html`. `tools/drive-launchpad.mjs` ajaa kolmen vertaisen testin DevTools-protokollalla (puhelin `adb forward tcp:9223 localabstract:chrome_devtools_remote`, Chromium `--remote-debugging-port=9222`).
