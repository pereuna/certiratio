# Rengaspalvelin puhelimessa: renkaan sisäinen palvelinrekisteri ilman DNS:ää

*Suunnitelma 2026-10-12 (versio 2). Ei vielä toteutettu.*

## Tavoite

Rengas (`poc1/web/direct.html`) toimii ilman palvelinta QR-koodeilla, mutta paluu suljetun sivun jälkeen vaatii kaksi skannausta. Jedi-kokeessa paluu tapahtui itsestään (kahdella puhelimella 1,1 s), mutta jedi on varattu muuhun käyttöön.

Uusi malli:
- Osa jäsenistä (esimerkiksi Nokia G50) ajaa puhelimessaan **rengaspalvelinta**. Nyt se on Termux-ohjelma, lopullisesti oma App.
- Renkaalla on **sisäinen palvelinrekisteri**: kunkin palvelimen IPv6-osoitteet, portti ja varmenteen sormenjälki. DNS-nimiä, ulkopuolista palvelua ja varmentajaa ei tarvita.
- Palvelin pitää osoitelistansa ajan tasalla. Selain ottaa sivun avautuessa yhteyden suoraan palvelimen IPv6-osoitteeseen, ja palvelin esittelee sen muille paikalla oleville jäsenille. Asiakas palaa linjoille itsestään.

## Ratkaiseva tekninen kohta: selaimesta suoraan IPv6-osoitteeseen

Pagesin HTTPS-sivu ei voi avata WebSocketia (`wss://`) pelkkään IPv6-osoitteeseen, koska luotettua varmennetta ei saa ilman nimeä. **WebRTC ei tarvitse varmentajaa.** DTLS:n vastapuoli tunnistetaan SDP:n sormenjäljestä, ja sormenjälki on nyt renkaan omassa rekisterissä.

Palvelin toimii kuten libp2p:n *WebRTC Direct*: se on **ICE-lite**-vertainen kiinteässä UDP-portissa, ja sillä on pysyvä DTLS-varmenne. Selain ei tarvitse signalointia, koska se kokoaa palvelimen vastauksen itse, kuten renkaan 2.o-koodi jo nyt:

1. Selain luo tarjouksen ja lukee oman ICE-tunnuksensa `U`.
2. Selain asettaa palvelimen vastaukseksi SDP:n, jossa on:
   - palvelimen osoitteet ja portti rekisteristä
   - `ice-lite`
   - ICE-tunnus `U` ja salasana `f(U)` (kiinteä johdos, esimerkiksi `"certiratio-" + U` täydennettynä 22 merkkiin)
   - rekisterin sormenjälki
   - `setup:passive`
3. Selain lähettää STUN-tarkistuksen, jonka käyttäjätunnus on `U:U`. Palvelin näkee siitä tuntemattoman tunnuksen, laskee salasanan `f(U)`, tarkistaa viestin eheyden ja luo tälle asiakkaalle uuden yhteyden samaan UDP-porttiin. ICE-lite ei lähetä omia tarkistuksia, joten se ei tarvitse selaimen salasanaa.
4. **DTLS:** selain on asiakas ja tarkistaa palvelimen sormenjäljen rekisteristä, joten väärä palvelin ei kelpaa. Palvelin ei tunne selaimen sormenjälkeä, joten se hyväksyy minkä tahansa varmenteen ja todentaa jäsenen sovellustasolla. Tähän käytetään nykyinen hello/auth rekisterin avaimilla.
5. DataChannel aukeaa, ja palvelin on tavallinen verkon solmu. Nykyinen esittely (`hello`-naapurilistat, `sig` välitettynä) yhdistää palaajan suoraan muihin paikalla oleviin.

**Palvelinkortti** on siis vain `{ id, osoitteet, portti, sormenjälki }`. ICE-tunnuksia ei tarvita, koska ne johdetaan selaimen omasta tunnuksesta. SDP:n peukalointia selaimessa ei tarvita, koska selain muuttaa vain vastapuolen kuvausta.

