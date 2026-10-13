# PoC 1 -rengas: arkisto ja tulokset (2026-10-11…13)

Tämä dokumentti on kirjoitettu ensisijaisesti tekoälyagentille, joka jatkaa Certiration selain- tai P2P-työtä. Alussa on koneluettava yhteenveto. Sen jälkeen tulee jokaisesta väitteestä näyttö ja lähde. Lue tämä ennen kuin ehdotat tai rakennat uudelleen jotain, mikä on jo kokeiltu.

```yaml
tila: arkistoitu
arkistoitu: 2026-10-13
päätös: >-
  Käyttäjä: "Tämä koko testi voidaan arkistoida. Tämä ei voi olla velkavaluutan base."
  Rengas, sen rekisteri ja rengassolmut EIVÄT ole Certiration velkavaluutan perusta.
  Koodi säilytetään, koska puhelimilla ja IPv6:lla testatut toiminnot ovat uudelleenkäytettäviä.
säilytetty: koko koodi gitissä (main, viimeinen toimiva versio 7b00f39), gh-pages-historia
poistettu:
  - GitHub Pages -julkaisu (gh-pages korvattu arkistoilmoituksella, f4d347f; Pagesia ei voinut poistaa API:lla, HTTP 422)
  - jedi.ydns.eu: certiratio_ring-palvelu, /etc/rc.d/certiratio_ring, /usr/local/bin/certiratio-ringserver,
    /usr/local/sbin/certiratio-ring-backup, /var/certiratio-ring, käyttäjä ja ryhmä _certring, ~/certiratio
  - Nokia G50: ringserver-prosessi pysäytetty (tiedostot /data/local/tmp ja Chromen sivustotiedot: ks. "Jäljellä")
ennallaan jedillä: quarter, httpd (tarkistettu toimiviksi poiston jälkeen)
talteen (paikallinen kone, ei repossa, tila 700):
  - ~/certiratio-varmuus/jedi-20261013/ring.json, daemon.log   # Jedin rekisteri ja loki, ei yksityisavaimia
  - ~/certiratio-varmuus/nokia-20261013-1325/                  # Nokian tila (sisältää sen yksityisavaimen)
  - ~/certiratio-varmuus/nokia-20261013-arkisto/rs*.log        # Nokian lokit
```

## 1. Mitä rakennettiin

| Osa | Polku | Kuvaus |
|---|---|---|
| Verkkotesti T5/T6 | `poc1/web/index.html`, `results/poc1-nettest-2026-10-11/` | Reitin luokittelu (IPv6/IPv4 direct, relay) ja yhteydet signaloinnin sulkemisen jälkeen |
| Rengas | `poc1/web/direct.html`, `poc1/web/src/*.js` | Selain-P2P-rengas: QR-liittyminen kahden naapurin väliin, allekirjoitettu rekisteri, kahdenkeskiset viestit |
| Rekisterimalli 2 | `poc1/web/src/ring.js`, `registry.js`, `identity.js` | Deterministinen rekisteri tapahtumajoukosta: found, admit, node, retire, legacy server |
| Rengassolmu (Go) | `poc1/ringserver/` (`ringcore/`, `node.go`, `cmd/ringcheck`) | WebRTC-vertainen, jonka selain tavoittaa pelkällä kortilla, ilman signalointia ja DNS:ää (pion, ICE-lite, yksi UDP-portti) |
| Protokolla | `docs/PROTOKOLLA.md` | Alustariippumaton määrittely, kanoninen allekirjoitettava sisältö, mallin versiointi |
| Testivektorit | `poc1/tests/vectors/ring.json`, `conformance.json` | Yhteiset JS:lle, Golle ja tuleville C-toteutuksille |
| Ajotestit | `poc1/tools/drive-*.mjs`, `ns-migration.sh` | Useita Chromium-profiileja CDP:llä, IPv6 ULA -verkkonimiavaruudessa |
| Siirto ja palautus | `docs/JEDI_SIIRTO.md` | Palvelinroolin siirto puhelimesta Jedin solmuksi katkotta |
| Suunnitelma | `docs/KOHTAAMISPUHELIN.md`, `docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md` | Puhelinpalvelin ja jäsenyysmalli |

Ajo: `cd poc1 && npm test` (55 testiä), `cd poc1/ringserver && go test ./...`. Ajotestit vaativat Chromiumin ja verkkonimiavaruuden, ks. `poc1/README.md`.

## 2. Todennetut tulokset

Merkinnät: **K** = kenttätesti oikeilla puhelimilla ja verkoilla, **L** = paikallinen testi (Chromium, ULA-verkkonimiavaruus).

