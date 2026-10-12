package main

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// Vektorit tekee selaimen koodi: node tools/make-vectors.mjs > tests/vectors/ring.json
type vectors struct {
	Ring     string            `json:"ring"`
	Events   []json.RawMessage `json:"events"`
	Forged   []json.RawMessage `json:"forged"`
	Members  []string          `json:"members"`
	Payloads []string          `json:"payloads"`
	Auth     struct {
		Key, Nonce, Signer, Verifier, Sig, Payload string
	} `json:"auth"`
}

func loadVectors(t *testing.T) vectors {
	b, err := os.ReadFile("../tests/vectors/ring.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func parseAll(t *testing.T, raws []json.RawMessage) []*event {
	var out []*event
	for _, r := range raws {
		e, ok := parseEvent(r)
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
		if got := string(payloadOf(e)); got != v.Payloads[i] {
			t.Errorf("%s: %s != %s", e.ID, got, v.Payloads[i])
		}
	}
	if got := string(authPayload(v.Auth.Nonce, v.Auth.Signer, v.Auth.Verifier)); got != v.Auth.Payload {
		t.Errorf("auth: %s != %s", got, v.Auth.Payload)
	}
}

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
		if verifyEvent(e, keyOf) != 1 {
			t.Errorf("%s: selaimen allekirjoitus ei kelpaa", e.ID)
		}
	}
	for _, e := range parseAll(t, v.Forged) {
		if verifyEvent(e, keyOf) == 1 {
			t.Errorf("%s: väärennös kelpasi", e.ID)
		}
	}
	if verifyEvent(evs[2], func(string) string { return "" }) != -1 {
		t.Error("tuntematon allekirjoittaja: pitäisi odottaa")
	}
	a := v.Auth
	if !verify(a.Key, authPayload(a.Nonce, a.Signer, a.Verifier), a.Sig) {
		t.Error("auth-allekirjoitus ei kelpaa")
	}
	if verify(a.Key, authPayload(a.Nonce+"x", a.Signer, a.Verifier), a.Sig) {
		t.Error("muutettu auth kelpasi")
	}
	if idOf(a.Key) != a.Signer {
		t.Error("idOf eri kuin selaimessa")
	}
}

func TestBuildSameRingAsBrowser(t *testing.T) {
	v := loadVectors(t)
	evs := parseAll(t, v.Events)
	r := build(v.Ring, evs)
	if !slices.Equal(r.members, v.Members) {
		t.Fatalf("%v != %v", r.members, v.Members)
	}
	rev := slices.Clone(evs)
	slices.Reverse(rev)
	if !slices.Equal(build(v.Ring, rev).members, v.Members) {
		t.Fatal("järjestys vaikutti")
	}
	if len(build("deadbeef", evs).members) != 0 {
		t.Fatal("vieras rengas")
	}
}

func TestOwnSignatureAndNames(t *testing.T) {
	me, err := loadIdentity(t.TempDir() + "/key.pem")
	if err != nil {
		t.Fatal(err)
	}
	p := authPayload("n", me.id, "aaaaaaaa")
	s, err := me.sign(p)
	if err != nil || !verify(me.key, p, s) || len(me.key) != 87 {
		t.Fatal("oma allekirjoitus")
	}
	for name, want := range map[string]bool{"isi": true, " isi": false, "isi ": false, "a b": true, "a\nb": false,
		"": false, "x\u0085": true, "abcdefghijklmnopqrstuvwx": true, "abcdefghijklmnopqrstuvwxy": false, "🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈": true, "🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈🐈x": false} {
		if cleanNameOK(name) != want {
			t.Errorf("cleanNameOK(%q) != %v", name, want)
		}
	}
}
