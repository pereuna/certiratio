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

## Rengas: suora verkko, jedi kohtaamispaikkana (`web/direct.html`)

Puhelimet muodostavat suoran IPv6-verkon, ja jäsenet muodostavat **renkaan** ([rekisteröitymismuistio](../docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md), vaiheen 1 rakennetesti). Jedin rtcsignal on vain kohtaamispaikka: se vie tarjouksen ja vastauksen perille, ja liikenne kulkee suoraan puhelimesta toiseen. Ilman jediä (`?nojedi`, tai jedi ei vastaa) kaikki käy QR-koodeilla. Tekstivirta on sama kuin launchpadissa (`src/streamview.js`).

Testaajille: **https://pereuna.github.io/certiratio/direct.html** (myös https://jedi.ydns.eu:8443/direct.html).

Testitarina "siemenen kylväjä":
1. **isi** kirjoittaa nimensä, valitsee kuvan ja painaa **Aloita uusi rengas**.
2. **Törttö** 🐈 (isin toinen puhelin): isi painaa **Kutsu toinen perustaja** ja näyttää koodin. Törttö skannaa sen puhelimen kameralla ja kirjoittaa nimensä. Muuta ei tarvita. Rengas: isi → Törttö ↺.
3. **Liisa** liittyy isin ja Törtön väliin: isi painaa **Kutsu väliin: minä ja Törttö**, ja Liisa skannaa koodin. Sen jälkeen Törtön puhelin näyttää vahvistuskoodin, ja Liisa skannaa sen (*Liittyminen 2/2*). Rengas: isi → Liisa → Törttö ↺.
4. **äiti** liittyy minkä tahansa vierekkäisen parin väliin, esimerkiksi isin ja Liisan väliin. Kutsun tekee aina parin vasen jäsen (*Kutsu väliin: minä ja seuraava*), ja oikea näyttää vahvistuskoodin.

Liittymisruudussa on kolme hahmoa käsi kädessä (vasen 🤝 **uusi** 🤝 oikea), ja tulokas on korostettu. Renkaan järjestys näkyy yläreunassa (oma nimi lihavoituna, uusin korostettuna hetken). Tekstivirrassa ei näy nimiä; kirjoittajat erottaa sävystä.

Rekisteri (`src/ring.js`, testit `tests/ring.test.mjs`):
- Tapahtumat `found` (aloitus) ja `admit` (uusi jäsen väliin vasen → oikea, nimi, kuva, vahvistuksen haaste). Rengas lasketaan aina tapahtumajoukosta deterministisessä järjestyksessä, joten saapumisjärjestyksellä ei ole väliä.
- `admit` hyväksytään vain, jos vasen ja oikea ovat yhä vierekkäin; puuttuvaa jäsentä odotetaan. Jäsen voi olla vain kerran.
- Vain välin vasen jäsen voi kutsua siihen, ja oikea vahvistaa yhden tulokkaan kerrallaan, joten samaan väliin ei tule kahta liittyjää.
- Jokaisella renkaalla on oma tunniste. Se kulkee koodeissa ja hello-sanomassa: eri renkaiden puhelimet eivät yhdisty, ja toisen renkaan vastauskoodi hylätään. Kaksi erillistä paria samalla sivulla pysyvät siis erillisinä.
- Tapahtumien tunniste johdetaan jäsenestä (`JÄSEN:f`, `JÄSEN:a`), koska jokainen liittyy kerran. Saman tunnisteen kahdesta versiosta kaikki valitsevat saman (`preferred`).

