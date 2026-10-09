# Ensimmäinen koe: siemen 7, 30 jaksoa

Kaikki kahdeksan automaattista testiä läpäisevät. Testipakettiin sisältyy myös 25 simulaatioajoa: viisi siementä ja viisi skenaariota. Saldo- ja varastoinvariantit tarkistetaan jokaisen hyväksytyn tapahtuman jälkeen. Sama siemen ja samat parametrit toistuvat identtisesti.

| Koe | Velka lopussa | Luotu velka | Kuolemissa poistettu | Siirtoliikevaihto yhteensä | Avoimet lupaukset | Ruokakulutus | Laatikkokulutus |
|---|---:|---:|---:|---:|---:|---:|---:|
| Perusajo | 296 | 296 | 0 | 1656 | 20 | 360 | 75 |
| Luonti pois | 0 | 0 | 0 | 0 | 31 | 20 | 3 |
| Vastaanottoraja nolla | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Resurssi 2 / alkutuottaja | 150 | 150 | 0 | 34 | 5 | 4 | 2 |
| Kuolleisuus 0,05 / henkilö / jakso | 10 | 118 | 108 | 230 | 0 | 36 | 26 |

Perusajo osoittaa, että kokeellinen luontisääntö käynnistää velkakiertoa ja panosketjun. Se ei osoita stationaarisuutta tai hyvinvointivaikutusta. Avoimet lupaukset sisältävät myös viimeisen jakson vielä erääntymättömät sopimukset; kaikki eivät ole selvitysvaikeuksia.

Luonti pois -ajossa ensimmäisiä hyödykkeitä toimitetaan velkalupausten vastineeksi, mutta positiivisen suuruiset lupaukset eivät selvity nollavelkaisessa järjestelmässä. Vastaanottovaraukset ja laskeva raja lopulta estävät uusia sopimuksia. Resurssipulassa työpalvelujen velkaa voi edelleen syntyä, vaikka lopputuotanto pysähtyy. Näin pelkkä velkasaldo tai velkaliikevaihto ei mittaa reaalitalouden onnistumista.

Kuolleisuuskokeessa velka 10 = luonti 118 − poistuma 108; tuotantoyksikön henkilöomistajan kuolema voi samalla katkaista koko tuotantoketjun. Se on tämän henkilöomistajamallin ominaisuus, ei yritysten todellisesta elinkaaresta tehty päätelmä.

Koneelliset tulokset ovat ../results/summary.json ja viidessä skenaariotiedostossa. Tämä taulukko kuvaa yhtä siementä; varsinaiset vaikutusarviot edellyttävät suunnitelmassa kuvattua kalibrointia ja laajempaa herkkyystutkimusta.
