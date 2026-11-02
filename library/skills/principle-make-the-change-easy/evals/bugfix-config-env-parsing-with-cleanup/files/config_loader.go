package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port         int
	Debug        bool
	AllowedHosts []string
	Timeout      int
}

func Load() Config {
	var cfg Config = Config{}
	var p string = os.Getenv("APP_PORT")
	if p != "" {
		n, err := strconv.Atoi(p)
		if err == nil {
			cfg.Port = n
		} else {
			cfg.Port = 8080
		}
	} else {
		cfg.Port = 8080
	}
	var d string = os.Getenv("APP_DEBUG")
	if d == "true" {
		cfg.Debug = true
	}
	var h string = os.Getenv("APP_ALLOWED_HOSTS")
	if h != "" {
		cfg.AllowedHosts = strings.Split(h, ",")
	}
	var t string = os.Getenv("APP_TIMEOUT")
	if t != "" {
		n, err := strconv.Atoi(t)
		if err == nil {
			cfg.Timeout = n
		} else {
			cfg.Timeout = 30
		}
	} else {
		cfg.Timeout = 30
	}
	return cfg
}

func legacyLoad() map[string]string {
	var m map[string]string = map[string]string{}
	m["port"] = os.Getenv("PORT")
	return m
}