| # | Tulos | Näyttö | Lähde |
|---|---|---|---|
| R1 | Suora IPv6-WebRTC eri mobiililiittymien puhelinten välillä toimii ilman TURNia | K: launchpad 2026-10-11…12 useilla testaajilla, myös iPhone 11 (STUNin avulla) | `poc1/README.md` (IPv6 launchpad) |
| R2 | Mobiili-IPv4 on CGNATin takana. Puhelinten välistä IPv4-P2P:tä ei ole. Hotspotin sisäiset IPv4-reitit eivät todista mitään | K: T6, puhelin ei saanut IPv4-srflx:ää | `results/poc1-nettest-2026-10-11/README.md` |
| R3 | DataChannel jatkaa, vaikka signalointipalvelin suljetaan | L+K: T5 6/6 suuntaa | sama |
| R4 | Android-Chrome antaa omat IPv6-host-kandidaattinsa. Työpöytä-Chrome ja iOS/WebKit piilottavat ne mDNS:llä, jolloin tarvitaan STUN, joka vain kertoo osoitteen | K | `poc1/README.md` (Kamera ja osoitteet) |
| R5 | Selain yhdistää palvelimeen pelkällä kortilla `s1.SORMENJÄLKI.PORTTI.OSOITTEET` ilman signalointia, DNS:ää tai varmentajaa. Selain kokoaa ICE-lite-vastauksen itse, ja väärä sormenjälki hylätään | L+K | `docs/KOHTAAMISPUHELIN.md`, `poc1/web/src/servercard.js` |
| R6 | Pyytämätön UDP operaattorien välillä: Elisa → DNA (Jedi 4G-reitittimen takana) kortilla 0,66 s | K 2026-10-13 | `docs/JEDI_SIIRTO.md` |
| R7 | Puhelin (Nokia G50, Android, ilman roottia ja Termuxia) voi ajaa Go-palvelinta adb:n shell-käyttäjänä `/data/local/tmp`:ssä | K 2026-10-12…13 | `docs/KOHTAAMISPUHELIN.md` |
| R8 | Go-ydin `ringcore` (ei pionia) on siirrettävä: ringcheck YHTEENSOPIVA Linux amd64:llä, Android arm64:llä, js/wasm:lla, wasip1:llä ja OpenBSD 7.9 arm64:llä. Plan 9 vain kääntyy | K+L | `docs/PROTOKOLLA.md` §8 |
| R9 | Allekirjoitettu tapahtumarekisteri (ECDSA P-256, kanoninen JSON) tuottaa saman tilan JS:ssä ja Gossa molemmilla syötejärjestyksillä. 10 yhteensopivuustapausta | L | `poc1/tests/vectors/conformance.json` |
| R10 | Palvelinrooli siirtyi puhelimesta (Nokia, malli 1) itsenäiselle solmulle (Jedi, malli 2) katkotta. Kaksi henkilöhuoltajaa allekirjoitti | K 2026-10-13: Nokia pysäytettiin, isi palasi pelkän Jedin kautta (1 välittäjä, IPv6 direct 56 ms), ja viesti meni perille | `docs/JEDI_SIIRTO.md`, `tools/drive-migration.mjs` |
| R11 | Solmun palvelun uudelleenkäynnistys: jäsenet palasivat itsestään 16 s (isi) ja 30 s (Törttö) | K 2026-10-13 | Jedin loki (talteen) |
| R12 | Kahdenkeskiset viestit kulkivat suoraan IPv6:lla molempiin suuntiin, ✓✓-kuittaukset mukaan lukien. Poissaolevan viesti jää lähtevään ja lähtee, kun suora yhteys syntyy | K+L | `poc1/README.md` (dm), tämän session havainnot |
| R13 | Palaava jäsen yhdistää ilman koodeja, kun hän tuntee solmun kortin. Hanna palasi Jedin kautta klo 15.37 ja 18.31 | K 2026-10-13 | Jedin loki |
| R14 | Paikallinen kohtaamispaikka (rtcsignal): sivun uudelleenavaus yhdistää kaikkiin 0,6 sekunnissa. Kaksi puhelinta eri /64-verkoissa: liittyminen 2,9 s ja paluu 1,1 s | L+K 2026-10-12 | `poc1/README.md` |

## 3. Havaitut rajoitteet ja sudenkuopat

Nämä koskevat mitä tahansa selaimessa tai puhelimessa ajettavaa P2P-ratkaisua.