**Ennakkoehto täyttyi 2026-10-12:** pyytämätön UDP pääsi perille ja vastaus palasi. Lähettäjä oli OnePlus mobiilidatalla (Termux, `nc -u`, `2001:999:3003:704::/64`), vastaanottaja G50 mobiilidatalla (`2001:999:408:763a::/64`, kuuntelija `udpecho` portissa 40123). Pyytämätön TCP portissa 40124 pääsi myös perille. Molemmat liittymät olivat samalla operaattorilla, joten eri operaattoreiden välinen testi on vielä tekemättä.

**Prototyyppi toimi puhelinten välillä 2026-10-12:**
- **Palvelin:** `poc1/ringserver` ajettiin G50:llä (`adb shell`, arm64-binääri, mobiilidata, kaksi IPv6-osoitetta kortissa).
- **Asiakas:** OnePlusin Chrome avasi Pagesin `palvelin.html#s1.…`-kortin mobiilidatalla.
- **Tulos:** yhteys syntyi 1,6 sekunnissa (ICE connected 0,7 s), reitti oli `2001:999:3003:704::8b → 2001:999:408:763a:…:40123`, ja palvelin vastasi viestiin. Uusi yhteys napista *Yhdistä* toimi samoin.
- Signalointia, DNS:ää ja varmentajaa ei käytetty.

**Alkuperäinen ennakkoehto:** pääseekö puhelimeen mobiiliverkossa *pyytämätön* UDP-paketti toisesta liittymästä? Ssh todisti TCP:n, mutta ICE-lite-palvelin ei lähetä ensimmäisenä. Testi tehdään kahdella USB-puhelimella (`nc -u -l` toisessa, lähetys toisesta). Jos operaattori suodattaa, palvelin ei voi olla pelkästään ICE-lite, vaan tarvitaan reiän avaus molemmista päistä. Se puolestaan vaatii signalointia.

## Palvelinrekisteri renkaassa

Jäsenyysrekisteri (`found`/`admit`) on vain lisäävä. Palvelinten osoitteet muuttuvat, joten ne ovat erillinen tila, jossa uusin versio voittaa:

- **`server`-tapahtuma** (rekisteriin, kerran per palvelin):
  - Kentät: `{ kind: 'server', id: SERVER:s, ring, server, key, operator, name, sigs: { server, operator } }`.
  - Palvelimella on oma P-256-avain, ja `server = idOf(key)`.
  - Palvelin ei ole jäsen, koska se ei voi skannata koodeja. Sen ottaa renkaaseen sitä ylläpitävä jäsen (`operator`), joka allekirjoittaa sen.
  - Palvelimen voi myöhemmin poistaa (`unserver`, operaattorin allekirjoitus).
- **Kortti** (`card`, ei rekisterissä):
  - Kentät: `{ server, seq, addrs: [...], port, fp, sig }`, ja palvelin allekirjoittaa kortin omalla avaimellaan.
  - Kun palvelimen osoite vaihtuu, palvelin kasvattaa `seq`:tä ja lähettää kortin kaikille yhteydessä oleville.
  - Kortit leviävät verkossa kuten tapahtumat. Jokainen jäsen tallentaa kustakin palvelimesta suurimman `seq`:n kortin IndexedDB:hen.
- **Palvelin pitää osoitelistaa:**
  - kaikkien renkaan palvelinten tuoreimmat kortit (palvelimet ovat yhteydessä myös toisiinsa)
  - koko rekisteri, joten palaaja saa poissaolon aikana liittyneet palvelimelta
  - jäsenten viimeksi nähdyt osoitteet. Näitä ei tarvita yhdistämiseen, koska esittely kulkee palvelimen kautta, mutta niistä on apua vianetsinnässä.
- **Selain sivun avautuessa:** yhteys kaikkiin tallennettujen korttien palvelimiin, kaikkiin niiden osoitteisiin rinnakkain. Ensimmäinen todennettu yhteys riittää, ja esittely hoitaa loput.

