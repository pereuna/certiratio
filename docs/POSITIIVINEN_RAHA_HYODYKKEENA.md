# Positiivinen raha hyödykkeenä: vaihdannan vapaus

Kirjattu 2026-10-14. Tämä on käyttäjän mallilinjaus. Kohta 5 on ehdotus Certiration perusperiaatteeksi. Se täydentää [nykyistä mallikontekstia](../VELKATALOUS_CONTEXT.md) eikä muuta sen kirjanpitosääntöjä.

Certiratiossa voidaan käyttää nykyisiä valuuttoja aivan kuten mitä tahansa muitakin vaihdettavia hyödykkeitä. Tämä yksinkertaistaa merkittävästi koko talousmallia.

Certiration ei tarvitse korvata nykyistä rahajärjestelmää. Se tarjoaa vaihtoehtoisen tavan kirjata taloudellisia vaihtoja.

## 1. Positiivinen raha on hyödyke

Euroja, dollareita, kultaa, osakkeita, taideteoksia ja perunoita voidaan käsitellä saman yleisen vaihtoperiaatteen mukaisesti.

Niiden arvo määräytyy sen perusteella, mitä osapuolet suostuvat niistä vaihtotilanteessa antamaan.

Keskuspankki ja liikepankki voidaan tässä mallissa käsittää yrityksiksi, joiden tarjoama tuote on positiivinen raha.

Pankkiraha eroaa kuitenkin juridisesti esimerkiksi taideteoksesta: seteli on keskuspankin velkaa, ja pankkitalletus on saatava liikepankilta. Tämä ei estä käsittelemästä niitä vaihdettavina varallisuuserinä.

## 2. Esimerkki: eurojen myyminen Certiratiossa

A:n ja B:n Certiratio-saldot ovat aluksi nolla.

A myy B:lle 100 euroa käteistä. He sopivat hinnaksi 100 Certiratio-yksikköä.

| | A | B |
|---|---:|---:|
| Alkusaldo | 0 | 0 |
| Certiratio-saldon muutos | −100 | +100 |
| Käteiseurojen muutos | −100 € | +100 € |

A on luovuttanut positiivista rahaa, ja hänen Certiratio-saldonsa pienenee.

B on saanut positiivista rahaa, ja hänen Certiratio-saldonsa kasvaa.

Täsmälleen sama kirjanpitotapahtuma syntyisi, jos A myisi B:lle polkupyörän.

100 euron ei myöskään tarvitse vastata 100:aa Certiratio-yksikköä. Vaihdon arvo voidaan sopia vapaasti.

## 3. Kaksi rahakäsitettä eivät sulje toisiaan pois

Tästä seuraa kiinnostava ominaisuus. Certiratio-taloudessa henkilö voi samanaikaisesti omistaa:

- euroja ja dollareita
- kiinteistöjä ja muita hyödykkeitä
- osakkeita ja muita saamisoikeuksia
- Certiratio-kirjanpidossa määräytyvän negatiivisen rahan saldon.

Mikään näistä ei edellytä muiden poistamista.

Myös Certiration ulkopuolella tapahtuva tavallinen eurokauppa voi jatkua täysin ennallaan.

## 4. Periaatteellinen seuraus

Aiemmin pohdimme, onko negatiivinen raha oikeastaan vain positiivisen rahan toinen muoto.

Nyt voimme erottaa käsitteet selkeämmin:

> Positiivinen raha on vaihdon kohde tai väline. Negatiivinen raha on vaihdosta syntyvän velkasuhteen kirjanpidollinen esitys.

Sama vaihto voi sisältää molemmat.

Siksi Certiration tavoitteeksi ei tarvitse määritellä rahan korvaamista, kieltämistä tai poistamista.

## 5. Ehdotus Certiration perusperiaatteeksi

> **Vaihdannan vapaus**
>
> Certiratio ei rajoita vaihdettavien hyödykkeiden laatua. Kaikki nykyiset valuutat ovat järjestelmässä vaihdettavia varallisuuseriä muiden hyödykkeiden tavoin. Tämä koskee myös keskuspankkien ja liikepankkien liikkeeseen laskemaa positiivista rahaa.
>
> Certiration negatiivinen raha ei korvaa näitä hyödykkeitä. Se muodostaa itsenäisen kirjanpidollisen järjestelmän, jolla osapuolten väliset vaihdot voidaan ilmaista.
>
> Vaihdettavan hyödykkeen arvo määräytyy osapuolten sopimuksen perusteella.

## 6. Ei kiinteää vaihtokurssia

Certiratio ei tarvitse omaa kiinteää vaihtokurssia euroon, dollariin eikä mihinkään muuhun valuuttaan.

Jos kurssi syntyy, se syntyy kaupankäynnissä.

Certiratio on siis pohjimmiltaan yleinen vaihdannan ja velan kirjanpitojärjestelmä, ei uusi keskuspankin liikkeeseen laskema valuutta.

Tässä muodossa positiivisen ja negatiivisen rahan käsitteet voivat elää rinnakkain ilman ristiriitaa.

## Suhde nykyiseen malliin

- Kirjaus noudattaa [välittömän kaupan sääntöä](../VELKATALOUS_CONTEXT.md#2-välittömät-kaupat): luovuttajan saldo pienenee hinnalla `p`, ja vastaanottajan saldo kasvaa saman verran. Valuutta on hyödyke, jonka määrä tarkistetaan kuten muidenkin hyödykkeiden.
- Simulaattori (`velkatalous/`) ei vielä mallinna valuuttoja hyödykkeinä. Ne voidaan lisätä tavallisina hyödykelajeina ilman uutta kirjanpitosääntöä.
- Avoimet kysymykset:
  - Miten pankkirahan juridinen luonne saamisena vaikuttaa tosite- ja valvontavaatimuksiin, esimerkiksi tilisiirron todentamiseen kaupan kohteena?
  - Tarvitaanko verotuksessa ja kirjanpitolainsäädännössä erillistä käsittelyä, kun euroja myydään Certiratio-yksiköillä?
