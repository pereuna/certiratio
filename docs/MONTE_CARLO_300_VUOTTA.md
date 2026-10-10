# Suhteellisten saldojen 300 vuoden rasituskoe

V2-koe testaa välittömien saldosiirtojen kirjanpitoa. Se ei sisällä velanluontia, erääntymisiä tai avoimia sopimuksia.

Jokaisen tapahtuman jälkeen tarkistetaan **elävien henkilöiden suhteellisten saldojen summa + yhteisön selvitystili = 0**. Yhteisötili vastaanottaa kuolleen position samalla etumerkillä. Se ei ole historiallinen perusvelka tai absoluuttinen kollektiivinen saaminen.

## Satunnaistetut syötteet

- 30 elossa olevaa ihmistä; alkujoukko 20–60-vuotiaita, kaikki saldolla nolla. Kuolleen tilalle syntyy nollavuotias, joka aloittaa palvelukaupan 18-vuotiaana.
- Elinikä 65–100 vuotta on testijakauma. Todellista arvottua kuolinikää ei käytetä vastaanottorajan laskennassa.
- Palvelun myyjä ja ostaja arvotaan. Jokaisen aikuisen vuosittainen työbudjetti on 2–8 yksikköä. Kauppayrityksiä tehdään yhteensä kaksi jokaista aikuista kohti; työbudjetin jo käyttäneet ohitetaan.
- Palvelun kokonaisvelkahinta on 1–20 yksikköä. Suostumus arvotaan 95 %:ssa yrityksistä. Hyödyke ja saldomuutokset siirtyvät heti hyväksytyssä kaupassa; palvelu kulutetaan heti.
- Hylätty kauppa ei muuta saldotilejä tai hyödykkeiden omistusta. Ennen kauppayritystä tuotettu palvelu vanhenee hylkäyksen jälkeen erillisessä fyysisessä tapahtumassa ja työbudjetti on käytetty.
- Raja on `max(0, 90 - ikä) × työkapasiteetti × vuosittainen ennustekerroin 0.25–1.5`, kokonaislukuna; lapsilla nolla. Tämä on kalibroimaton testisyöte. Negatiivinen saldo antaa lisävaraa rajaan asti.
- Kuolemassa saldo siirtyy yhteisötilille ja tili suljetaan. Yrityksiä, perintöä ja yhteisötilin käyttöä ei ole tässä kokeessa.

Vuoden järjestys: ikääntyminen ja kuolemat → korvaavat syntymät → rajojen päivitys → välittömät palvelukaupat → vuosiraportti.

## Tarkastukset ja rajat

Moottori tarkistaa nollasumman ja fyysiset varastot jokaisen tapahtuman jälkeen. Lisäksi `AuditedLedger` laskee tapahtumista riippumattoman varjosaldon jokaiselle henkilölle, yhteisötilille ja siirtoliikevaihdolle. Myös väärälle ihmiselle päätyvä saldo havaitaan, vaikka aggregaatti näyttäisi oikealta.

Kokonaislukujen avulla täsmäytys on tarkka. Yksityiskohtainen tapahtumaloki tyhjennetään vuosittain vasta tarkastuksen jälkeen. Vuosiyhteenvedot, tapahtumamäärät ja kuolleiden nollatilien tarkastus säilyvät. Sama ohjelmaversio ja siemen toistavat historian.

```bash
python3 -m unittest discover -s tests -v
python3 -m velkatalous.monte_carlo --runs 100 --years 300 --population 30
```

Tulokset ovat `results/monte_carlo/annual.csv` ja `summary.json`. CSV:n `accounting_error` on nolla, ja `balance_sum + community_balance = 0`. Positiiviset ja negatiiviset saldot sekä niiden itseisarvojen summa raportoidaan erikseen. Nettosumma voi kuolemien vuoksi poiketa nollasta. Negatiivinen saldo tai yhteisötili eivät tarkoita kirjanpitovirhettä.

Testin läpäisy tarkoittaa, ettei näissä historioissa löytynyt kirjanpitovirhettä. Se ei ole kaikkien tapahtumaketjujen matemaattinen todistus eikä talouden toimivuusarvio. Hintojen, kysynnän, kannustimien ja elinikärajojen realismia ei tässä kokeessa optimoida tai kalibroida.
