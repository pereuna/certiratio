# Jedi itsenäiseksi rengassolmuksi: siirto- ja palautusohje

13.10.2026. Toimeksianto: siirretään Törtön puhelimen (Nokia G50) rengaspalvelimen tehtävät palvelimelle `jedi.ydns.eu`.

- Jedi liittyy renkaaseen itsenäisenä rengassolmuna, omalla identiteetillään.
- Sen huoltajiksi tulee kaksi vierekkäistä henkilöjäsentä. Huolto on vastuu, ei omistusta eikä palkkiota.
- Jedille ei siirretä Törtön identiteettiä eikä avainta.

Protokolla on kuvattu tiedostossa [PROTOKOLLA.md](PROTOKOLLA.md).

## Lähtötilanne (luettu 13.10.2026)

**Rengas `4d2a8810`:**
- isi `28fab959` → Hanna Reunamo `3e4ee4b8` → Törttö `6efb58c7`. Törttö on G50:n Chrome-välilehti.
- Rengaspalvelin Nokia `73b20779` on vanhaa mallia 1. Sen operaattori on Törttö.
  - Ajossa G50:ssä adb:n kautta: `ringserver -port 40123 -name Nokia -dir /data/local/tmp/nokia-tila`
  - Ajo on ilman aikarajaa, mutta prosessi kuolee, kun puhelin käynnistyy uudelleen.
  - Tila: `key.pem`, `dtls.pem` ja `ring.json`.

**Huoltajat:** isi ja Törttö (käyttäjän päätös 13.10.2026). Renkaassa Törttö → isi ovat vierekkäin, joten Törttö avaa liittämislinkin ja isi hyväksyy.

## Valmisteltu ja testattu (koodi)

**Rekisterimalli 2** on toteutettu sekä selaimessa että Go:ssa:
- `node`: solmu ja kaksi vierekkäistä henkilöä allekirjoittavat liittymisen. Huoltajat kirjataan erikseen.
- `retire`: palvelinroolin poisto.
- `legacy` ja siirtymäsääntö: kun renkaassa on solmu, yksi jäsen ei voi enää lisätä palvelinta yksin.
- Solmu ei voi perustaa solmua eikä hyväksyä jäsentä.

**Yhteiset testivektorit** (`tests/vectors/conformance.json`, 10 tapausta) antavat saman tuloksen kaikilla kokeilluilla alustoilla:
- selain-JS
- Go (linux amd64)
- linux arm64 (G50)
- wasm32 (js ja wasip1)

Plan 9 amd64 -käännös onnistuu, mutta sitä ei ole ajettu.

**Siirtymätesti** (`poc1/tools/ns-migration.sh` ja `drive-migration.mjs`) jäljittelee oikeaa siirtoa erillisessä verkkonimiavaruudessa. Testi kulkee näin:

1. Vanha sivu ja vanha palvelin: rengas isi → Hanna → Törttö, ja Nokia, jonka operaattori on Törttö.
2. Päivitys: uusi sivu, Nokia uudella ohjelmalla samalla tilalla, ja Jedi uutena. Rengas palaa ennallaan.
3. isi pyytää Jedin liittämistä, ja Hanna hyväksyy. Rekisteri on kaikilla sama, ja Jedin huoltajat ovat isi ja Hanna.
4. Nokia pysäytetään (SIGSTOP: prosessi ja tila säilyvät, mutta se ei vastaa), ja kaikki sivut suljetaan. Seuraavat toimivat pelkän Jedin varassa:
   - paluu ilman koodeja
   - esittely
   - kahdenkeskinen viesti suoraan jäsenten välillä
   - Jedin uudelleenkäynnistys, jonka jälkeen jäsenet palaavat itsestään
   - kortin päivitys uuteen osoitteeseen
   - myöhemmin palaava jäsen
