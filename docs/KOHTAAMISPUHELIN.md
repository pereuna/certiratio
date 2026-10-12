# Kohtaamispuhelin: yhteyksien esittely puhelimella palvelimen sijaan

*Suunnitelma 2026-10-12. Ei vielä toteutettu.*

## Tavoite

Rengas (`poc1/web/direct.html`) toimii ilman palvelinta QR-koodeilla, mutta paluu suljetun sivun jälkeen vaatii kaksi skannausta. Jedi-kokeessa paluu tapahtui itsestään, kun kohtaamispaikka vei tarjouksen ja vastauksen perille (kahdella puhelimella 1,1 s). Jedi on kuitenkin varattu muuhun käyttöön, ja kohtaamispaikka on poistettu sieltä.

Tavoite on, että kohtaamispaikka toimii **renkaan jäsenen omassa puhelimessa**, esimerkiksi Nokia G50:ssä. Puhelimen IPv6-osoite (tai nimi) on muiden tiedossa, ja sen sovellus esittelee yhteydet. Liikenne kulkee edelleen suoraan selainten välillä, eikä kohtaamispuhelin näe tekstiä eikä rekisteriä.

Pohja on olemassa. Androidin puhelin kelpaa palvelimeksi IPv6-verkossa: Termuxin sshd on toiminut muilta puhelimilta. Selainpuolen kohtaamispaikkakoodi (`direct.js`: renkaan huone, kertakäyttöinen kutsuhuone 2.j, automaattinen paluu, todennus avaimilla) on jo testattu.

## Miksi pelkkä IPv6-osoite ei riitä selaimelle

- Sivu ladataan HTTPS:llä (GitHub Pages). HTTPS-sivu saa avata vain salatun WebSocket-yhteyden (`wss://`).
- Selain hyväksyy `wss://`-yhteyden vain, jos palvelimen varmenne on luotettu. Itse allekirjoitettua varmennetta selain ei kysy WebSocketille, vaan yhteys vain epäonnistuu.
- Luotetun varmenteen saa käytännössä vain **nimelle**, ei puhelimen IPv6-osoitteelle. Let's Encryptin IP-varmenteet vaatisivat portin 80 tai 443, eikä Android ilman roottia salli niitä.
- Pelkkä osoite ei kelpaa myöskään toisin päin. Jos sivu ladattaisiin suoraan puhelimesta osoitteesta `http://[osoite]:8443/`, sivu ei olisi suojattu konteksti. Silloin WebCrypto (avaimet) ja kamera eivät toimi.

**Siksi kohtaamispuhelin tarvitsee DNS-nimen**, jonka AAAA-tietue seuraa puhelimen osoitetta, ja nimelle luotetun varmenteen. DNS-palvelu kertoo vain osoitteen, eikä liikennettä kulje sen kautta.

| Vaihtoehto | Toimiiko HTTPS-sivulta | Arvio |
|---|---|---|
| WebSocket, nimi ja Let's Encrypt (DNS-01) | kyllä, myös iPhonessa | **suositus**: vakiotekniikkaa, ja repossa on valmis palvelin |
| WebSocket, itse allekirjoitettu varmenne IP:lle | ei (WebSocket ei kysy hyväksyntää) | hylätty |
| Sivu puhelimesta `http://[IPv6]` | sivu lataa, mutta WebCrypto ja kamera eivät toimi | hylätty |
| WebRTC-direct: puhelin on ICE-lite-vertainen, jolla on kiinteät tunnukset | kyllä, ilman nimeä ja varmennetta | myöhempi tutkimus, ks. lopuksi |

## Rakenne

```
 selain (Pages, https)            Nokia G50 / Termux                    selain
   │  wss://nokia.<dns>:8443/  ┌──────────────────────────┐   wss://…    │
   ├──────────────────────────►│ kohtaamispalvelin (node)  │◄────────────┤
   │   tarjous / vastaus       │ huoneet muistissa, ei lokia│             │
   │                           └──────────────────────────┘             │
   └──────────── suora IPv6 WebRTC DataChannel (DTLS) ───────────────────┘
```

### Puhelimen sovellus (Termux, Nokia G50)

