# Certiration PoC 1 — Hajautettu selainkirjanpito

**Tila:** Toteutusmäärittely (v0.1)  
**Päiväys:** 2026-10-10  
**Ehdotettu sijainti repositoriossa:** `docs/POC1-BROWSER-P2P.md`  
**Kohde:** Ensimmäinen toimiva prototyyppi (ei tuotantokäyttöön)

## 1. Tarkoitus

Todistetaan, että kolme itsenäistä verkkoselainta (A, B ja C) voivat ylläpitää samaa allekirjoitettujen velkasetelitapahtumien joukkoa **ilman keskitettyä kirjanpitopalvelinta**. Selain toimii vertaisverkon solmuna ja säilyttää tiedot paikallisesti. Erillinen palvelu saa välittää vain yhteydenmuodostuksessa tarvittavaa signalointia.

**Kokeen peruspolku:** A luo velkasetelin, A luovuttaa sen B:lle, B luovuttaa sen C:lle; kaikki kolme solmua synkronoituvat. Yksi solmu suljetaan ja avataan uudelleen, minkä jälkeen se hakee puuttuvat tapahtumat vertaisiltaan.

Tämä PoC testaa tapahtumien luontia, allekirjoituksia, jakelua, paikallista säilytystä ja determinististä validointia. Se **ei** toteuta rahajärjestelmän yhteiskunnallisia sääntöjä, luottorajoja eikä globaalin konsensuksen lopullista päätöksentekoa.

## 2. Rajaus ja termit

- **Osapuoli:** A, B tai C; kryptografinen identiteetti, ei henkilötietojen varmennusta.
- **Peer/solmu:** selainvälilehden ajama ohjelma, jolla on identiteetti, paikallistietokanta ja verkkoyhteydet.
- **Instrumentti:** yksilöity velkaseteli / siirrettävä maksusitoumus (`instrument_id`).
- **Tapahtuma:** muuttumattomana tallennettava, allekirjoitettu tilasiirtymä.
- **Siirtoketju:** yhden instrumentin ISSUE- ja TRANSFER-tapahtumat sekä mahdollinen SETTLE.
- **Hyväksyntä:** paikallinen sääntöjenmukaisuus; ei lopullinen globaalin verkon vahvistus.
- **Konflikti:** kaksi toisensa poissulkevaa, muuten kelvollista siirtoa samasta edeltäjästä.

PoC:n taloudellinen mittayksikkö on sovittu testiyksikkö `TEST`, ei euro eikä oikeudellinen maksuväline. PoC:n saldot ovat *testinäkymiä*, eivät autoritatiivinen henkilökohtainen velkakirjanpito.

## 3. Toteutusrakenne

```text
  Selain A                  Selain B                  Selain C
  Web UI                    Web UI                    Web UI
  WebCrypto                 WebCrypto                 WebCrypto
  IndexedDB                 IndexedDB                 IndexedDB
  Event validation          Event validation          Event validation
       |                         |                         |
       +----------- WebRTC DataChannel (P2P) -------------+
                         ^
                         |
            WebSocket signaling / bootstrap
       (vain peer discovery, SDP ja ICE; ei kirjanpitoa)
```

### 3.1 Selain

- Staattinen HTTPS-sovellus; ei vaadi selainlaajennusta tai natiivisovellusta.
- `RTCPeerConnection` + luotettava, järjestetty `RTCDataChannel` (`ordered: true`) siirtävät P2P-sanomat.
- `crypto.subtle` hoitaa SHA-256:n sekä allekirjoitukset. **Algoritmivalinta:** Ed25519, jos kaikki kohdeselaimet tukevat sitä; muussa tapauksessa koko PoC toteutetaan ECDSA P-256 / SHA-256:lla. Algoritmia ei vaihdeta solmukohtaisesti. Suoritettava yhteensopivuustesti ratkaisee valinnan ennen toteutusta.
- `IndexedDB` säilyttää avainmateriaalin, tapahtumat, vertaismetadataa ja synkronointitilan. Yksityinen avain luodaan `extractable: false` -asetuksella, jos valittu selain-/algoritmiyhdistelmä tukee sen tallennusta IndexedDB:hen. Pelkkä SHA-tunniste ei ole allekirjoitus.
- Sovellus tarjoaa paikallisen testidatan poiston ja identiteetin nollauksen; poisto estetään vahingossa tavallisten toimintojen yhteydessä.

