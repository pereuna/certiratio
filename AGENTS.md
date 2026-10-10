# Certiratio – Codex-ohjeet

Kun tehtävä koskee taloussääntöjä, simulointia tai kirjanpitoa, lue ensin `VELKATALOUS_CONTEXT.md`. Käyttäjän viimeisin mallipäätös on ensisijainen. `docs/history/` ja `codex_handoff.zip` sisältävät historiallisen v1-mallin, eivät nykyisiä ohjeita.

Nykyinen kirjanpito käyttää etumerkillistä suhteellista saldoa x. Älä palauta ei-negatiivisen absoluuttisen velan vaatimusta, myyjän saldokatetta, velanluontia tai erääntyviä velansiirtolupauksia. Invariantti on elävien saldot + yhteisön selvitystili = 0; kuolemassa saldo siirtyy yhteisötilille samalla etumerkillä.

Kirjanpitokerros, agenttien päätössäännöt ja fyysinen tuotanto pidetään erillisinä. Testaa tapahtumat saldo- ja varastoinvariantteja vasten sekä hylkäysten atomisuus. Dokumentoi oletukset ja avoimet kysymykset. Negatiivisen saldon vastaanottovara on taloudellisesti merkityksellinen; älä lisää nollasaldon tai säästöjen maksimointia agenttien tavoitteeksi.
