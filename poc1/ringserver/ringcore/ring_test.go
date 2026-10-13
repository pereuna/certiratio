package ringcore

import (
	"encoding/json"
	"maps"
	"os"
	"reflect"
	"slices"
	"testing"
)

// Vektorit tekee selaimen koodi: node tools/make-vectors.mjs > tests/vectors/ring.json
type vectors struct {
	Ring     string            `json:"ring"`
	Events   []json.RawMessage `json:"events"`
	Forged   []json.RawMessage `json:"forged"`
	Members  []string          `json:"members"`
	Servers  []string          `json:"servers"`
	Card     Card              `json:"card"`
	CardPay  string            `json:"cardPayload"`
	Payloads []string          `json:"payloads"`
	Auth     struct {
		Key, Nonce, Signer, Verifier, Sig, Payload string
	} `json:"auth"`
}

func loadVectors(t *testing.T) vectors {
	b, err := os.ReadFile("../../tests/vectors/ring.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func parseAll(t *testing.T, raws []json.RawMessage) []*Event {
	var out []*Event
	for _, r := range raws {
		e, ok := ParseEvent(r)
		if !ok {
			t.Fatalf("kelvoton tapahtuma: %s", r)
		}
		out = append(out, e)
	}
	return out
}

func TestCanonMatchesJSONStringify(t *testing.T) {
	v := loadVectors(t)
	for i, e := range parseAll(t, v.Events) {
		if got := string(PayloadOf(e)); got != v.Payloads[i] {
			t.Errorf("%s: %s != %s", e.ID, got, v.Payloads[i])
		}
	}
	if got := string(CardPayload(v.Ring, &v.Card)); got != v.CardPay {
		t.Errorf("kortti: %s != %s", got, v.CardPay)
	}
	srvKey := ""
	for _, e := range parseAll(t, v.Events) {
		if e.Kind == "server" {
			srvKey = e.Key
		}
	}
	if !Verify(srvKey, CardPayload(v.Ring, &v.Card), v.Card.Sig) {
		t.Error("selaimen tekemän kortin allekirjoitus ei kelpaa")
	}
	if got := string(AuthPayload(v.Auth.Nonce, v.Auth.Signer, v.Auth.Verifier)); got != v.Auth.Payload {
		t.Errorf("auth: %s != %s", got, v.Auth.Payload)
	}
}

func noTarget(string) *Event { return nil }

func TestVerifyBrowserSignatures(t *testing.T) {
	v := loadVectors(t)
	evs := parseAll(t, v.Events)
	keyOf := func(id string) string {
		for _, e := range evs {
			if e.Member == id {
				return e.Key
			}
		}
		return ""
	}
	for _, e := range evs {
		if VerifyEvent(e, keyOf, noTarget) != 1 {
			t.Errorf("%s: selaimen allekirjoitus ei kelpaa", e.ID)
		}
	}
	for _, e := range parseAll(t, v.Forged) {
		if VerifyEvent(e, keyOf, noTarget) == 1 {
			t.Errorf("%s: väärennös kelpasi", e.ID)
		}
	}
	if VerifyEvent(evs[2], func(string) string { return "" }, noTarget) != -1 {
		t.Error("tuntematon allekirjoittaja: pitäisi odottaa")
	}
	a := v.Auth
	if !Verify(a.Key, AuthPayload(a.Nonce, a.Signer, a.Verifier), a.Sig) {
		t.Error("auth-allekirjoitus ei kelpaa")
	}
	if Verify(a.Key, AuthPayload(a.Nonce+"x", a.Signer, a.Verifier), a.Sig) {
		t.Error("muutettu auth kelpasi")
	}
	if IDOf(a.Key) != a.Signer {
		t.Error("idOf eri kuin selaimessa")
	}
}

func TestBuildSameRingAsBrowser(t *testing.T) {
	v := loadVectors(t)
	evs := parseAll(t, v.Events)
	r := Build(v.Ring, evs)
	if !slices.Equal(r.Members, v.Members) {
		t.Fatalf("%v != %v", r.Members, v.Members)
	}
	rev := slices.Clone(evs)
	slices.Reverse(rev)
	if !slices.Equal(Build(v.Ring, rev).Members, v.Members) {
		t.Fatal("järjestys vaikutti")
	}
	if got := slices.Sorted(maps.Keys(r.Servers)); !slices.Equal(got, v.Servers) {
		t.Fatalf("palvelimet %v != %v", got, v.Servers)
	}
	if len(Build("deadbeef", evs).Members) != 0 {
		t.Fatal("vieras rengas")
	}
}

func TestOwnSignatureAndNames(t *testing.T) {
	me, err := LoadIdentity(t.TempDir() + "/key.pem")
	if err != nil {
		t.Fatal(err)
	}
	p := AuthPayload("n", me.ID, "aaaaaaaa")
	s, err := me.Sign(p)
	if err != nil || !Verify(me.Key, p, s) || len(me.Key) != 87 {
		t.Fatal("oma allekirjoitus")
	}
	for name, want := range map[string]bool{"isi": true, " isi": false, "isi ": false, "a b": true, "a\nb": false,
		"": false, "x\u0085": true, "abcdefghijklmnopqrstuvwx": true, "abcdefghijklmnopqrstuvwxy": false, "🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈": true, "🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈x": false} {
		if CleanNameOK(name) != want {
			t.Errorf("CleanNameOK(%q) != %v", name, want)
		}
	}
}

// Rekisterimallin 2 yhteensopivuusvektorit: node tools/make-conformance.mjs > tests/vectors/conformance.json
type conformance struct {
	Model int `json:"model"`
	Cases []struct {
		Name   string            `json:"name"`
		Ring   string            `json:"ring"`
		Events []json.RawMessage `json:"events"`
		Expect Summary           `json:"expect"`
	} `json:"cases"`
	Card struct {
		Ring    string `json:"ring"`
		Card    Card   `json:"card"`
		Payload string `json:"payload"`
	} `json:"card"`
	Payloads []struct {
		Event   json.RawMessage `json:"event"`
		Payload string          `json:"payload"`
	} `json:"payloads"`
}

func TestConformance(t *testing.T) {
	b, err := os.ReadFile("../../tests/vectors/conformance.json")
	if err != nil {
		t.Fatal(err)
	}
	var v conformance
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	if v.Model != Model {
		t.Fatalf("malli %d != %d", v.Model, Model)
	}
	for _, c := range v.Cases {
		evs := Compact(c.Events)
		for _, list := range [][]json.RawMessage{evs, reversed(evs)} {
			_, got := Resolve(c.Ring, list)
			if !reflect.DeepEqual(norm(t, got), norm(t, c.Expect)) {
				t.Errorf("%s:\n got  %+v\n want %+v", c.Name, got, c.Expect)
			}
		}
	}
	for _, p := range v.Payloads {
		e, _ := ParseEvent(p.Event)
		if string(PayloadOf(e)) != p.Payload {
			t.Errorf("%s: %s != %s", e.ID, PayloadOf(e), p.Payload)
		}
	}
	if string(CardPayload(v.Card.Ring, &v.Card.Card)) != v.Card.Payload {
		t.Error("kortin sisältö")
	}
}

// norm: JSON-muotoon ja takaisin, jotta tyypit ovat samat.
func norm(t *testing.T, s Summary) any {
	b, _ := json.Marshal(s)
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func reversed(l []json.RawMessage) []json.RawMessage {
	r := slices.Clone(l)
	slices.Reverse(r)
	return r
}