Identiteetti ja pysyvyys (`src/identity.js`, `src/store.js`, testit `tests/identity.test.mjs`):
- Jokaisella selaimella on ECDSA P-256 -avainpari (WebCrypto; yksityistä avainta ei voi viedä ulos). Jäsentunniste on `hex8(SHA-256(julkinen avain))`, renkaan tunniste `hex8(SHA-256(perustajan avain.suola))`.
- Allekirjoitukset: `found` perustajalta; `admit` tulokkaalta, vasemmalta ja oikealta naapurilta (perustajaliittymisessä tulokas ja kutsuja). Tapahtuma pääsee rekisteriin vasta tarkistettuna; jos allekirjoittajan avainta ei vielä tunneta, se odottaa.
- Jokainen yhteys todennetaan: `hello` kertoo avaimen ja haasteen, `auth` allekirjoittaa vastapuolen haasteen. Avaimen on vastattava tunnistetta ja rekisteriä. Ennen todennusta yhteydestä ei käsitellä muuta.
- Avain, oma tunniste ja rekisteri tallentuvat selaimen IndexedDB:hen, ja sivu aukeaa suoraan jäsenenä (`navigator.storage.persist()` pyydetään). Samassa selaimessa on yksi aktiivinen välilehti (Web Locks): toinen välilehti välittää koodin sille tai voi ottaa renkaan itselleen. Info-osiossa voi poistaa jäsenyyden tästä puhelimesta.
- **Palaava jäsen** (sivu suljettu, puhelin käynnistetty uudelleen) yhdistyy itsestään: sivu liittyy renkaan huoneeseen jedissä, ja paikalla olevat jäsenet muodostavat suorat yhteydet (pienempi id tarjoaa). Poissaolon aikana liittyneet tulevat rekisterin mukana. Renkaan näkymässä paikalla olevat on merkitty ●, muut himmeinä. Tilarivillä näkyy *jedi ✓* tai *jedi ei vastaa*.
- **Renkaan huone:** nimi on `m-` ja 16 heksaa SHA-256:sta jäsenten yhteisestä salaisuudesta (16 tavua). Perustaja arpoo salaisuuden, ja se kulkee vain todennettuja yhteyksiä pitkin jäsenille (`meet`), ei tapahtumissa. Jos arvoja on useita (vanha tallenne), pienempi voittaa. Huoneen kautta syntynyt yhteys katkaistaan, jos vastapuoli ei ole rekisterissä viiden sekunnin kuluttua. Yhteys jediin avataan uudelleen katkon jälkeen (2 s → 30 s), ja heti kun sivu tulee näkyviin tai verkko palaa.
- **Ilman jediä** paluu käy yhdistämiskoodilla: kuka tahansa paikalla oleva jäsen painaa **Yhdistä → Näytä yhdistämiskoodi** (`2.r…`), palaaja **Yhdistä → Skannaa yhdistämiskoodi** ja näyttää vastauksen, jonka näyttäjä skannaa. Yhdistä-nappi näkyy, kun jedi ei vastaa tai joku puuttuu.
- **Mitä jedi näkee:** tunnisteet, huoneiden nimet ja SDP:t (IPv6-osoitteet), ei tekstiä eikä rekisteriä (DataChannel on DTLS-salattu). Jedi ei voi esiintyä jäsenenä, koska jokainen yhteys todennetaan rekisterin avaimilla.
- **Kotivalikko:** `direct.webmanifest` ja kuvake (`icons/`). Android-Chrome tarjoaa asennusta, iPhonessa Jaa → Lisää Koti-valikkoon. iPhonen Koti-valikon sovelluksella on oma tallennustilansa, joten iPhonella kannattaa lisätä sivu Koti-valikkoon ensin ja liittyä sieltä (sivun oma kamera). Safari voi poistaa tavallisen välilehden tallenteet, jos sivua ei käytetä noin viikkoon. Jedi (rtcsignal) tarjoilee vain .html- ja .js-tiedostoja, joten kuvake toimii vain Pagesissa.
- PoC-rajat: 32-bittiset tunnisteet (väärennys vaatisi noin 2^32 avainta), osoitettujen sanomien lähettäjää ei allekirjoiteta päästä päähän (välittäjä voisi väärentää `sig`-tarjouksen, mutta yhteys todennetaan silti avaimella), avainta ei voi siirtää toiseen selaimeen.

