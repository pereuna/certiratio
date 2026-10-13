# Certiratio-renkaan protokolla

**Versiot:**
- kuljetusprotokolla `certiratio-direct/5`
- rekisterimalli 2

Päivitetty 13.10.2026.

Tämä on renkaan alustariippumaton määrittely. Toteutuksia on kaksi:
- selain: `poc1/web/src`
- Go: `poc1/ringserver`, ja sen verkoton ydin `poc1/ringserver/ringcore`

Muut toteutukset (C, Plan2001, wasm) kelpaavat, kun ne läpäisevät samat testivektorit (`poc1/tests/vectors/`). Kirjastot saavat olla eri.

Määrittely ei edellytä Go:ta, Linuxia, DNS:ää tai tiettyä laitetta. Tarvitaan IPv6, UDP, WebRTC-DataChannel (ICE, DTLS, SCTP) sekä ECDSA P-256 ja SHA-256.

## 1. Identiteetit

| | |
|---|---|
| Avainpari | ECDSA P-256. Julkinen avain `key` on raakamuodossa: 65 tavua `04‖X‖Y`, base64url ilman täytettä, 87 merkkiä. |
| Tunniste | `id = hex8(SHA-256(key))`: SHA-256:n neljä ensimmäistä tavua pieninä heksoina. `key` tiivistetään merkkijonona (UTF-8). |
| Rengas | `ring = hex8(SHA-256(perustajan key + "." + salt))`. `salt` on 8 heksaa. |
| Allekirjoitus | ECDSA-SHA-256 kanoniselle sisällölle (kohta 2). Muoto on `r‖s` (64 tavua, WebCrypton muoto), base64url, 86 merkkiä. |

**Henkilöjäsen.** Avain syntyy selaimessa, eikä yksityistä avainta voi viedä sieltä.

