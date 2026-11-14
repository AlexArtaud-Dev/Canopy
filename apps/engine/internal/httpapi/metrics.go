package httpapi

import (
	"context"
	"errors"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/metrics"
)

// Metrics answers dashboard queries (metrics.Service in production).
type Metrics interface {
	Query(ctx context.Context, permissions []string, metric string, from, to time.Time, points int) (metrics.Result, error)
}

const (
	codeMetricsForbidden    = "metrics.forbidden"
	codeMetricsUnknown      = "metrics.unknown"
	codeMetricsInvalidRange = "metrics.invalid_range"
	defaultMetricPoints     = 120
	// No retention keeps more than two years: a longer range asks for nothing that exists.
	maxMetricRange = 2 * 366 * 24 * time.Hour
)

func toAPIDefinition(definition metrics.Definition) api.MetricDefinition {
	return api.MetricDefinition{
		Name:   definition.Name,
		Family: api.MetricDefinitionFamily(definition.Family),
		Unit:   api.MetricDefinitionUnit(definition.Unit),
		Series: definition.Series,
	}
}

// readsMetrics is a person's token: share links never read metrics.
func readsMetrics(ctx context.Context) (enginetoken.Principal, bool) {
	principal, ok := enginetoken.FromContext(ctx)
	return principal, ok && principal.Scope == ""
}

func (s *server) ListMetrics(ctx context.Context, _ api.ListMetricsRequestObject) (api.ListMetricsResponseObject, error) {
	principal, ok := readsMetrics(ctx)
	if !ok {
		return api.ListMetrics401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	visible := metrics.Visible(principal.Permissions)
	definitions := make([]api.MetricDefinition, 0, len(visible))
	for _, definition := range visible {
		definitions = append(definitions, toAPIDefinition(definition))
	}
	return api.ListMetrics200JSONResponse{Metrics: definitions}, nil
}

func (s *server) QueryMetric(ctx context.Context, request api.QueryMetricRequestObject) (api.QueryMetricResponseObject, error) {
	principal, ok := readsMetrics(ctx)
	if !ok {
		return api.QueryMetric401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	params := request.Params
	if !params.To.After(params.From) || params.To.Sub(params.From) > maxMetricRange {
		return api.QueryMetric400JSONResponse(newError(ctx, codeMetricsInvalidRange)), nil
	}
	points := defaultMetricPoints
	if params.Points != nil {
		points = *params.Points
	}
	if s.deps.Metrics == nil {
		return api.QueryMetric404JSONResponse(newError(ctx, codeMetricsUnknown)), nil
	}
	result, err := s.deps.Metrics.Query(ctx, principal.Permissions, params.Metric, params.From, params.To, points)
	switch {
	case errors.Is(err, metrics.ErrUnknown):
		return api.QueryMetric404JSONResponse(newError(ctx, codeMetricsUnknown)), nil
	case errors.Is(err, metrics.ErrForbidden):
		return api.QueryMetric403JSONResponse(newError(ctx, codeMetricsForbidden)), nil
	case err != nil:
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	series := make([]api.MetricSeriesPoints, 0, len(result.Series))
	for _, one := range result.Series {
		points := make([]api.MetricPoint, 0, len(one.Points))
		for _, point := range one.Points {
			points = append(points, api.MetricPoint{At: point.At, Avg: point.Avg, Min: point.Min, Max: point.Max})
		}
		series = append(series, api.MetricSeriesPoints{Name: one.Name, Points: points})
	}
	return api.QueryMetric200JSONResponse{
		Metric:        toAPIDefinition(result.Definition),
		BucketSeconds: int(result.Bucket / time.Second),
		Series:        series,
	}, nil
}