### 3.2 Bootstrap/signaling

- Yksi minimaalinen WebSocket-palvelu `wss://.../signal` (kehityksessä myös `localhost`).
- Palvelu jakaa **tilapäiset istuntotunnisteet**, välittää SDP offer/answer- ja ICE-kandidaattisanomat kohdeistuntoon.
- Se ei vastaanota eikä tallenna `ISSUE`-, `TRANSFER`- tai `SETTLE`-tapahtumia.
- Ei tietokantaa; aktiivisten istuntojen lista voidaan pitää muistissa.
- PoC:ssa peerit liittyvät samaan satunnaiseen testihuoneeseen. Kuka tahansa huonekoodin tunteva voi yrittää liittyä; kryptografinen tapahtumavalidointi tapahtuu erikseen.
- P2P-yhteyden auettua signaling-palvelu voidaan pysäyttää, jolloin jo muodostettujen yhteyksien kirjanpitoliikenteen on jatkuttava.

### 3.3 IPv6-verkon testaus

- ICE saa yrittää suoria IPv6-yhteyksiä, mutta julkinen IPv6-osoite **ei takaa** yhteyden onnistumista (operaattorien palomuurit, ICE-kandidaatit ja selainten rajoitukset).
- PoC kirjaa valitun ICE-kandidaattiparin tyypin ja IP-protokollaperheen selaimen tarjoamien tilastojen puitteissa (`getStats()`). IP-osoitteita ei tarvitse kerätä pysyvään kirjanpitoon.
- Yhteystyypit raportoidaan: **suora IPv6**, **suora IPv4**, **TURN relay**, **epäonnistunut/tuntematon**. Suoraa IPv6-yhteyttä ei saa päätellä pelkästä laitteen IPv6-osoitteesta.
- Testit ajetaan ensin ilman TURNia suorien reittien mittaamiseksi ja tarvittaessa erikseen TURNin kanssa toiminnallisen P2P-tiedonsiirron osoittamiseksi. TURN-palvelimen välittämä liikenne ei täytä *suora IPv6* -tulosta.

## 4. Identiteetti ja avaimet

1. Ensimmäisellä käynnistyksellä selain muodostaa allekirjoitusavainparin.
2. `participant_id = "sha256:" + hex(SHA256(canonical_public_key_bytes))`. Julkisen avaimen sarjoitus ja algoritmitunniste määritellään täsmälleen käytetylle algoritmille ja lukitaan koko PoC:lle.
3. Osapuolen nimi `A`, `B` tai `C` on vain käyttöliittymän alias.
4. Julkinen avain kulkee tapahtumien mukana tai haetaan osallistujarekisteristä; aina tarkastetaan, että avaimen tiiviste vastaa tunnistetta.
5. Yksityistä avainta ei lähetetä vertaisille tai signaling-palvelulle.
6. Avaimen katoaminen tai selaimen tietojen poistaminen merkitsee PoC:ssa identiteetin katoamista. Palautusta ei toteuteta.

## 5. Tapahtumamalli v1

Kaikki tapahtumat ovat **kanonisoitua JSONia** (RFC 8785 / JCS) ja UTF-8-koodattuja. Kaikki kokonaislukusummat ovat JSON-merkkijonoja, jotta JavaScriptin liukulukuesitys ei aiheuta eroja. Hash muodostetaan kanonisoidusta `body`-objektista: `event_id = sha256:<hex(SHA256(JCS(body)))>`. Allekirjoitus kattaa domain-erotellun tavujonon `UTF8("CERTIRATION/POC1/EVENT\n") || JCS(body)`; allekirjoitus esitetään base64url-koodattuna ilman täytemerkkejä. `event_id` ei sisälly `body`yn eikä allekirjoitukseen, joten rakenne ei ole itseensä viittaava.

