# Certiratio – velkatalouden tutkimussimulaattori

*Credita certa, homines liberi.* [Nimen tausta](docs/name.md).

**Järjestelmä toteutetaan aluksi selainpohjaiseksi. Kaikki paperiset ratkaisut ovat aluksi toissijainen tavoite.** Nykyinen repo sisältää tutkimussimulaattorin; selainpohjainen tapahtumajärjestelmä on seuraava toteutustavoite. [Velkasetelipohdinta ja toteutusjärjestys](docs/VELKASETELIT_JA_TOTEUTUSJARJESTYS.md) kuvaa myös siirtokelpoisia välineitä ja avointa kysymystä yksittäisten vaihtojen kirjaamisesta tai lopullisesta netotuksesta.

[PoC 1: hajautettu selain-P2P-koe](docs/POC1-BROWSER-P2P.md) ja sen [tarkastusmuistio](docs/POC1-BROWSER-P2P-REVIEW.md) määrittelevät rajatun kolmen selaimen instrumenttitapahtumien replikointikokeen. Määrittely v0.1 tarvitsee muistion protokollatäsmennykset ennen toteutusta; koe ei vielä toteuta varsinaista saldokirjanpitoa tai vastaanottorajojen valvontaa.

Certiratio kirjaa yhteiseen historialliseen perusvelkaan suhteutetun **etumerkillisen saldon** `x_i`. Perusvelkaa ei mitata tai tallenneta. Syntymäsaldo 0 on neutraali vertailupiste. Negatiivinen saldo kertoo poikkeamasta velka-akselilla ja antaa käytännössä lisää vastaanottovaraa.

Ensimmäinen kauppa onnistuu heti nollasaldoista: A myy B:lle puuta 10 yksiköllä → A:n saldo −10, B:n +10. Hyödyke ja saldot siirtyvät atomisesti. Ostajan suostumus ja vastaanottoraja tarkistetaan.

Kuolemassa henkilön saldo siirtyy samalla etumerkillä erilliselle yhteisön selvitystilille. Invariantti on **elävien saldot + yhteisötili = 0**. Selvitystili ei ole kaupankäyntiin käytettävissä. Se ei mittaa historiallista perusvelkaa tai yhteisön absoluuttista saamista.

Lue [nykyinen mallikonteksti](VELKATALOUS_CONTEXT.md), [mekanismi ja tutkimussuunnitelma](docs/MALLI_JA_SUUNNITELMA.md) sekä [ensimmäiset v2-tulokset](docs/ENSIMMAISET_TULOKSET.md).

Protokollan sitova [kannustinyhteensopivuusvaatimus](docs/KANNUSTINYHTEENSOPIVUUS.md): ostaja hyväksyy kaupan kaupantekohetkellä, myyjä vastaa rekisteröinnistä ja laskentatoimisto valvonnasta. Myyjän hyvitys ei saa riippua ostajan myöhemmästä vapaaehtoisesta toiminnasta. Hyvitystakuu edellyttää ostajan tapahtumaoikeuden asianmukaista tarkistusta. Tosite-, henkilöllisyys-, valtuutus- ja riitautusmenettelyt ovat suunnitteluvaatimuksia, joita nykyinen simulaattori ei vielä kokonaisuutena toteuta.

Python 3.10 tai uudempi, vain standardikirjasto. Projektin juuresta:

```bash
python3 -m unittest discover -s tests -v
python3 -m velkatalous.simulation --seed 7 --periods 30 --output results/baseline.json
python3 -m velkatalous.simulation --cap-scale 0 --output results/zero_limit.json
python3 -m velkatalous.simulation --resource 2 --output results/scarcity.json
python3 -m velkatalous.simulation --mortality 0.05 --output results/mortality.json
python3 -m velkatalous.scenarios
python3 -m velkatalous.monte_carlo --runs 100 --years 300 --population 30
```

`scenarios` tuottaa neljä yllä kuvattua skenaariotiedostoa ja `results/summary.json`-yhteenvedon. Monte Carlo tuottaa `results/monte_carlo/annual.csv`-vuosirivit ja `summary.json`-raportin. Sama ohjelmaversio, siemen ja parametrit tuottavat samat tulokset.

## Rajapinta ja tulokset, versio 2

```python
from velkatalous.ledger import Ledger

book = Ledger()
book.add('A', 100, goods={'wood': 1})
book.add('B', 100)
book.trade('A', 'B', 'wood', 1, 10, consent=True)
assert book.agents['A'].balance == -10
assert book.agents['B'].balance == 10
book.death('A')
assert book.community_balance == -10
book.check()
```

`Agent.balance` korvaa vanhan `debt`-kentän. `trade` ei ota erääntymisaikaa; kaikki hyväksytyt kaupat toteutuvat heti. `Promise`, `settle`, varaukset, velanluonti ja `--no-creation` on poistettu. Vanhan mekanismin ajot löytyvät [v1-version Git-historiasta](https://github.com/pereuna/certiratio/tree/581198f069666e7640f2227df521aa24e9adcc81). Myös `codex_handoff.zip` on historiallinen v1-aineisto.

JSONin `model` on `relative-balances-v2`. Mittarit sisältävät henkilöiden nettosumman `balance_sum`, yhteisön selvityssaldon `community_balance`, positiivisten ja negatiivisten saldojen summat sekä `accounting_error`-täsmäytyseron. `gross_balance = sum(abs(x_i))` mittaa suhteellisten positioiden suuruutta, ei absoluuttista velkaa. Vanhoja luonti-, poistuma- ja lupausten mittareita ei tuoteta.

[300 vuoden rasituskoe](docs/MONTE_CARLO_300_VUOTTA.md) tarkistaa tapahtumista erikseen jokaisen henkilön ja yhteisötilin saldon. Testin läpäisy ei osoita hintojen, elintason tai vastaanottorajojen toimivuutta. Hinnat ja päätössäännöt ovat prototyypin oletuksia.
