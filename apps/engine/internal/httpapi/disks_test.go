package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

type fakeDiskHealth struct {
	state                       disks.State
	alerts                      []disks.Alert
	currentErr, checkErr, claim error
	checks                      int
}

func (f *fakeDiskHealth) Current(context.Context) (disks.State, error) { return f.state, f.currentErr }

func (f *fakeDiskHealth) Check(context.Context) (disks.State, error) {
	f.checks++
	return f.state, f.checkErr
}

func (f *fakeDiskHealth) Claim(context.Context, int) ([]disks.Alert, error) { return f.alerts, f.claim }

func number(n int64) *int64 { return &n }

// diskAudit records what the disks handlers audit.
var diskAudit = &fakeAudit{}

func diskCall(h jobsHarness, deps Deps, method, target, token, body string) (*httptest.ResponseRecorder, api.Error) {
	h.t.Helper()
	if deps.Audit == nil {
		deps.Audit = diskAudit
	}
	return h.call(deps, method, target, token, body)
}

func lastAction() string {
	diskAudit.mu.Lock()
	defer diskAudit.mu.Unlock()
	if len(diskAudit.events) == 0 {
		return ""
	}
	return diskAudit.events[len(diskAudit.events)-1].Action
}

// fullDisk sets every field, so that a field the contract drops shows up in the round trip.
func fullDisk() disks.Disk {
	remaining := 40
	return disks.Disk{
		ID: "sdb", Device: "/dev/sdb", Type: "sat", Kind: disks.KindHDD, Model: "WD", Serial: "S1", Firmware: "F",
		Capacity: 4e12, Health: disks.HealthWarning, Reasons: []string{disks.ReasonReallocated}, Asleep: true, Hot: true,
		Temperature: number(41), PowerOnHours: number(100), PowerCycles: number(5), Reallocated: number(8),
		Pending: number(1), Uncorrectable: number(2), CRCErrors: number(3), MediaErrors: number(4),
		WearPercent: number(5), Spare: number(90), SpareLimit: number(10), BytesWritten: number(math.MaxInt32 * 4),
		SelfTest: disks.SelfTest{Running: true, RemainingPercent: &remaining, Last: &disks.SelfTestResult{
			Kind: "Short offline", Result: "Completed without error", Passed: true, PowerOnHours: number(90),
		}},
	}
}

func TestDiskConversionKeepsEveryField(t *testing.T) {
	disk := fullDisk()
	converted, err := toAPI[api.Disk](disk)
	if err != nil {
		t.Fatal(err)
	}
	back, _ := json.Marshal(converted)
	original, _ := json.Marshal(disk)
	var fromAPI, fromEngine map[string]any
	_ = json.Unmarshal(back, &fromAPI)
	_ = json.Unmarshal(original, &fromEngine)
	delete(fromEngine, "type") // smartctl's device type stays in the engine
	for key := range fromEngine {
		if _, ok := fromAPI[key]; !ok {
			t.Errorf("the contract drops %q", key)
		}
	}
	if _, err := toAPI[api.Disk](func() {}); err == nil {
		t.Error("unencodable value converted")
	}
	if _, err := toAPI[api.Disk]([]int{1}); err == nil {
		t.Error("mismatched value converted")
	}
}