### 5.1 ISSUE

```json
{
  "body": {
    "version": 1,
    "type": "ISSUE",
    "instrument_id": "random-128-bit-hex",
    "prev": null,
    "issuer": "sha256:<A-id>",
    "holder_from": null,
    "holder_to": "sha256:<A-id>",
    "debtor": "sha256:<A-id>",
    "amount": "1000",
    "unit": "TEST",
    "nonce": "random-128-bit-hex"
  },
  "signatures": [
    {"by": "sha256:<A-id>", "alg": "Ed25519", "public_key": "<base64url>", "sig": "<base64url>"}
  ]
}
```

`ISSUE` luo yhden instrumentin A:n hallintaan; alkuperäinen velallinen on A. Tämän testirakenteen `issuer`, `debtor` ja alkuperäinen haltija ovat sama osapuoli. Tapahtuman luonti ei itsessään merkitse velkasaldon selvitystä.

### 5.2 TRANSFER

```json
{
  "body": {
    "version": 1,
    "type": "TRANSFER",
    "instrument_id": "<same-instrument-id>",
    "prev": "sha256:<preceding-event-id>",
    "holder_from": "sha256:<B-id>",
    "holder_to": "sha256:<C-id>",
    "nonce": "random-128-bit-hex"
  },
  "signatures": [
    {"by": "sha256:<B-id>", "alg": "Ed25519", "public_key": "<base64url>", "sig": "<base64url>"},
    {"by": "sha256:<C-id>", "alg": "Ed25519", "public_key": "<base64url>", "sig": "<base64url>"}
  ]
}
```

Molemmat, luovuttaja ja vastaanottaja, allekirjoittavat täsmälleen saman `body`-sisällön. Vastaanottajan allekirjoitus on PoC:n kaksipuolinen hyväksyntä; allekirjoitukset voidaan kerätä kahdessa viestissä ja julkaista yhtenä valmiina tapahtumana. Osittain allekirjoitettua siirtoa ei lisätä tapahtumakirjanpitoon. `holder_from` on aina edeltävän tapahtuman nykyinen haltija. Tapahtuma ei muuta instrumentin velallista eikä määrää.

### 5.3 SETTLE

```json
{
  "body": {
    "version": 1,
    "type": "SETTLE",
    "instrument_id": "<same-instrument-id>",
    "prev": "sha256:<preceding-event-id>",
    "holder_from": "sha256:<C-id>",
    "debtor": "sha256:<A-id>",
    "nonce": "random-128-bit-hex"
  },
  "signatures": [
    {"by": "sha256:<C-id>", "alg": "Ed25519", "public_key": "<base64url>", "sig": "<base64url>"},
    {"by": "sha256:<A-id>", "alg": "Ed25519", "public_key": "<base64url>", "sig": "<base64url>"}
  ]
}
```

`SETTLE` on PoC:n **molempien osapuolten kuittaama lopetustapahtuma**, ei todistus oikeasta pankkisuorituksesta eikä vielä Certirationin lopullinen velkatilin selvityssääntö. `SETTLE` päättää instrumentin siirtoketjun; sen jälkeen uusia siirtoja ei hyväksytä.

### 5.4 Tapahtumaidentiteetti ja turvallisuus

- `instrument_id` on kryptografisesti satunnainen ja yksikäsitteisyys tarkistetaan paikallisesta tapahtumajoukosta.
- Jokainen `prev` osoittaa **tapahtuman ID:hen**, ei pelkkään instrumenttiin.
- Sama `event_id` saa saapua rajattomasti uudelleen; tallennus on idempotentti.
- Tapahtumat ovat sisältöosoitteisia; tallennus ja verkko eivät saa muuttaa `body`ä.
- Yksi instrumentti on tässä PoC:ssa jakamaton: ei osasiirtoa, yhdistämistä, summan muutosta eikä siirtoketjun haaran automaattista valintaa.
- Tapahtumassa ei ole järjestyksen määräävää kellonaikaa. Paikallisia havaintoaikoja saa käyttää vain diagnostiikkaan.