**Vanhentunut osoite** on mallin heikko kohta. Jos *kaikkien* palvelinten osoitteet vaihtuivat palaajan poissa ollessa, hän ei löydä niitä. Mobiiliverkon /64 vaihtuu, kun datayhteys katkeaa, eli ei kovin usein, mutta varmasti joskus. Lieventävät keinot:
- useita palvelimia eri liittymissä
- palvelin pitää myös vanhat osoitteensa korttissa niin kauan kuin ne ovat voimassa
- vara on yhdistämiskoodi (2.r), kuten nyt
- myöhemmin mahdollisesti valinnainen DNS-nimi kortissa

## Palvelinohjelma

**Nyt: Termux (Nokia G50).**
- **Ohjelma:** Go ja pion/webrtc v4. Pion tukee ICE-liteä, kiinteää UDP-porttia (`UDPMux`) ja sormenjäljen tarkistuksen ohittamista. Tuntemattoman ICE-tunnuksen tunnistus otetaan go-libp2p:n WebRTC-direct-toteutuksen `udpmux`-paketista tai tehdään sen mallin mukaan.
- **Käännös:** koneella `GOOS=android GOARCH=arm64` yhdeksi binääriksi, joka siirretään adb:llä Termuxiin. Puhelimeen ei tarvita kääntäjää eikä Nodea.
- **Protokolla:** sama `certiratio-direct` DataChannelissa. Go-puolelle siirretään:
  - hello/auth: P-256 ja raw-avain sekä allekirjoitus r‖s, kuten WebCrypto
  - `verifyEvent` ja `build` (`ring.js`, `identity.js`, noin 200 riviä)
  - välitys (`route`)
  - korttien ylläpito
- **Kanoninen allekirjoitettava sisältö** on JSON-taulukko. Go:n `json.Marshal` koodaa merkit `<>&` eri tavalla kuin selain, joten Go-puolella käytetään kooderia, jolla `SetEscapeHTML(false)`. Yhteiset testivektorit (JSON-tiedosto) ajetaan sekä Noden että Go:n testeissä.
- **Pysyvä tila** tiedostoina: avain, DTLS-varmenne, rekisteri ja kortit.
- **Osoitteen seuranta:** liitäntöjen globaalit IPv6-osoitteet minuutin välein. Väliaikaiset yksityisyysosoitteet jätetään pois, jos pysyvä löytyy.
- **Käynnissä pysyminen:** `termux-wake-lock`, akunsäästö pois ja Termux:Boot.
- **Renkaaseen liittäminen:**
  1. Ohjelma tulostaa korttinsa QR-koodina terminaaliin.
  2. Operaattori painaa selaimessa *Lisää palvelin* ja skannaa koodin.
  3. Selain ottaa yhteyden palvelimeen, palvelin todistaa avaimensa, ja operaattori allekirjoittaa `server`-tapahtuman.
  4. Palvelin saa rekisterin.

**Lopullinen: Android-App.** Sama Go-ydin gomobilella Kotlin-sovelluksen *foreground service* -palveluun. Pysyvä ilmoitus pitää palvelun käynnissä paremmin kuin Termux. Sovelluksessa on käynnistys, tila (osoitteet, yhteydet, paikalla olevat) ja kortin QR. Sovellus voi myöhemmin olla myös renkaan jäsen omalla käyttöliittymällään.

## Selaimen muutokset

- **`pairing.js`:** palvelinkortti `2.s.RENGAS.PALVELIN.SORMENJÄLKI.PORTTI.OSOITTEET` QR-koodiksi ja linkiksi. Kortista kootaan ICE-lite-vastaus (`setup:passive`, `a=ice-lite`).
- **`ring.js` ja `identity.js`:** `server`-tapahtuma, kortin allekirjoitus, testit.
- **`direct.js`:**
  - korttien tallennus ja levitys (`card`)
  - yhteys palvelimiin sivun avautuessa sekä näkyviin palatessa ja verkon palatessa
  - *Lisää palvelin*
  - tilarivillä palvelinten tila ("palvelin Nokia ✓")
  - nykyinen `?signal=`-kohtaamispaikka poistetaan, kun tämä toimii
