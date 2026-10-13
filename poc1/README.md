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

## IPv6 launchpad (poistettu 2026-10-12)

Launchpad oli ensimmäinen kenttätesti: saman huoneen selaimet muodostivat suoran IPv6-WebRTC-meshin ja kirjoittivat yhteiseen tekstivirtaan (sama tekstivirta oli renkaassa 2026-10-12 asti). Signalointi kulki jedin rtcsignalin kautta. Jedi on käyttäjän muuhun käyttöön varattu palvelin, joten launchpad ja kaikki sen palvelut poistettiin sieltä ja repossa 2026-10-12 (viimeinen versio: commit `1f36471`).

Tulokset (testaajat 2026-10-11…12, käyttäjän yhteenveto):
- Toimi erinomaisesti: suorat IPv6-yhteydet puhelinten välillä eri mobiililiittymissä, myös Applen puhelimella (iPhone 11, osoite STUNin kautta, koska WebKit piilottaa sen mDNS-nimellä).
- Vain yksi testaaja ei päässyt IPv6-verkkoon (liittymässä tai Wi-Fissä ei ollut IPv6:ta).
- Huoneen laskurit (*Huoneessa N · suoria yhteyksiä M*) korjattiin, kun sivun uudelleenlataus jätti vanhoja vertaisia näkyviin.

## Rengas: suora verkko, QR-koodit (`web/direct.html`)

Puhelimet muodostavat suoran IPv6-verkon, ja jäsenet muodostavat **renkaan** ([rekisteröitymismuistio](../docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md), vaiheen 1 rakennetesti). Oletuksena palvelinta ei ole: sivun lataamisen jälkeen kaikki käy QR-koodeilla ja suoraan selainten välillä. Valinnainen kohtaamispaikka (`?signal=wss://…`, rtcsignal-yhteensopiva WebSocket-palvelin) vie vain tarjoukset ja vastaukset perille; jedin kohtaamispaikka poistettiin 2026-10-12 ([suunnitelma puhelinpalvelimesta](../docs/KOHTAAMISPUHELIN.md)). Jäsen valitaan renkaasta, ja viestit kulkevat vain valitun jäsenen kanssa suoralla yhteydellä (`src/dm.js`).

Testaajille: **https://pereuna.github.io/certiratio/direct.html**.

Testitarina "siemenen kylväjä":
1. **isi** kirjoittaa nimensä, valitsee kuvan ja painaa **Aloita uusi rengas**.
2. **Törttö** 🐈 (isin toinen puhelin): isi painaa **Kutsu toinen perustaja** ja näyttää koodin. Törttö skannaa sen puhelimen kameralla, kirjoittaa nimensä ja näyttää vastauskoodin. isi painaa **Skannaa hänen vastauksensa** ja skannaa sen sivun omalla kameralla. Rengas: isi → Törttö ↺. (Kohtaamispaikan kanssa vastausta ei tarvita.)
3. **Liisa** liittyy isin ja Törtön väliin: isi painaa **Kutsu väliin: minä ja Törttö**, ja koodit vaihdetaan kuten edellä. Sen jälkeen Törtön puhelin näyttää vahvistuskoodin, ja Liisa skannaa sen (*Liittyminen 3/3*). Rengas: isi → Liisa → Törttö ↺.
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
- **Palaava jäsen** (sivu suljettu, puhelin käynnistetty uudelleen): yhteys palaa itsestään kohtaamispaikan tai rengaspalvelimen kautta. **Yhdistä**-nappi näkyy vain, kun sitä tarvitaan: joku jäsen puuttuu, eikä kohtaamispaikka tai rengaspalvelin vastaa. Silloin palaaja painaa **Yhdistä → Näytä yhdistämiskoodi** (`2.r…`), paikalla oleva jäsen skannaa sen puhelimen kameralla ja näyttää vastauksen, jonka palaaja skannaa. Toisin päin toimii myös. Liittymistä ja vahvistusta ei tehdä uudelleen. Verkko esittelee palaajan muille paikalla oleville, ja poissaolon aikana liittyneet tulevat rekisterin mukana. Renkaan näkymässä paikalla olevat on merkitty ●, muut himmeinä.
- **Kohtaamispaikan kanssa** palaaja yhdistyy itsestään: sivu liittyy renkaan huoneeseen, ja paikalla olevat jäsenet muodostavat suorat yhteydet (pienempi id tarjoaa). Tilarivillä näkyy *kohtaamispaikka ✓* tai *ei vastaa*.
- **Renkaan huone:** nimi on `m-` ja 16 heksaa SHA-256:sta jäsenten yhteisestä salaisuudesta (16 tavua). Perustaja arpoo salaisuuden, ja se kulkee vain todennettuja yhteyksiä pitkin jäsenille (`meet`), ei tapahtumissa. Jos arvoja on useita (vanha tallenne), pienempi voittaa. Huoneen kautta syntynyt yhteys katkaistaan, jos vastapuoli ei ole rekisterissä viiden sekunnin kuluttua. Yhteys kohtaamispaikkaan avataan uudelleen katkon jälkeen (2 s → 30 s), ja heti kun sivu tulee näkyviin tai verkko palaa.
- **Mitä kohtaamispaikka näkee:** tunnisteet, huoneiden nimet ja SDP:t (IPv6-osoitteet), ei tekstiä eikä rekisteriä (DataChannel on DTLS-salattu). Se ei voi esiintyä jäsenenä, koska jokainen yhteys todennetaan rekisterin avaimilla. Yhdistä-nappi näkyy, kun kohtaamispaikkaa ei ole tai joku puuttuu.
- **Kotivalikko:** `direct.webmanifest` ja kuvake (`icons/`). Android-Chrome tarjoaa asennusta, iPhonessa Jaa → Lisää Koti-valikkoon. iPhonen Koti-valikon sovelluksella on oma tallennustilansa, joten iPhonella kannattaa lisätä sivu Koti-valikkoon ensin ja liittyä sieltä (sivun oma kamera). Safari voi poistaa tavallisen välilehden tallenteet, jos sivua ei käytetä noin viikkoon. 
- PoC-rajat: 32-bittiset tunnisteet (väärennys vaatisi noin 2^32 avainta), osoitettujen sanomien lähettäjää ei allekirjoiteta päästä päähän (välittäjä voisi väärentää `sig`-tarjouksen, mutta yhteys todennetaan silti avaimella), avainta ei voi siirtää toiseen selaimeen.