## 6. Validointi ja instrumentin tilakone

Validointi on deterministinen riippumatta tapahtumien vastaanottojärjestyksestä.

**Tapahtuman tarkistus:**

1. JSON-rakenne, versio, merkkijonojen pituudet ja suurimmat sanomakoot ovat sallittuja.
2. `event_id` vastaa `body`n kanonista SHA-256-tiivistettä.
3. Kaikkien allekirjoittajien julkinen avain vastaa `participant_id`-tunnistetta ja allekirjoitus on oikea.
4. Vaaditut osapuolten allekirjoitukset ovat mukana (ISSUE: liikkeeseenlaskija; TRANSFER: luovuttaja ja saaja; SETTLE: viimeinen haltija ja velallinen).
5. `prev` osoittaa saman instrumentin olemassa olevaan edeltävään tapahtumaan; puuttuvasta edeltäjästä seuraa `PENDING`, ei lopullinen hylkäys.
6. Edeltäjän tila on sallittu (`ISSUE/TRANSFER` voi edeltää `TRANSFER/SETTLE`; `SETTLE` ei voi).
7. Edeltävän ketjun nykyinen haltija vastaa `holder_from`-kenttää; `SETTLE`n velallinen vastaa alkuperäistä `ISSUE`a.

**Instrumentin tilat:**

- `OPEN(holder, amount, debtor)` — yksi kelvollinen ketju, ei ratkaisemattomia kilpailevia seuraajia.
- `SETTLED` — yksikäsitteisen ketjun viimeinen tapahtuma on SETTLE.
- `PENDING` — osa ketjusta tai sen allekirjoituksista puuttuu.
- `CONFLICT` — samaan `prev`-tapahtumaan liittyy vähintään kaksi erilaista, allekirjoituksiltaan ja paikallisilta ehdoiltaan kelvollista seuraajaa (myös TRANSFER vs SETTLE). Konfliktin jälkeläisiä ei nosteta hyväksytyksi haaraksi.
- `INVALID` — tapahtuma ei täytä sääntöjä.

Konfliktissa **ei** valita voittajaa aikaleiman, vastaanottojärjestyksen, pienimmän hashin tai peer-määrän perusteella. Kaikki solmut säilyttävät molemmat tapahtumat ja näyttävät `CONFLICT`-tilan. Lopullinen konfliktin ratkaisu on rajattu pois PoC 1:stä.

## 7. P2P-synkronointiprotokolla v1

Siirto tapahtuu luotettavalla, järjestetyllä WebRTC DataChannelilla. Viestit ovat UTF-8 JSONia. Jokaisessa viestissä on `protocol: "certiration-p2p/1"`, `type`, `message_id` ja tarvittava sisältö. Sovitaan viestikohtainen enimmäiskoko 64 KiB; tapahtumat välitetään erissä, jotta koko ei ylity. Tuntemattomat tyypit ohitetaan hallitusti.

| Sanoma | Tarkoitus |
| --- | --- |
| `HELLO` | Versio, osapuolitunniste, julkinen avain, satunnainen haaste, identiteetin todistava allekirjoitus |
| `INVENTORY` | Tunnettujen `event_id`-arvojen lista (PoC:n pieni testiaineisto) |
| `GET_EVENTS` | Pyydetyt tapahtumat ID:n perusteella |
| `EVENTS` | Rajattu joukko kokonaisia tapahtumia |
| `ACK` | Vastaanottoilmoitus erälle; ei taloudellinen hyväksyntä |
| `ERROR` | Protokolla- tai validointivirhe |

### 7.1 Yhteys- ja synkronointisekvenssi