**Rengassolmu (palvelin).** Avain syntyy palvelimen tilahakemistoon (`key.pem`, PKCS#8).

Tunnisteessa on vain 32 bittiä. Se riittää reititykseen ja koodeihin, koska todisteena toimii rekisteriin kirjattu koko avain.

## 2. Kanoninen allekirjoitettava sisältö

Allekirjoitettava sisältö on merkkijonotaulukko JSON-muodossa, täsmälleen niin kuin JavaScriptin `JSON.stringify(taulukko)` sen tuottaa:
- Ei välilyöntejä.
- Merkkijonoissa escapoidaan vain `"`, `\` ja ohjausmerkit U+0000–U+001F.
  - `\b \f \n \r \t` kirjoitetaan lyhyinä, muut muodossa `\u00XX`.
- Kaikki muu kirjoitetaan sellaisenaan UTF-8:na: `<`, `>`, `&`, U+2028 ja ei-ASCII.
- Allekirjoitetaan UTF-8-tavut.

| Laji | Taulukko |
|---|---|
| found | `["found", ring, member, key, salt, name, icon]` |
| admit | `["admit", ring, left, right, member, key, name, icon, proof]` |
| node | `["node", ring, left, right, member, key, name, legacy.join(",")]` |
| retire | `["retire", ring, member]` |
| server (malli 1) | `["server", ring, member, key, operator, name]` |
| card | `["card", ring, server, String(seq), String(port), fp, addrs.join(",")]` |
| auth | `["auth", nonce, signer, verifier]` |

Nimi `name` on 1–24 UTF-16-yksikköä. Siinä ei ole ohjausmerkkejä (U+0000–U+001F, U+007F) eikä alussa tai lopussa JavaScriptin `trim()`-välilyöntejä.

Henkilön `icon` on jokin näistä: 🧑 👩 👨 👧 👦 👵 👴 🐈 🐕.

## 3. Tapahtumat ja rekisterimalli 2

Rekisteri on joukko allekirjoitettuja tapahtumia. Kukin jäsen tai palvelin liittyy kerran, joten tapahtuman tunniste johdetaan jäsenestä: `id = member + ":" + pääte`.

| Laji | Pääte | Kentät | Allekirjoittajat (`sigs`) |
|---|---|---|---|
| `found` | `f` | ring, member, key, salt, name, icon | `member` |
| `admit` | `a` | ring, left, right, member, key, name, icon, proof | `member`, `left`, `right` (ei `right`, jos left = right) |
| `node` | `n` | ring, left, right, member, key, name, legacy | `member`, `left`, `right` |
| `retire` | `r` | ring, member | solmulle `left` ja `right` (huoltajat), vanhalle palvelimelle `operator` |
| `server` | `s` | ring, member, key, operator, name | `member`, `operator` |

**Kenttien muoto:**
- `ring`, `member`, `left`, `right` ja `operator` ovat 8 heksaa.
- `proof` on tyhjä tai 12 heksaa: oikean naapurin vahvistuskoodin haaste.
- `legacy` on kasvava, toistoton lista, jossa on enintään 8 palvelintunnistetta.
- Solmussa `left ≠ right`.

Muodoltaan kelvoton tapahtuma hylätään ilman tarkistusta.

**Allekirjoitusten tarkistus:**
- Tunnisteen on vastattava avainta: `id(key) = member`.
- `member`-allekirjoitus tarkistetaan tapahtuman omalla avaimella.
- `found`-tapahtumassa lisäksi `ringId(key, salt) = ring`.
- Muut allekirjoittajat tarkistetaan rekisteriin jo hyväksytyillä **henkilöjäsenten** avaimilla (`found`/`admit`).
- Solmun tai palvelimen avain ei kelpaa naapurin allekirjoitukseksi. Siksi solmu ei voi perustaa solmua eikä hyväksyä jäsentä.
- Jos allekirjoittajan avainta ei vielä tunneta, tapahtuma odottaa. Se tarkistetaan uudelleen, kun rekisteri kasvaa.
- `retire` tarkistetaan kohteen hyväksytyn `node`- tai `server`-tapahtuman perusteella:
  - solmulla sen `left`- ja `right`-huoltajien avaimilla
  - vanhalla palvelimella sen `operator`-avaimella

### Rekisterin rakentaminen (deterministinen)

1. **Versioiden valinta.** Jokaisesta tunnisteesta käytetään allekirjoitukseltaan kelvollisista versioista se, jonka JSON-merkkijono on pienin. Vertailu tehdään UTF-16-yksiköittäin `JSON.stringify`-muodossa.
2. **Järjestys.** Tapahtumat järjestetään tunnisteen mukaan. Perustajaksi hyväksytään pienin `found`, ja muut `found`-tapahtumat hylätään.
3. **Henkilöt ja solmut.** `members` on henkilöt rengasjärjestyksessä. `order` on koko rengas solmuineen.
   - Kierroksella sovelletaan **ensin solmut** ja sitten henkilöt, kummatkin tunnisteen mukaan. Ensimmäinen sovellettavissa oleva tapahtuma sovelletaan, ja kierros alkaa alusta.
   - Tapahtuma **hylätään**, jos:
     - jäsen on jo henkilö tai solmu
     - `left` tai `right` on solmu
     - naapurit ovat henkilöjäseninä, mutta eivät vierekkäin `members`-järjestyksessä
   - Tapahtuma **odottaa**, jos `left` tai `right` ei ole vielä jäsen.
   - Muuten uusi jäsen lisätään `order`-järjestykseen heti `left`:n jälkeen. Henkilö lisätään myös `members`-järjestykseen heti `left`:n jälkeen.
   - Solmut eivät ole `members`-järjestyksessä. Siksi solmu ei erota huoltajiaan, eikä sitä tarvita uuden jäsenen hyväksymiseen.
   - "Solmu ensin": huoltajien väliin myöhemmin liittyvä henkilö voi tulla vasta, kun molemmat huoltajat ovat jäseniä. Solmu on siis aina ehtinyt ensin, oli tunnisteiden järjestys mikä tahansa.
4. **Vanhat palvelimet (malli 1).** `server` hylätään, jos jäsen on henkilö tai solmu. Se odottaa, kunnes operaattori on henkilöjäsen.
   - **Siirtymäsääntö:** kun renkaassa on yksikin solmu, vanha palvelin kelpaa enää, jos jonkin hyväksytyn solmun `legacy` luettelee sen. Yksi jäsen ei siis voi enää lisätä palvelinta yksin.
5. **Poistot.** `retire` poistaa kohteen voimassa olevista palvelimista ja `order`-järjestyksestä ja lisää sen `retired`-joukkoon.
   - Jos kohde puuttuu, poisto odottaa.
   - Jos allekirjoittajien rooli ei vastaa kohteen lajia, poisto hylätään.
   - Poistettua tunnistetta ei voi ottaa uudelleen käyttöön, koska tunniste on sidottu avaimeen.

Tulos on sama kaikilla, joilla on samat tapahtumat, saapumisjärjestyksestä riippumatta. Testivektori `conformance.json` kirjaa jokaiselle tapauksesta yhteenvedon. Kentät ja niiden järjestys:

| Kenttä | Järjestys |
|---|---|
| `members`, `order` | rengasjärjestys |
| `servers` | palvelimet ja niiden huoltajat tai operaattori |
| `retired`, `rejected`, `pending`, `invalid`, `unverified` | tunnisteet aakkosjärjestyksessä |

### Huoltajuus

Solmun huoltajat ovat sen `node`-tapahtuman `left` ja `right`, eli kaksi silloin vierekkäistä henkilöjäsentä. Huoltajuus ei muutu, kun rengasjärjestys muuttuu.

Huoltajuus on vastuu solmun ylläpidosta. Se ei ole omistusta, eikä siihen liity palkkiota. Huoltajat voivat yhdessä poistaa solmun palvelinroolin (`retire`).

Huoltajuuden siirtoa toiselle jäsenelle ei ole vielä määritelty. Ehdotus: `guard`-tapahtuma, jonka allekirjoittavat molemmat nykyiset ja uusi huoltaja.

### Yhteensopivuus ja siirtymä mallista 1

**Malli 1** tunsi `found`-, `admit`- ja `server`-tapahtumat.
- Se pitää `node`- ja `retire`-tapahtumia kelvottomina eikä tallenna tai välitä niitä.
- Mallin 1 toteutus ei siis näe solmuja, mutta henkilörekisteri pysyy samana.
- `hello.model` kertoo mallin. Puuttuva kenttä tarkoittaa mallia 1, ja eroavasta mallista kirjoitetaan lokiin päivityskehotus.
- Palvelimet on päivitettävä malliin 2 ennen kuin ensimmäinen solmu liitetään. Muuten ne eivät välitä solmun tapahtumaa eivätkä sen korttia.

**Malli 2** hyväksyy vanhat `server`-tapahtumat (siirtymäsääntö kohdassa 4) mutta ei luo niitä. Palvelin vastaa vanhan sivun yhden operaattorin liittämispyyntöön kieltävästi. Mallissa 3 vanhat `server`-tapahtumat on tarkoitus jättää pois, kun niitä ei ole enää voimassa.

## 4. Kuljetus: sanomat

Sanomat ovat JSON-olioita DataChannelissa, jonka nimi on `direct`, ordered. Jokaisessa on `protocol: "certiratio-direct/5"` ja `type`.
- Enimmäiskoko on 64 KiB.
- Tuntemattomat tyypit ja kentät ohitetaan.
- Ennen todennusta käsitellään vain `hello` ja `auth`. Muut jonotetaan (enintään 200) ja käsitellään todennuksen jälkeen.

| Tyyppi | Kentät | Merkitys |
|---|---|---|
| `hello` | id, key, nonce, boot, ring, name, icon, peers, server?, model | Esittely ja haaste. `peers` on lähettäjän todennetut henkilöyhteydet. Palvelimella `server: true`. |
| `auth` | sig | Allekirjoitus `["auth", vastapuolen nonce, oma id, vastapuolen id]`. Todennuksen jälkeen avain sidotaan yhteyteen. |
| `events` | list | Koko rekisteri, enintään 1000 tapahtumaa. |
| `ev` | ev, mid, from, ttl | Uusi tapahtuma kaikille. Välitetään tulvana: `mid` kerran, `ttl` ≤ 8. |
| `card` | card | Palvelimen kortti (kohta 6). |
| `sig` | to, from, mid, ttl, data | WebRTC-tarjous tai -vastaus toiselle jäsenelle. Ohjattu: välitetään suoraan vastaanottajalle, jos yhteys on, muuten tulvana. |
| `sponsor`, `claim`, `vouched` | to, … | Henkilön liittymisen vaiheet. |
| `cosign`, `cosigned` | to, ev / member, ok | Solmun liittämisen tai poiston toinen allekirjoittaja (kohta 5). |
| `enroll`, `enrolled` | token, ring, left, right, legacy, events / ok, why, sig, kind, … | Palvelin rengassolmuksi (kohta 5). |
| `meet` | secret | Kohtaamispaikan salaisuus jäsenelle. Ei koskaan palvelimelle. |
| `dm`, `dm-ack` | from, to, id, text / id | Kahdenkeskinen viesti (kohta 7). |

**Jäsenyys ja virheet:**
- Todennettu vastapuoli, joka ei ole rekisterissä henkilönä tai palvelimena, katkaistaan, kun rekisterillä on ollut aikaa saapua (5 s).
- Todentamaton yhteys katkaistaan palvelimella 10 sekunnissa ja selaimella 45 sekunnissa.
- Avain, joka ei vastaa tunnistetta tai rekisteriä, katkaisee yhteyden.
- Toisen renkaan `hello` katkaisee yhteyden.
- `ev` välitetään tulvana ennen tarkistusta, joten jokainen vastaanottaja tarkistaa sen itse. Virheellinen allekirjoitus kirjataan lokiin, eikä tapahtumaa tallenneta tai lähetetä `events`-listassa.

## 5. Rengassolmun liittäminen ja poisto

1. Palvelin tulostaa liittämislinkin `SIVU#s1.FP.PORTTI.OSOITTEET.TUNNUS`. Tunnus on 16 heksaa ja kertakäyttöinen.
2. Jäsen A avaa linkin. Sivu yhdistää kortilla (kohta 6) ja lähettää `enroll`-sanoman:
   - `left` = A
   - `right` = A:n oikea henkilönaapuri B
   - `legacy` = voimassa olevat vanhat palvelimet
   - `events` = rekisteri
3. Palvelin tarkistaa pyynnön:
   - tunnus
   - `left` on pyytäjä
   - A ja B ovat vierekkäin
   - legacy-lista vastaa rekisteriä

   Sitten palvelin allekirjoittaa `node`-sisällön ja vastaa `enrolled`-sanomalla `{ok, sig, kind: "node", …}`.
4. A tarkistaa palvelimen allekirjoituksen, allekirjoittaa `left`-roolissa ja lähettää B:lle `cosign {ev}`.
5. B tarkistaa pyynnön: A ja B ovat vierekkäin, ja solmun ja A:n allekirjoitukset kelpaavat. Sen jälkeen B näyttää pyynnön.
   - Jos B hyväksyy, B allekirjoittaa `right`-roolissa ja julkaisee `ev`-sanoman.
   - Jos B hylkää, B lähettää `cosigned {ok: false}`.
6. Palvelin saa tapahtuman ja liittyy renkaaseen. Liittämistunnus mitätöidään, ja palvelin julkaisee korttinsa.

**Poisto:**
- Rengassolmun poiston aloittaa toinen huoltaja `cosign`-pyynnöllä, ja toinen huoltaja julkaisee sen.
- Vanhan palvelimen operaattori julkaisee `retire`-tapahtuman yksin.
- Poistetun palvelimen kortit hylätään, eikä siihen enää yhdistetä.

## 6. Yhteys palvelimeen kortilla (ilman signalointia)

**Kortin muoto:** `s1.FP.PORTTI.OSOITTEET`
- `FP` on DTLS-varmenteen SHA-256-sormenjälki base64url-muodossa (43 merkkiä).
- `OSOITTEET` on 1–8 IPv6-osoitetta pilkuin eroteltuna. Kelpaavat 2000::/3 ja fc00::/7.
- Sama kortti allekirjoitettuna kulkee `card`-sanomassa: `{server, seq, port, fp, addrs, sig}`.
  - `seq` on millisekunteja ja kasvaa, kun osoitteet muuttuvat.
  - Vastaanottaja hyväksyy vain tuoreemman kortin, ja vain renkaan voimassa olevalta palvelimelta.

**Palvelin:**
- ICE-lite yhdessä kiinteässä UDP-portissa.
- DTLS-palvelimena se hyväksyy minkä tahansa asiakasvarmenteen, koska jäsenet todennetaan `hello`/`auth`-vaiheessa.

**Selain:**
- Selain tekee tarjouksen (DataChannel `direct`) ja kokoaa palvelimen vastauksen itse kortista:
  - ICE-tunnus = selaimen oma `ice-ufrag` U
  - salasana = `pwdOf(U)` = `"certiratio-" + U`, täytettynä `-`-merkeillä 24 merkkiin
  - sormenjälki ja kandidaatit = kortin osoitteet ja portti
  - `setup:passive` (palvelin)
- Salasana ei ole turvamekanismi. Palvelimen tunnistaa sormenjälki, jäsenen allekirjoitus.

**Uudet asiakkaat palvelimella:**
- Palvelin tunnistaa uuden asiakkaan STUN-tarkistuksen tuntemattomasta tunnuksesta.
- Asiakkaita on enintään 64.
- Suljetun yhteyden tunnus on 30 sekuntia karanteenissa.

**Korttien leviäminen:**
- Jäsenet säilyttävät kortit ja jakavat ne todennetuille jäsenille ja palvelimille.
- Poissa ollut jäsen palaa tallennetulla kortilla ilman uusia koodeja.
- Palvelin esittelee paikalla olevat (`hello.peers`) ja välittää `sig`-sanomat. Varsinainen yhteys on jäsenten välinen.

DNS-nimeä voi käyttää ylläpidossa, mutta rengas ei tarvitse sitä.

## 7. Kahdenkeskiset viestit

`{type: "dm", from, to, id (16 heksaa), text (≤ 2000 merkkiä, reunoilta siistitty)}` lähetetään **vain** todennetulla suoralla yhteydellä henkilöjäsenten välillä. Sitä ei välitetä, eikä se kulje palvelimen kautta.

**Vastaanottaja:**
- hyväksyy vain sanoman, jossa `to` = minä ja `from` = yhteyden todennettu jäsen
- kuittaa `dm-ack {id}`-sanomalla
- tunnistaa kaksoiskappaleet `id`:n perusteella

**Lähettäjä:** jos suoraa yhteyttä ei ole, viesti jää lähtevään ja lähtee, kun yhteys syntyy.

Palvelin ohittaa `dm`-sanomat.

## 8. Testivektorit ja toteutukset

**Testivektorit:**

| Tiedosto | Sisältö | Tekijä |
|---|---|---|
| `poc1/tests/vectors/ring.json` | malli 1, allekirjoitukset, kortti, auth | `tools/make-vectors.mjs` |
| `poc1/tests/vectors/conformance.json` | malli 2: tapahtumajoukot ja odotetut rekisterit | `tools/make-conformance.mjs` |

**Tarkistajat:**
- **Selain/Node:** `npm test` (`tests/conformance.test.mjs`, `web/src/registry.js`)
- **Go:** `go test ./...` (`ringcore`)
- **Muut alustat:** `ringcheck VEKTORIT` (`ringserver/cmd/ringcheck`). Ohjelma tulostaa jokaisesta tapauksesta `ok`/`FAIL` ja lopuksi `YHTEENSOPIVA`.

Uuden toteutuksen on tuotettava jokaisesta tapauksesta sama yhteenveto molemmilla syötejärjestyksillä.

| Alusta | Tila 13.10.2026 |
|---|---|
| Linux amd64 (Go) | ✅ ringcheck, go test, palvelin |
| Linux arm64 (Go, Nokia G50 Android ilman Termuxia, adb) | ✅ ringcheck, palvelin |
| wasm32 (Go `js/wasm`, Node) | ✅ ringcheck |
| wasm32 WASI (Go `wasip1/wasm`, Noden WASI) | ✅ ringcheck (`tools/run-wasip1.mjs`) |
| Chromium (selain-JS) | ✅ npm test, ajotestit |
| OpenBSD arm64 (Go, jedi) | ⚠️ palvelin ja ringcheck kääntyvät; ajo jedissä tehdään käyttöönotossa |
| Plan 9 amd64 (Go `GOOS=plan9`) | ⚠️ ringcheck kääntyy, ajoa Plan2001:ssä ei ole kokeiltu |
| Plan2001 / C | ❌ porttaus puuttuu: tarvitaan P-256 ECDSA, SHA-256 ja JSON-jäsennin; vektorit ovat valmiina |
| Android/Termux | ❌ ei kokeiltu: puhelimessa ei ole Termuxia. Sama arm64-binääri toimii adb:n kautta. |
| Firefox, Safari | ❌ ei kokeiltu tässä ympäristössä |