Koodit (`src/pairing.js`):
- Kutsu `2.j.RENGAS.VASEN.OIKEA.TUNNUS`: kutsuja avaa kertakäyttöisen kutsuhuoneen `i-TUNNUS` (16 heksaa) kohtaamispaikassa, tulokas liittyy siihen ja lähettää tarjouksensa sitä kautta. Ensimmäinen tulija saa yhteyden, minkä jälkeen huone suljetaan; käytetty tai yli 10 minuuttia vanha kutsu ei kelpaa. QR on versio ≤ 6.
- Ilman kohtaamispaikkaa kutsu `2.o.RENGAS.VASEN.OIKEA.UFRAG.PWD.SORMENJÄLKI.MID.OSOITE_PORTTI,…` ja vastaus `2.a.RENGAS.UFRAG.…`, jonka kutsuja skannaa. Yhdistämiskoodi `2.r.RENGAS.NÄYTTÄJÄ.UFRAG.…` ja vahvistus `2.c.RENGAS.JÄSEN.HAASTE`.
- SDP-koodeissa on vain IPv6-osoitteet (ei link-localia, IPv4:ää eikä mDNS-nimiä), ICE-tunnus ja -salasana, DTLS-sormenjälki (sha-256, base64url) ja mid. Vastaanottaja kokoaa niistä SDP:n. QR-koodi on versio ≤ 11.
- Miksi koodia ei voi tallentaa ja käyttää uudelleen: WebRTC-yhteys tarvitsee molempien tuoreen tarjouksen tai vastauksen, ICE-tunnukset ovat yhteyskohtaisia ja puhelimen IPv6-osoite vaihtuu. QR kulkee vain yhteen suuntaan, joten paluusuuntaan tarvitaan joko toinen skannaus tai kohtaamispaikka.
- Vanhat `1.`-koodit hylätään ("päivitä sivu").