1. Vertaiset löytävät toisensa huoneen kautta ja muodostavat WebRTC-yhteyden.
2. Molemmat lähettävät `HELLO`-viestin; haaste/vastaus sitoo vertaisidentiteetin aktiiviseen kanavaan. Pelkkä peerin itse ilmoittama ID ei riitä.
3. Molemmat lähettävät `INVENTORY`n (ID:t aakkosjärjestyksessä).
4. Molemmat pyytävät puuttuvat tapahtumat `GET_EVENTS`-viestillä.
5. Saadut `EVENTS`-erät validoidaan ja tallennetaan atomisesti IndexedDB:hen. Puuttuvat edeltäjät pyydetään erikseen.
6. Uudesta paikallisesta tapahtumasta lähetetään `INVENTORY` tai ilmoitus sen ID:stä kaikille suorille vertaisille. Vertaiset hakevat sisällön tarvittaessa ja välittävät tiedon eteenpäin.
7. Yhteyden palautuessa tehdään aina täydellinen inventaariovertailu. Periodinen inventaario (esim. 30 sekuntia) korjaa myös katoaneet ilmoitukset.

PoC:ssa koko tapahtumajoukon inventaario riittää, kun tapahtumia on enintään 1 000. Yli tämän koon Merkle-puut, Bloom-suodattimet ja muu skaalautuva anti-entropy jätetään jatkoversioon.

### 7.2 Väärinkäytön rajoitukset

- Enintään 3 suoraa vertaisyhteyttä PoC:n normaalissa testissä.
- Enintään 1 000 tapahtumaa ja 64 KiB per verkkosanoma testisolmua kohti.
- Validoi viestikoot **ennen** JSON-jäsennystä; rajoita jonopituus ja `bufferedAmount`.
- Rajoita virheellisten sanomien määrää, lokita syy ja katkaise toistuvasti väärinkäyttävä vertainen.
- Älä koskaan suorita vertaiselta tullutta JavaScriptiä tai renderöi tapahtuman tekstiä HTML:nä.
- PoC:n ohjelman latauksen alkuperä on luottamusraja: haitallinen tai muuttunut sivusto voi väärinkäyttää selainavaimia. Käytä HTTPS:ää ja mahdollisimman vähäisiä riippuvuuksia.

## 8. IndexedDB-tietomalli

| Object store | Avain | Sisältö |
| --- | --- | --- |
| `identity` | `local` | Julkinen avain, CryptoKey-yksityisavain, participant ID, algoritmi |
| `events` | `event_id` | Kanoninen tapahtuma, vastaanottoaika, paikallinen validointitila |
| `instruments` | `instrument_id` | **Johdettu välimuisti:** nykytila / ristiriita / viimeiset tapahtuma-ID:t |
| `peers` | `participant_id` | Viimeisin kohtaaminen ja paikalliset yhteysmetatiedot |

`events` on ensisijainen totuuden lähde. `instruments`-välimuisti voidaan aina rakentaa deterministisesti uudelleen tapahtumista. Saapumisen järjestys ei saa muuttaa laskettua tilaa. Tapahtumat tallennetaan ennen vastaanottokuittausta. `navigator.storage.persist()`-pyyntöä voidaan yrittää, mutta selain voi evätä sen; tämä ei ole varmistusratkaisu.

## 9. Käyttöliittymä

Yksi sivu riittää. Näytä:

- Paikallinen alias ja lyhennetty `participant_id`, avaimen käyttökelpoisuus.
- Liity huoneeseen / luo huone; suorien vertaisten määrä ja yhteystila.
- Yhteystilasto: `IPv6 direct`, `IPv4 direct`, `relay`, `unknown`.
- Luo testivelkaseteli (`ISSUE`), siirrä toiselle (`TRANSFER`), kuittaa (`SETTLE`).
- Instrumenttilista: ID, amount/unit, debtor, holder, state, chain length.
- Tapahtumaloki ja mahdolliset konfliktit; viennin mahdollisuus JSON-muodossa.
- Nollaa testidata -toiminto erillisellä vahvistuksella.