5. Väärennetty solmutapahtuma hylätään kaikilla selaimilla ja Jedissä.
6. Törttö poistaa Nokian palvelinroolin. Kortti mitätöityy kaikilla, ja Jedi jää.

Ajo 13.10.2026: kaikki kohdat OK.

**Käyttöönotossa testattu (13.10.2026):**
- operaattorien välinen UDP: Elisa → DNA
- yhteydet eri IPv6-verkoista oikeaan Jediin

## Tila 13.10.2026 klo 14

Tehdyt vaiheet:

1. **Nokian varmuuskopio** (kohta 1) on tiedostossa `~/certiratio-varmuus/nokia-20261013-1325/`.
   - Vanha Nokia ei ollut enää käynnissä. Se kuoli todennäköisesti, kun koneen adb-yhteys katkesi kaatumisessa.
2. **Nokia päivitettiin malliin 2** (kohta 2) samalla tilalla.
   - Se käynnistettiin `setsid nohup`, joten se ei kuole, kun adb-yhteys katkeaa.
   - Vanha ohjelma on tiedostossa `/data/local/tmp/ringserver.malli1`.
3. **Jedi asennettiin** (kohta 3): tunniste `248fdde4`, ringcheck YHTEENSOPIVA OpenBSD arm64:llä.
   - Yhteys onnistui toisen operaattorin verkosta: kone Elisa → Jedi DNA 0,66 s, ja väärän sormenjäljen kortti hylättiin. G50 mobiilidatalla → Jedi: suora yhteys.
   - **Huoltajat ovat isi ja Törttö** (käyttäjän päätös). Renkaassa Törttö → isi ovat vierekkäin, joten Törttö pyysi ja isi hyväksyi klo 13.51.
   - Rengas: isi → Hanna Reunamo → Törttö → 🖥️ Jedi → (isi).
   - Liittämisessä löytyi virhe. Törtön sivu jäätyi odotuksen ajaksi, joten Jedi ei kuullut liittymisestään, eikä kukaan tuntenut sen korttia. Virhe ohitettiin yhdistämällä Jediin käsin ja korjattiin sitten koodissa: `cosign` kuljettaa kortin, ja pyytäjä ja hyväksyjä yhdistävät uuteen solmuun.

Seuraavaksi: kohta 4 (testi pelkän Jedin varassa) ja kohta 5 (Nokian palvelinroolin poisto).

## 1. Dokumentointi ja varmuuskopio Törtön palvelusta

```sh
adb shell 'ps -A -o PID,ARGS | grep ringserve[r]'
adb pull /data/local/tmp/nokia-tila nokia-tila-$(date +%Y%m%d)        # avain, varmenne, rekisteri
adb pull /data/local/tmp/rs.log
```

Varmuuskopio pidetään poissa repositoriosta, koska siinä on Nokian yksityinen avain.

Ennen siirtoa ajettavat testit:
- `npm test`
- `go test -race ./...`
- `ringcheck`
- `drive-ringnode`
- `drive-direct`
- `ns-migration.sh`

## 2. Nokian päivitys malliin 2 (sama identiteetti ja tila)

Mallin 1 Nokia ei tallenna eikä välitä `node`-tapahtumaa eikä Jedin korttia. Siksi Nokia päivitetään ensin:

```sh
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o ringserver-arm64 ./poc1/ringserver
adb push ringserver-arm64 /data/local/tmp/ringserver.new
adb shell 'kill PID; mv /data/local/tmp/ringserver.new /data/local/tmp/ringserver; cd /data/local/tmp &&
  nohup ./ringserver -port 40123 -name Nokia -dir /data/local/tmp/nokia-tila >> rs.log 2>&1 &'
```

Katko kestää muutaman sekunnin. Jäsenet yhdistävät uudelleen 15–30 sekunnissa.

Sivu (GitHub Pages) julkaistaan samaan aikaan. Pagesin välimuisti on noin 10 minuuttia, ja sivun voi ladata uudelleen.