1. **Palvelin:** `poc1/signal/server.mjs` (node, ei riippuvuuksia, TLS valmiina). Siihen lisätään rtcsignal-yhteensopivuus, jotta selaimen `Signaling` toimii sellaisenaan:
   - nimetyt jäsenet (`join {room, name}`, nimi = jäsentunniste, `name-taken`)
   - WebSocket polussa `/`
   - huoneen koko 3 → 16
   - sivuja ei jaeta (`--no-web`)
   - lokiin vain käynnistys ja virheet, ei huoneiden nimiä eikä osoitteita
   - Asennus: `pkg install nodejs`, ja repon `poc1/signal` kopioidaan puhelimeen.
2. **Portti 8443.** Ilman roottia portit alle 1024 eivät ole käytössä, mutta selaimelle portti on yhdentekevä.
3. **Nimi ja osoitteen seuranta:**
   - Ilmainen dynaaminen DNS, jossa on rajapinta sekä AAAA- että TXT-tietueille. Ehdotus on deSEC (`dedyn.io`, Saksa, voittoa tavoittelematon); acme.sh tukee sitä (`dns_desec`).
   - Termuxin skripti tarkistaa minuutin välein puhelimen pysyvän globaalin IPv6-osoitteen (`mngtmpaddr`, ei väliaikaista yksityisyysosoitetta). Jos osoite on muuttunut, skripti päivittää AAAA-tietueen (TTL 60 s).
   - Mobiiliverkko vaihtaa /64-etuliitettä istunnon katketessa.
