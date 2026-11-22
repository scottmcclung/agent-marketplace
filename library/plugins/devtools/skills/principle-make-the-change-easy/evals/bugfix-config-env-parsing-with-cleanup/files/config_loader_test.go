package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("APP_PORT", "")
	var cfg Config = Load()
	if cfg.Port != 8080 {
		t.Fatalf("Port = %d, want 8080", cfg.Port)
	}
}

func TestLoadAllowedHosts(t *testing.T) {
	t.Setenv("APP_ALLOWED_HOSTS", "a.example.com,b.example.com")
	var cfg Config = Load()
	if len(cfg.AllowedHosts) != 2 {
		t.Fatalf("got %d hosts, want 2", len(cfg.AllowedHosts))
	}
}