Koodit (`src/pairing.js`):
- Kutsu `2.j.RENGAS.VASEN.OIKEA.TUNNUS`: kutsuja avaa kertakäyttöisen kutsuhuoneen `i-TUNNUS` (16 heksaa) jedissä, tulokas liittyy siihen ja lähettää tarjouksensa sitä kautta. Ensimmäinen tulija saa yhteyden, minkä jälkeen huone suljetaan; käytetty tai yli 10 minuuttia vanha kutsu ei kelpaa. QR on versio ≤ 6.
- Ilman jediä kutsu `2.o.RENGAS.VASEN.OIKEA.UFRAG.PWD.SORMENJÄLKI.MID.OSOITE_PORTTI,…` ja vastaus `2.a.RENGAS.UFRAG.…`, jonka kutsuja skannaa. Yhdistämiskoodi `2.r.RENGAS.NÄYTTÄJÄ.UFRAG.…` ja vahvistus `2.c.RENGAS.JÄSEN.HAASTE`.
- SDP-koodeissa on vain IPv6-osoitteet (ei link-localia, IPv4:ää eikä mDNS-nimiä), ICE-tunnus ja -salasana, DTLS-sormenjälki (sha-256, base64url) ja mid. Vastaanottaja kokoaa niistä SDP:n. QR-koodi on versio ≤ 11.
- Miksi koodia ei voi tallentaa ja käyttää uudelleen: WebRTC-yhteys tarvitsee molempien tuoreen tarjouksen tai vastauksen, ICE-tunnukset ovat yhteyskohtaisia ja puhelimen IPv6-osoite vaihtuu. QR kulkee vain yhteen suuntaan, joten paluusuuntaan tarvitaan joko toinen skannaus tai kohtaamispaikka.
- Vanhat `1.`-koodit hylätään ("päivitä sivu").