- **Kutsu:** kutsukoodi voi sisältää yhden palvelinkortin. Silloin tulokkaan tarjous ja vastaus kulkevat palvelimen kautta, ja tulokas skannaa vain kutsujan ja oikean naapurin koodit kuten 2.j-kokeessa. QR pysyy kohtuullisena (osoite, portti ja sormenjälki noin 90 merkkiä).

## Turva ja yksityisyys

- **Palvelin näkee** jäsentunnisteet, välittämänsä SDP:t (jäsenten IPv6-osoitteet) ja rekisterin, koska se säilyttää rekisterin palaajia varten. Tekstiä se ei näe, kun jäsenten välinen yhteys on suora. Jos suora yhteys puuttuu, tekstivirta kiertää palvelimen kautta, kuten minkä tahansa solmun kautta nyt.
- **Palvelin ei voi lisätä jäseniä.** Liittyminen vaatii naapurien allekirjoitukset, ja yhteydet todennetaan rekisterin avaimilla.
- **Väärä palvelin:** selain hyväksyy vain sormenjäljen, joka on rekisteriin allekirjoitetussa kortissa.
- **Palvelimen julkinen pinta:** yksi UDP-portti. Vieras, joka ei tunne sormenjälkeä eikä ole rekisterissä, ei pääse hello/authin ohi. Palvelin rajaa yhteyksien määrän ja katkaisee todentamattomat 10 sekunnissa.

## Vaiheet ja testaus

1. **Ennakkoehto:** pyytämätön UDP toisesta liittymästä perille. ✅ Samalla operaattorilla toimii, eri operaattoreiden välillä testaamatta.
2. **Prototyyppi koneella:** ✅ (`tools/drive-ringserver.mjs`: kolme asiakasta samassa portissa, väärä sormenjälki hylätään) ja puhelinten välillä ✅.
   - Go-palvelin (pion, ICE-lite, kiinteä portti), johon Chromium yhdistää pelkällä kortilla (ULA-verkkonimiavaruus)
   - useita asiakkaita samaan porttiin
   - väärä sormenjälki hylätään
3. **Protokolla Go:ssa:** hello/auth, rekisteri, välitys ja kortit. Yhteiset testivektorit Node- ja Go-testeissä. `drive-direct.mjs`:
   - palvelin renkaassa
   - Liisa suljetaan ja avataan, ja hän palaa ilman koodeja
   - palvelimen osoite vaihdetaan, ja kortti leviää
4. **Termux Nokialla:** binääri adb:llä. OnePlus ja kolmas laite Pagesin sivulla mobiilidatalla. Testataan sivujen sulkeminen ja avaaminen, Nokian datayhteyden katkaisu (osoite vaihtuu) ja vuorokauden ajo.
5. **App** (gomobile ja foreground service), kun Termux-versio on osoittanut mallin.

## Avoimet kysymykset

- **UDP eri operaattoreiden välillä:** saman operaattorin sisällä pyytämätön UDP kulkee (testattu). Eri operaattorilta testaamatta.
- **Piilotettu oma osoite (mDNS):** jos selain piilottaa oman host-osoitteensa (työpöytä-Chrome, iPhone/WebKit), yhteys kortilla ei syntynyt paikallisessa testissä. Android-Chrome ei piilota. Ratkaisuvaihtoehtoja: STUN, kuten renkaassa nyt (antaa selaimelle srflx-kandidaatin), tai palvelin myös vastaanottajaksi, joka hyväksyy vertaisheijastetut osoitteet. Testattava iPhonella.
- **Safari ja iPhone:** WebRTC Direct -tyyppisen yhteyden (koottu ICE-lite-vastaus) toimivuus iOS:n WebKitissä on testattava. Chrome ja Firefox toimivat libp2p:n kokemuksen perusteella.
- **Palvelinten määrä ja sijoittelu:** riittääkö yksi palvelin per kotitalous?
- **Säilyttääkö palvelin tekstiä poissaolijoille?** Ei tässä vaiheessa. Tekstivirta on hetkellinen kuten nyt.