func TestGetDisks(t *testing.T) {
	h := newJobsHarness(t)
	checked := time.Date(2026, 11, 24, 13, 0, 0, 0, time.FixedZone("CET", 3600))
	health := &fakeDiskHealth{state: disks.State{CheckedAt: &checked, Disks: []disks.Disk{fullDisk()}}}

	recorder, failure := diskCall(h, Deps{Disks: health}, http.MethodGet, "/v1/disks", h.user, "")
	if recorder.Code != http.StatusForbidden || failure.Code != codeDisksForbidden {
		t.Fatalf("without metrics:disks: %d %+v", recorder.Code, failure)
	}
	if recorder, _ = diskCall(h, Deps{Disks: health}, http.MethodGet, "/v1/disks", "", ""); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", recorder.Code)
	}
	recorder, _ = diskCall(h, Deps{Disks: health}, http.MethodGet, "/v1/disks", h.admin, "")
	var report api.DiskReport
	_ = json.Unmarshal(recorder.Body.Bytes(), &report)
	if recorder.Code != http.StatusOK || !report.Configured || len(report.Disks) != 1 || report.Disks[0].Model != "WD" ||
		!report.CheckedAt.Equal(checked) || !strings.Contains(recorder.Body.String(), `"checkedAt":"2026-11-24T12:00:00Z"`) {
		t.Fatalf("admin: %d %s", recorder.Code, recorder.Body.String())
	}

	// Not set up: an empty, unconfigured report.
	recorder, _ = diskCall(h, Deps{}, http.MethodGet, "/v1/disks", h.admin, "")
	_ = json.Unmarshal(recorder.Body.Bytes(), &report)
	if recorder.Code != http.StatusOK || report.Configured || report.Disks == nil || len(report.Disks) != 0 {
		t.Fatalf("not set up: %d %s", recorder.Code, recorder.Body.String())
	}
	health.currentErr = errors.New("db down")
	if recorder, _ = diskCall(h, Deps{Disks: health}, http.MethodGet, "/v1/disks", h.admin, ""); recorder.Code != http.StatusInternalServerError {
		t.Fatalf("store failure: %d", recorder.Code)
	}
}

func TestCheckDisks(t *testing.T) {
	h := newJobsHarness(t)
	health := &fakeDiskHealth{state: disks.State{Disks: []disks.Disk{fullDisk()}}}
	cases := []struct {
		name  string
		deps  Deps
		token string
		err   error
		want  int
		code  string
	}{
		{"anonymous", Deps{Disks: health}, "", nil, http.StatusUnauthorized, enginetoken.CodeMissing},
		{"not admin", Deps{Disks: health}, h.user, nil, http.StatusForbidden, codeAdminOnly},
		{"not set up", Deps{}, h.admin, nil, http.StatusServiceUnavailable, codeDisksNotConfigured},
		{"service down", Deps{Disks: health}, h.admin, disks.ErrUnavailable, http.StatusServiceUnavailable, codeDisksUnavailable},
		{"store down", Deps{Disks: health}, h.admin, errors.New("db"), http.StatusInternalServerError, "system.internal"},
		{"checked", Deps{Disks: health}, h.admin, nil, http.StatusOK, ""},
	}
	for _, c := range cases {
		health.checkErr = c.err
		recorder, failure := diskCall(h, c.deps, http.MethodPost, "/v1/disks/check", c.token, "")
		if recorder.Code != c.want || failure.Code != c.code {
			t.Errorf("%s: %d %+v", c.name, recorder.Code, failure)
		}
	}
	if lastAction() != "disks.check" {
		t.Errorf("audited %q", lastAction())
	}
}