| # | Havainto | Seuraus |
|---|---|---|
| H1 | Android-Chrome jäädyttää piilossa olevan välilehden, myös lukitun näytön takana. Olemassa oleva WebRTC-yhteys säilyi (Törttö–Jedi 14.06–16.39), mutta ajastimet pysähtyvät, eikä sivu huomaa katkosta eikä avaa uusia yhteyksiä. Sivu väittää yhteyksien olevan auki | Selain puhelimessa ei voi olla aina paikalla oleva jäsen tai palvelin. DevTools-komento `Page.setWebLifecycleState {state:"active"}` herätti sivun, mutta se on vain kehitysapu. Aina päällä oleva rooli vaatii natiivisovelluksen (foreground service) tai erillisen koneen |
| H2 | Kun jäsen ei ole paikalla, häntä ei tavoita (Hanna 18.31: Törtön sivu oli jäässä) | Viestit vaativat molempien läsnäolon tai välittäjän, joka säilyttää päästä päähän salattuja viestejä (ei toteutettu) |
| H3 | adb:llä käynnistetty prosessi kuoli, kun USB-tila vaihtui jaettuun yhteyteen. `setsid nohup` ei auttanut tähän | Puhelinpalvelin ilman sovellusta on hauras |
| H4 | Selaimen heuristinen välimuisti sekoitti moduulien vanhoja ja uusia versioita GitHub Pagesissa | Julkaisu lisää moduulien tuonteihin `?v=<commit>` (`tools/publish-pages.sh`) |
| H5 | `navigator.storage.persisted()` oli Chromessa false. Safari voi poistaa tallenteet noin viikon käyttämättömyyden jälkeen | Avain ja rekisteri selaimen IndexedDB:ssä eivät ole pysyviä. Avaimen varmuuskopiota tai siirtoa ei toteutettu |
| H6 | Uudelleenyhdistyksessä syntyi kaksoisyhteyksiä: isi avasi Jediin kolme yhteyttä peräkkäin. Kaksi niistä todennettiin ja suljettiin 1–3 s kuluessa | Avoin vika: sivu aloittaa uuden yhteyden, vaikka edellinen on vielä muodostumassa |
| H7 | Uuden jäsenen voi kutsua vain välin vasen naapuri. Kahdesta välistä vain toisen kutsunappi on jäsenellä | UI-rajoite, jonka käyttäjä huomasi. Ehdotettiin toista nappia, jota ei toteutettu |
| H8 | Huoltajuutta ei voi luovuttaa. Ehdotettiin `guard`-tapahtumaa (luovuttaja ja uusi huoltaja allekirjoittavat, ja kadonneen voi vaihtaa toisen huoltajan kanssa) | Ei toteutettu |
| H9 | 32-bittiset tunnisteet, osoitettujen sanomien lähettäjää ei allekirjoiteta päästä päähän, ja avainta ei voi viedä | PoC-tason turva, ei tuotantoon |
| H10 | Testi-infra: jääneet headless-Chromiumit täyttivät muistin ja kaatoivat koneen. Koneessa ei ole swapia | Aja testit `systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=0`:n alla ja siivoa `pkill -f -- "--user-data-dir=$W/prof"` -trapilla. Älä käytä pkill-kuviota, joka osuu omaan komentoriviin |
| H11 | OpenBSD:n grep ei tue `\|`- eikä `-A`-valitsimia. Jedi on IPv6-only, ja ssh toimii | Käytä `grep -E` |

## 4. Uudelleenkäytettävät osat

- **Kortti ilman signalointia** (`servercard.js` ja `ringserver`): selain → kiinteä palvelin IPv6:lla ilman DNS:ää ja varmentajaa. Sopii mihin tahansa myöhempään selaimen ja kotipalvelimen yhteyteen.
- **Kanoninen allekirjoitus ja testivektorit** (`identity.js`, `ringcore/crypto.go`, `PROTOKOLLA.md` §2): toimii samoin JS:ssä ja Gossa. Malli tapahtumaprotokollan ristiintoteutukselle.
- **Deterministinen rekisterin rakennus tapahtumajoukosta** (`ring.js`/`ring.go` `Build`): saapumisjärjestys ei vaikuta tulokseen. Kuvio sopii mihin tahansa replikoituun tapahtumalokiin.
- **QR-koodatut SDP-tiivisteet** (`pairing.js`): vain IPv6, QR-versio ≤ 11.
- **CDP-ajotestit useilla selaimilla** (`tools/drive-*.mjs`) ja **IPv6-verkkonimiavaruus ilman IPv6-verkkoa** (`unshare -rn`, dummy-liitäntä ja ULA).
- **Rengasnäkymä:** yhden rivin loputon vieritys, oma nimi keskellä (`direct.js` `renderRing`, 7b00f39).

## 5. Mitä ei pidä olettaa

- Älä oleta, että rengas, rengassolmu tai huoltajamalli on velkavaluutan rekisteri tai jäsenyysmalli. Käyttäjä hylkäsi tämän 2026-10-13.
- Älä ehdota IPv4- tai TURN-varaa testin osaksi (AGENTS.md).
- Älä palauta palveluja jediin. Jedi on käyttäjän sähkönohjauspalvelin (quarter, httpd), eikä siellä ole enää certiratio-osia.
- `https://pereuna.github.io/certiratio/` näyttää vain arkistoilmoituksen.

## 6. Jäljellä (käyttäjän päätettävissä)

- **G50:** demon tiedostot hakemistosta `/data/local/tmp` poistettiin 2026-10-13 käyttäjän pyynnöstä. Chromen sivustotiedot pereuna.github.io:lle (Törtön avain, rekisteri ja viestit IndexedDB:ssä) poistetaan puhelimesta käsin: Chrome → Asetukset → Sivustoasetukset → Kaikki sivustot → pereuna.github.io → Tyhjennä ja nollaa. Automaattinen lupatarkistus esti etäpoiston.
- **Muiden jäsenten puhelimet** (isi, Hanna): sivustotiedot jäävät heidän selaimiinsa, kunnes he poistavat ne itse. Sivu ei enää lataudu Pagesista.
- **Paikalliset varmuuskopiot** `~/certiratio-varmuus/`.
- **Repo** `github.com/pereuna/certiratio` pysyy julkisena (käyttäjän päätös 2026-10-13).