Verkko (`src/direct.js`, protokolla `certiratio-direct/5` DataChannelissa):
- **hello**/**auth**: naapurilista, renkaan tunniste, nimi, kuva, avain ja haaste aina, kun lista muuttuu; auth todentaa yhteyden. Kun puhelin näkee listalla jäsenen, johon sillä ei ole yhteyttä, pienempi id tekee tarjouksen.
- **events**: koko rekisteri heti yhteyden auettua; **ev**: uusi tapahtuma kaikille.
- **sig**, **sponsor**, **claim**, **vouched**: osoitetut sanomat (tarjous ja vastaus, vahvistuspyyntö oikealle naapurille, tulokkaan haaste, vahvistus kutsujalle). Ne viedään suoraan perille tai muuten kaikille naapureille (`ttl` 8, kaksoiskappaleet `mid`:stä).
- **dm** `{from, to, id, text}` ja **dm-ack** `{id}`: kahdenkeskinen viesti (`src/dm.js`, enintään 2000 merkkiä, tunniste 16 heksaa). Lähetetään vain todennettua suoraa yhteyttä pitkin, ei koskaan muiden jäsenten eikä rengaspalvelimen kautta, ja vastaanottaja hyväksyy sen vain, kun `to` on oma tunniste, `from` on sama kuin suora todennettu vertainen ja tämä on renkaan jäsen. Vastaanottaja kuittaa jokaisen viestin ja tunnistaa uudelleenlähetyksen tunnisteesta.
  - **Lähtevä:** jos jäsen ei ole paikalla (harmaa renkaassa), viesti jää lähtevään (⏳, enintään 100 jäsentä kohden) ja lähtee, kun suora yhteys hänen kanssaan syntyy, kunhan lähettäjän sivu on silloin auki. Lähetetty mutta kuittaamaton palaa lähtevään, jos yhteys katkeaa. Tila näkyy viestin perässä: ⏳ lähtevässä, ✓ lähetetty, ✓✓ perillä.
  - **Tallennus:** keskustelut (enintään 500 viestiä jäsentä kohden) ja lähtevä tallennetaan selaimen IndexedDB:hen salaamattomina, kuten rekisterikin. Tallennus tehdään heti eikä ajastimella, koska piilossa olevan sivun ajastimia hidastetaan jopa minuuttiin. Yhteinen tekstivirta (`chars`, `src/streamview.js`) poistettiin 2026-10-12: Certiration käyttöliittymä on kahden toimijan välistä asiointia, ei ryhmäkeskustelua. Rekisteri (`events`, `ev`) ja palvelinkortit synkronoidaan edelleen kaikille, koska jokaisen on tiedettävä toisten avaimet ja jäsenyys.
- **meet**: renkaan huoneen salaisuus jäsenelle.
- Tarjous jäsenelle kulkee kohtaamispaikan kautta, jos hän on renkaan huoneessa, muuten verkon kautta (`sig`). Katkennut yhteys renkaan huoneessa olevaan yritetään heti uudelleen, muuten se palautuu, kun naapurilistat seuraavan kerran muuttuvat. Yhteyttä, joka ei syntynyt 45 sekunnissa, yritetään uudelleen aikaisintaan kahden minuutin päästä. Uudelleen ladatun sivun yhteys korvaa vanhan (`boot`).

Kamera ja osoitteet:
- Sivulla on oma QR-lukija (`src/scanner.js`): Android-Chromessa `BarcodeDetector`, muualla `src/vendor/jsQR.js` (jsQR 1.4.0, Apache-2.0), joka ladataan vasta tarvittaessa. Näin kaikki tapahtuu yhdessä välilehdessä. Jos koodi kuitenkin avataan järjestelmäkameralla, uusi välilehti välittää sen odottavalle välilehdelle (`BroadcastChannel`). Koodin linkin jakaminen ja liittäminen ilman kameraa (*Ei kameraa?*) poistettiin 2026-10-13: tilaa ruudulla on vähän, ja koodit skannataan aina kameralla. Myös sivun yläosan otsikko ja kuvaus poistettiin.
- QR-koodit tekee `src/vendor/qrcode.js` (qrcode-generator 1.4.4, Kazuhiko Arase, MIT).
- Ilman STUNia selaimen on kerrottava IPv6-osoitteensa itse. Androidin Chrome tekee niin. iPhone (kaikki iOS-selaimet ovat WebKitiä) ja työpöytä-Chrome piilottavat osoitteet mDNS-nimillä; sivu huomaa sen ennen ensimmäistä kohtaamispaikan kautta tehtävää yhteyttä tai koodin muodostuksessa ja kysyy osoitteen automaattisesti Googlen STUNilta (`?stun` pakottaa sen heti). STUN vain kertoo osoitteen, liikenne kulkee silti suoraan.

Testi: `tools/drive-direct.mjs URL PORT_ISI PORT_TORTTO PORT_LIISA PORT_AITI [PORT_Q]`, URL paikallisen rtcsignalin jakama `http://localhost:8090/direct.html`. Jokainen puhelin on oma Chromium (`--disable-features=WebRtcHideLocalIpsWithMdns --use-fake-ui-for-media-stream --use-fake-device-for-media-stream`), ja kamera korvataan `direct.scan()`-kutsulla tai koodin linkillä. Tarina ajetaan läpi 2.j-kutsuilla: kaikilla on sama rengas isi → äiti → Liisa → Törttö, suorat IPv6-yhteydet kaikkiin. Kahdenkeskiset viestit: isi → Törttö ja vastaus perillä, Liisa ja äiti eivät saa niitä; äiti valitsee Liisan renkaasta ja lähettää lomakkeella, Liisalla näkyy lukematon; kuittaus palaa lähettäjälle; itselle, renkaaseen kuulumattomalle ja tyhjää ei lähetetä. Poissa olevan Liisan viesti jää isin lähtevään ja tulee perille, kun Liisa avaa sivun uudelleen; Liisan keskustelu äidin kanssa on tallessa uudelleenavauksen jälkeen; katkenneelle yhteydelle viesti jää lähtevään ja lähtee yhteyden palattua kerran, eikä rekisteri muutu. Sen jälkeen: väärennetyt tapahtumat hylätään; Liisan välilehti suljetaan ja avataan uudelleen (sama tunniste ja rengas tallesta), ja hän yhdistyy itsestään kaikkiin; toinen välilehti samassa selaimessa ei aukea jäsenenä; `?signal=off`-tilassa Liisa ei yhdisty itsestään vaan yhdistämiskoodilla, jonka hän näyttää ja äiti skannaa (Yhdistä-nappi näkyy vain Liisalla, koska vain hän ei saa yhteyttä itsestään); käytetty kutsukoodi ei kelpaa; vieras ja toisen renkaan jäsen eivät voi käyttää yhdistämiskoodia. Selainprofiilien on oltava tyhjiä ajon alussa. Jos koneella ei ole IPv6-verkkoa, ajon voi tehdä käyttäjän verkkonimiavaruudessa: `unshare -rn`, dummy-liitäntä ja ULA-osoite (`ip link add d0 type dummy; ip -6 addr add fd00:c0de::1/64 dev d0 nodad`), Chromium `--no-sandbox`.

- Kohtaamispaikka testattu Chromiumeilla 2026-10-12 (ULA-verkkonimiavaruus, paikallinen rtcsignal): Liisa yhdistyi uudelleenavauksen jälkeen kaikkiin 0,6 sekunnissa ilman koodeja. Samana päivänä kahdella puhelimella USB:ssä (Nokia G50 Chrome 154 ja OnePlus Nord CE4 Lite Chrome 151, molemmat mobiilidatalla eri /64-verkoissa; sivu ja rtcsignal koneelta `adb reverse tcp:8090`): Törttö liittyi 2.j-koodilla 2,9 sekunnissa, yhteys IPv6 direct (host → host, 45–74 ms), ja OnePlusin sivun uudelleenlatauksen jälkeen yhteys palasi itsestään 1,1 sekunnissa (IPv6 direct, 47–96 ms), teksti perillä molemmilla kerroilla. `2.o`-varakutsua ei ajettu.
- Testattu Chromiumeilla 2026-10-11. Lisäksi oikea Android-Chrome 154 (Nokia G50, mobiilidata) ja kannettava eri IPv6-verkossa (Wi-Fi, eri /64): liittyminen IPv6 direct (host → host, 82 ms), puhelimen sivun uudelleenlataus (sama tunniste ja rengas tallesta; yksityinen avain IndexedDB:ssä, ei vietävissä) ja paluu yhdistämiskoodilla, teksti perillä. `navigator.storage.persisted()` oli Chromessa false (Chrome myöntää pysyvyyden käytön tai asennuksen perusteella). Kahden puhelimen rengasta ei ole vielä testattu.
- Avoinna: puhelimen taustalle jääminen ja IPv6-osoitteen vaihtuminen (yhteys katkeaa; kohtaamispaikan kanssa uusi yritys, kun sivu on taas näkyvissä), epäonnistuneen yhteyden uusinta renkaan huoneessa (nyt aikaisintaan kahden minuutin päästä seuraavasta tapahtumasta), avaimen siirto tai varmuuskopio toiseen laitteeseen, uudelleentunnistus kadonneen avaimen tilalle (muistion kohta 10), yhteinen järjestys verkkokatkojen aikana (kohta 13), suurten verkkojen rajattu naapurimäärä täyden verkon sijaan.

Julkaisu muutoksen jälkeen (commit ja push ensin): `tools/publish-pages.sh` (GitHub Pages, näkyy noin minuutissa).

Paikallisesti: `python3 ../../Plan2001/monolith/tools/rtcsignal --port 8090 --web web` ja `http://localhost:8090/direct.html` (paikallisesta palvelimesta ladattu sivu käyttää sitä kohtaamispaikkana).

## Rengaspalvelimen prototyyppi (`ringserver/`, `web/palvelin.html`)

Puhelimessa ajettava WebRTC-vertainen, johon selain ottaa yhteyden pelkällä kortilla `s1.SORMENJÄLKI.PORTTI.OSOITTEET` ilman signalointia, DNS:ää tai varmentajaa ([suunnitelma](../docs/KOHTAAMISPUHELIN.md)). Palvelin on ICE-lite yhdessä UDP-portissa (pion), ja sillä on pysyvä DTLS-varmenne ja oma P-256-avain (`-dir`). Selain (`src/servercard.js`) kokoaa palvelimen vastauksen kortista ja tarkistaa sormenjäljen.

Palvelin on rengassolmu (`ringserver/node.go`, protokolla `certiratio-direct/5`, rekisterimalli 2; määrittely [PROTOKOLLA.md](../docs/PROTOKOLLA.md)):
- todentaa jokaisen yhteyden (hello/auth) ja tarkistaa avaimen rekisteristä
- tarkistaa ja säilyttää rekisterin (`ring.json`)
- katkaisee vieraan renkaan ja rekisterin ulkopuolisen avaimen (5 s armonaika rekisterin saapumiselle)
- kertoo naapurilistassaan paikalla olevat jäsenet ja välittää heidän tarjouksensa (`sig`) ja tapahtumat; kahdenkeskiset viestit (`dm`) eivät kulje sen kautta

Jäsenet muodostavat sen jälkeen suorat yhteydet toisiinsa. Palvelin ei ole henkilöjäsen (`hello.server`), eikä se näy jäsenten naapurilistoissa; renkaassa se näkyy omana 🖥️-solmunaan huoltajiensa välissä. `palvelin.html` käyttää kanavaa `echo`, joka vain kaiuttaa viestit.

**Palvelimen liittäminen renkaaseen rengassolmuksi** (kaksi huoltajaa):
1. Palvelin tulostaa käynnistyessään liittämislinkin ja QR-koodin: `direct.html#s1.SORMENJÄLKI.PORTTI.OSOITTEET.TUNNUS`.
2. Renkaan jäsen A avaa linkin tai skannaa koodin sivun kameralla.
3. Sivu ottaa yhteyden palvelimeen ja lähettää `enroll`-sanoman (tunnus, rengas, rekisteri, `left` = A, `right` = A:n oikea naapuri B, vanhat palvelimet).
4. Palvelin tarkistaa, että A ja B ovat vierekkäiset jäsenet, ja allekirjoittaa `node`-tapahtuman. A allekirjoittaa sen ja pyytää B:tä (`cosign`); B hyväksyy omalla sivullaan ja julkaisee sen. A:sta ja B:stä tulee solmun huoltajat (huolto on vastuu, ei omistus).
5. Tunnus on kertakäyttöinen, ja liitetty palvelin kuuluu vain omaan renkaaseensa. Yksi jäsen ei voi liittää palvelinta yksin, eikä solmu voi perustaa solmua.
6. Palvelinroolin poisto (`retire`): yhteydet-osion *Poista palvelinrooli* (solmulta molemmat huoltajat, vanhalta mallin 1 palvelimelta sen operaattori). Poistetun kortti ei enää kelpaa.

Vanhat mallin 1 `server`-tapahtumat (yksi operaattori) kelpaavat siirtymäkauden ajan; uusia ei tehdä. Siirto Törtön puhelimesta Jediin: [JEDI_SIIRTO.md](../docs/JEDI_SIIRTO.md).

**Kortit:** palvelin allekirjoittaa korttinsa `{server, seq, port, fp, addrs, sig}`. Osoitteet tarkistetaan 30 sekunnin välein, ja kun ne muuttuvat, `seq` kasvaa ja kortti lähetetään kaikille. Jäsenet tarkistavat kortin palvelimen avaimella rekisteristä, tallentavat tuoreimman IndexedDB:hen ja välittävät sen muille. Sivu yhdistää kaikkiin tunnettuihin palvelimiin, kun se avautuu tai tulee näkyviin, kun verkko palaa, kun kortti vaihtuu, kun yhteys katkeaa ja muuten puolen minuutin välein. Tilarivillä näkyy *palvelin ✓* tai *palvelin ei vastaa*, ja info-osiossa on palvelinten nimet ja tila.

Go-puolen rekisteriydin on verkoton paketti `ringserver/ringcore`: se tekee allekirjoitettavan sisällön kuten `JSON.stringify` (ei `encoding/json`) ja rakentaa renkaan kuten `ring.js`. Yhteiset testivektorit tehdään selaimen koodilla: `node tools/make-vectors.mjs > tests/vectors/ring.json` ja `node tools/make-conformance.mjs > tests/vectors/conformance.json`; niitä käyttävät `npm test` ja `cd ringserver && go test -race ./...`. Muilla alustoilla: `go run ./cmd/ringcheck ../tests/vectors/conformance.json` (myös `GOOS=js GOARCH=wasm`, Node: `$(go env GOROOT)/lib/wasm/wasm_exec_node.js`; `GOOS=wasip1`: `tools/run-wasip1.mjs`; arm64 puhelimessa adb:llä). Alustojen tila: [PROTOKOLLA.md](../docs/PROTOKOLLA.md#8-testivektorit-ja-toteutukset).

Jedin palvelutiedostot (OpenBSD rc.d, Linux systemd, varmuuskopio): `ringserver/deploy/`.

```bash
cd ringserver && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o ringserver-arm64 .   # puhelimeen (adb push / Termux)
./ringserver -port 40123 -name Nokia -dir ringserver-tila   # tulostaa kortin sekä liittämislinkin ja QR-koodin
```

Rengastesti: `tools/drive-ringnode.mjs BASE_URL LIITTÄMISLINKKI PORT_ISI PORT_TORTTO PORT_VIERAS [PORT_HANNA]`. Siinä isi ja Törttö perustavat renkaan QR-koodeilla, ja isi liittää palvelimen rengassolmuksi; Törttö hyväksyy (huoltajat isi ja Törttö). Palvelintapahtuma ja kortti leviävät Törtölle, joka yhdistää palvelimeen itsestään. Törtön välilehti suljetaan ja avataan: tallennettu kortti riittää, ja suora yhteys isiin palaa 0,5–0,8 sekunnissa sivun avauksesta ilman yhtään koodia. Teksti menee perille. Vieras ei voi liittää toisen renkaan palvelinta eikä pysy palvelimessa. Testattu 2026-10-12 kolmella peräkkäisellä ajolla (ULA-verkkonimiavaruus).

Yhteystesti: `tools/drive-ringserver.mjs PAGE_URL KORTTI DEVTOOLS_PORT` (kolme asiakasta samaan porttiin, väärä sormenjälki hylätään; Chromium `--disable-features=WebRtcHideLocalIpsWithMdns`). Testattu 2026-10-12 G50 palvelimena ja OnePlusin Chrome asiakkaana, molemmat mobiilidatalla: yhteys 1,6 s.

Siirtymätesti (`tools/ns-migration.sh`, `tools/drive-migration.mjs`): vanha versio (sivu ja palvelin) → uusi, ja vanha palvelin Nokia → rengassolmu Jedi. Nokia pysäytetään (SIGSTOP, ei sammuteta), ja paluu ilman koodeja, esittely, viestit, Jedin uudelleenkäynnistys, kortin päivitys ja väärennöksen torjunta tarkistetaan pelkän Jedin varassa; lopuksi Nokian palvelinrooli poistetaan. Ajetaan muistirajan sisällä (kone ilman swapia kaatui, kun Chromiumeja jäi testeistä käyntiin):

```bash
git worktree add /tmp/old 056e67d && (cd /tmp/old/poc1/ringserver && go build -o /tmp/ringserver-old .) && (cd ringserver && go build -o /tmp/ringserver .)
systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=0 unshare -rn sh tools/ns-migration.sh /tmp/mig /tmp/old/poc1/web /tmp/ringserver-old /tmp/ringserver
```
Testattu 2026-10-13: kaikki kohdat OK (*JEDI KORVAA NOKIAN*).