Jokainen siirto näyttää selvästi, kumman osapuolen allekirjoitus vielä puuttuu. Käyttöliittymä ei saa merkitä `TRANSFER`ia valmiiksi ennen molempien allekirjoitusten tarkistamista.

## 10. Testit ja hyväksymiskriteerit

### T1 — Kolmen selaimen perustesti

1. A, B ja C käynnistyvät erillisissä selainprofiileissa tai laitteissa ja liittyvät samaan huoneeseen.
2. A luo yhden `1000 TEST` -instrumentin; kaikki saavat sen.
3. A siirtää B:lle; A ja B allekirjoittavat saman tapahtuman.
4. B siirtää C:lle; B ja C allekirjoittavat saman tapahtuman.
5. Kaikissa näkyy sama `instrument_id`, sama tapahtumajoukko ja `OPEN(holder=C)`.
6. A ja B voivat tarkastaa allekirjoitukset ilman yhteyttä keskitettyyn kirjanpitopalvelimeen.

**Hyväksyntä:** kolmen solmun tapahtuma-ID-joukot ovat identtiset ja tila deterministisesti sama.

### T2 — Offline ja paluu

1. Sulje B:n välilehti siirron A→B jälkeen.
2. A ja C jatkavat toimintaansa; tee tarvittava testitapahtuma muiden osapuolten välillä omalla erillisellä testiinstrumentilla.
3. Avaa B uudelleen samassa selainprofiilissa.
4. B säilyttää identiteettinsä ja hakee puuttuvat tapahtumat.

**Hyväksyntä:** B päätyy samaan tapahtumajoukkoon ja tiloihin kuin A ja C ilman tapahtumien käsin tuontia.

### T3 — Kaksoisluovutus

1. Muodosta instrumentti, jonka nykyinen haltija on B.
2. Simuloi toisistaan erillään B→A ja B→C (molemmat kaksipuolisesti allekirjoitettuja ja samaan `prev`-ID:hen viittaavia).
3. Jaa molemmat haarat kaikille solmuille.

**Hyväksyntä:** jokainen solmu säilyttää molemmat tapahtumat ja näyttää `CONFLICT`; mikään solmu ei automaattisesti hyväksy kumpaakaan haaraa voittajaksi.

### T4 — Väärentämisen torjunta

Muunna `amount`, `holder_to`, `prev`, allekirjoitus tai julkinen avain siirron jälkeen; testaa lisäksi puuttuva edeltäjä ja duplikaattitoimitus.

**Hyväksyntä:** väärennös hylätään, puuttuvan edeltäjän tapahtuma jää `PENDING`-tilaan, ja duplikaatti tallentuu vain kerran.

### T5 — Signalingin riippumattomuus

Kun kolmen selaimen WebRTC-yhteydet ovat auki, pysäytä signaling-palvelu ja siirrä uusi tapahtuma.

**Hyväksyntä:** olemassa olevat WebRTC-yhteydet välittävät tapahtuman. Katkenneiden yhteyksien uudelleenmuodostus ei kuulu tähän testiin.

### T6 — IPv6-mittaus

Testaa kahden eri mobiiliverkon välillä, sitten Wi-Fi ↔ mobiili, sekä (jos käytettävissä) kaksi natiivin IPv6:n päätelaitetta. Kirjaa ICE-kandidaattityyppi ja reitin IP-perhe; toista ilman TURNia ja TURNin kanssa.

**Hyväksyntä:** sovellus erottaa todennetusti suoran IPv6-, suoran IPv4-, välitetyn ja epäonnistuneen yhteyden. Suora IPv6 on mitattava tavoite, **ei kaikkien operaattorien yli taattu onnistumisehto**.

### T7 — SETTLE

C ja A allekirjoittavat `SETTLE`n siirtoketjun lopussa.

**Hyväksyntä:** kaikkien solmujen tila on `SETTLED`; uusi TRANSFER sen perään on `INVALID`.

## 11. Ehdotettu hakemistorakenne