## 3. Jedin käyttöönotto rinnalle

Jedi on OpenBSD 7.9 arm64 4G-reitittimen takana, ja se näkyy Internetiin vain IPv6:lla. Se on käyttäjän pörssisähkön ohjauspalvelin (`quarter` ja httpd), eikä rengassolmu saa häiritä sitä. Siksi rengassolmu:
- on oma rc.d-palvelunsa (`certiratio_ring`)
- ajetaan omana käyttäjänään `_certring` (login-luokka `daemon`)
- pitää tilansa omassa hakemistossaan `/var/certiratio-ring`
- käyttää yhtä UDP-porttia (40123)

`quarter`iin, httpd:hen ja niiden asetuksiin ei kosketa.

```sh
GOOS=openbsd GOARCH=arm64 CGO_ENABLED=0 go build -o ringserver-openbsd-arm64 ./poc1/ringserver
GOOS=openbsd GOARCH=arm64 CGO_ENABLED=0 go build -o ringcheck-openbsd-arm64 ./poc1/ringserver/cmd/ringcheck
scp ringserver-openbsd-arm64 ringcheck-openbsd-arm64 poc1/tests/vectors/conformance.json \
    poc1/ringserver/deploy/certiratio_ring.rc poc1/ringserver/deploy/certiratio-ring-backup.sh lapere@jedi.ydns.eu:
# jedissä:
./ringcheck-openbsd-arm64 conformance.json          # YHTEENSOPIVA (OpenBSD arm64)
doas install -m 755 ringserver-openbsd-arm64 /usr/local/bin/certiratio-ringserver
doas install -m 555 certiratio_ring.rc /etc/rc.d/certiratio_ring
doas install -m 555 certiratio-ring-backup.sh /usr/local/sbin/certiratio-ring-backup
doas useradd -s /sbin/nologin -d /var/certiratio-ring -L daemon _certring
doas install -d -o _certring -g _certring -m 700 /var/certiratio-ring
doas rcctl enable certiratio_ring && doas rcctl start certiratio_ring
grep -A1 'Liitä palvelin' /var/log/daemon | tail -1   # liittämislinkki
# varmuuskopio päivittäin: doas crontab -e → 30 3 * * * /usr/local/sbin/certiratio-ring-backup
```

**UDP-portti.**
- pf: oletussäännöstö (`pass`) päästää UDP 40123:n. Jos jedin `pf.conf` estää sisääntulevan liikenteen, lisätään vain tämä yksi sääntö: `pass in on egress inet6 proto udp to port 40123`.
- 4G-reititin: sen on päästettävä sisään pyytämätön IPv6-UDP porttiin 40123. Tämä tarkistetaan ensin (esimerkiksi `nc -u` puhelimesta jediin), ennen kuin rengas luottaa siihen.

**Linux-palvelimelle** on vastaavat systemd-tiedostot: `certiratio-ring.service` (DynamicUser, rajaukset) sekä varmuuskopion `.service` ja `.timer`.

**Liittäminen:**
1. isi avaa liittämislinkin omalla sivullaan, tai skannaa QR-koodin sivun kameralla.
2. Sivu näyttää: "Odotetaan, että Hanna Reunamo hyväksyy rengassolmun Jedi."
3. Hannan sivulla on oltava auki. Hän näkee pyynnön ja painaa **Hyväksy**.
4. Molemmat näkevät viestin: "Rengassolmu Jedi liitetty. Huoltajat: isi ja Hanna Reunamo."

DNS-nimeä `jedi.ydns.eu` käytetään vain ylläpitoon (ssh). Kortissa ovat IPv6-osoitteet.

## 4. Testi pelkän Jedin varassa (Nokiaa ei sammuteta)

```sh
adb shell kill -STOP <Nokian PID>      # ei vastaa, mutta prosessi ja tila säilyvät
```

Tarkistettavat asiat:

