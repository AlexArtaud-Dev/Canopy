package metrics

import (
	"context"
	"log/slog"
	"time"
)

// Sample is one value of one series at sampling time.
type Sample struct {
	Metric string
	Series string
	Value  float64
}

// Volume is a top-level folder of the root, measured on its filesystem.
type Volume struct {
	Name string
	Path string
}

// Counts are the values the engine reads from its own tables.
type Counts struct {
	Running        int
	Queued         int
	FailedLastHour int
	TrashBytes     int64
	ThumbnailBytes int64
}

// Sources are the edges a sampling reads; injected so that sampling is tested without a system.
type Sources struct {
	// ReadFile reads /proc files; an error leaves the matching metrics out (not Linux, no access).
	ReadFile func(path string) ([]byte, error)
	Volumes  func(ctx context.Context) ([]Volume, error)
	// DiskUsage measures the filesystem holding a path.
	DiskUsage func(path string) (used, total uint64, err error)
	Counts    func(ctx context.Context) (Counts, error)
}

// Sampler turns readings into samples. CPU and network are rates: the first sampling only
// records where the counters stand.
type Sampler struct {
	sources Sources
	logger  *slog.Logger
	cpu     *CPUTimes
	net     *NetBytes
	netAt   time.Time
}

func NewSampler(sources Sources, logger *slog.Logger) *Sampler {
	return &Sampler{sources: sources, logger: logger}
}

// Sample reads every source once. A source that fails is logged and skipped: the others still
// count.
func (s *Sampler) Sample(ctx context.Context, now time.Time) []Sample {
	samples := make([]Sample, 0, 16)
	samples = append(samples, s.system(now)...)
	samples = append(samples, s.volumes(ctx)...)
	return append(samples, s.counts(ctx)...)
}

func (s *Sampler) system(now time.Time) []Sample {
	var samples []Sample
	if stat, err := s.sources.ReadFile("/proc/stat"); err == nil {
		if times, ok := ParseCPU(string(stat)); ok {
			if s.cpu != nil {
				samples = append(samples, Sample{Metric: CPUPercentName, Value: CPUPercent(*s.cpu, times)})
			}
			s.cpu = &times
		}
	}
	if meminfo, err := s.sources.ReadFile("/proc/meminfo"); err == nil {
		if memory, ok := ParseMemInfo(string(meminfo)); ok {
			samples = append(samples,
				Sample{Metric: MemoryUsedName, Value: float64(memory.Total - min(memory.Available, memory.Total))},
				Sample{Metric: MemoryTotalName, Value: float64(memory.Total)},
			)
		}
	}
	if netdev, err := s.sources.ReadFile("/proc/net/dev"); err == nil {
		if bytes, ok := ParseNetDev(string(netdev)); ok {
			if s.net != nil {
				seconds := now.Sub(s.netAt).Seconds()
				samples = append(samples,
					Sample{Metric: NetworkReceivedName, Value: PerSecond(s.net.Received, bytes.Received, seconds)},
					Sample{Metric: NetworkSentName, Value: PerSecond(s.net.Sent, bytes.Sent, seconds)},
				)
			}
			s.net, s.netAt = &bytes, now
		}
	}
	return samples
}

func (s *Sampler) volumes(ctx context.Context) []Sample {
	volumes, err := s.sources.Volumes(ctx)
	if err != nil {
		s.logger.Warn("metrics: volumes not listed", slog.Any("error", err))
		return nil
	}
	samples := make([]Sample, 0, 2*len(volumes))
	for _, volume := range volumes {
		used, total, err := s.sources.DiskUsage(volume.Path)
		if err != nil {
			continue
		}
		samples = append(samples,
			Sample{Metric: VolumeUsedName, Series: volume.Name, Value: float64(used)},
			Sample{Metric: VolumeTotalName, Series: volume.Name, Value: float64(total)},
		)
	}
	return samples
}

func (s *Sampler) counts(ctx context.Context) []Sample {
	counts, err := s.sources.Counts(ctx)
	if err != nil {
		s.logger.Warn("metrics: counts not read", slog.Any("error", err))
		return nil
	}
	return []Sample{
		{Metric: OperationsRunning, Value: float64(counts.Running)},
		{Metric: OperationsQueued, Value: float64(counts.Queued)},
		{Metric: OperationsFailedHour, Value: float64(counts.FailedLastHour)},
		{Metric: TrashBytesName, Value: float64(counts.TrashBytes)},
		{Metric: ThumbnailBytesName, Value: float64(counts.ThumbnailBytes)},
	}
}