```text
certiration/
  docs/
    POC1-BROWSER-P2P.md
  poc1/
    web/
      index.html
      src/
        identity.js       # avainpari, ID, allekirjoitukset
        events.js         # canonical JSON, event_id, rakentaminen
        validate.js       # tilakone, konfliktit
        storage.js        # IndexedDB
        p2p.js            # RTCDataChannel + synkronointi
        signaling.js      # WebSocket, SDP, ICE
        app.js            # testikäyttöliittymä
    signal/
      server.*            # pieni WebSocket-signaling-palvelin
    tests/
      vectors/            # kanonisointi- ja allekirjoitustestivektorit
      validation.*        # deterministinen tapahtumavalidointi
      integration.*       # synkronointi ja offline-tilanteet
    README.md
```

Tarkat tiedostonpäätteet ja signaling-palvelimen kieli ovat toteuttajan valittavissa. Selainpuoli toteutetaan ensisijaisesti natiivilla JavaScriptillä ilman raskasta frameworkia. Testivektorien odotetut hashit ja allekirjoitukset kiinnitetään ennen usean toteutuksen yhteensopivuustestausta.

## 12. Toteutusjärjestys

1. Staattinen HTTPS-sivu, identiteetti, IndexedDB, kanoninen serialisointi ja yksikkötestit.
2. ISSUE/TRANSFER/SETTLE + paikallinen validaattori, konfliktien tunnistus ja testivektorit.
3. Signaling ja kahden selaimen WebRTC DataChannel.
4. Inventory-/GET_EVENTS-/EVENTS-synkronointi ja kolmen selaimen toiminta.
5. Offline-paluu, kaksoisluovutustesti, signalingin sammutustesti.
6. Eri verkkoympäristöjen IPv6/ICE-mittaukset ja tulosten dokumentointi.

## 13. Ei-tavoitteet ja avoimet jatkokysymykset

PoC 1 ei ratkaise maailmanlaajuista konsensusta, Sybil-hyökkäyksiä, verkon partitiotilanteiden lopullista ratkaisua, laajan käyttäjäjoukon event discoveryä, pysyviä mobiilitaustasolmuja, henkilön virallista tunnistamista, avaimen palauttamista, yksityisyyttä julkisessa verkossa, kryptografista tapahtumien peruuttamista, oikeuskelpoista velkaseteliä eikä Certirationin varsinaisia velkatilien saldo- ja selvityssääntöjä.

Erityisesti myöhemmässä arkkitehtuurissa on määriteltävä, tarkoittaako haltijan vaihdos vain yhden allekirjoitetun maksusitoumuksen luovutusta vai myös velkakirjanpidon vastuiden muutosta. PoC 1 käsittelee **instrumentin haltijaketjua**, ei väitä ratkaisevansa koko velkatalouden kaksinkertaista kirjanpitoa.

## 14. Valmistumisen määritelmä (Definition of Done)

- Testit T1–T7 voidaan suorittaa dokumentoidusti.
- Kolme erillistä selainidentiteettiä replikoivat täsmälleen samat tapahtumat.
- Tapahtumat ja yksityinen avain säilyvät tavallisesta välilehden sulkemisesta ja uudelleenavaamisesta.
- Allekirjoitukset ja hashit validoidaan riippumatta siitä, missä solmussa tapahtuma syntyi.
- Konfliktit ovat havaittavia eivätkä piiloudu viimeisin-kirjoitus-voittaa -säännöllä.
- Signaling-palvelimella ei ole tapahtumatietokantaa eikä mitään kirjanpidon hyväksymisvaltaa.
- Verkon raportissa erotellaan **suora IPv6**, **suora IPv4** ja **TURN-välitys** havaintojen perusteella.
- `README.md` sisältää paikalliset käynnistyskomennot, käytetyt selaimet/versiot, HTTPS-vaatimuksen ja toistettavat testiaskeleet.

## 15. Teknisiä viitteitä

- MDN: WebRTC data channels — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- MDN: Signaling — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
- MDN: Web Crypto — https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- RFC 8785: JSON Canonicalization Scheme — https://www.rfc-editor.org/rfc/rfc8785