4. **Varmenne:** `acme.sh --issue --dns dns_desec -d nokia.dedyn.io` (Let's Encrypt, DNS-01). Uusinta tehdään Termuxin cronilla (`termux-services`), ja palvelin käynnistetään uudelleen, kun varmenne vaihtuu.
5. **Pysyminen käynnissä:**
   - `termux-wake-lock`
   - akunsäästö pois Termuxilta
   - Termux:Boot käynnistää palvelimen ja osoitteen seurannan käynnistyksessä
   - mieluiten puhelin laturissa
6. **Itsetesti:** skripti tarkistaa toisesta verkosta, että `wss://nokia.dedyn.io:8443/` vastaa, ja varoittaa, jos operaattori estää tulevat yhteydet.

### Selaimen muutokset (`direct.js`, `pairing.js`)

1. **Kohtaamispaikat ovat renkaan asetus,** eivät sivun osoitteessa:
   - Tallennetaan `meet`-salaisuuden rinnalle: `{ ringId, events, meet, meetUrls: ['wss://nokia.dedyn.io:8443/'] }`.
   - Lista kulkee jäsenille samalla `meet`-sanomalla todennettuja yhteyksiä pitkin.
   - Asetuksen lisää kohtaamispuhelimen omistaja. Info-osioon tulee kenttä *Kohtaamispaikka*, ja sinne voi liittää `wss://`-osoitteen tai skannata sen QR-koodina puhelimen näytöltä.
2. **Useita kohtaamispaikkoja:** sivu liittyy kaikkiin listan paikkoihin samaan huoneeseen. Jos yksi puhelin on poissa, muut riittävät. Palvelimien välillä ei tarvita mitään yhteistä tilaa.
3. **Kutsu kertoo kohtaamispaikan:**
   - `2.j.RENGAS.VASEN.OIKEA.TUNNUS.PAIKKA`, jossa PAIKKA on isäntänimi ja portti (`nokia.dedyn.io:8443`).
   - Tulokas tietää näin, mistä kutsuhuone löytyy, vaikka hänellä ei ole vielä renkaan asetuksia. QR-koodi pysyy pienenä (versio ≤ 7).
4. **Ilman kohtaamispaikkaa** kaikki toimii kuten nyt, QR-koodeilla.

## Turva ja yksityisyys

- **Kohtaamispuhelin näkee** jäsentunnisteet, huoneiden nimet ja SDP:t (IPv6-osoitteet ja portit), kuten jedi aiemmin. Se ei näe tekstiä (DTLS), rekisteriä eikä renkaan salaisuutta, koska huoneen nimi on salaisuuden tiiviste.
- **Se ei voi esiintyä jäsenenä eikä päästää vierasta sisään.** Jokainen yhteys todennetaan rekisterin avaimilla (hello/auth), ja liittyminen vaatii molempien naapurien allekirjoitukset.
- **Pahimmillaan se voi estää esittelyn** (palvelunesto). Siihen auttavat useat kohtaamispaikat ja QR-koodit varalla.
- **DNS-palvelu näkee** vain puhelimen osoitteen ja sen muutokset.
- **Kohtaamispuhelimen osoite on julkisessa DNS:ssä.** Puhelimessa on silloin auki portti 8443 (ja sshd, jos se on käytössä). Palvelin hyväksyy vain WebSocket-sanomat, ja sanoman koko on rajattu.

## Riskit ja avoimet kysymykset

- **Android pysäyttää taustaprosesseja.** Wake lock ja akunsäästön poisto auttavat, mutta valmistajakohtaiset säästötilat voivat silti pysäyttää Termuxin. Tämä testataan Nokialla vuorokauden ajolla.
- **Operaattorin palomuuri:** tulevat IPv6-yhteydet ovat toimineet (sshd), mutta eri operaattoreilla ja liittymillä tilanne voi vaihdella. Itsetesti kertoo sen.
- **Osoitteen vaihtuminen:** DNS-päivitys kestää TTL:n verran (≤ 1 min). Selain avaa yhteyden uudelleen itsestään (2 s → 30 s).
- **Varmenteen uusinta** 60–90 päivän välein: acme.sh ja cron, epäonnistumisesta ilmoitus Termuxin ilmoituksena.
- **Valinnat käyttäjälle:**
  - DNS-palvelu: deSEC, DuckDNS tai ydns, jos sen rajapinta tukee TXT-tietueita.
  - Onko Nokia pysyvästi laturissa kohtaamispuhelimena?
  - Onko Termux jo asennettu F-Droidista tai GitHubista? Play-kaupan versio on vanhentunut.

## Vaiheet ja testaus

1. **Palvelin repossa:**
   - `server.mjs` rtcsignal-yhteensopivaksi
   - `tests/signal.test.mjs`: nimetyt jäsenet, `name-taken`, huoneen koko, välitys ja poistuminen
   - `drive-direct.mjs` ajetaan sitä vasten (ULA-verkkonimiavaruus)
2. **Selain:**
   - `meetUrls` renkaan asetukseksi ja jako jäsenille
   - 2.j:hin PAIKKA
   - useita kohtaamispaikkoja
   - testit: pairing ja tarina kahdella paikallisella palvelimella, joista toinen sammutetaan kesken
3. **Nokia:** Termux, node, palvelin, deSEC-nimi, acme.sh-varmenne ja Termux:Boot. Tarkistus OnePlusilta mobiilidatalla: `wss://nokia.dedyn.io:8443/` vastaa.
4. **Kenttätesti:**
   - Pagesin sivu, Nokia kohtaamispaikkana, OnePlus ja kolmas puhelin jäseninä
   - liittyminen 2.j:llä, sivujen sulkeminen ja avaaminen, automaattinen paluu
   - Nokian verkon katkaisu ja palautus (osoite vaihtuu)
   - vuorokauden ajo

## Myöhemmin: kohtaamispuhelin ilman nimeä ja varmennetta (WebRTC-direct)

Selaimeen voi muodostaa WebRTC-yhteyden ilman signalointia, jos vastapuoli on **ICE-lite** ja sen tunnukset ovat kiinteät: osoite ja portti, ICE-käyttäjätunnus ja -salasana sekä DTLS-varmenteen sormenjälki. Selain kokoaa vastapuolen vastauksen itse, kuten renkaan 2.o-koodissa jo nyt (libp2p:n *WebRTC Direct* toimii näin).

- **Hyöty:** kohtaamispuhelimen "osoite" olisi vain `IPv6, portti, sormenjälki`. DNS:ää, varmennetta ja HTTPS-porttia ei tarvita.
- **Hinta:** palvelin tarvitsee WebRTC-pinon, joka erottelee asiakkaat ICE-käyttäjätunnuksen mukaan, esimerkiksi Go ja pion tai libp2p. Se on paljon isompi työ kuin node-palvelin.

Tämä jätetään tutkittavaksi, kun nimellinen versio on osoittanut, että kohtaamispuhelin pysyy käynnissä.
