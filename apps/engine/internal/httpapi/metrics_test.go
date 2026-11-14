package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/metrics"
)

type fakeMetrics struct {
	err    error
	points int
}

func (f *fakeMetrics) Query(_ context.Context, permissions []string, metric string, _, _ time.Time, points int) (metrics.Result, error) {
	f.points = points
	if f.err != nil {
		return metrics.Result{}, f.err
	}
	definition, ok := metrics.Lookup(metric)
	if !ok {
		return metrics.Result{}, metrics.ErrUnknown
	}
	if !metrics.MayRead(permissions, definition.Family) {
		return metrics.Result{}, metrics.ErrForbidden
	}
	at := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	return metrics.Result{
		Definition: definition,
		Bucket:     time.Minute,
		Series:     []metrics.SeriesPoints{{Name: "", Points: []metrics.Point{{At: at, Avg: 12.5, Min: 10, Max: 15}}}},
	}, nil
}

func metricsQuery(metric, from, to string, extra url.Values) string {
	values := url.Values{"metric": {metric}, "from": {from}, "to": {to}}
	for key, list := range extra {
		values[key] = list
	}
	return "/v1/metrics/series?" + values.Encode()
}

func TestMetricsCatalog(t *testing.T) {
	h := newJobsHarness(t)
	deps := Deps{Metrics: &fakeMetrics{}}

	recorder, _ := h.call(deps, http.MethodGet, "/v1/metrics", h.user, "")
	var catalog api.MetricCatalog
	_ = json.Unmarshal(recorder.Body.Bytes(), &catalog)
	if recorder.Code != http.StatusOK || len(catalog.Metrics) != 0 {
		t.Fatalf("a person without metric permissions sees none: %d %s", recorder.Code, recorder.Body.String())
	}

	recorder, _ = h.call(deps, http.MethodGet, "/v1/metrics", h.admin, "")
	_ = json.Unmarshal(recorder.Body.Bytes(), &catalog)
	if recorder.Code != http.StatusOK || len(catalog.Metrics) != len(metrics.Catalog) || catalog.Metrics[0].Unit != api.Percent {
		t.Fatalf("administrators see every metric: %d %+v", recorder.Code, catalog)
	}

	if recorder, _ = h.call(deps, http.MethodGet, "/v1/metrics", "", ""); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", recorder.Code)
	}
}

func TestMetricsSeries(t *testing.T) {
	h := newJobsHarness(t)
	fake := &fakeMetrics{}
	deps := Deps{Metrics: fake}
	from, to := "2026-11-14T11:00:00Z", "2026-11-14T12:00:00Z"

	recorder, _ := h.call(deps, http.MethodGet, metricsQuery(metrics.CPUPercentName, from, to, url.Values{"points": {"60"}}), h.admin, "")
	var series api.MetricSeries
	_ = json.Unmarshal(recorder.Body.Bytes(), &series)
	if recorder.Code != http.StatusOK || series.BucketSeconds != 60 || series.Series[0].Points[0].Avg != 12.5 || fake.points != 60 {
		t.Fatalf("query: %d %s", recorder.Code, recorder.Body.String())
	}

	recorder, _ = h.call(deps, http.MethodGet, metricsQuery(metrics.CPUPercentName, from, to, nil), h.admin, "")
	if recorder.Code != http.StatusOK || fake.points != defaultMetricPoints {
		t.Fatalf("default points: %d %d", recorder.Code, fake.points)
	}

	cases := []struct {
		name   string
		target string
		token  string
		status int
		code   string
	}{
		{"forbidden family", metricsQuery(metrics.CPUPercentName, from, to, nil), h.user, http.StatusForbidden, codeMetricsForbidden},
		{"unknown metric", metricsQuery("nope", from, to, nil), h.admin, http.StatusNotFound, codeMetricsUnknown},
		{"backwards range", metricsQuery(metrics.CPUPercentName, to, from, nil), h.admin, http.StatusBadRequest, codeMetricsInvalidRange},
		{"range too long", metricsQuery(metrics.CPUPercentName, "2020-01-01T00:00:00Z", to, nil), h.admin, http.StatusBadRequest, codeMetricsInvalidRange},
		{"anonymous", metricsQuery(metrics.CPUPercentName, from, to, nil), "", http.StatusUnauthorized, "auth.engine_token_missing"},
	}
	for _, c := range cases {
		recorder, failure := h.call(deps, http.MethodGet, c.target, c.token, "")
		if recorder.Code != c.status || failure.Code != c.code {
			t.Errorf("%s: %d %q", c.name, recorder.Code, failure.Code)
		}
	}

	if recorder, failure := h.call(Deps{}, http.MethodGet, metricsQuery(metrics.CPUPercentName, from, to, nil), h.admin, ""); recorder.Code != http.StatusNotFound || failure.Code != codeMetricsUnknown {
		t.Errorf("no metrics service: %d %q", recorder.Code, failure.Code)
	}

	fake.err = errors.New("database down")
	if recorder, _ := h.call(deps, http.MethodGet, metricsQuery(metrics.CPUPercentName, from, to, nil), h.admin, ""); recorder.Code != http.StatusInternalServerError {
		t.Errorf("store failure: %d", recorder.Code)
	}
}