Verkko (`src/direct.js`, protokolla `certiratio-direct/5` DataChannelissa):
- **hello**/**auth**: naapurilista, renkaan tunniste, nimi, kuva, avain ja haaste aina, kun lista muuttuu; auth todentaa yhteyden. Kun puhelin näkee listalla jäsenen, johon sillä ei ole yhteyttä, pienempi id tekee tarjouksen.
- **events**: koko rekisteri heti yhteyden auettua; **ev**: uusi tapahtuma kaikille.
- **sig**, **sponsor**, **claim**, **vouched**: osoitetut sanomat (tarjous ja vastaus, vahvistuspyyntö oikealle naapurille, tulokkaan haaste, vahvistus kutsujalle). Ne viedään suoraan perille tai muuten kaikille naapureille (`ttl` 8, kaksoiskappaleet `mid`:stä).
- **chars**: tekstivirta leviää kaikille ja kiertää puuttuvan suoran yhteyden ohi.
- **meet**: renkaan huoneen salaisuus jäsenelle.
- Tarjous jäsenelle kulkee jedin kautta, jos hän on renkaan huoneessa, muuten verkon kautta (`sig`). Katkennut yhteys renkaan huoneessa olevaan yritetään heti uudelleen, muuten se palautuu, kun naapurilistat seuraavan kerran muuttuvat. Yhteyttä, joka ei syntynyt 45 sekunnissa, yritetään uudelleen aikaisintaan kahden minuutin päästä. Uudelleen ladatun sivun yhteys korvaa vanhan (`boot`).

Kamera ja osoitteet:
- Sivulla on oma QR-lukija (`src/scanner.js`): Android-Chromessa `BarcodeDetector`, muualla `src/vendor/jsQR.js` (jsQR 1.4.0, Apache-2.0), joka ladataan vasta tarvittaessa. Näin kaikki tapahtuu yhdessä välilehdessä. Jos koodi kuitenkin avataan järjestelmäkameralla, uusi välilehti välittää sen odottavalle välilehdelle (`BroadcastChannel`). *Ei kameraa?* -kohdassa on jakolinkki ja liittämiskenttä.
- QR-koodit tekee `src/vendor/qrcode.js` (qrcode-generator 1.4.4, Kazuhiko Arase, MIT).
- Ilman STUNia selaimen on kerrottava IPv6-osoitteensa itse. Androidin Chrome tekee niin. iPhone (kaikki iOS-selaimet ovat WebKitiä) ja työpöytä-Chrome piilottavat osoitteet mDNS-nimillä; sivu huomaa sen ennen ensimmäistä jedin kautta tehtävää yhteyttä tai koodin muodostuksessa ja kysyy osoitteen automaattisesti Googlen STUNilta (`?stun` pakottaa sen heti). STUN vain kertoo osoitteen, liikenne kulkee silti suoraan.

Testi: `tools/drive-direct.mjs URL PORT_ISI PORT_TORTTO PORT_LIISA PORT_AITI [PORT_Q]`, URL paikallisen rtcsignalin jakama `http://localhost:8090/direct.html`. Jokainen puhelin on oma Chromium (`--disable-features=WebRtcHideLocalIpsWithMdns --use-fake-ui-for-media-stream --use-fake-device-for-media-stream`), ja kamera korvataan `direct.scan()`-kutsulla tai koodin linkillä. Tarina ajetaan läpi 2.j-kutsuilla: kaikilla on sama rengas isi → äiti → Liisa → Törttö, suorat IPv6-yhteydet kaikkiin ja tekstit perillä. Sen jälkeen: väärennetyt tapahtumat hylätään; Liisan välilehti suljetaan ja avataan uudelleen (sama tunniste ja rengas tallesta), ja hän yhdistyy itsestään kaikkiin; toinen välilehti samassa selaimessa ei aukea jäsenenä; `?nojedi`-tilassa Liisa ei yhdisty itsestään vaan äidin yhdistämiskoodilla; käytetty kutsukoodi ei kelpaa; vieras ja toisen renkaan jäsen eivät voi käyttää yhdistämiskoodia. Selainprofiilien on oltava tyhjiä ajon alussa. Jos koneella ei ole IPv6-verkkoa, ajon voi tehdä käyttäjän verkkonimiavaruudessa: `unshare -rn`, dummy-liitäntä ja ULA-osoite (`ip link add d0 type dummy; ip -6 addr add fd00:c0de::1/64 dev d0 nodad`), Chromium `--no-sandbox`.

- Jedi kohtaamispaikkana testattu Chromiumeilla 2026-10-12 (ULA-verkkonimiavaruus, paikallinen rtcsignal): Liisa yhdistyi uudelleenavauksen jälkeen kaikkiin 0,6 sekunnissa ilman koodeja. Samana päivänä kahdella puhelimella USB:ssä (Nokia G50 Chrome 154 ja OnePlus Nord CE4 Lite Chrome 151, molemmat mobiilidatalla eri /64-verkoissa; sivu ja rtcsignal koneelta `adb reverse tcp:8090`): Törttö liittyi 2.j-koodilla 2,9 sekunnissa, yhteys IPv6 direct (host → host, 45–74 ms), ja OnePlusin sivun uudelleenlatauksen jälkeen yhteys palasi itsestään 1,1 sekunnissa (IPv6 direct, 47–96 ms), teksti perillä molemmilla kerroilla. `2.o`-varakutsua ei ajettu.
- Testattu Chromiumeilla 2026-10-11. Lisäksi oikea Android-Chrome 154 (Nokia G50, mobiilidata) ja kannettava eri IPv6-verkossa (Wi-Fi, eri /64): liittyminen IPv6 direct (host → host, 82 ms), puhelimen sivun uudelleenlataus (sama tunniste ja rengas tallesta; yksityinen avain IndexedDB:ssä, ei vietävissä) ja paluu yhdistämiskoodilla, teksti perillä. `navigator.storage.persisted()` oli Chromessa false (Chrome myöntää pysyvyyden käytön tai asennuksen perusteella). Kahden puhelimen rengasta ei ole vielä testattu.
- Avoinna: puhelimen taustalle jääminen ja IPv6-osoitteen vaihtuminen (yhteys katkeaa; uusi yritys jedin kautta, kun sivu on taas näkyvissä), epäonnistuneen yhteyden uusinta renkaan huoneessa (nyt aikaisintaan kahden minuutin päästä seuraavasta tapahtumasta), avaimen siirto tai varmuuskopio toiseen laitteeseen, uudelleentunnistus kadonneen avaimen tilalle (muistion kohta 10), yhteinen järjestys verkkokatkojen aikana (kohta 13), suurten verkkojen rajattu naapurimäärä täyden verkon sijaan.

Julkaisu molempiin paikkoihin muutoksen jälkeen (commit ja push ensin; palvelinta ei käynnistetä uudelleen):

```bash
tools/publish-pages.sh                                   # GitHub Pages, näkyy noin minuutissa
scp web/launchpad.html web/direct.html lapere@jedi.ydns.eu:rtcsignal/site/
scp web/src/{launchpad,direct,stream,streamview,pairing,signaling,classify,ring,scanner,identity,store}.js lapere@jedi.ydns.eu:rtcsignal/site/src/
scp web/src/vendor/{qrcode,jsQR}.js lapere@jedi.ydns.eu:rtcsignal/site/src/vendor/
```

Tulokset jediltä: `ssh lapere@jedi.ydns.eu 'grep launchpad ~/rtcsignal/pages.log'` (liittymiset, IPv6-testi, reitit).

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/launchpad.html`. `tools/drive-launchpad.mjs` ajaa kolmen vertaisen testin DevTools-protokollalla (puhelin `adb forward tcp:9223 localabstract:chrome_devtools_remote`, Chromium `--remote-debugging-port=9222`).
