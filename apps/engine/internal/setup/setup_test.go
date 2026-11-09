package setup

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type chownRecorder map[string][2]int

func (c chownRecorder) chown(path string, uid, gid int) error {
	c[filepath.Base(path)] = [2]int{uid, gid}
	return nil
}

func options(t *testing.T, home string, owners chownRecorder) Options {
	t.Helper()
	return Options{
		Home: home, PUID: 1001, PGID: 100, WebUID: 1000, PostgresUID: 70, DBHost: "postgres",
		Chown: owners.chown, Random: bytes.NewReader(bytes.Repeat([]byte{7}, 4096)),
	}
}

func read(t *testing.T, home, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(home, SecretsDir, name))
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(data))
}

func TestPrepare(t *testing.T) {
	home := t.TempDir()
	owners := chownRecorder{}
	report, err := Prepare(options(t, home, owners))
	if err != nil {
		t.Fatal(err)
	}
	if len(report.CreatedFolders) != 4 || len(report.CreatedSecrets) != 5 {
		t.Fatalf("report: %+v", report)
	}
	if owners[CacheDir] != [2]int{1001, 100} || owners[PluginsDir] != [2]int{1001, 100} {
		t.Fatalf("folder owners: %v", owners)
	}
	if owners[PostgresDir] != [2]int{70, 70} {
		t.Fatalf("the database folder belongs to Postgres: %v", owners[PostgresDir])
	}
	for name, uid := range map[string]int{
		DBAdminPassword: 70, WebDBPassword: 0, EngineDBPassword: 0, EncryptionKey: 1000,
		EnginePrivateKey: 1000, EnginePublicKey: 1001, WebDatabaseURL: 1000, EngineDatabaseURL: 1001,
	} {
		if owners[name][0] != uid {
			t.Errorf("%s owned by %d, want %d", name, owners[name][0], uid)
		}
	}

	key, err := base64.StdEncoding.DecodeString(read(t, home, EncryptionKey))
	if err != nil || len(key) != 32 {
		t.Fatalf("encryption key: %v", err)
	}
	seed, _ := base64.RawURLEncoding.DecodeString(read(t, home, EnginePrivateKey))
	public := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	if read(t, home, EnginePublicKey) != base64.RawURLEncoding.EncodeToString(public) {
		t.Fatal("public key does not match the private one")
	}
	webURL := read(t, home, WebDatabaseURL)
	if webURL != "postgres://canopy_web:"+read(t, home, WebDBPassword)+"@postgres:5432/canopy" {
		t.Fatalf("web url: %s", webURL)
	}

	// A second run keeps every secret and creates nothing.
	adminBefore := read(t, home, DBAdminPassword)
	again, err := Prepare(options(t, home, chownRecorder{}))
	if err != nil || len(again.CreatedFolders) != 0 || len(again.CreatedSecrets) != 0 {
		t.Fatalf("second run: %+v %v", again, err)
	}
	if read(t, home, DBAdminPassword) != adminBefore {
		t.Fatal("secret regenerated")
	}
}

func TestPrepareFailures(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, CacheDir), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Prepare(options(t, home, chownRecorder{})); err == nil {
		t.Fatal("a file where a folder should be")
	}

	refused := options(t, t.TempDir(), chownRecorder{})
	refused.Chown = func(string, int, int) error { return errors.New("not root") }
	if _, err := Prepare(refused); err == nil {
		t.Fatal("chown failure")
	}

	empty := options(t, t.TempDir(), chownRecorder{})
	empty.Random = bytes.NewReader(nil)
	if _, err := Prepare(empty); err == nil {
		t.Fatal("no randomness")
	}

	broken := t.TempDir()
	if err := os.MkdirAll(filepath.Join(broken, SecretsDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(broken, SecretsDir, EnginePrivateKey), []byte("nope"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Prepare(options(t, broken, chownRecorder{})); err == nil {
		t.Fatal("a private key that is not a seed")
	}
}

type recorder struct {
	sql string
	err error
}

func (r *recorder) Exec(_ context.Context, sql string) error {
	r.sql = sql
	return r.err
}

func TestDatabase(t *testing.T) {
	web, engine := strings.Repeat("a", 48), strings.Repeat("b", 48)
	db := &recorder{}
	if err := EnsureDatabase(context.Background(), db, web, engine); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"CREATE ROLE canopy_web LOGIN", "PASSWORD '" + web + "'", "PASSWORD '" + engine + "'",
		"CREATE SCHEMA IF NOT EXISTS river AUTHORIZATION canopy_engine",
		"GRANT INSERT ON TABLES TO canopy_engine", "SET search_path = engine, river",
	} {
		if !strings.Contains(db.sql, want) {
			t.Errorf("missing %q", want)
		}
	}
	for _, bad := range []string{"short", "has'quote" + strings.Repeat("x", 20), strings.Repeat("x", 200)} {
		if err := EnsureDatabase(context.Background(), db, bad, engine); !errors.Is(err, ErrUnsafePassword) {
			t.Errorf("%q accepted", bad)
		}
	}
	failing := &recorder{err: errors.New("down")}
	if err := EnsureDatabase(context.Background(), failing, web, engine); err == nil {
		t.Fatal("exec failure")
	}
}