| Tarkistus | Missä |
|---|---|
| Jokaisen sivulla rengas isi → 🖥️ Jedi → Hanna → Törttö. Tilarivillä "palvelin ✓ 1/2". | kaikki sivut |
| Hanna ja isi sulkevat sivun ja avaavat sen uudelleen eri verkoista (esim. Wi-Fi ja LTE). Suorat yhteydet syntyvät ilman koodeja. | Hanna, isi |
| Kahdenkeskinen viesti menee perille (✓✓). Jedin lokissa ei ole viestejä. | sivut, Jedin loki |
| `doas rcctl restart certiratio_ring`. Jäsenet palaavat itsestään (lokissa "todennettu"). | Jedi |
| Jedin osoitteen vaihtuessa kortti päivittyy ("kortti päivittyi" sivun yhteydet-osiossa). | sivut |
| Kaikki jäsenet ovat käyneet paikalla ja näkevät Jedin kortin (yhteydet-osio: "Jedi (solmu, …) ✓"). | kaikki sivut |

Jos jokin kohta ei toimi, Nokia jatkaa komennolla `adb shell kill -CONT <PID>`, eikä mitään menetetä.

## 5. Nokian palvelinroolin poisto (vasta hyväksytyn testin jälkeen)

1. Törttö (operaattori) avaa G50:llä kohdan "yhteydet" ja valitsee **Poista palvelinrooli: Nokia**.
2. Törttö vahvistaa poiston. Sivu julkaisee `retire`-tapahtuman.
3. Kaikki hylkäävät Nokian kortin, eivätkä yhdistä siihen enää.
4. Lopuksi Nokia sammutetaan: `adb shell kill -CONT <PID>; adb shell kill <PID>`.
5. Varmuuskopio (kohta 1) säilytetään palautusta varten.

## Palautus

**Ennen poistoa (kohta 5)**
- Nokia jatkaa: `kill -CONT`.
- Jos Jedi halutaan pois, huoltajat (isi ja Hanna) poistavat sen palvelinroolin: yhteydet → Poista palvelinrooli: Jedi, ja toinen huoltaja hyväksyy.
- Toinen vaihtoehto on pysäyttää Jedin palvelu: rekisterissä se näkyy, mutta yhteyttä ei ole.

**Poiston jälkeen**
- Poistettu tunniste ei palaa: tunniste on sidottu avaimeen, eikä yksi jäsen voi enää lisätä vanhan mallin palvelinta.
- Varapalvelin käynnistetään uudella tilahakemistolla (uusi identiteetti), esimerkiksi G50:ssä `-dir /data/local/tmp/nokia2-tila`.
- Se liitetään rengassolmuksi samalla tavalla kuin Jedi: pyytäjä ja hänen oikea naapurinsa hyväksyvät.

**Jedin tilan menetys**
1. Palvelu pysäytetään (`doas rcctl stop certiratio_ring`).
2. Uusin `/var/backups/certiratio-ring/ring-*.tgz` puretaan hakemistoon `/var/certiratio-ring` (omistaja `_certring`; Linuxissa `/var/lib/private/certiratio-ring`).
3. Palvelu käynnistetään.

Identiteetti ja DTLS-sormenjälki säilyvät, joten jäsenten tallentamat kortit kelpaavat.

**Jäsen, joka oli poissa koko siirron ajan**
- Hän tuntee vain Nokian kortin.
- Hän saa Jedin kortin yhdeltä paikalla olevalta jäseneltä: Yhdistä-nappi ja yhdistämiskoodi kerran.
- Siksi kohdassa 4 tarkistetaan, että kaikki ovat käyneet paikalla.

## Rajaus

Tässä ei toteuteta velanottoa, palkkioita, voitonjakoa eikä oikeudellista rakennetta.

**Avoimia asioita:**
- huoltajuuden siirto (`guard`-ehdotus protokollassa)
- palvelinten väliset yhteydet
- C- ja Plan2001-porttaukset