func TestStartDiskSelfTest(t *testing.T) {
	h := newJobsHarness(t)
	health := &fakeDiskHealth{state: disks.State{Disks: []disks.Disk{fullDisk()}}}
	body := `{"test":"short"}`
	cases := []struct {
		name     string
		deps     Deps
		token    string
		target   string
		startErr error
		want     int
		code     string
	}{
		{"anonymous", Deps{Disks: health}, "", "sdb", nil, http.StatusUnauthorized, enginetoken.CodeMissing},
		{"not admin", Deps{Disks: health}, h.user, "sdb", nil, http.StatusForbidden, codeAdminOnly},
		{"not set up", Deps{}, h.admin, "sdb", nil, http.StatusServiceUnavailable, codeDisksNotConfigured},
		{"unknown disk", Deps{Disks: health}, h.admin, "sdz", nil, http.StatusNotFound, codeDiskNotFound},
		{"too many", Deps{Disks: health}, h.admin, "sdb", jobs.ErrTooMany, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"queue down", Deps{Disks: health}, h.admin, "sdb", errors.New("x"), http.StatusInternalServerError, "system.internal"},
	}
	for _, c := range cases {
		c.deps.Jobs = &fakeJobs{startErr: c.startErr}
		recorder, failure := diskCall(h, c.deps, http.MethodPost, "/v1/disks/"+c.target+"/self-test", c.token, body)
		if recorder.Code != c.want || failure.Code != c.code {
			t.Errorf("%s: %d %+v", c.name, recorder.Code, failure)
		}
	}

	queue := &fakeJobs{job: jobs.Job{ID: jobID, Kind: disks.SelfTestKind, State: jobs.StateQueued}}
	recorder, _ := diskCall(h, Deps{Disks: health, Jobs: queue}, http.MethodPost, "/v1/disks/sdb/self-test", h.admin, `{"test":"long"}`)
	if recorder.Code != http.StatusAccepted || !slices.Equal(queue.selfTest[1:], []string{"sdb", "long"}) {
		t.Fatalf("started: %d %v %s", recorder.Code, queue.selfTest, recorder.Body.String())
	}
	if lastAction() != "jobs.start" {
		t.Errorf("audited %q", lastAction())
	}
	if recorder, _ = diskCall(h, Deps{Disks: health, Jobs: queue}, http.MethodPost, "/v1/disks/sdb/self-test", h.admin, `{"test":"erase"}`); recorder.Code != http.StatusBadRequest {
		t.Fatalf("unknown test: %d", recorder.Code)
	}
	health.currentErr = errors.New("db")
	if recorder, _ = diskCall(h, Deps{Disks: health, Jobs: queue}, http.MethodPost, "/v1/disks/sdb/self-test", h.admin, body); recorder.Code != http.StatusInternalServerError {
		t.Fatalf("store down: %d", recorder.Code)
	}
	health.currentErr = nil
	queue.getErr = errors.New("gone")
	if recorder, _ = diskCall(h, Deps{Disks: health, Jobs: queue}, http.MethodPost, "/v1/disks/sdb/self-test", h.admin, body); recorder.Code != http.StatusInternalServerError {
		t.Fatalf("job unreadable: %d", recorder.Code)
	}
}

func TestClaimDiskAlerts(t *testing.T) {
	h := newJobsHarness(t)
	health := &fakeDiskHealth{alerts: []disks.Alert{{Disk: "sdb", Name: "WD · S1", Kind: disks.AlertHot, Reasons: []string{}, Temperature: number(60), Limit: number(55)}}}

	if recorder, _ := diskCall(h, Deps{Disks: health}, http.MethodPost, "/v1/disks/alerts/claim", "", ""); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", recorder.Code)
	}
	if recorder, _ := diskCall(h, Deps{Disks: health}, http.MethodPost, "/v1/disks/alerts/claim", h.user, ""); recorder.Code != http.StatusForbidden {
		t.Fatalf("not admin: %d", recorder.Code)
	}
	recorder, _ := diskCall(h, Deps{Disks: health}, http.MethodPost, "/v1/disks/alerts/claim", h.admin, "")
	var claimed api.DiskAlerts
	_ = json.Unmarshal(recorder.Body.Bytes(), &claimed)
	if recorder.Code != http.StatusOK || len(claimed.Alerts) != 1 || claimed.Alerts[0].Kind != api.DiskAlertKindHot || *claimed.Alerts[0].Limit != 55 {
		t.Fatalf("claimed: %d %s", recorder.Code, recorder.Body.String())
	}
	for _, deps := range []Deps{{}, {Disks: &fakeDiskHealth{}}} {
		recorder, _ = diskCall(h, deps, http.MethodPost, "/v1/disks/alerts/claim", h.admin, "")
		if recorder.Code != http.StatusOK || recorder.Body.String() != "{\"alerts\":[]}\n" {
			t.Fatalf("nothing: %d %s", recorder.Code, recorder.Body.String())
		}
	}
	health.claim = errors.New("db")
	if recorder, _ = diskCall(h, Deps{Disks: health}, http.MethodPost, "/v1/disks/alerts/claim", h.admin, ""); recorder.Code != http.StatusInternalServerError {
		t.Fatalf("store down: %d", recorder.Code)
	}
}
