# Suhteellisten saldojen ensimmäiset tulokset

V2, siemen 7, 30 jaksoa. Kaikki 26 automaattista testiä läpäisevät. Testit kattavat ensimmäisen välittömän kaupan nollasta, negatiivisen myyjän, negatiivisen vastaanottajan vastaanottovaran, ostajan rajan, ilmaisen luovutuksen ylirajaiselle, kuoleman molemmilla etumerkeillä, hylkäysten atomisuuden ja fyysiset varastot.

| Koe | Henkilöiden nettosumma | Yhteisötili | Positiiviset saldot | Negatiiviset saldot | Siirtoliikevaihto yhteensä | Ruokakulutus | Laatikkokulutus |
|---|---:|---:|---:|---:|---:|---:|---:|
| Perusajo | 0 | 0 | 264 | −264 | 2006 | 360 | 74 |
| Vastaanottoraja nolla | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Resurssi 2 / alkutuottaja | 0 | 0 | 156 | −156 | 190 | 4 | 2 |
| Kuolleisuus 0,05 / henkilö / jakso | −8 | 8 | 0 | −8 | 420 | 36 | 26 |

Kaikkien jaksojen saldojen ja yhteisötilin yhteissumma oli nolla. Nollasumma ei tarkoita, ettei kauppaa tapahtuisi: perusajon 2006 yksikön liikevaihto syntyi ilman velanluontia tai erääntyviä lupauksia. Myyjä voi siirtyä negatiiviseksi ensimmäisessä kaupassa.

Rajan nollakoe alkaa kaikkien nollasaldoista, joten yksikään positiivisen hinnan vastaanotto ei käynnisty. Se ei tarkoita, että negatiivinen saldo ja raja nolla estäisivät kaiken ostamisen: esimerkiksi −10-saldo sallii 10 yksikön vastaanoton nollaan asti. Tämä on erillinen deterministinen testi.

Resurssipulassa palvelujen vaihto ja saldosiirrot voivat jatkua, vaikka lopputuotanto pysähtyy. Liikevaihto tai saldon itseisarvo ei siis yksin mittaa reaalitalouden onnistumista.

Kuolleisuuskokeessa henkilöiden −8:n nettosumman vastapaino on yhteisötilin +8. Henkilöomistajan kuolema voi yhä katkaista tuotantoketjun; yritysten periytymistä ei mallinneta. Vanhan v1-mallin absoluuttisen velan luonti- ja poistumatuloksia ei voi verrata näihin suhteellisiin saldoihin samoina suureina.

Uudelleentuotto: `python3 -m velkatalous.scenarios`. Koneelliset tulokset ovat `results/summary.json` ja neljä skenaariotiedostoa. Hinnat ja ennusterajat ovat kalibroimattomia; tämä yksi siemen ei osoita tasapainoa tai hyvinvointivaikutusta.
