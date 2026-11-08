package main

import (
	"context"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/foldersize"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// jobService adapts the runner, its store and the notification hub to the HTTP API.
type jobService struct {
	runner *jobs.Runner
	hub    *jobs.Hub
}

func (j *jobService) StartFolderSize(ctx context.Context, path string, subject authz.Subject) (string, error) {
	return jobs.Enqueue(ctx, j.runner, subject.UserID, path, func(id string) foldersize.Args {
		return foldersize.Args{Job: id, Path: path, Subject: subject}
	})
}

func (j *jobService) Get(ctx context.Context, id, owner string) (jobs.Job, error) {
	return j.runner.Store().Get(ctx, id, owner)
}

func (j *jobService) List(ctx context.Context, owner string, limit int) ([]jobs.Job, error) {
	return j.runner.Store().List(ctx, owner, limit)
}

func (j *jobService) Cancel(ctx context.Context, job jobs.Job) error {
	return j.runner.Cancel(ctx, job)
}

func (j *jobService) Logs(ctx context.Context, id string, after int) ([]jobs.LogLine, error) {
	return j.runner.Store().Logs(ctx, id, after)
}

func (j *jobService) Subscribe(owner string) (<-chan jobs.Notice, func()) {
	return j.hub.Subscribe(owner)
}
